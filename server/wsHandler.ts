/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebSocket, WebSocketServer } from 'ws';
import type {
  AdminRole,
  ChatMessage,
  ServerTelemetrySnapshot,
  SharedWorldVehicle,
  WeatherForecastData,
} from '../src/game/types.ts';
import {
  AFK_ARREST_SECONDS,
  AFK_JAIL_SECONDS,
  PAYDAY_INTERVAL_MS,
  VOLLEYBALL_COURT_CENTER,
} from '../src/game/data/catalog.ts';
import {
  clampToValidWorldBounds,
  DEFAULT_SPAWN_POS,
  getAssignedCellData,
  isInInteriorPocket,
} from '../src/game/city/terrainPhysics.ts';
import { addTransaction, getDb, hydrateDbFromSqlIfNeeded, saveDb } from './db.ts';
import type { CharacterRecord, LuandaDatabase } from './db.ts';
import { resolveAccountRole, verifyToken } from './auth.ts';
import { buildWeatherForecastResponse, fetchLuandaWeatherTelemetry } from './weatherService.ts';

export const MAX_PLAYERS = Math.max(20, Number(process.env.LUANDA_MAX_PLAYERS || 120));
const SERVER_BOOT_AT = Date.now();

export interface ConnectedPlayer {
  ws: WebSocket;
  id: string;
  sessionId: string;
  clientInstanceId?: string;
  accountId?: string;
  characterId?: string;
  name: string;
  badge: string;
  role: AdminRole;
  factionId: string | null;
  interiorId: string | null;
  position: { x: number; y: number; z: number };
  rotationY: number;
  animState: string;
  isDriving: boolean;
  vehicleId?: string;
  seatIndex?: number;
  vehicleName?: string;
  customization: {
    skinColor: string;
    skinTone?: string;
    shirtColor: string;
    pantsColor: string;
    shoesColor: string;
    hairStyle: string;
    hairColor: string;
    gender?: string;
    outfitStyle?: string;
    hasCap?: boolean;
    capColor?: string;
    hasMask?: boolean;
    maskColor?: string;
    hasSunglasses?: boolean;
    hasChain?: boolean;
    hasBag?: boolean;
    heightScale?: number;
    equippedWeapon?: string;
  };
  lastSeen: number;
  lastMoveCheckAt: number;
  lastCheckedPos: { x: number; z: number };
  lastActivityAt: number;
  afkWarningStage: number; // 0 = none, 1 = 60m, 2 = 68m, 3 = 71m
  chatWindowStart?: number;
  chatCountInWindow?: number;
  voiceWindowStart?: number;
  voiceCountInWindow?: number;
}

const connectedPlayers = new Map<string, ConnectedPlayer>();
const chatHistory: ChatMessage[] = [
  {
    id: 'welcome-1',
    senderId: 'system',
    senderName: 'Governo Provincial de Luanda 🇦🇴',
    text: 'Bem-vindo ao Luanda RP! Usa /me, /do, /s, /l, /ooc, /pm, /f ou /r para Roleplay realista.',
    channel: 'geral',
    timestamp: '15:30',
  },
];

function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function getConnectedPlayersSnapshot() {
  return Array.from(connectedPlayers.values()).map((p) => ({
    id: p.id,
    sessionId: p.sessionId,
    characterId: p.characterId,
    accountId: p.accountId,
    name: p.name,
    badge: p.badge,
    role: p.role,
    factionId: p.factionId,
    interiorId: p.interiorId,
    position: p.position,
    isDriving: p.isDriving,
    vehicleId: p.vehicleId,
    seatIndex: p.seatIndex,
    vehicleName: p.vehicleName,
  }));
}

export function getConnectedCount(): number {
  return connectedPlayers.size;
}

export function getServerTelemetrySnapshot(): ServerTelemetrySnapshot {
  const db = getDb();
  const mem = process.memoryUsage();
  return {
    connectedPlayers: connectedPlayers.size,
    maxPlayers: MAX_PLAYERS,
    activeVehicles: Object.keys(db.sharedVehicles || {}).length,
    memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    uptimeSec: Math.floor((Date.now() - SERVER_BOOT_AT) / 1000),
    tickMs: 50,
    activeBlackouts: Object.keys(db.worldState?.blackoutDistricts || {}).length,
  };
}

export function markCharacterActive(characterId: string, now = Date.now()) {
  for (const client of connectedPlayers.values()) {
    if (client.characterId === characterId || client.id === characterId) {
      client.lastActivityAt = now;
      client.afkWarningStage = 0;
    }
  }
}

export function isCharacterShelteredInHabitation(
  char: CharacterRecord,
  pos: { x: number; z: number },
  db: LuandaDatabase,
  _now = Date.now()
): boolean {
  // 1. Dentro de interior de Casa (x: 615..665, z: 600..860) tendo posse, arrendamento ou chave partilhada
  const inHouseInterior = pos.x >= 615 && pos.x <= 665 && pos.z >= 600 && pos.z <= 860;
  if (inHouseInterior) {
    const hasHomeAccess = db.properties.some(
      (p) =>
        p.type !== 'business' &&
        (p.ownerId === char.id ||
          p.renterId === char.id ||
          (p.sharedKeys && p.sharedKeys.includes(char.id)))
    );
    if (hasHomeAccess) return true;
  }

  // 2. Dentro da sua Casa comprada (raio exterior imediato caso esteja na varanda privada)
  const ownsHere = db.properties.some(
    (p) =>
      p.type !== 'business' &&
      (p.ownerId === char.id ||
        p.renterId === char.id ||
        (p.sharedKeys && p.sharedKeys.includes(char.id))) &&
      Math.hypot(pos.x - p.position[0], pos.z - p.position[2]) <= 9
  );
  if (ownsHere) return true;

  return false;
}

export function processHourlyPayday(
  db: LuandaDatabase = getDb(),
  now = Date.now(),
  onlineCharIds?: string[]
): { paidCount: number; totalPaidKz: number; paidRecords: { characterId: string; amountKz: number; factionName: string; rank: string }[] } {
  const paidRecords: { characterId: string; amountKz: number; factionName: string; rank: string }[] = [];
  let totalPaidKz = 0;
  const targetIds = onlineCharIds
    ? Array.from(new Set(onlineCharIds))
    : Array.from(connectedPlayers.values())
        .map((c) => c.characterId || c.id)
        .filter(Boolean);

  for (const charId of targetIds) {
    const char = db.characters[charId];
    if (!char || !char.stats.factionId) continue;
    const faction = db.factions.find((f) => f.id === char.stats.factionId);
    // Regra estrita: Gangues/Crime ganham APENAS com assaltos ou desmanche, NUNCA Payday!
    if (!faction || faction.suspended || faction.type === 'gangue' || faction.type === 'crime') {
      continue;
    }
    if (faction.type !== 'policia' && faction.type !== 'hospital' && faction.type !== 'advogados' && faction.type !== 'empresa') {
      continue;
    }
    const member = faction.members.find((m) => m.characterId === char.id);
    const rankDef =
      faction.ranks.find((r) => (member ? r.level === member.level : r.name === char.stats.factionRank)) ||
      faction.ranks[0];
    const salaryKz = Math.max(0, Math.round((rankDef?.salaryKz || 3200) * (db.worldConfig.economyMultiplier || 1)));
    if (salaryKz <= 0) continue;

    char.stats.bankKz += salaryKz;
    addTransaction(char.id, 'salary', salaryKz, `Payday Horário — ${faction.name} (${rankDef?.name || char.stats.factionRank})`);
    totalPaidKz += salaryKz;
    paidRecords.push({
      characterId: char.id,
      amountKz: salaryKz,
      factionName: faction.name,
      rank: rankDef?.name || char.stats.factionRank,
    });
  }

  db.worldState.lastPaydayAt = now;
  return { paidCount: paidRecords.length, totalPaidKz, paidRecords };
}

export function arrestCharacterForAfk(
  char: CharacterRecord,
  db: LuandaDatabase,
  now = Date.now()
): { jailUntil: number; assignedCell: number } {
  const assignedCell = ((Object.keys(db.characters).indexOf(char.id) + Math.floor(now / 1000)) % 4) + 1;
  const cellSpawn = getAssignedCellData(assignedCell);
  const jailUntil = now + AFK_JAIL_SECONDS * 1000;

  char.stats.jailUntil = jailUntil;
  char.stats.jailReason = 'Inatividade / Abandono em via pública (+72 min AFK)';
  char.stats.assignedCell = assignedCell;
  char.stats.wantedStars = 0;
  char.position = { x: cellSpawn.x, y: cellSpawn.y, z: cellSpawn.z };
  char.updatedAt = new Date(now).toISOString();

  db.criminalRecords.unshift({
    id: 'crm-' + now + '-' + Math.random().toString(36).substring(2, 6),
    characterId: char.id,
    characterName: `${char.stats.name} ${char.stats.surname}`,
    type: 'arrest',
    reason: 'Detenção Automática por AFK em local não habitacional (5h de Prisão)',
    amountKz: 0,
    officerName: 'Patrulha PNA — Vigilância Urbana',
    timestamp: new Date(now).toISOString(),
  });
  if (db.criminalRecords.length > 600) db.criminalRecords.length = 600;

  return { jailUntil, assignedCell };
}

export function checkSingleClientAfk(
  client: ConnectedPlayer,
  db: LuandaDatabase,
  now = Date.now()
): 'none' | 'warned' | 'arrested' {
  if (!client.characterId) return 'none';
  const char = db.characters[client.characterId];
  if (!char) return 'none';

  // Já preso, inconsciente ou protegido em casa/hotel -> pausa contador AFK
  if (char.stats.jailUntil > now || char.stats.isUnconscious) {
    client.lastActivityAt = now;
    client.afkWarningStage = 0;
    return 'none';
  }

  if (isCharacterShelteredInHabitation(char, client.position, db, now)) {
    client.lastActivityAt = now;
    client.afkWarningStage = 0;
    return 'none';
  }

  const idleSec = (now - client.lastActivityAt) / 1000;

  if (idleSec >= AFK_ARREST_SECONDS) {
    const { jailUntil, assignedCell } = arrestCharacterForAfk(char, db, now);
    const cellSpawn = getAssignedCellData(assignedCell);
    client.position = { x: cellSpawn.x, y: cellSpawn.y, z: cellSpawn.z };
    client.lastCheckedPos = { x: cellSpawn.x, z: cellSpawn.z };
    client.lastActivityAt = now;
    client.afkWarningStage = 0;

    sendToClient(client, {
      type: 'afk_arrest',
      jailUntil,
      assignedCell,
      reason: char.stats.jailReason,
      position: client.position,
    });
    sendToClient(client, {
      type: 'admin_effect',
      effect: {
        action: 'teleport',
        x: cellSpawn.x,
        z: cellSpawn.z,
        reason: 'Detido por AFK prolongado (+72 min fora de casa) — 5 horas de prisão.',
      },
    });
    broadcastSystemChat(
      `[PNA] ${char.stats.name} ${char.stats.surname} foi detido por inatividade (+72 min em via pública) e transferido para a Cela ${assignedCell} (5h).`,
      'geral'
    );
    saveDb();
    return 'arrested';
  }

  // Avisos antecipados: 60m (3600s), 68m (4080s), 71m (4260s)
  let stage = 0;
  if (idleSec >= 4260) stage = 3;
  else if (idleSec >= 4080) stage = 2;
  else if (idleSec >= 3600) stage = 1;

  if (stage > client.afkWarningStage) {
    client.afkWarningStage = stage;
    const remainingMin = Math.max(1, Math.ceil((AFK_ARREST_SECONDS - idleSec) / 60));
    sendToClient(client, {
      type: 'afk_warning',
      stage,
      remainingMinutes: remainingMin,
      message: `Aviso de Inatividade PNA: estás fora de casa há ${Math.floor(idleSec / 60)} min. Move-te ou abriga-te em ${remainingMin} min para evitar prisão de 5h!`,
    });
    return 'warned';
  }

  return 'none';
}

export function broadcast(message: object, excludeWs?: WebSocket) {
  const data = JSON.stringify(message);
  for (const client of connectedPlayers.values()) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(data);
      } catch {}
    }
  }
}

let latestForecastSnapshot: WeatherForecastData | null = null;

export function setLatestForecastSnapshot(snapshot: WeatherForecastData) {
  latestForecastSnapshot = snapshot;
}

export function getLatestForecastSnapshot(): WeatherForecastData | null {
  return latestForecastSnapshot;
}

export function broadcastWorldSync(forecast?: WeatherForecastData | null) {
  const db = getDb();
  if (forecast) latestForecastSnapshot = forecast;
  broadcast({
    type: 'world_sync',
    worldState: {
      weather: db.worldConfig.weather,
      weatherMode: db.worldConfig.weatherMode || 'auto',
      timeSpeed: db.worldConfig.timeSpeed,
      timeOfDay: db.worldConfig.timeOfDay,
      forecast: latestForecastSnapshot || undefined,
    },
  });
}

export function broadcastDjSync() {
  const db = getDb();
  broadcast({
    type: 'dj_sync',
    djState: db.djState,
    serverNow: Date.now(),
  });
}

export function broadcastPoliticsSync() {
  const db = getDb();
  broadcast({
    type: 'politics_sync',
    politics: db.politics,
  });
}

export function broadcastDynamicWorldSync() {
  const db = getDb();
  broadcast({
    type: 'dynamic_world_sync',
    worldState: db.worldState,
    serverNow: Date.now(),
  });
}

export function broadcastSharedVehicle(vehicle: SharedWorldVehicle, excludeWs?: WebSocket) {
  broadcast({ type: 'shared_vehicle_updated', vehicle }, excludeWs);
}

export function removeSharedVehicleAndBroadcast(vehicleId: string) {
  const db = getDb();
  if (db.sharedVehicles && db.sharedVehicles[vehicleId]) {
    delete db.sharedVehicles[vehicleId];
  }
  broadcast({ type: 'shared_vehicle_removed', vehicleId });
}

export function broadcastEmergencyAlert(alert: {
  service: 'policia' | 'medico' | 'crime';
  title: string;
  message: string;
  x: number;
  z: number;
}) {
  const data = JSON.stringify({ type: 'emergency_alert', alert });
  for (const client of connectedPlayers.values()) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    const isMedicalTarget = alert.service === 'medico' && client.factionId === 'hospital';
    const isPoliceTarget =
      alert.service === 'policia' && (client.factionId === 'policia' || client.factionId === 'faa');
    if (
      alert.service === 'crime' ||
      isMedicalTarget ||
      isPoliceTarget ||
      client.factionId === alert.service ||
      client.role !== 'player'
    ) {
      try {
        client.ws.send(data);
      } catch {}
    }
  }
}

export function syncConnectedCharacterPosition(characterId: string, x: number, z: number, rotationY?: number) {
  for (const client of connectedPlayers.values()) {
    if (client.characterId === characterId || client.id === characterId) {
      client.position.x = x;
      client.position.z = z;
      client.lastCheckedPos = { x, z };
      client.lastMoveCheckAt = Date.now();
      if (typeof rotationY === 'number') client.rotationY = rotationY;
    }
  }
}

export function syncConnectedPlayerProfile(characterId: string) {
  const db = getDb();
  const char = db.characters[characterId];
  if (!char) return;
  const account = db.accounts[char.accountId];
  const nextRole: AdminRole = account ? resolveAccountRole(account) : 'player';
  const nextName = `${char.stats.name} ${char.stats.surname}`.trim();
  const nextBadge = char.stats.factionId ? `${char.stats.factionRank}` : 'Cidadão';
  const nextFactionId = char.stats.factionId || null;

  for (const client of connectedPlayers.values()) {
    if (client.characterId === characterId || client.id === characterId) {
      client.name = nextName;
      client.badge = nextBadge;
      client.role = nextRole;
      client.factionId = nextFactionId;
      broadcast({
        type: 'player_meta_updated',
        id: client.id,
        name: client.name,
        badge: client.badge,
        role: client.role,
        factionId: client.factionId,
      });
    }
  }
}

function releasePlayerFromSharedVehicles(targetPlayerId: string) {
  const db = getDb();
  for (const sv of Object.values(db.sharedVehicles || {})) {
    let changed = false;
    if (sv.driverId === targetPlayerId) {
      sv.driverId = null;
      sv.driverName = undefined;
      sv.speedKmh = 0;
      changed = true;
    }
    const beforeLen = sv.passengers.length;
    sv.passengers = (sv.passengers || []).filter((p) => p.characterId !== targetPlayerId);
    if (sv.passengers.length !== beforeLen) changed = true;
    if (changed) {
      sv.lastUpdatedAt = Date.now();
      broadcastSharedVehicle(sv);
    }
  }
}

export function broadcastSystemChat(text: string, channel: ChatMessage['channel'] = 'geral') {
  const msg: ChatMessage = {
    id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    senderId: 'system',
    senderName: 'Sistema Luanda RP 🇦🇴',
    text,
    channel,
    timestamp: nowTimeStr(),
  };
  chatHistory.push(msg);
  if (chatHistory.length > 60) chatHistory.shift();
  broadcast({ type: 'chat_received', message: msg });
}

export function pushAdminEffectToCharacter(
  characterId: string,
  effect: {
    action: 'heal' | 'revive' | 'freeze' | 'teleport' | 'kick' | 'ban' | 'refresh_character' | 'spawn_vehicle';
    x?: number;
    z?: number;
    frozen?: boolean;
    reason?: string;
    vehicleModelId?: string;
  }
) {
  for (const client of connectedPlayers.values()) {
    if (client.characterId === characterId || client.id === characterId) {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (effect.action === 'teleport' && typeof effect.x === 'number' && typeof effect.z === 'number') {
          client.position.x = effect.x;
          client.position.z = effect.z;
          client.lastCheckedPos = { x: effect.x, z: effect.z };
        }
        try {
          client.ws.send(JSON.stringify({ type: 'admin_effect', effect }));
          if (effect.action === 'kick' || effect.action === 'ban') {
            setTimeout(() => {
              try {
                client.ws.close();
              } catch {}
            }, 250);
          }
        } catch {}
      }
    }
  }
}

function sendToClient(client: ConnectedPlayer, payload: object) {
  if (client.ws.readyState === WebSocket.OPEN) {
    try {
      client.ws.send(JSON.stringify(payload));
    } catch {}
  }
}

function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function initWebSocketServer(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    let playerId = '';

    let queryToken = '';
    try {
      const url = new URL(req.url || '', 'http://localhost');
      queryToken = url.searchParams.get('token') || '';
    } catch {}

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          if (playerId) {
            const entry = connectedPlayers.get(playerId);
            if (entry) entry.lastSeen = Date.now();
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', serverNow: Date.now() }));
          }
          return;
        }
        await hydrateDbFromSqlIfNeeded();
        const db = getDb();

        if (msg.type === 'join') {
          const token = msg.token || queryToken || '';
          const payload = verifyToken(token);
          const account = payload ? db.accounts[payload.accountId] : undefined;
          const verifiedRole: AdminRole = account ? resolveAccountRole(account) : 'player';
          const requestedCharId = typeof msg.characterId === 'string' ? msg.characterId : '';
          const charRecord =
            account && requestedCharId && db.characters[requestedCharId]?.accountId === account.id
              ? db.characters[requestedCharId]
              : undefined;

          if (!account || !charRecord) {
            ws.send(
              JSON.stringify({
                type: 'auth_error',
                error: 'Sessão inválida ou personagem não autorizado para ligação WebSocket.',
              })
            );
            ws.close();
            return;
          }

          if (account.bannedUntil > Date.now() || account.suspendedUntil > Date.now()) {
            ws.send(
              JSON.stringify({
                type: 'admin_effect',
                effect: { action: 'ban', reason: account.banReason || 'Conta suspensa/banida.' },
              })
            );
            ws.close();
            return;
          }

          if (connectedPlayers.size >= MAX_PLAYERS && verifiedRole === 'player') {
            ws.send(
              JSON.stringify({
                type: 'admin_effect',
                effect: { action: 'kick', reason: `Servidor lotado (${connectedPlayers.size}/${MAX_PLAYERS} jogadores). Tenta novamente em instantes.` },
              })
            );
            ws.close();
            return;
          }

          playerId = charRecord.id;
          const now = Date.now();
          const clientInstanceId =
            typeof msg.clientInstanceId === 'string' && msg.clientInstanceId.trim()
              ? msg.clientInstanceId.trim().slice(0, 64)
              : undefined;
          const existingConn = connectedPlayers.get(playerId);
          const isSameInstanceReconnect = Boolean(
            clientInstanceId &&
              existingConn?.clientInstanceId &&
              clientInstanceId === existingConn.clientInstanceId
          );
          if (
            existingConn &&
            existingConn.ws !== ws &&
            existingConn.ws.readyState === WebSocket.OPEN &&
            now - existingConn.lastSeen < 45000 &&
            !isSameInstanceReconnect
          ) {
            ws.send(
              JSON.stringify({
                type: 'session_conflict',
                error: 'Esta personagem já está ativa noutra ligação simultânea. Fecha a outra sessão antes de entrar.',
              })
            );
            ws.close();
            return;
          }
          if (existingConn && existingConn.ws !== ws) {
            releasePlayerFromSharedVehicles(playerId);
            try {
              existingConn.ws.close();
            } catch {}
          }

          let startPos = charRecord.position
            ? { ...charRecord.position }
            : msg.position || { ...DEFAULT_SPAWN_POS };
          if (charRecord.stats.jailUntil > now) {
            const cell = getAssignedCellData(charRecord.stats.assignedCell || 1);
            startPos = { x: cell.x, y: cell.y, z: cell.z };
            charRecord.position = { ...startPos };
          } else if (
            msg.position &&
            typeof msg.position.x === 'number' &&
            typeof msg.position.z === 'number' &&
            Number.isFinite(msg.position.x) &&
            Number.isFinite(msg.position.z)
          ) {
            const reqPos = clampToValidWorldBounds(msg.position.x, msg.position.z);
            const nearHomeProp = db.properties.some(
              (p) =>
                p.type !== 'business' &&
                (p.ownerId === charRecord.id ||
                  p.renterId === charRecord.id ||
                  p.sharedKeys?.includes(charRecord.id)) &&
                Math.hypot(reqPos.x - p.position[0], reqPos.z - p.position[2]) <= 18
            );
            const wasAtDefaultSpawn =
              !charRecord.position ||
              Math.hypot(
                charRecord.position.x - DEFAULT_SPAWN_POS.x,
                charRecord.position.z - DEFAULT_SPAWN_POS.z
              ) < 1.0;
            const closeToSaved =
              charRecord.position &&
              Math.hypot(reqPos.x - charRecord.position.x, reqPos.z - charRecord.position.z) <= 20;
            if (closeToSaved || (wasAtDefaultSpawn && nearHomeProp)) {
              startPos = {
                x: reqPos.x,
                y: Math.max(-3, Math.min(80, Number(msg.position.y) || 0)),
                z: reqPos.z,
              };
              charRecord.position = { ...startPos };
            }
          }

          const displayName = `${charRecord.stats.name} ${charRecord.stats.surname}`.trim();
          const sessionId = 'sess-' + now + '-' + Math.random().toString(36).substring(2, 8);
          const initialInterior =
            charRecord.stats.interiorId || (isInInteriorPocket(startPos.x, startPos.z) ? String(msg.interiorId || 'interior') : null);

          const client: ConnectedPlayer = {
            ws,
            id: playerId,
            sessionId,
            clientInstanceId,
            accountId: account.id,
            characterId: charRecord.id,
            name: displayName,
            badge: charRecord.stats.factionId
              ? `${charRecord.stats.factionRank}`
              : msg.badge || 'Cidadão',
            role: verifiedRole,
            factionId: charRecord.stats.factionId || null,
            interiorId: initialInterior,
            position: { ...startPos },
            rotationY: charRecord.rotationY || msg.rotationY || 0,
            animState: msg.animState || 'idle',
            isDriving: !!msg.isDriving,
            vehicleId: msg.vehicleId,
            seatIndex: typeof msg.seatIndex === 'number' ? msg.seatIndex : undefined,
            vehicleName: msg.vehicleName,
            customization: charRecord.customization
              ? {
                  ...charRecord.customization,
                  skinColor: charRecord.customization.skinTone,
                }
              : msg.customization || {
                  skinColor: '#9e563f',
                  shirtColor: '#dc2626',
                  pantsColor: '#09090b',
                  shoesColor: '#ffffff',
                  hairStyle: 'trancas',
                  hairColor: '#d4d4d8',
                },
            lastSeen: now,
            lastMoveCheckAt: now,
            lastCheckedPos: { x: startPos.x, z: startPos.z },
            lastActivityAt: now,
            afkWarningStage: 0,
          };

          connectedPlayers.set(playerId, client);

          // Limpar faixa DJ expirada
          if (db.djState.currentTrack && (db.djState.currentTrack.endsAt <= now || db.djState.endsAt <= now)) {
            db.djState.currentTrack = null;
            db.djState.startedAt = 0;
            db.djState.endsAt = 0;
          }

          const allOtherPlayers = Array.from(connectedPlayers.values())
            .filter((p) => p.id !== playerId)
            .map((p) => ({
              id: p.id,
              characterId: p.characterId,
              name: p.name,
              badge: p.badge,
              role: p.role,
              interiorId: p.interiorId,
              position: p.position,
              rotationY: p.rotationY,
              animState: p.animState,
              isDriving: p.isDriving,
              vehicleId: p.vehicleId,
              seatIndex: p.seatIndex,
              vehicleName: p.vehicleName,
              customization: p.customization,
            }));

          ws.send(
            JSON.stringify({
              type: 'init',
              selfId: playerId,
              sessionId,
              players: allOtherPlayers,
              sharedVehicles: Object.values(db.sharedVehicles || {}),
              dynamicWorldState: db.worldState,
              worldState: {
                weather: db.worldConfig.weather,
                weatherMode: db.worldConfig.weatherMode || 'auto',
                timeSpeed: db.worldConfig.timeSpeed,
                timeOfDay: db.worldConfig.timeOfDay,
                forecast: latestForecastSnapshot || undefined,
              },
              djState: db.djState,
              serverNow: now,
              recentChat: chatHistory.slice(-20),
            })
          );

          broadcast(
            {
              type: 'player_joined',
              player: {
                id: client.id,
                characterId: client.characterId,
                name: client.name,
                badge: client.badge,
                role: client.role,
                interiorId: client.interiorId,
                position: client.position,
                rotationY: client.rotationY,
                animState: client.animState,
                isDriving: client.isDriving,
                vehicleId: client.vehicleId,
                seatIndex: client.seatIndex,
                vehicleName: client.vehicleName,
                customization: client.customization,
              },
            },
            ws
          );
        } else if (msg.type === 'update' && playerId) {
          const entry = connectedPlayers.get(playerId);
          if (!entry || entry.ws !== ws || !msg.position) return;

          const now = Date.now();
          const dtSec = Math.max(0.05, (now - entry.lastMoveCheckAt) / 1000);
          const jumpDist = dist2D(msg.position, entry.lastCheckedPos);

          // Permitir teleporte legítimo de entrada/saída de interior ou emprego sem bloquear pelo anti-cheat
          const wasInsidePocket = isInInteriorPocket(entry.lastCheckedPos.x, entry.lastCheckedPos.z);
          const goingInsidePocket = isInInteriorPocket(Number(msg.position.x) || 0, Number(msg.position.z) || 0);
          if (entry.role === 'player' && wasInsidePocket === goingInsidePocket && dtSec < 1.5 && jumpDist / dtSec > 130 && jumpDist > 30) {
            sendToClient(entry, {
              type: 'position_correction',
              position: { ...entry.position },
              rotationY: entry.rotationY,
              reason: 'Movimento fora dos limites físicos permitidos pelo servidor.',
            });
            return;
          }

          const clamped = clampToValidWorldBounds(Number(msg.position.x) || 0, Number(msg.position.z) || 0);
          const movedDist = dist2D(clamped, entry.lastCheckedPos);

          entry.position = {
            x: clamped.x,
            y: Math.max(-3, Math.min(80, Number(msg.position.y) || 0)),
            z: clamped.z,
          };
          entry.rotationY = Number(msg.rotationY) || 0;
          entry.animState = String(msg.animState || 'idle');
          entry.isDriving = !!msg.isDriving;
          entry.vehicleId = typeof msg.vehicleId === 'string' ? msg.vehicleId : undefined;
          entry.seatIndex = typeof msg.seatIndex === 'number' ? msg.seatIndex : undefined;
          entry.vehicleName = msg.vehicleName;
          entry.interiorId = typeof msg.interiorId === 'string' ? msg.interiorId : isInInteriorPocket(clamped.x, clamped.z) ? (entry.interiorId || 'interior') : null;
          entry.lastSeen = now;
          entry.lastMoveCheckAt = now;
          entry.lastCheckedPos = { x: entry.position.x, z: entry.position.z };

          // Atualiza última atividade real se o jogador se moveu ou fez animação ativa (não idle)
          if (movedDist > 0.35 || (entry.animState !== 'idle' && entry.animState !== 'sleep')) {
            entry.lastActivityAt = now;
            entry.afkWarningStage = 0;
          }

          if (entry.characterId && db.characters[entry.characterId]) {
            db.characters[entry.characterId].position = { ...entry.position };
            db.characters[entry.characterId].rotationY = entry.rotationY;
            db.characters[entry.characterId].stats.interiorId = entry.interiorId;
          }

          broadcast(
            {
              type: 'player_updated',
              id: playerId,
              interiorId: entry.interiorId,
              position: entry.position,
              rotationY: entry.rotationY,
              animState: entry.animState,
              isDriving: entry.isDriving,
              vehicleId: entry.vehicleId,
              seatIndex: entry.seatIndex,
              vehicleName: entry.vehicleName,
            },
            ws
          );
        } else if (msg.type === 'vehicle_sync' && playerId && (msg.vehicle?.id || msg.vehicleId)) {
          const entry = connectedPlayers.get(playerId);
          if (!entry || entry.ws !== ws) return;
          const v = (msg.vehicle?.id ? msg.vehicle : { ...msg, id: msg.vehicleId }) as SharedWorldVehicle;
          db.sharedVehicles = db.sharedVehicles || {};
          const prev = db.sharedVehicles[v.id];
          if (prev && prev.driverId && prev.driverId !== playerId) {
            return;
          }
          if ((!prev || !prev.driverId) && (!entry.isDriving || entry.vehicleId !== v.id)) {
            return;
          }
          const clamped = clampToValidWorldBounds(Number(v.position?.x) || 0, Number(v.position?.z) || 0);
          const merged: SharedWorldVehicle = {
            id: v.id,
            ownerId: prev?.ownerId || v.ownerId || playerId,
            modelId: v.modelId || prev?.modelId || 'taxi_i10',
            name: v.name || prev?.name || 'Viatura Luanda',
            type: v.type || prev?.type || 'taxi',
            plate: v.plate || prev?.plate || 'LD-00-00-AO',
            color: v.color || prev?.color || '#2563eb',
            accentColor: v.accentColor ?? prev?.accentColor,
            skinId: v.skinId ?? prev?.skinId,
            position: { x: clamped.x, y: Number(v.position?.y) || 0, z: clamped.z },
            rotationY: Number(v.rotationY) || 0,
            speedKmh: Math.max(0, Math.min(290, Number(v.speedKmh) || 0)),
            steeringAngle: Number(v.steeringAngle) || 0,
            driverId: prev?.driverId || playerId,
            driverName: prev?.driverName || entry.name,
            passengers: prev?.passengers || [],
            headlightsOn: Boolean(v.headlightsOn),
            sirenOn: Boolean(v.sirenOn),
            engineOn: v.engineOn !== false,
            blinkerMode: v.blinkerMode || 'off',
            isLocked: Boolean(prev?.isLocked ?? v.isLocked),
            health: Math.max(0, Math.min(100, Number(v.health ?? prev?.health ?? 100))),
            fuel: Math.max(0, Math.min(100, Number(v.fuel ?? prev?.fuel ?? 100))),
            mileageKm: Math.max(prev?.mileageKm || 0, Number(v.mileageKm) || 0, db.vehicles[v.id]?.mileageKm || 0),
            doorsOpen: Boolean(v.doorsOpen),
            hoodOpen: Boolean(v.hoodOpen),
            trunkOpen: Boolean(v.trunkOpen),
            lastUpdatedAt: Date.now(),
          };
          db.sharedVehicles[merged.id] = merged;
          if (db.vehicles[merged.id]) {
            db.vehicles[merged.id].position = { ...merged.position };
            db.vehicles[merged.id].rotationY = merged.rotationY;
            db.vehicles[merged.id].fuel = merged.fuel;
            db.vehicles[merged.id].health = merged.health;
            db.vehicles[merged.id].mileageKm = merged.mileageKm;
          }
          broadcastSharedVehicle(merged, ws);
        } else if (msg.type === 'vehicle_enter_seat' && playerId && msg.vehicleId) {
          const entry = connectedPlayers.get(playerId);
          if (!entry || entry.ws !== ws) return;
          db.sharedVehicles = db.sharedVehicles || {};
          const vId = String(msg.vehicleId);
          const wantedSeat = Math.max(0, Math.min(3, Number(msg.seatIndex) || 0));
          let sv = db.sharedVehicles[vId];
          if (!sv && msg.vehicleMeta) {
            const m = msg.vehicleMeta;
            sv = {
              id: vId,
              ownerId: String(m.ownerId || playerId),
              modelId: String(m.modelId || 'taxi_i10'),
              name: String(m.name || 'Viatura Luanda'),
              type: m.type || 'taxi',
              plate: String(m.plate || 'LD-00-00-AO'),
              color: String(m.color || '#2563eb'),
              accentColor: m.accentColor,
              skinId: m.skinId,
              position: m.position || { ...entry.position },
              rotationY: Number(m.rotationY) || 0,
              speedKmh: 0,
              steeringAngle: 0,
              driverId: null,
              passengers: [],
              headlightsOn: false,
              sirenOn: false,
              engineOn: true,
              blinkerMode: 'off',
              isLocked: false,
              health: Number(m.health ?? 100),
              fuel: Number(m.fuel ?? 100),
              lastUpdatedAt: Date.now(),
            };
            db.sharedVehicles[vId] = sv;
          }
          if (!sv) return;
          sv.passengers = (sv.passengers || []).filter((p) => p.characterId !== playerId);
          if (wantedSeat === 0) {
            if (!sv.driverId || sv.driverId === playerId) {
              sv.driverId = playerId;
              sv.driverName = entry.name;
              entry.isDriving = true;
              entry.vehicleId = vId;
              entry.seatIndex = 0;
              entry.vehicleName = sv.name;
            }
          } else {
            const occupiedSeats = new Set(sv.passengers.map((p) => p.seatIndex));
            let assigned = wantedSeat;
            while (occupiedSeats.has(assigned) && assigned <= 3) assigned += 1;
            if (assigned <= 3) {
              sv.passengers.push({ characterId: playerId, name: entry.name, seatIndex: assigned });
              entry.isDriving = false;
              entry.vehicleId = vId;
              entry.seatIndex = assigned;
              entry.vehicleName = sv.name;
            }
          }
          sv.lastUpdatedAt = Date.now();
          broadcastSharedVehicle(sv);
        } else if (msg.type === 'vehicle_exit_seat' && playerId && msg.vehicleId) {
          const entry = connectedPlayers.get(playerId);
          if (!entry || entry.ws !== ws) return;
          const vId = String(msg.vehicleId);
          const sv = db.sharedVehicles?.[vId];
          if (sv) {
            if (sv.driverId === playerId) {
              sv.driverId = null;
              sv.driverName = undefined;
              sv.speedKmh = 0;
            }
            sv.passengers = (sv.passengers || []).filter((p) => p.characterId !== playerId);
            sv.lastUpdatedAt = Date.now();
            broadcastSharedVehicle(sv);
          }
          entry.isDriving = false;
          entry.vehicleId = undefined;
          entry.seatIndex = undefined;
          entry.vehicleName = undefined;
        } else if (msg.type === 'customization_updated' && playerId) {
          const entry = connectedPlayers.get(playerId);
          if (entry && entry.ws === ws && msg.customization) {
            entry.lastActivityAt = Date.now();
            entry.customization = {
              ...msg.customization,
              skinColor: msg.customization.skinTone || msg.customization.skinColor || entry.customization.skinColor,
            };
            broadcast({ type: 'player_customization', id: playerId, customization: entry.customization }, ws);
          }
        } else if (msg.type === 'weapon_fired' && playerId) {
          const entry = connectedPlayers.get(playerId);
          if (entry) {
            entry.lastActivityAt = Date.now();
            entry.afkWarningStage = 0;
          }
          broadcast(
            {
              type: 'weapon_fired',
              id: playerId,
              weaponId: msg.weaponId,
              from: msg.from,
              to: msg.to,
            },
            ws
          );
        } else if (msg.type === 'chat') {
          const entry = connectedPlayers.get(playerId);
          if (entry) {
            const now = Date.now();
            if (!entry.chatWindowStart || now - entry.chatWindowStart > 10000) {
              entry.chatWindowStart = now;
              entry.chatCountInWindow = 1;
            } else {
              entry.chatCountInWindow = (entry.chatCountInWindow || 0) + 1;
              if (entry.chatCountInWindow > 10) return;
            }
            entry.lastActivityAt = now;
            entry.afkWarningStage = 0;
          }
          const rawText = String(msg.text || '').trim().slice(0, 320);
          if (!rawText) return;

          const senderName = entry?.name || String(msg.senderName || 'Cidadão');
          const senderRole = entry?.role || 'player';
          const senderPos = msg.position || entry?.position || { x: 0, z: 10 };
          let channel: ChatMessage['channel'] = msg.channel || 'geral';
          let finalText = rawText;

          if (rawText.startsWith('/')) {
            const [cmd, ...rest] = rawText.split(' ');
            const argStr = rest.join(' ').trim();
            const lowerCmd = cmd.toLowerCase();

            if (lowerCmd === '/me' && argStr) {
              channel = 'rp';
              finalText = `* ${senderName} ${argStr}`;
            } else if (lowerCmd === '/do' && argStr) {
              channel = 'rp';
              finalText = `(( ${argStr} — ${senderName} ))`;
            } else if ((lowerCmd === '/ooc' || lowerCmd === '/b') && argStr) {
              channel = 'geral';
              finalText = `[OOC] ${argStr}`;
            } else if (lowerCmd === '/s' && argStr) {
              channel = 'proximidade';
              finalText = `[GRITA] ${argStr.toUpperCase()}`;
              const shoutMsg: ChatMessage = {
                id: 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                senderId: playerId,
                senderName,
                senderRole,
                text: finalText,
                channel,
                timestamp: nowTimeStr(),
              };
              for (const c of connectedPlayers.values()) {
                if (dist2D(c.position, senderPos) <= 65) {
                  sendToClient(c, { type: 'chat_received', message: shoutMsg });
                }
              }
              return;
            } else if (lowerCmd === '/l' && argStr) {
              channel = 'proximidade';
              finalText = `[SUSSURRA] ${argStr}`;
              const whisperMsg: ChatMessage = {
                id: 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                senderId: playerId,
                senderName,
                senderRole,
                text: finalText,
                channel,
                timestamp: nowTimeStr(),
              };
              for (const c of connectedPlayers.values()) {
                if (dist2D(c.position, senderPos) <= 12) {
                  sendToClient(c, { type: 'chat_received', message: whisperMsg });
                }
              }
              return;
            } else if ((lowerCmd === '/pm' || lowerCmd === '/w') && rest.length >= 2) {
              const targetQuery = rest[0].toLowerCase();
              const pmText = rest.slice(1).join(' ');
              const target = Array.from(connectedPlayers.values()).find((c) =>
                c.name.toLowerCase().includes(targetQuery)
              );
              const pmMsg: ChatMessage = {
                id: 'pm-' + Date.now(),
                senderId: playerId,
                senderName: `${senderName} ➔ ${target ? target.name : targetQuery}`,
                senderRole,
                text: pmText,
                channel: 'pm',
                timestamp: nowTimeStr(),
              };
              if (entry) sendToClient(entry, { type: 'chat_received', message: pmMsg });
              if (target && target.id !== playerId) sendToClient(target, { type: 'chat_received', message: pmMsg });
              return;
            } else if (lowerCmd === '/f' && argStr) {
              const charFaction = entry?.characterId ? db.characters[entry.characterId]?.stats.factionId : entry?.factionId;
              if (!charFaction) return;
              const fMsg: ChatMessage = {
                id: 'fac-' + Date.now(),
                senderId: playerId,
                senderName: `[FACÇÃO] ${senderName}`,
                senderRole,
                text: argStr,
                channel: 'faccao',
                timestamp: nowTimeStr(),
              };
              for (const c of connectedPlayers.values()) {
                const cFac = c.characterId ? db.characters[c.characterId]?.stats.factionId : c.factionId;
                if (cFac === charFaction) sendToClient(c, { type: 'chat_received', message: fMsg });
              }
              return;
            } else if (lowerCmd === '/r' && argStr) {
              channel = 'radio';
              finalText = argStr;
            } else if (lowerCmd === '/a' && argStr) {
              if (senderRole === 'player') return;
              const aMsg: ChatMessage = {
                id: 'adm-' + Date.now(),
                senderId: playerId,
                senderName: `[STAFF ${senderRole.toUpperCase()}] ${senderName}`,
                senderRole,
                text: argStr,
                channel: 'admin',
                timestamp: nowTimeStr(),
              };
              for (const c of connectedPlayers.values()) {
                if (c.role !== 'player') sendToClient(c, { type: 'chat_received', message: aMsg });
              }
              return;
            }
          }

          const newMsg: ChatMessage = {
            id: 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            senderId: playerId,
            senderName,
            senderRole,
            text: finalText,
            channel,
            timestamp: nowTimeStr(),
            position: senderPos,
          };

          if (channel === 'proximidade' || channel === 'rp') {
            for (const c of connectedPlayers.values()) {
              if (dist2D(c.position, senderPos) <= 38) {
                sendToClient(c, { type: 'chat_received', message: newMsg });
              }
            }
            return;
          }

          chatHistory.push(newMsg);
          if (chatHistory.length > 60) chatHistory.shift();
          broadcast({ type: 'chat_received', message: newMsg });
        } else if (msg.type === 'voice_chunk' && playerId) {
          const entry = connectedPlayers.get(playerId);
          if (!entry) return;
          const now = Date.now();
          if (!entry.voiceWindowStart || now - entry.voiceWindowStart > 3000) {
            entry.voiceWindowStart = now;
            entry.voiceCountInWindow = 1;
          } else {
            entry.voiceCountInWindow = (entry.voiceCountInWindow || 0) + 1;
            if (entry.voiceCountInWindow > 20) return;
          }
          const rawData = typeof msg.data === 'string' ? msg.data : '';
          if (!rawData || rawData.length > 96000) return;

          entry.lastActivityAt = now;
          entry.afkWarningStage = 0;

          const senderPos = msg.position && typeof msg.position.x === 'number' ? msg.position : entry.position;
          const isRadio = msg.channel === 'radio';
          const mimeType = String(msg.mimeType || 'audio/webm').slice(0, 40);

          for (const client of connectedPlayers.values()) {
            if (client.id === playerId || client.ws.readyState !== WebSocket.OPEN) continue;
            const d = dist2D(client.position, senderPos);
            if (!isRadio && d > 55) continue;
            sendToClient(client, {
              type: 'voice_chunk',
              senderId: playerId,
              senderName: entry.name,
              data: rawData,
              mimeType,
              position: senderPos,
              channel: isRadio ? 'radio' : 'proximity',
              distance: Math.round(d * 10) / 10,
              isRadio,
            });
          }
        } else if (msg.type === 'volleyball_hit' && playerId) {
          const entry = connectedPlayers.get(playerId);
          if (!entry) return;
          const now = Date.now();
          const cx = VOLLEYBALL_COURT_CENTER[0];
          const cz = VOLLEYBALL_COURT_CENTER[1];
          if (!db.worldState.volleyball) {
            db.worldState.volleyball = {
              x: cx,
              y: 0.45,
              z: cz,
              vx: 0,
              vy: 0,
              vz: 0,
              scoreLeft: 0,
              scoreRight: 0,
              updatedAt: now,
            };
          }
          const ball = db.worldState.volleyball;
          const distToBall = Math.hypot(entry.position.x - ball.x, entry.position.z - ball.z);
          if (distToBall <= 7.5) {
            entry.lastActivityAt = now;
            const aimX = Number(msg.dirX);
            const aimZ = Number(msg.dirZ);
            const towardsOppositeZ = ball.z >= cz ? -1 : 1;
            const vx = Number.isFinite(aimX) ? Math.max(-6, Math.min(6, aimX * 5.2)) : (cx - ball.x) * 0.45;
            const vz = Number.isFinite(aimZ) && Math.abs(aimZ) > 0.25
              ? Math.max(-8.5, Math.min(8.5, aimZ * 7.2))
              : towardsOppositeZ * (5.6 + Math.random() * 1.4);
            ball.vx = vx;
            ball.vy = 6.8 + Math.random() * 1.1;
            ball.vz = vz;
            ball.y = Math.max(ball.y, 0.9);
            ball.lastHitBy = entry.name;
            ball.updatedAt = now;
            broadcast({ type: 'volleyball_sync', volleyball: ball });
          }
        }
      } catch {}
    });

    const handleDisconnect = () => {
      if (playerId && connectedPlayers.get(playerId)?.ws === ws) {
        releasePlayerFromSharedVehicles(playerId);
        connectedPlayers.delete(playerId);
        broadcast({ type: 'player_left', id: playerId });
      }
    };

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
  });

  // Física em tempo real do Volei da Praia sincronizada pelo servidor (10 Hz quando a bola está em movimento)
  setInterval(() => {
    if (connectedPlayers.size === 0) return;
    const db = getDb();
    const ball = db.worldState.volleyball;
    if (!ball) return;
    const isMoving = Math.abs(ball.vx) > 0.04 || Math.abs(ball.vy) > 0.04 || Math.abs(ball.vz) > 0.04 || ball.y > 0.46;
    if (!isMoving) return;

    const dt = 0.1;
    const cx = VOLLEYBALL_COURT_CENTER[0];
    const cz = VOLLEYBALL_COURT_CENTER[1];
    ball.vy -= 13.5 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    // Limites laterais e rede
    if (ball.x < cx - 5.2) {
      ball.x = cx - 5.2;
      ball.vx = Math.abs(ball.vx) * 0.65;
    } else if (ball.x > cx + 5.2) {
      ball.x = cx + 5.2;
      ball.vx = -Math.abs(ball.vx) * 0.65;
    }
    if (Math.abs(ball.z - cz) < 0.35 && ball.y < 2.25 && ball.y > 0.9) {
      ball.vz = -ball.vz * 0.6;
      ball.z = ball.z >= cz ? cz + 0.38 : cz - 0.38;
    }

    if (ball.y <= 0.35) {
      ball.y = 0.35;
      if (Math.abs(ball.vz) > 1.2) {
        if (ball.z < cz) ball.scoreRight += 1;
        else ball.scoreLeft += 1;
      }
      ball.vx *= 0.45;
      ball.vz *= 0.45;
      ball.vy = Math.abs(ball.vy) > 2.2 ? Math.abs(ball.vy) * 0.42 : 0;
      if (Math.hypot(ball.vx, ball.vz) < 0.35 && ball.vy === 0) {
        ball.vx = 0;
        ball.vz = 0;
        ball.y = 0.35;
      }
      if (ball.z < cz - 8.5 || ball.z > cz + 8.5) {
        ball.x = cx;
        ball.z = cz + (ball.z < cz ? 2.2 : -2.2);
        ball.vx = 0;
        ball.vy = 0;
        ball.vz = 0;
      }
    }

    ball.updatedAt = Date.now();
    broadcast({ type: 'volleyball_sync', volleyball: ball });
  }, 100);

  // Limpeza de ligações mortas + Auditoria AFK (72 min -> 5h Prisão) + Payday Horário (Apenas Orgs Legais) + DJ
  setInterval(() => {
    const now = Date.now();
    const db = getDb();

    if (now - (db.worldState.lastPaydayAt || 0) >= PAYDAY_INTERVAL_MS && connectedPlayers.size > 0) {
      const paydayRes = processHourlyPayday(db, now);
      for (const rec of paydayRes.paidRecords) {
        for (const client of connectedPlayers.values()) {
          if (client.characterId === rec.characterId || client.id === rec.characterId) {
            sendToClient(client, {
              type: 'payday',
              amountKz: rec.amountKz,
              factionName: rec.factionName,
              rank: rec.rank,
            });
          }
        }
        pushAdminEffectToCharacter(rec.characterId, { action: 'refresh_character' });
      }
      if (paydayRes.paidCount > 0) {
        saveDb();
      }
    }

    if (db.djState.currentTrack && (db.djState.currentTrack.endsAt <= now || db.djState.endsAt <= now)) {
      db.djState.currentTrack = null;
      db.djState.startedAt = 0;
      db.djState.endsAt = 0;
      broadcastDjSync();
      saveDb();
    }

    for (const [id, entry] of connectedPlayers.entries()) {
      if (now - entry.lastSeen > 65000) {
        releasePlayerFromSharedVehicles(id);
        try {
          entry.ws.close();
        } catch {}
        connectedPlayers.delete(id);
        broadcast({ type: 'player_left', id });
        continue;
      }
      if (entry.ws.readyState === WebSocket.OPEN) {
        try {
          entry.ws.ping();
        } catch {}
      }
      checkSingleClientAfk(entry, db, now);
    }
  }, 30000);

  // Atualização meteorológica automática ligada à API de Luanda + hora do dia (a cada 3 minutos)
  const syncLiveWeather = async () => {
    try {
      const db = getDb();
      const telemetry = await fetchLuandaWeatherTelemetry(db.worldConfig.timeOfDay, false);
      const mode = db.worldConfig.weatherMode || 'auto';
      if (mode === 'auto') {
        db.worldConfig.weather = telemetry.current.mappedWeather;
      }
      const snapshot = buildWeatherForecastResponse(db.worldConfig.weather, mode, telemetry);
      setLatestForecastSnapshot(snapshot);
      if (connectedPlayers.size > 0) {
        broadcastWorldSync(snapshot);
      }
    } catch {}
  };
  void syncLiveWeather();
  setInterval(() => {
    void syncLiveWeather();
  }, 180000);
}
