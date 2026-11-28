/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Response } from 'express';
import {
  addAdminLog,
  addTransaction,
  createDefaultMissions,
  generateAngolanPhone,
  generateBI,
  generatePlate,
  getDb,
  saveDb,
  withCharacterLock,
} from './db.ts';
import type { CharacterRecord } from './db.ts';
import {
  findOrCreateAccountFromSupabaseUser,
  getAccountBlockingReason,
  getAdminEmail,
  hashPassword,
  rateLimit,
  requireAuth,
  requireRole,
  resolveAccountRole,
  signToken,
  verifyFirebaseIdToken,
  verifyPassword,
} from './auth.ts';
import type { AuthedRequest } from './auth.ts';
import { verifySupabaseAccessToken } from './supabaseAdmin.ts';
import {
  broadcastDjSync,
  broadcastDynamicWorldSync,
  broadcastEmergencyAlert,
  broadcastPoliticsSync,
  broadcastSharedVehicle,
  broadcastSystemChat,
  broadcastWorldSync,
  getConnectedCount,
  getConnectedPlayersSnapshot,
  getServerTelemetrySnapshot,
  markCharacterActive,
  pushAdminEffectToCharacter,
  removeSharedVehicleAndBroadcast,
  setLatestForecastSnapshot,
  syncConnectedCharacterPosition,
  syncConnectedPlayerProfile,
} from './wsHandler.ts';
import {
  buildWeatherForecastResponse,
  fetchLuandaWeatherTelemetry,
} from './weatherService.ts';
import {
  AIRPORT_FLIGHTS,
  ANGOLAN_DISHES,
  DJ_GLOBAL_COST_KZ,
  DJ_TRACKS_CATALOG,
  ELISAL_DUMPSTER_POINTS,
  ENDE_FAULT_POINTS,
  FAA_HEIST_COOLDOWN_MS,
  FAA_HEIST_REWARD_KZ,
  FACTION_CITY_STATIONS,
  FARM_CRATE_MAX_KZ,
  FARM_CRATE_MIN_KZ,
  FARM_MAX_CRATES,
  FARM_PLANT_NODES,
  FARM_REGROW_MAX_MS,
  FARM_REGROW_MIN_MS,
  FARM_VAN_RENT_KZ,
  FISH_SPECIES_CATALOG,
  FISHING_ZONES,
  FTX_CRAFT_RECIPES,
  JOBS_CATALOG,
  MOTO_RENTAL_DURATION_MS,
  MOTO_RENTAL_PRICE_KZ,
  MUSIC_PERSONAL_COST_KZ,
  normalizeWeatherType,
  SHOP_CATALOG,
  VEHICLE_CATALOG,
  VEHICLE_SKIN_PRESETS,
  WEAPON_CATALOG,
  WEAPON_LICENSE_BUY_KZ,
  WEAPON_LICENSE_DURATION_MS,
  WEAPON_LICENSE_RENEW_KZ,
  YANGO_PICKUP_NODES,
} from '../src/game/data/catalog.ts';
import {
  clampToValidWorldBounds,
  DEFAULT_SPAWN_POS,
  getAssignedCellData,
  isInInteriorPocket,
  MOTO_RENTAL_POS,
  PRISON_RELEASE_POS,
} from '../src/game/city/terrainPhysics.ts';
import type {
  AdminRole,
  InventoryItem,
  OwnedVehicleRecord,
  PlayerCustomization,
  PlayerStats,
  PoliticalCandidate,
  WeatherMode,
  WeatherType,
} from '../src/game/types.ts';

function assertOwnedChar(req: AuthedRequest, characterId: string, res: Response): CharacterRecord | null {
  const db = getDb();
  const char = db.characters[characterId];
  if (!char || char.accountId !== req.account!.id) {
    res.status(404).json({ error: 'Personagem não encontrado ou não pertence à tua conta.' });
    return null;
  }
  return char;
}

function advanceMission(char: CharacterRecord, missionId: string, amount = 1) {
  const m = char.missions.find((x) => x.id === missionId);
  if (m && !m.claimed) {
    m.progress = Math.min(m.target, m.progress + amount);
  }
}

function addXpAndCheckLevel(char: CharacterRecord, xpGain: number) {
  char.stats.xp += xpGain;
  const needed = char.stats.level * 120;
  if (char.stats.xp >= needed) {
    char.stats.xp -= needed;
    char.stats.level += 1;
    if (!char.achievements.includes('level_up')) {
      char.achievements.push('level_up');
    }
  }
}

function addItemToInventory(char: CharacterRecord, item: Omit<InventoryItem, 'id'>) {
  const existing = char.inventory.find((i) => i.catalogId === item.catalogId && item.category !== 'weapon');
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    char.inventory.push({
      ...item,
      id: 'inv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    });
  }
}

function totalInventoryWeight(char: CharacterRecord): number {
  return Number(
    char.inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0).toFixed(2)
  );
}

export function registerApiRoutes(app: Express) {
  // 0. STATUS PÚBLICO & TELEMETRIA MULTIPLAYER
  app.get('/api/status', (_req, res) => {
    const db = getDb();
    res.json({
      status: 'online',
      city: 'Luanda',
      country: 'Angola',
      activeCitizens: getConnectedCount(),
      totalCharacters: Object.keys(db.characters).length,
      worldConfig: db.worldConfig,
      worldState: db.worldState,
      serverTelemetry: getServerTelemetrySnapshot(),
      serverTime: new Date().toISOString(),
    });
  });

  // 1. AUTENTICAÇÃO & CONTAS
  app.post('/api/auth/register', rateLimit(15, 60000), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !email.includes('@') || password.length < 6) {
      return res.status(400).json({ error: 'Insere um email válido e palavra-passe com pelo menos 6 caracteres.' });
    }

    const db = getDb();
    const existing = Object.values(db.accounts).find((a) => a.email === email);
    if (existing) {
      return res.status(409).json({ error: 'Já existe uma conta registada com este email.' });
    }

    const id = 'acc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const recoveryCode = String(Math.floor(100000 + Math.random() * 899999));
    const account = {
      id,
      email,
      accountStatus: 'active' as const,
      passwordHash: hashPassword(password),
      recoveryCode,
      role: 'player' as AdminRole,
      bannedUntil: 0,
      banReason: '',
      suspendedUntil: 0,
      createdAt: new Date().toISOString(),
    };
    resolveAccountRole(account);
    db.accounts[id] = account;
    await saveDb();

    const token = signToken(account);
    res.json({
      token,
      recoveryCode,
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        accountStatus: account.accountStatus,
        bannedUntil: account.bannedUntil,
        banReason: account.banReason,
        suspendedUntil: account.suspendedUntil,
      },
    });
  });

  app.post('/api/auth/login', rateLimit(20, 60000), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const db = getDb();
    const account = Object.values(db.accounts).find((a) => a.email === email);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ error: 'Email ou palavra-passe incorretos.' });
    }

    const blockingReason = getAccountBlockingReason(account);
    if (blockingReason) {
      return res.status(403).json({ error: blockingReason });
    }

    const role = resolveAccountRole(account);
    await saveDb();
    const token = signToken(account);

    res.json({
      token,
      account: {
        id: account.id,
        email: account.email,
        role,
        accountStatus: account.accountStatus || 'active',
        bannedUntil: account.bannedUntil,
        banReason: account.banReason,
        suspendedUntil: account.suspendedUntil,
      },
    });
  });

  app.post('/api/auth/recover', rateLimit(10, 60000), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const recoveryCode = String(req.body?.recoveryCode || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (!email || !recoveryCode || newPassword.length < 6) {
      return res.status(400).json({ error: 'Preenche email, código de recuperação e nova senha (6+ chars).' });
    }
    const db = getDb();
    const account = Object.values(db.accounts).find((a) => a.email === email);
    if (!account || account.recoveryCode !== recoveryCode) {
      return res.status(400).json({ error: 'Código de recuperação inválido para este email.' });
    }
    account.passwordHash = hashPassword(newPassword);
    account.recoveryCode = String(Math.floor(100000 + Math.random() * 899999));
    await saveDb();
    res.json({ ok: true, newRecoveryCode: account.recoveryCode });
  });

  app.post('/api/auth/supabase', rateLimit(30, 60000), async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const accessToken = String(req.body?.accessToken || bearerToken || '').trim();
    if (!accessToken) {
      return res.status(400).json({ error: 'Token Supabase em falta.' });
    }
    try {
      const verified = await verifySupabaseAccessToken(accessToken);
      if (!verified) {
        return res.status(401).json({ error: 'Sessão Supabase inválida ou expirada. Faz login novamente.' });
      }
      const account = await findOrCreateAccountFromSupabaseUser(verified);
      const blockingReason = getAccountBlockingReason(account);
      if (blockingReason) {
        return res.status(403).json({ error: blockingReason });
      }
      const role = resolveAccountRole(account);
      await saveDb();
      const token = signToken(account);
      res.json({
        token,
        account: {
          id: account.id,
          email: account.email,
          role,
          accountStatus: account.accountStatus || 'active',
          bannedUntil: account.bannedUntil,
          banReason: account.banReason,
          suspendedUntil: account.suspendedUntil,
        },
      });
    } catch (err: unknown) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Autenticação Supabase recusada.',
      });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/auth/firebase', rateLimit(20, 60000), async (req, res) => {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) {
      return res.status(400).json({ error: 'Token Firebase em falta.' });
    }
    try {
      const verified = await verifyFirebaseIdToken(idToken);
      const db = getDb();
      let account = Object.values(db.accounts).find((a) => a.email === verified.email);
      if (!account) {
        const id = 'acc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const recoveryCode = String(Math.floor(100000 + Math.random() * 899999));
        account = {
          id,
          email: verified.email,
          accountStatus: 'active',
          passwordHash: hashPassword(idToken.slice(0, 24) + '-' + Date.now()),
          recoveryCode,
          role: 'player' as AdminRole,
          bannedUntil: 0,
          banReason: '',
          suspendedUntil: 0,
          createdAt: new Date().toISOString(),
        };
        resolveAccountRole(account);
        db.accounts[id] = account;
      }

      const blockingReason = getAccountBlockingReason(account);
      if (blockingReason) {
        return res.status(403).json({ error: blockingReason });
      }

      const role = resolveAccountRole(account);
      await saveDb();
      const token = signToken(account);
      res.json({
        token,
        account: {
          id: account.id,
          email: account.email,
          role,
          accountStatus: account.accountStatus || 'active',
          bannedUntil: account.bannedUntil,
          banReason: account.banReason,
          suspendedUntil: account.suspendedUntil,
        },
      });
    } catch (err: unknown) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Autenticação Firebase recusada.',
      });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const acc = req.account!;
    res.json({
      account: {
        id: acc.id,
        email: acc.email,
        role: resolveAccountRole(acc),
        accountStatus: acc.accountStatus || 'active',
        bannedUntil: acc.bannedUntil,
        banReason: acc.banReason,
        suspendedUntil: acc.suspendedUntil,
      },
    });
  });

  // 2. PERSONAGENS
  app.get('/api/characters', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const chars = Object.values(db.characters)
      .filter((c) => c.accountId === req.account!.id)
      .map((c) => ({
        id: c.id,
        name: c.stats.name,
        surname: c.stats.surname,
        age: c.stats.age,
        nationality: c.stats.nationality,
        gender: c.stats.gender,
        idNumber: c.stats.idNumber,
        phone: c.stats.phone,
        cashKz: c.stats.cashKz,
        bankKz: c.stats.bankKz,
        level: c.stats.level,
        jobId: c.stats.jobId,
        factionId: c.stats.factionId,
        customization: c.customization,
      }));
    res.json({ characters: chars });
  });

  app.post('/api/characters', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const existingCount = Object.values(db.characters).filter((c) => c.accountId === req.account!.id).length;
    if (existingCount >= 4) {
      return res.status(400).json({ error: 'Máximo de 4 personagens por conta.' });
    }

    const name = String(req.body?.name || '').trim().slice(0, 24);
    const surname = String(req.body?.surname || '').trim().slice(0, 24);
    const age = Math.max(18, Math.min(85, Number(req.body?.age) || 24));
    const nationality = String(req.body?.nationality || 'Angolana').trim().slice(0, 30);
    const gender = req.body?.gender === 'feminino' ? 'feminino' : 'masculino';
    const history = String(req.body?.history || 'Cidadão trabalhador à procura de sucesso em Luanda.').slice(0, 280);

    if (!name || !surname) {
      return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios.' });
    }

    const custInput: Partial<PlayerCustomization> = req.body?.customization || {};
    const customization: PlayerCustomization = {
      ...custInput,
      gender,
      skinTone: custInput.skinTone || '#a16244',
      shirtColor: custInput.shirtColor || '#dc2626',
      pantsColor: custInput.pantsColor || '#111827',
      shoesColor: custInput.shoesColor || '#18181b',
      hairStyle: custInput.hairStyle || 'trancas',
      hairColor: custInput.hairColor || '#cbd5e1',
      heightScale: Math.max(0.85, Math.min(1.15, Number(custInput.heightScale) || 1.0)),
    };

    const id = 'char-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const phone = generateAngolanPhone(db);
    const idNumber = generateBI();

    const stats: PlayerStats = {
      name,
      surname,
      age,
      nationality,
      gender,
      phone,
      history,
      idNumber,
      cashKz: 100,
      bankKz: 7000,
      loanBalanceKz: 0,
      health: 100,
      armor: 0,
      energy: 100,
      hunger: 100,
      thirst: 100,
      sleep: 100,
      bleeding: false,
      isUnconscious: false,
      wantedStars: 0,
      jailUntil: 0,
      jailReason: '',
      assignedCell: 0,
      homePropertyId: null,
      xp: 0,
      level: 1,
      jobId: null,
      jobLevel: 1,
      jobXp: 0,
      factionId: null,
      factionRank: 'Civil',
      isFrozen: false,
    };

    const char: CharacterRecord = {
      id,
      accountId: req.account!.id,
      stats,
      customization,
      inventory: [
        {
          id: 'inv-bi-' + id,
          catalogId: 'bi_angola',
          name: `Bilhete de Identidade (${idNumber})`,
          description: `Documento Oficial de ${name} ${surname}`,
          category: 'document',
          quantity: 1,
          weight: 0.05,
          equipped: false,
          usable: false,
          sellPriceKz: 0,
        },
        {
          id: 'inv-phone-' + id,
          catalogId: 'telemovel_luanda',
          name: 'Smartphone Luanda 5G',
          description: `Número ativo: ${phone}`,
          category: 'phone',
          quantity: 1,
          weight: 0.3,
          equipped: true,
          usable: true,
          sellPriceKz: 5000,
        },
        {
          id: 'inv-agua-' + id,
          catalogId: 'agua_pura',
          name: 'Garrafa de Água Pura 1.5L',
          description: 'Kit inicial de hidratação.',
          category: 'drink',
          quantity: 2,
          weight: 0.5,
          equipped: false,
          usable: true,
          sellPriceKz: 100,
        },
      ],
      jobStepIndex: 0,
      activeJobStartedAt: 0,
      completedJobsCount: 0,
      counters: { jobsCompleted: 0, purchasesCount: 0, robberiesCount: 0, healsCount: 0 },
      missions: createDefaultMissions(),
      achievements: ['first_citizen'],
      position: { ...DEFAULT_SPAWN_POS },
      rotationY: Math.PI,
      updatedAt: new Date().toISOString(),
    };

    db.characters[id] = char;
    addTransaction(id, 'deposit', 7000, 'Subsídio inicial de cidadania — Governo de Luanda');
    await saveDb();
    res.json({ character: char });
  });

  app.get('/api/characters/:id', requireAuth, async (req: AuthedRequest, res) => {
    const char = assertOwnedChar(req, req.params.id, res);
    if (!char) return;
    const db = getDb();
    const now = Date.now();
    markCharacterActive(char.id, now);

    // Garante cumprimento de pena offline e libertação automática limpa ao expirar
    if (char.stats.jailUntil > now) {
      const cell = getAssignedCellData(char.stats.assignedCell || 1);
      char.stats.assignedCell = cell.cell;
      char.position = { x: cell.x, y: cell.y, z: cell.z };
    } else if (char.stats.jailUntil > 0 && char.stats.jailUntil <= now) {
      char.stats.jailUntil = 0;
      char.stats.jailReason = '';
      char.stats.assignedCell = 0;
      char.position = { x: PRISON_RELEASE_POS[0], y: 0, z: PRISON_RELEASE_POS[2] };
      await saveDb();
    }

    if (typeof char.stats.sleep !== 'number') char.stats.sleep = 100;

    const vehicles = Object.values(db.vehicles).filter((v) => v.ownerId === char.id);
    const transactions = db.transactions.filter((t) => t.characterId === char.id).slice(0, 40);
    const jobWorkLogs = db.jobWorkLogs.filter((l) => l.characterId === char.id).slice(0, 25);
    res.json({ character: char, vehicles, transactions, jobWorkLogs, worldConfig: db.worldConfig });
  });

  app.patch('/api/characters/:id/appearance', requireAuth, async (req: AuthedRequest, res) => {
    const char = assertOwnedChar(req, req.params.id, res);
    if (!char) return;
    const { name, surname, age, nationality, history, gender, customization } = req.body || {};
    if (typeof name === 'string' && name.trim()) char.stats.name = name.trim().slice(0, 24);
    if (typeof surname === 'string' && surname.trim()) char.stats.surname = surname.trim().slice(0, 24);
    if (typeof age === 'number' && age >= 18 && age <= 85) char.stats.age = Math.round(age);
    if (typeof nationality === 'string' && nationality.trim()) char.stats.nationality = nationality.trim().slice(0, 30);
    if (typeof history === 'string') char.stats.history = history.slice(0, 280);
    if (gender === 'masculino' || gender === 'feminino') char.stats.gender = gender;
    if (customization) {
      char.customization = {
        ...char.customization,
        ...customization,
        gender: char.stats.gender,
      };
    }
    char.updatedAt = new Date().toISOString();
    await saveDb();
    syncConnectedPlayerProfile(char.id);
    res.json({ character: char });
  });

  // Salvamento automático seguro (com suporte a Morros e Interiores isolados)
  app.post('/api/characters/:id/autosave', requireAuth, async (req: AuthedRequest, res) => {
    const char = assertOwnedChar(req, req.params.id, res);
    if (!char) return;
    const { position, rotationY, hunger, thirst, energy, sleep, health, interiorId } = req.body || {};
    if (position && typeof position.x === 'number' && typeof position.z === 'number') {
      const clamped = clampToValidWorldBounds(position.x, position.z);
      char.position = {
        x: clamped.x,
        y: Math.max(-3, Math.min(50, Number(position.y) || 0)),
        z: clamped.z,
      };
      if (interiorId !== undefined) {
        char.stats.interiorId = typeof interiorId === 'string' ? interiorId : null;
      } else if (!isInInteriorPocket(clamped.x, clamped.z)) {
        char.stats.interiorId = null;
      }
    }
    if (typeof rotationY === 'number') char.rotationY = rotationY;
    if (typeof hunger === 'number') char.stats.hunger = Math.max(0, Math.min(100, hunger));
    if (typeof thirst === 'number') char.stats.thirst = Math.max(0, Math.min(100, thirst));
    if (typeof energy === 'number') char.stats.energy = Math.max(0, Math.min(100, energy));
    if (typeof sleep === 'number') char.stats.sleep = Math.max(0, Math.min(100, sleep));
    if (typeof health === 'number') {
      char.stats.health = Math.max(0, Math.min(char.stats.health, health));
      if (char.stats.health <= 0) char.stats.isUnconscious = true;
    }
    char.updatedAt = new Date().toISOString();
    await saveDb();
    res.json({ ok: true, stats: char.stats });
  });

  // 3. ECONOMIA & MULTICAIXA
  app.post('/api/bank/action', requireAuth, rateLimit(25, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, amount, targetPhoneOrBi } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0 || !Number.isFinite(amt)) {
      return res.status(400).json({ error: 'Valor inválido.' });
    }

    return await withCharacterLock(char.id, async () => {
      const db = getDb();

      if (action === 'deposit') {
        if (char.stats.cashKz < amt) return res.status(400).json({ error: 'Saldo insuficiente em carteira (Cash).' });
        char.stats.cashKz -= amt;
        char.stats.bankKz += amt;
        addTransaction(char.id, 'deposit', amt, 'Depósito Multicaixa');
      } else if (action === 'withdraw') {
        if (char.stats.bankKz < amt) return res.status(400).json({ error: 'Saldo bancário insuficiente.' });
        char.stats.bankKz -= amt;
        char.stats.cashKz += amt;
        addTransaction(char.id, 'withdraw', -amt, 'Levantamento Multicaixa');
      } else if (action === 'transfer' || action === 'pay_cash') {
        const q = String(targetPhoneOrBi || '').trim().toLowerCase();
        const target = Object.values(db.characters).find(
          (c) =>
            c.id !== char.id &&
            (c.stats.phone.toLowerCase() === q ||
              c.stats.idNumber.toLowerCase() === q ||
              `${c.stats.name} ${c.stats.surname}`.toLowerCase() === q)
        );
        if (!target) return res.status(404).json({ error: 'Destinatário não encontrado (usa Telefone, BI ou Nome completo).' });

        if (action === 'pay_cash') {
          if (char.stats.cashKz < amt) return res.status(400).json({ error: 'Dinheiro insuficiente em mão.' });
          char.stats.cashKz -= amt;
          target.stats.cashKz += amt;
        } else {
          if (char.stats.bankKz < amt) return res.status(400).json({ error: 'Saldo bancário insuficiente.' });
          const tax = Math.round(amt * db.worldConfig.taxRate);
          if (char.stats.bankKz < amt + tax) return res.status(400).json({ error: `Saldo insuficiente para cobrir taxa (${tax} Kz).` });
          char.stats.bankKz -= amt + tax;
          target.stats.bankKz += amt;
        }
        addTransaction(char.id, 'transfer', -amt, `Enviado para ${target.stats.name} ${target.stats.surname}`);
        addTransaction(target.id, 'transfer', amt, `Recebido de ${char.stats.name} ${char.stats.surname}`);
        pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
      } else if (action === 'loan') {
        const maxLoan = 100000;
        if (char.stats.loanBalanceKz + amt > maxLoan) {
          return res.status(400).json({ error: `Limite máximo de crédito: ${maxLoan.toLocaleString('pt-PT')} Kz.` });
        }
        const interest = Math.round(amt * 0.15);
        char.stats.bankKz += amt;
        char.stats.loanBalanceKz += amt + interest;
        addTransaction(char.id, 'loan', amt, `Empréstimo Bancário (+15% juros: ${amt + interest} Kz dívida)`);
      } else if (action === 'repay_loan') {
        const pay = Math.min(amt, char.stats.loanBalanceKz);
        if (pay <= 0) return res.status(400).json({ error: 'Não tens dívida ativa.' });
        if (char.stats.bankKz < pay) return res.status(400).json({ error: 'Saldo bancário insuficiente.' });
        char.stats.bankKz -= pay;
        char.stats.loanBalanceKz -= pay;
        addTransaction(char.id, 'loan', -pay, 'Amortização de empréstimo bancário');
      } else {
        return res.status(400).json({ error: 'Operação bancária inválida.' });
      }

      await saveDb();
      const transactions = db.transactions.filter((t) => t.characterId === char.id).slice(0, 40);
      res.json({ character: char, transactions });
    });
  });

  // 4. LOJAS & INVENTÁRIO REAL
  app.post('/api/shop/buy', requireAuth, rateLimit(30, 15000), async (req: AuthedRequest, res) => {
    const { characterId, catalogId, quantity = 1, payWith = 'cash' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    const item = SHOP_CATALOG.find((s) => s.catalogId === catalogId);
    const qty = Math.max(1, Math.min(20, Math.floor(Number(quantity) || 1)));
    if (!item) return res.status(404).json({ error: 'Artigo não existe no catálogo.' });

    if (item.category === 'weapon' && item.weaponId) {
      const weaponSpec = WEAPON_CATALOG[item.weaponId];
      if (weaponSpec && !weaponSpec.isMelee && (char.stats.weaponLicenseUntil || 0) <= Date.now()) {
        return res.status(403).json({
          error: 'Porte de Arma obrigatório! Obtém a tua Licença de Armas na Esquadra PNA (50.000 Kz / 15 dias).',
        });
      }
    }

    return await withCharacterLock(char.id, async () => {
      const totalWeight = totalInventoryWeight(char) + item.weight * qty;
      if (totalWeight > 35) {
        return res.status(400).json({ error: 'Mochila demasiado pesada! Máximo permitido: 35 kg.' });
      }

      const totalCost = Math.round(item.priceKz * qty);
      if (payWith === 'bank') {
        if (char.stats.bankKz < totalCost) return res.status(400).json({ error: 'Saldo bancário insuficiente.' });
        char.stats.bankKz -= totalCost;
      } else {
        if (char.stats.cashKz < totalCost) return res.status(400).json({ error: 'Kwanza insuficiente em carteira.' });
        char.stats.cashKz -= totalCost;
      }

      addItemToInventory(char, {
        catalogId: item.catalogId,
        name: item.name,
        description: item.description,
        category: item.category,
        quantity: qty,
        weight: item.weight,
        equipped: false,
        usable: item.usable,
        sellPriceKz: Math.round(item.priceKz * 0.55),
      });

      char.counters.purchasesCount += 1;
      advanceMission(char, 'daily_shop_3', 1);
      addTransaction(char.id, 'purchase', -totalCost, `Compra: ${qty}x ${item.name}`);
      await saveDb();
      res.json({ character: char });
    });
  });

  app.post('/api/inventory/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, itemId, action, targetQuery, x, z } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    return await withCharacterLock(char.id, async () => {
      const idx = char.inventory.findIndex((i) => i.id === itemId);
      if (idx < 0) return res.status(404).json({ error: 'Item não encontrado na mochila.' });
      const item = char.inventory[idx];
      const db = getDb();

      if (action === 'use') {
        const cat = SHOP_CATALOG.find((c) => c.catalogId === item.catalogId);
        if (cat?.effects) {
          if (cat.effects.health) char.stats.health = Math.min(100, char.stats.health + cat.effects.health);
          if (cat.effects.armor) char.stats.armor = Math.min(100, char.stats.armor + cat.effects.armor);
          if (cat.effects.hunger) char.stats.hunger = Math.min(100, char.stats.hunger + cat.effects.hunger);
          if (cat.effects.thirst) char.stats.thirst = Math.min(100, char.stats.thirst + cat.effects.thirst);
          if (cat.effects.energy) char.stats.energy = Math.min(100, char.stats.energy + cat.effects.energy);
          if (cat.effects.stopBleeding) char.stats.bleeding = false;
        }
        if (item.category !== 'phone' && item.category !== 'document' && item.category !== 'weapon') {
          item.quantity -= 1;
          if (item.quantity <= 0) char.inventory.splice(idx, 1);
        } else {
          item.equipped = !item.equipped;
          if (item.category === 'weapon') {
            if (item.equipped) {
              char.inventory.forEach((other) => {
                if (other.id !== item.id && other.category === 'weapon') other.equipped = false;
              });
              char.customization.equippedWeapon = (cat?.weaponId || 'none') as PlayerCustomization['equippedWeapon'];
            } else {
              char.customization.equippedWeapon = 'none';
            }
          }
        }
      } else if (action === 'equip') {
        item.equipped = !item.equipped;
        if (item.category === 'weapon') {
          const cat = SHOP_CATALOG.find((c) => c.catalogId === item.catalogId);
          if (item.equipped) {
            char.inventory.forEach((other) => {
              if (other.id !== item.id && other.category === 'weapon') other.equipped = false;
            });
            char.customization.equippedWeapon = (cat?.weaponId || 'none') as PlayerCustomization['equippedWeapon'];
          } else {
            char.customization.equippedWeapon = 'none';
          }
        }
      } else if (action === 'sell') {
        if (item.sellPriceKz <= 0) return res.status(400).json({ error: 'Este item pessoal não pode ser vendido.' });
        char.stats.cashKz += item.sellPriceKz;
        addTransaction(char.id, 'sale', item.sellPriceKz, `Venda de ${item.name}`);
        item.quantity -= 1;
        if (item.quantity <= 0) char.inventory.splice(idx, 1);
      } else if (action === 'drop') {
        db.droppedItems.push({
          id: 'drop-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
          catalogId: item.catalogId,
          name: item.name,
          description: item.description,
          category: item.category,
          quantity: 1,
          weight: item.weight,
          usable: item.usable,
          sellPriceKz: item.sellPriceKz,
          x: Number(x) || char.position.x,
          z: Number(z) || char.position.z,
          droppedBy: char.stats.name,
        });
        item.quantity -= 1;
        if (item.quantity <= 0) char.inventory.splice(idx, 1);
      } else if (action === 'give') {
        const q = String(targetQuery || '').trim().toLowerCase();
        const target = Object.values(db.characters).find(
          (c) =>
            c.id !== char.id &&
            (c.stats.phone.toLowerCase() === q || `${c.stats.name} ${c.stats.surname}`.toLowerCase() === q)
        );
        if (!target) return res.status(404).json({ error: 'Cidadão destinatário não encontrado.' });
        addItemToInventory(target, { ...item, quantity: 1, equipped: false });
        item.quantity -= 1;
        if (item.quantity <= 0) char.inventory.splice(idx, 1);
        pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
      }

      await saveDb();
      res.json({ character: char, droppedItems: db.droppedItems });
    });
  });

  app.get('/api/world/drops', (_req, res) => {
    res.json({ droppedItems: getDb().droppedItems });
  });

  app.post('/api/world/pickup', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, dropId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const idx = db.droppedItems.findIndex((d) => d.id === dropId);
    if (idx < 0) return res.status(404).json({ error: 'Objeto já foi apanhado.' });
    const drop = db.droppedItems[idx];
    db.droppedItems.splice(idx, 1);
    addItemToInventory(char, {
      catalogId: drop.catalogId,
      name: drop.name,
      description: drop.description,
      category: drop.category,
      quantity: drop.quantity,
      weight: drop.weight,
      equipped: false,
      usable: drop.usable,
      sellPriceKz: drop.sellPriceKz,
    });
    await saveDb();
    res.json({ character: char, droppedItems: db.droppedItems });
  });

  // 5. VEÍCULOS, GARAGEM & OFICINA (Com sincronização partilhada no mundo)
  app.get('/api/vehicles/shared', (_req, res) => {
    const db = getDb();
    const now = Date.now();
    for (const [id, sv] of Object.entries(db.sharedVehicles || {})) {
      if (sv.isTestDrive && sv.testDriveExpiresAt && sv.testDriveExpiresAt <= now) {
        removeSharedVehicleAndBroadcast(id);
      }
    }
    res.json({ vehicles: Object.values(db.sharedVehicles || {}) });
  });

  app.post('/api/vehicles/test-drive', requireAuth, rateLimit(10, 30000), async (req: AuthedRequest, res) => {
    const { characterId, modelId, color } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const cat = VEHICLE_CATALOG.find((v) => v.modelId === modelId);
    if (!cat) return res.status(404).json({ error: 'Modelo não encontrado na Concessionária CICOMEX.' });
    const db = getDb();
    const now = Date.now();
    db.sharedVehicles = db.sharedVehicles || {};
    for (const [id, sv] of Object.entries(db.sharedVehicles)) {
      if (sv.isTestDrive && (sv.ownerId === char.id || (sv.testDriveExpiresAt && sv.testDriveExpiresAt <= now))) {
        removeSharedVehicleAndBroadcast(id);
      }
    }
    const tdId = `td-${char.id}-${now}`;
    const expiresAt = now + 90000;
    const sv = {
      id: tdId,
      ownerId: char.id,
      modelId: cat.modelId,
      name: `${cat.name} (Test Drive CICOMEX)`,
      type: cat.type,
      plate: `TD-${Math.floor(100 + Math.random() * 899)}`,
      color: typeof color === 'string' && color ? color : cat.defaultColor,
      skinId: cat.defaultSkinId,
      position: { x: 46, y: 0, z: -56 },
      rotationY: Math.PI / 2,
      speedKmh: 0,
      steeringAngle: 0,
      driverId: null,
      passengers: [],
      headlightsOn: false,
      sirenOn: false,
      engineOn: true,
      blinkerMode: 'off' as const,
      isLocked: false,
      health: 100,
      fuel: 100,
      mileageKm: 0,
      isTestDrive: true,
      testDriveExpiresAt: expiresAt,
      lastUpdatedAt: now,
    };
    db.sharedVehicles[tdId] = sv;
    broadcastSharedVehicle(sv);
    await saveDb();
    res.json({ vehicle: sv, expiresAt });
  });

  app.post('/api/vehicles/buy', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, modelId, color, skinId, accentColor } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const cat = VEHICLE_CATALOG.find((v) => v.modelId === modelId);
    if (!cat) return res.status(404).json({ error: 'Modelo de viatura não encontrado.' });
    if (cat.factionOnly && char.stats.factionId !== cat.factionOnly) {
      return res.status(403).json({ error: `Esta viatura exige filiação na facção: ${cat.factionOnly}.` });
    }
    return await withCharacterLock(char.id, async () => {
      if (char.stats.bankKz < cat.priceKz && char.stats.cashKz < cat.priceKz) {
        return res.status(400).json({ error: `Precisas de ${cat.priceKz.toLocaleString('pt-PT')} Kz no banco ou carteira.` });
      }
      if (char.stats.bankKz >= cat.priceKz) char.stats.bankKz -= cat.priceKz;
      else char.stats.cashKz -= cat.priceKz;

      const chosenSkinId = typeof skinId === 'string' ? skinId : cat.defaultSkinId;
      const skinPreset = chosenSkinId ? VEHICLE_SKIN_PRESETS.find((s) => s.id === chosenSkinId) : undefined;

      const db = getDb();
      const vehId = 'veh-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const rec: OwnedVehicleRecord = {
        id: vehId,
        ownerId: char.id,
        modelId: cat.modelId,
        name: cat.name,
        type: cat.type,
        plate: generatePlate(db),
        color: color || skinPreset?.baseColor || cat.defaultColor,
        accentColor: typeof accentColor === 'string' ? accentColor : skinPreset?.accentColor,
        skinId: chosenSkinId,
        engineLevel: 1,
        suspensionLevel: 1,
        wheelStyle: chosenSkinId ? 'desportiva' : 'padrao',
        fuel: 100,
        health: 100,
        isLocked: false,
        isStoredInGarage: false,
        isImpounded: false,
        finesKz: 0,
        position: { x: 10, y: 0, z: -12 },
        rotationY: 0,
      };
      db.vehicles[vehId] = rec;
      db.sharedVehicles = db.sharedVehicles || {};
      const sv = {
        id: rec.id,
        ownerId: rec.ownerId,
        modelId: rec.modelId,
        name: rec.name,
        type: rec.type,
        plate: rec.plate,
        color: rec.color,
        accentColor: rec.accentColor,
        skinId: rec.skinId,
        position: { ...rec.position },
        rotationY: rec.rotationY,
        speedKmh: 0,
        steeringAngle: 0,
        driverId: null,
        passengers: [],
        headlightsOn: false,
        sirenOn: false,
        engineOn: false,
        blinkerMode: 'off' as const,
        isLocked: false,
        health: 100,
        fuel: 100,
        lastUpdatedAt: Date.now(),
      };
      db.sharedVehicles[vehId] = sv;
      broadcastSharedVehicle(sv);
      addTransaction(char.id, 'purchase', -cat.priceKz, `Compra Viatura: ${cat.name} [${rec.plate}]`);
      await saveDb();
      res.json({ character: char, vehicle: rec, vehicles: Object.values(db.vehicles).filter((v) => v.ownerId === char.id) });
    });
  });

  app.post('/api/vehicles/rent-moto', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, payWith = 'cash' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const now = Date.now();

      for (const [id, v] of Object.entries(db.vehicles)) {
        if (v.ownerId === char.id && v.isRental && v.rentedUntil && v.rentedUntil <= now) {
          delete db.vehicles[id];
          removeSharedVehicleAndBroadcast(id);
        }
      }

      const activeRental = Object.values(db.vehicles).find(
        (v) => v.ownerId === char.id && v.isRental && (!v.rentedUntil || v.rentedUntil > now)
      );
      if (activeRental) {
        activeRental.isStoredInGarage = false;
        activeRental.position = {
          x: MOTO_RENTAL_POS[0] + 2.5,
          y: 0,
          z: MOTO_RENTAL_POS[2] + 2.5,
        };
        db.sharedVehicles = db.sharedVehicles || {};
        const sv = {
          id: activeRental.id,
          ownerId: activeRental.ownerId,
          modelId: activeRental.modelId,
          name: activeRental.name,
          type: activeRental.type,
          plate: activeRental.plate,
          color: activeRental.color,
          position: { ...activeRental.position },
          rotationY: activeRental.rotationY,
          speedKmh: 0,
          steeringAngle: 0,
          driverId: null,
          passengers: [],
          headlightsOn: false,
          sirenOn: false,
          engineOn: false,
          blinkerMode: 'off' as const,
          isLocked: false,
          health: activeRental.health,
          fuel: activeRental.fuel,
          lastUpdatedAt: now,
        };
        db.sharedVehicles[activeRental.id] = sv;
        broadcastSharedVehicle(sv);
        await saveDb();
        return res.json({
          character: char,
          vehicle: activeRental,
          vehicles: Object.values(db.vehicles).filter((v) => v.ownerId === char.id),
        });
      }

      if (payWith === 'bank') {
        if (char.stats.bankKz < MOTO_RENTAL_PRICE_KZ) {
          return res.status(400).json({ error: `Saldo bancário insuficiente (${MOTO_RENTAL_PRICE_KZ.toLocaleString('pt-PT')} Kz).` });
        }
        char.stats.bankKz -= MOTO_RENTAL_PRICE_KZ;
      } else if (char.stats.cashKz >= MOTO_RENTAL_PRICE_KZ) {
        char.stats.cashKz -= MOTO_RENTAL_PRICE_KZ;
      } else if (char.stats.bankKz >= MOTO_RENTAL_PRICE_KZ) {
        char.stats.bankKz -= MOTO_RENTAL_PRICE_KZ;
      } else {
        return res.status(400).json({ error: `Alugar moto Kupapata custa ${MOTO_RENTAL_PRICE_KZ.toLocaleString('pt-PT')} Kz.` });
      }

      const vehId = 'veh-rent-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const rec: OwnedVehicleRecord = {
        id: vehId,
        ownerId: char.id,
        modelId: 'moto_kupapata',
        name: 'Kupapata 150cc (Aluguer Praia)',
        type: 'moto',
        plate: generatePlate(db),
        color: '#f97316',
        engineLevel: 1,
        suspensionLevel: 1,
        wheelStyle: 'padrao',
        fuel: 100,
        health: 100,
        isLocked: false,
        isStoredInGarage: false,
        isImpounded: false,
        finesKz: 0,
        isRental: true,
        rentedUntil: now + MOTO_RENTAL_DURATION_MS,
        position: {
          x: MOTO_RENTAL_POS[0] + 2.5,
          y: 0,
          z: MOTO_RENTAL_POS[2] + 2.5,
        },
        rotationY: 0,
      };
      db.vehicles[vehId] = rec;
      db.sharedVehicles = db.sharedVehicles || {};
      const sv = {
        id: rec.id,
        ownerId: rec.ownerId,
        modelId: rec.modelId,
        name: rec.name,
        type: rec.type,
        plate: rec.plate,
        color: rec.color,
        position: { ...rec.position },
        rotationY: 0,
        speedKmh: 0,
        steeringAngle: 0,
        driverId: null,
        passengers: [],
        headlightsOn: false,
        sirenOn: false,
        engineOn: false,
        blinkerMode: 'off' as const,
        isLocked: false,
        health: 100,
        fuel: 100,
        lastUpdatedAt: now,
      };
      db.sharedVehicles[vehId] = sv;
      broadcastSharedVehicle(sv);
      addTransaction(char.id, 'purchase', -MOTO_RENTAL_PRICE_KZ, `Aluguer Moto Kupapata (20min) [${rec.plate}]`);
      await saveDb();
      res.json({ character: char, vehicle: rec, vehicles: Object.values(db.vehicles).filter((v) => v.ownerId === char.id) });
    });
  });

  app.post('/api/vehicles/:vehId/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, color, accentColor, skinId, wheelStyle, position, rotationY, fuel, health, mileageKm } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const veh = db.vehicles[req.params.vehId];
    if (!veh || veh.ownerId !== char.id) {
      return res.status(404).json({ error: 'Viatura não encontrada na tua posse.' });
    }

    if (action === 'store') {
      veh.isStoredInGarage = true;
      if (typeof fuel === 'number') veh.fuel = Math.max(0, Math.min(100, fuel));
      if (typeof health === 'number') veh.health = Math.max(0, Math.min(100, health));
      if (typeof mileageKm === 'number' && Number.isFinite(mileageKm)) veh.mileageKm = Math.max(veh.mileageKm || 0, mileageKm);
      else if (db.sharedVehicles?.[veh.id]?.mileageKm) veh.mileageKm = Math.max(veh.mileageKm || 0, db.sharedVehicles[veh.id].mileageKm || 0);
      removeSharedVehicleAndBroadcast(veh.id);
    } else if (action === 'spawn') {
      if (veh.isImpounded) return res.status(400).json({ error: 'Viatura apreendida! Paga a multa primeiro.' });
      veh.isStoredInGarage = false;
      veh.position = position || { x: 14, y: 0, z: -14 };
      veh.rotationY = Number(rotationY) || 0;
      db.sharedVehicles = db.sharedVehicles || {};
      const sv = {
        id: veh.id,
        ownerId: veh.ownerId,
        modelId: veh.modelId,
        name: veh.name,
        type: veh.type,
        plate: veh.plate,
        color: veh.color,
        accentColor: veh.accentColor,
        skinId: veh.skinId,
        position: { ...veh.position },
        rotationY: veh.rotationY,
        speedKmh: 0,
        steeringAngle: 0,
        driverId: null,
        passengers: [],
        headlightsOn: false,
        sirenOn: false,
        engineOn: false,
        blinkerMode: 'off' as const,
        isLocked: veh.isLocked,
        health: veh.health,
        fuel: veh.fuel,
        mileageKm: veh.mileageKm || 0,
        lastUpdatedAt: Date.now(),
      };
      db.sharedVehicles[veh.id] = sv;
      broadcastSharedVehicle(sv);
    } else if (action === 'lock') {
      veh.isLocked = !veh.isLocked;
      if (db.sharedVehicles?.[veh.id]) {
        db.sharedVehicles[veh.id].isLocked = veh.isLocked;
        broadcastSharedVehicle(db.sharedVehicles[veh.id]);
      }
    } else if (action === 'refuel') {
      const cost = 1500;
      if (char.stats.cashKz < cost && char.stats.bankKz < cost) return res.status(400).json({ error: 'Precisas de 1.500 Kz.' });
      if (char.stats.cashKz >= cost) char.stats.cashKz -= cost;
      else char.stats.bankKz -= cost;
      veh.fuel = 100;
      if (db.sharedVehicles?.[veh.id]) db.sharedVehicles[veh.id].fuel = 100;
      addTransaction(char.id, 'purchase', -cost, `Abastecimento completo [${veh.plate}]`);
    } else if (action === 'repair') {
      const cost = 4500;
      if (char.stats.cashKz < cost && char.stats.bankKz < cost) return res.status(400).json({ error: 'Precisas de 4.500 Kz.' });
      if (char.stats.cashKz >= cost) char.stats.cashKz -= cost;
      else char.stats.bankKz -= cost;
      veh.health = 100;
      if (db.sharedVehicles?.[veh.id]) db.sharedVehicles[veh.id].health = 100;
      addTransaction(char.id, 'purchase', -cost, `Reparação Oficina [${veh.plate}]`);
    } else if (action === 'paint') {
      const cost = 3000;
      if (char.stats.bankKz < cost) return res.status(400).json({ error: 'Saldo bancário insuficiente (3.000 Kz).' });
      char.stats.bankKz -= cost;
      if (typeof skinId === 'string') {
        veh.skinId = skinId || undefined;
        const preset = VEHICLE_SKIN_PRESETS.find((s) => s.id === skinId);
        if (preset) {
          veh.color = preset.baseColor;
          veh.accentColor = preset.accentColor;
        }
      }
      if (typeof color === 'string') veh.color = color;
      if (typeof accentColor === 'string') veh.accentColor = accentColor;
      if (wheelStyle) veh.wheelStyle = wheelStyle;
      if (db.sharedVehicles?.[veh.id]) {
        db.sharedVehicles[veh.id].color = veh.color;
        db.sharedVehicles[veh.id].accentColor = veh.accentColor;
        db.sharedVehicles[veh.id].skinId = veh.skinId;
        broadcastSharedVehicle(db.sharedVehicles[veh.id]);
      }
      addTransaction(char.id, 'purchase', -cost, `Pintura & Skin [${veh.plate}]`);
    } else if (action === 'upgrade_engine') {
      if (veh.engineLevel >= 3) return res.status(400).json({ error: 'Motor já está no nível máximo (3).' });
      const cost = 12000 * veh.engineLevel;
      if (char.stats.bankKz < cost) return res.status(400).json({ error: `Saldo bancário insuficiente (${cost.toLocaleString('pt-PT')} Kz).` });
      char.stats.bankKz -= cost;
      veh.engineLevel += 1;
      addTransaction(char.id, 'purchase', -cost, `Tuning Motor Nv.${veh.engineLevel} [${veh.plate}]`);
    } else if (action === 'pay_fine') {
      const fine = veh.finesKz;
      if (fine <= 0) return res.status(400).json({ error: 'Sem multas pendentes nesta viatura.' });
      if (char.stats.bankKz < fine) return res.status(400).json({ error: 'Saldo bancário insuficiente para pagar apreensão.' });
      char.stats.bankKz -= fine;
      veh.finesKz = 0;
      veh.isImpounded = false;
      addTransaction(char.id, 'fine', -fine, `Pagamento multa e liberação [${veh.plate}]`);
    } else if (action === 'sell') {
      const cat = VEHICLE_CATALOG.find((c) => c.modelId === veh.modelId);
      const refund = Math.round((cat?.priceKz || 40000) * 0.6);
      char.stats.bankKz += refund;
      delete db.vehicles[veh.id];
      removeSharedVehicleAndBroadcast(veh.id);
      addTransaction(char.id, 'sale', refund, `Venda Viatura [${veh.plate}]`);
      await saveDb();
      return res.json({ character: char, vehicles: Object.values(db.vehicles).filter((v) => v.ownerId === char.id), soldId: req.params.vehId });
    }

    await saveDb();
    res.json({ character: char, vehicle: veh, vehicles: Object.values(db.vehicles).filter((v) => v.ownerId === char.id) });
  });

  // 6. EMPREGOS JOGÁVEIS OFICIAIS (FASE 4: Estritamente Yango, ENDE, Pescador, ELISAL)
  app.post('/api/jobs/start', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, jobId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    markCharacterActive(char.id);
    const job = JOBS_CATALOG.find((j) => j.id === jobId);
    if (!job) return res.status(404).json({ error: 'Emprego não encontrado (disponíveis: Yango, ENDE, Pescador, ELISAL).' });
    if (char.stats.level < job.minLevel) {
      return res.status(400).json({ error: `Exige Nível ${job.minLevel} de cidadão.` });
    }
    char.stats.jobId = job.id;
    char.jobStepIndex = 0;
    char.activeJobStartedAt = Date.now();
    char.customization.shirtColor = job.uniformShirt;
    char.customization.pantsColor = job.uniformPants;
    char.customization.outfitStyle = job.uniformStyle;

    const firstStep = job.steps[0];
    if (firstStep) {
      const clampedStep = clampToValidWorldBounds(firstStep.pos[0], firstStep.pos[2] + firstStep.radius + 2.4);
      char.position = { x: clampedStep.x, y: 0, z: clampedStep.z };
      syncConnectedCharacterPosition(char.id, clampedStep.x, clampedStep.z);
    }

    const db = getDb();
    let workVehicle = undefined;
    if (job.vehicleModelId) {
      const cat = VEHICLE_CATALOG.find((v) => v.modelId === job.vehicleModelId);
      if (cat) {
        const workVehId = `work-${job.id}-${char.id}`;
        const sv = {
          id: workVehId,
          ownerId: char.id,
          modelId: cat.modelId,
          name: `${cat.name} (${job.shortTitle})`,
          type: cat.type,
          plate: `SRV-${char.stats.idNumber.slice(-4)}`,
          color: job.uniformShirt,
          accentColor: '#111827',
          position: { x: char.position.x + 3.2, y: 0, z: char.position.z + 2.2 },
          rotationY: 0,
          speedKmh: 0,
          steeringAngle: 0,
          driverId: null,
          passengers: [],
          headlightsOn: false,
          sirenOn: false,
          engineOn: false,
          blinkerMode: 'off' as const,
          isLocked: false,
          health: 100,
          fuel: 100,
          lastUpdatedAt: Date.now(),
        };
        db.sharedVehicles = db.sharedVehicles || {};
        db.sharedVehicles[workVehId] = sv;
        broadcastSharedVehicle(sv);
        workVehicle = sv;
        char.stats.activeWorkVehicleId = workVehId;
      }
    } else {
      char.stats.activeWorkVehicleId = null;
    }

    await saveDb();
    res.json({ character: char, job, workVehicle });
  });

  app.post('/api/jobs/step-complete', requireAuth, rateLimit(25, 15000), async (req: AuthedRequest, res) => {
    const { characterId, position, drivingModelId, enforceVehicle } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      markCharacterActive(char.id);
      if (!char.stats.jobId) return res.status(400).json({ error: 'Não tens um trabalho ativo.' });
      const job = JOBS_CATALOG.find((j) => j.id === char.stats.jobId);
      if (!job) return res.status(400).json({ error: 'Profissão inválida.' });

      if (job.vehicleModelId && (drivingModelId !== undefined || enforceVehicle === true)) {
        if (drivingModelId !== job.vehicleModelId) {
          return res.status(400).json({
            error: `Este serviço exige estar dentro da viatura oficial (${job.vehicleModelId})!`,
          });
        }
      }

      const currentStep = job.steps[char.jobStepIndex] || job.steps[0];
      if (currentStep) {
        const checkPos = position && typeof position.x === 'number' && typeof position.z === 'number' ? position : char.position;
        const dist = Math.hypot(checkPos.x - currentStep.pos[0], checkPos.z - currentStep.pos[2]);
        if (dist > currentStep.radius + 16) {
          return res.status(400).json({
            error: `Aproxima-te do checkpoint 3D "${currentStep.label}" (distância atual: ${Math.round(dist)}m).`,
          });
        }
        if (position && typeof position.x === 'number' && typeof position.z === 'number') {
          const clamped = clampToValidWorldBounds(position.x, position.z);
          char.position.x = clamped.x;
          char.position.z = clamped.z;
        }
      }

      const db = getDb();
      char.jobStepIndex += 1;
      let completedTurn = false;
      let payout = 0;

      if (char.jobStepIndex >= job.steps.length) {
        completedTurn = true;
        char.jobStepIndex = 0;
        char.completedJobsCount += 1;
        char.counters.jobsCompleted += 1;
        const mult = db.worldConfig.economyMultiplier * (1 + (char.stats.jobLevel - 1) * 0.12);
        payout = Math.round(job.basePayKz * mult);
        char.stats.bankKz += payout;
        char.stats.jobXp += job.xpReward;
        char.stats.sleep = Math.max(0, (char.stats.sleep ?? 100) - 8);
        if (char.stats.jobXp >= char.stats.jobLevel * 100) {
          char.stats.jobXp -= char.stats.jobLevel * 100;
          char.stats.jobLevel += 1;
        }
        addXpAndCheckLevel(char, job.xpReward);
        advanceMission(char, 'daily_job_2', 1);
        advanceMission(char, 'weekly_jobs_8', 1);
        addTransaction(char.id, 'salary', payout, `Turno Completo: ${job.title}`);
        db.jobWorkLogs.unshift({
          id: 'jlog-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
          characterId: char.id,
          jobId: job.id,
          jobTitle: job.title,
          payoutKz: payout,
          xpEarned: job.xpReward,
          completedAt: new Date().toISOString(),
        });
        if (db.jobWorkLogs.length > 500) db.jobWorkLogs.length = 500;
      }

      await saveDb();
      res.json({
        character: char,
        completedTurn,
        payout,
        nextStepIndex: char.jobStepIndex,
        jobWorkLogs: db.jobWorkLogs.filter((l) => l.characterId === char.id).slice(0, 25),
      });
    });
  });

  // 6.1 YANGO — CENTRAL DE TÁXI
  app.get('/api/jobs/yango/calls', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    res.json({
      calls: db.worldState.yangoCalls.slice(0, 25),
      pickupNodes: YANGO_PICKUP_NODES,
      logs: db.jobWorkLogs.filter((l) => l.jobId === 'yango').slice(0, 25),
    });
  });

  app.post('/api/jobs/yango/action', requireAuth, rateLimit(25, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, callId, destLabel, destPos, pickupLabel, pickupPos, rating, drivingModelId, enforceVehicle } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const ws = db.worldState;
      const now = Date.now();
      const fullName = `${char.stats.name} ${char.stats.surname}`;

      if (action === 'request_ride' || action === 'generate_call') {
        const nodeA = YANGO_PICKUP_NODES[Math.floor(Math.random() * YANGO_PICKUP_NODES.length)];
        let nodeB = YANGO_PICKUP_NODES[Math.floor(Math.random() * YANGO_PICKUP_NODES.length)];
        if (nodeB.label === nodeA.label) {
          nodeB = YANGO_PICKUP_NODES[(YANGO_PICKUP_NODES.indexOf(nodeA) + 3) % YANGO_PICKUP_NODES.length];
        }
        const pPos: [number, number, number] =
          action === 'request_ride'
            ? [char.position.x, char.position.y, char.position.z]
            : Array.isArray(pickupPos) && pickupPos.length === 3
            ? [Number(pickupPos[0]), Number(pickupPos[1]), Number(pickupPos[2])]
            : nodeA.pos;
        const dPos: [number, number, number] =
          Array.isArray(destPos) && destPos.length === 3
            ? [Number(destPos[0]), Number(destPos[1]), Number(destPos[2])]
            : nodeB.pos;
        const distM = Math.max(60, Math.round(Math.hypot(dPos[0] - pPos[0], dPos[2] - pPos[2])));
        const fareKz = Math.max(2200, Math.round(1600 + distM * 26));
        const call = {
          id: 'yng-' + now + '-' + Math.random().toString(36).slice(2, 5),
          passengerName: action === 'request_ride' ? fullName : `Passageiro (${nodeA.label.split(' ')[0]})`,
          isPlayer: action === 'request_ride',
          passengerId: action === 'request_ride' ? char.id : undefined,
          pickupLabel: String(pickupLabel || (action === 'request_ride' ? 'Localização Atual' : nodeA.label)),
          pickupPos: pPos,
          destLabel: String(destLabel || nodeB.label),
          destPos: dPos,
          distanceM: distM,
          fareKz,
          status: 'pending' as const,
          createdAt: now,
        };
        ws.yangoCalls.unshift(call);
        if (ws.yangoCalls.length > 25) ws.yangoCalls.length = 25;
        await saveDb();
        broadcastDynamicWorldSync();
        return res.json({ call, calls: ws.yangoCalls, character: char });
      }

      if (char.stats.jobId !== 'yango') {
        return res.status(403).json({ error: 'Entra ao serviço como Motorista Yango para gerir corridas.' });
      }
      const call = ws.yangoCalls.find((c) => c.id === String(callId || ''));
      if (!call) return res.status(404).json({ error: 'Pedido Yango não encontrado.' });

      if (action === 'accept') {
        if (call.status !== 'pending') return res.status(409).json({ error: 'Esta corrida já foi aceite.' });
        call.status = 'accepted';
        call.driverId = char.id;
        call.driverName = fullName;
      } else if (action === 'pickup') {
        if (call.driverId !== char.id) return res.status(403).json({ error: 'Não és o motorista desta corrida.' });
        if ((drivingModelId !== undefined || enforceVehicle === true) && drivingModelId !== 'taxi_i10') {
          return res.status(400).json({ error: 'Precisas conduzir o Táxi Oficial Yango para recolher o passageiro.' });
        }
        call.status = 'picked_up';
      } else if (action === 'complete') {
        if (call.driverId !== char.id) return res.status(403).json({ error: 'Não és o motorista desta corrida.' });
        if (call.status === 'completed') return res.status(400).json({ error: 'Corrida já concluída.' });
        if ((drivingModelId !== undefined || enforceVehicle === true) && drivingModelId !== 'taxi_i10') {
          return res.status(400).json({ error: 'Conclui a corrida ao volante do Táxi Oficial Yango!' });
        }
        call.status = 'completed';
        call.completedAt = now;
        call.rating = Number(rating) || Number((4.5 + Math.random() * 0.5).toFixed(1));
        const mult = db.worldConfig.economyMultiplier * (1 + (char.stats.jobLevel - 1) * 0.1);
        const payout = Math.round(call.fareKz * mult);
        char.stats.bankKz += payout;
        char.completedJobsCount += 1;
        char.counters.jobsCompleted += 1;
        char.stats.jobXp += 55;
        if (char.stats.jobXp >= char.stats.jobLevel * 100) {
          char.stats.jobXp -= char.stats.jobLevel * 100;
          char.stats.jobLevel += 1;
        }
        addXpAndCheckLevel(char, 55);
        advanceMission(char, 'daily_job_2', 1);
        advanceMission(char, 'weekly_jobs_8', 1);
        addTransaction(char.id, 'salary', payout, `Corrida Yango: ${call.pickupLabel} ➔ ${call.destLabel}`);
        db.jobWorkLogs.unshift({
          id: 'jlog-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          jobId: 'yango',
          jobTitle: `Yango (${call.distanceM}m • ★${call.rating})`,
          payoutKz: payout,
          xpEarned: 55,
          details: `${call.pickupLabel} ➔ ${call.destLabel}`,
          completedAt: new Date(now).toISOString(),
        });
      } else if (action === 'cancel') {
        if (call.driverId === char.id || call.passengerId === char.id) {
          call.status = 'cancelled';
        }
      }

      await saveDb();
      broadcastDynamicWorldSync();
      res.json({ call, calls: ws.yangoCalls, character: char, logs: db.jobWorkLogs.filter((l) => l.characterId === char.id && l.jobId === 'yango').slice(0, 20) });
    });
  });

  // 6.2 ENDE — ELETRICISTA DA REDE E AVARIAS DE BAIRRO
  app.get('/api/jobs/ende/faults', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({
      faults: db.worldState.endeCalls,
      blackoutDistricts: db.worldState.blackoutDistricts,
      faultPoints: ENDE_FAULT_POINTS,
      logs: db.jobWorkLogs.filter((l) => l.jobId === 'ende').slice(0, 25),
    });
  });

  app.post('/api/jobs/ende/action', requireAuth, rateLimit(25, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, faultId, pointId, causesBlackout, drivingModelId, enforceVehicle } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const ws = db.worldState;
      const now = Date.now();
      const fullName = `${char.stats.name} ${char.stats.surname}`;

      if (action === 'generate_fault') {
        const pt =
          ENDE_FAULT_POINTS.find((p) => p.id === pointId) ||
          ENDE_FAULT_POINTS[Math.floor(Math.random() * ENDE_FAULT_POINTS.length)];
        const f = {
          id: 'ende-' + now + '-' + Math.random().toString(36).slice(2, 5),
          faultPointId: pt.id,
          district: pt.district,
          title: pt.title,
          repairType: pt.repairType,
          pos: pt.pos,
          causesBlackout: Boolean(causesBlackout),
          rewardKz: pt.rewardKz,
          status: 'open' as const,
          createdAt: now,
        };
        ws.endeCalls.unshift(f);
        if (ws.endeCalls.length > 25) ws.endeCalls.length = 25;
        if (f.causesBlackout) {
          ws.blackoutDistricts[f.district] = { faultId: f.id, title: f.title, since: now };
        }
        await saveDb();
        broadcastDynamicWorldSync();
        return res.json({ fault: f, faults: ws.endeCalls, blackoutDistricts: ws.blackoutDistricts, character: char });
      }

      if (char.stats.jobId !== 'ende') {
        return res.status(403).json({ error: 'Entra ao serviço como Eletricista ENDE primeiro.' });
      }
      const fault = ws.endeCalls.find((f) => f.id === String(faultId || ''));
      if (!fault) return res.status(404).json({ error: 'Avaria ENDE não encontrada.' });

      if (action === 'accept_fault') {
        fault.status = 'in_progress';
        fault.assignedCharId = char.id;
        fault.assignedName = fullName;
      } else if (action === 'complete_repair') {
        if (fault.status === 'fixed') return res.status(400).json({ error: 'Esta avaria já foi reparada.' });
        if ((drivingModelId !== undefined || enforceVehicle === true) && drivingModelId !== 'pickup_hilux') {
          return res.status(400).json({ error: 'Usa a Pickup de Serviço ENDE (pickup_hilux) para operar reparações da rede!' });
        }
        fault.status = 'fixed';
        fault.fixedAt = now;
        fault.assignedCharId = char.id;
        fault.assignedName = fullName;
        delete ws.blackoutDistricts[fault.district];

        const mult = db.worldConfig.economyMultiplier * (1 + (char.stats.jobLevel - 1) * 0.12);
        const payout = Math.round((fault.rewardKz + (fault.causesBlackout ? 1800 : 0)) * mult);
        char.stats.bankKz += payout;
        char.completedJobsCount += 1;
        char.counters.jobsCompleted += 1;
        char.stats.jobXp += 68;
        if (char.stats.jobXp >= char.stats.jobLevel * 100) {
          char.stats.jobXp -= char.stats.jobLevel * 100;
          char.stats.jobLevel += 1;
        }
        addXpAndCheckLevel(char, 68);
        advanceMission(char, 'daily_job_2', 1);
        advanceMission(char, 'weekly_jobs_8', 1);
        addTransaction(char.id, 'salary', payout, `Reparação ENDE: ${fault.title}`);
        db.jobWorkLogs.unshift({
          id: 'jlog-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          jobId: 'ende',
          jobTitle: `ENDE (${fault.title})`,
          payoutKz: payout,
          xpEarned: 68,
          details: `Bairro ${fault.district} restabelecido`,
          completedAt: new Date(now).toISOString(),
        });
      }

      await saveDb();
      broadcastDynamicWorldSync();
      res.json({
        fault,
        faults: ws.endeCalls,
        blackoutDistricts: ws.blackoutDistricts,
        character: char,
        logs: db.jobWorkLogs.filter((l) => l.characterId === char.id && l.jobId === 'ende').slice(0, 20),
      });
    });
  });

  // 6.3 PESCADOR — PESCA ATLÂNTICA & MERCADO DE PEIXE
  app.get('/api/jobs/pescador/state', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const marketMult = Number((0.9 + ((Math.floor(Date.now() / 300000) % 5) * 0.08)).toFixed(2));
    res.json({
      zones: FISHING_ZONES,
      species: FISH_SPECIES_CATALOG,
      marketMultiplier: marketMult,
      logs: db.jobWorkLogs.filter((l) => l.jobId === 'pescador').slice(0, 20),
    });
  });

  app.post('/api/jobs/pescador/action', requireAuth, rateLimit(25, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, position, bonusRoll } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const now = Date.now();

      if (action === 'cast_catch') {
        if (char.stats.jobId !== 'pescador') {
          return res.status(403).json({ error: 'Entra primeiro ao serviço como Pescador.' });
        }
        const checkPos = position && typeof position.x === 'number' ? position : char.position;
        const restricted = FISHING_ZONES.find(
          (z) => !z.allowed && Math.hypot(checkPos.x - z.pos[0], checkPos.z - z.pos[2]) <= z.radius
        );
        if (restricted) {
          return res.status(403).json({ error: restricted.reason || `Pesca interdita em ${restricted.name}!` });
        }
        const allowedZone = FISHING_ZONES.find(
          (z) => z.allowed && Math.hypot(checkPos.x - z.pos[0], checkPos.z - z.pos[2]) <= z.radius + 14
        );
        if (!allowedZone) {
          return res.status(400).json({ error: 'Desloca-te para uma zona costeira permitida (Ilha do Cabo, Pontão Sul ou Cacuaco).' });
        }

        const roll = Math.random() + (bonusRoll ? 0.14 : 0);
        const caught =
          roll > 0.94
            ? FISH_SPECIES_CATALOG[3]
            : roll > 0.72
            ? FISH_SPECIES_CATALOG[2]
            : roll > 0.42
            ? FISH_SPECIES_CATALOG[1]
            : FISH_SPECIES_CATALOG[0];

        if (totalInventoryWeight(char) + caught.weightKg > 35) {
          return res.status(400).json({ error: 'Mochila cheia (35 kg máx.)! Vende o peixe no Mercado da Ilha.' });
        }

        addItemToInventory(char, {
          catalogId: caught.id,
          name: caught.name,
          description: `Pescado em ${allowedZone.name} (${caught.rarity.toUpperCase()})`,
          category: 'fish',
          quantity: 1,
          weight: caught.weightKg,
          equipped: false,
          usable: false,
          sellPriceKz: caught.basePriceKz,
        });
        char.stats.jobXp += 20;
        addXpAndCheckLevel(char, 20);
        await saveDb();
        return res.json({ character: char, caught, zone: allowedZone.name });
      }

      if (action === 'sell_fish') {
        const marketMult = 0.9 + ((Math.floor(now / 300000) % 5) * 0.08);
        const fishItems = char.inventory.filter((i) => i.category === 'fish');
        if (fishItems.length === 0) {
          return res.status(400).json({ error: 'Não tens peixe na mochila para vender.' });
        }
        let totalKz = 0;
        let totalQty = 0;
        for (const f of fishItems) {
          totalKz += Math.round(f.sellPriceKz * f.quantity * marketMult * db.worldConfig.economyMultiplier);
          totalQty += f.quantity;
        }
        char.inventory = char.inventory.filter((i) => i.category !== 'fish');
        char.stats.cashKz += totalKz;
        char.completedJobsCount += 1;
        char.counters.jobsCompleted += 1;
        char.stats.jobXp += 45;
        if (char.stats.jobXp >= char.stats.jobLevel * 100) {
          char.stats.jobXp -= char.stats.jobLevel * 100;
          char.stats.jobLevel += 1;
        }
        addXpAndCheckLevel(char, 45);
        advanceMission(char, 'daily_job_2', 1);
        advanceMission(char, 'weekly_jobs_8', 1);
        addTransaction(char.id, 'sale', totalKz, `Mercado de Peixe (${totalQty} unid.)`);
        db.jobWorkLogs.unshift({
          id: 'jlog-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          jobId: 'pescador',
          jobTitle: `Venda Mercado de Peixe (${totalQty}x)`,
          payoutKz: totalKz,
          xpEarned: 45,
          completedAt: new Date(now).toISOString(),
        });
        await saveDb();
        return res.json({ character: char, payout: totalKz, soldCount: totalQty, logs: db.jobWorkLogs.filter((l) => l.characterId === char.id && l.jobId === 'pescador').slice(0, 20) });
      }

      res.status(400).json({ error: 'Ação de pesca inválida.' });
    });
  });

  // 6.4 ELISAL — RECOLHA DE LIXO & LIMPEZA POR BAIRRO
  app.get('/api/jobs/elisal/state', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({
      dumpsters: ELISAL_DUMPSTER_POINTS,
      cleanlinessByDistrict: db.worldState.cleanlinessByDistrict,
      logs: db.jobWorkLogs.filter((l) => l.jobId === 'elisal').slice(0, 20),
    });
  });

  app.post('/api/jobs/elisal/action', requireAuth, rateLimit(25, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, binId, drivingModelId, enforceVehicle } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      if (char.stats.jobId !== 'elisal') {
        return res.status(403).json({ error: 'Entra ao serviço como Equipa ELISAL primeiro.' });
      }
      if ((drivingModelId !== undefined || enforceVehicle === true) && drivingModelId !== 'camiao_carga') {
        return res.status(400).json({ error: 'A recolha ELISAL só pode ser executada com o Camião ELISAL oficial!' });
      }
      const db = getDb();
      const ws = db.worldState;
      const now = Date.now();

      if (action === 'collect_bin') {
        const bin = ELISAL_DUMPSTER_POINTS.find((b) => b.id === String(binId || ''));
        if (!bin) return res.status(404).json({ error: 'Contentor ELISAL não encontrado.' });
        const cdKey = `elisal:${bin.id}`;
        if ((db.robberyCooldowns[cdKey] || 0) > now) {
          const secs = Math.ceil((db.robberyCooldowns[cdKey] - now) / 1000);
          return res.status(429).json({ error: `Contentor já recolhido recentemente. Próxima recolha em ${secs}s.` });
        }
        db.robberyCooldowns[cdKey] = now + 45000;
        const prev = ws.cleanlinessByDistrict[bin.district] ?? 75;
        ws.cleanlinessByDistrict[bin.district] = Math.min(100, prev + 7);
        char.jobStepIndex = (char.jobStepIndex || 0) + 1;
        const payout = Math.round(1800 * db.worldConfig.economyMultiplier);
        char.stats.bankKz += payout;
        char.stats.jobXp += 24;
        addXpAndCheckLevel(char, 24);
        addTransaction(char.id, 'salary', payout, `ELISAL Recolha: ${bin.label}`);
        await saveDb();
        broadcastDynamicWorldSync();
        return res.json({
          character: char,
          payout,
          bin,
          cleanlinessByDistrict: ws.cleanlinessByDistrict,
        });
      }

      if (action === 'finish_route') {
        if ((char.jobStepIndex || 0) < 1) {
          return res.status(400).json({ error: 'Recolhe pelo menos 1 contentor ELISAL antes de concluir a rota no Eco-Centro.' });
        }
        char.jobStepIndex = 0;
        const bonus = Math.round(4500 * db.worldConfig.economyMultiplier);
        char.stats.bankKz += bonus;
        char.completedJobsCount += 1;
        char.counters.jobsCompleted += 1;
        char.stats.jobXp += 62;
        if (char.stats.jobXp >= char.stats.jobLevel * 100) {
          char.stats.jobXp -= char.stats.jobLevel * 100;
          char.stats.jobLevel += 1;
        }
        addXpAndCheckLevel(char, 62);
        advanceMission(char, 'daily_job_2', 1);
        advanceMission(char, 'weekly_jobs_8', 1);
        addTransaction(char.id, 'salary', bonus, 'ELISAL Descarga Final no Eco-Centro');
        db.jobWorkLogs.unshift({
          id: 'jlog-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          jobId: 'elisal',
          jobTitle: 'Rota ELISAL Concluída',
          payoutKz: bonus,
          xpEarned: 62,
          completedAt: new Date(now).toISOString(),
        });
        await saveDb();
        broadcastDynamicWorldSync();
        return res.json({
          character: char,
          payout: bonus,
          cleanlinessByDistrict: ws.cleanlinessByDistrict,
          logs: db.jobWorkLogs.filter((l) => l.characterId === char.id && l.jobId === 'elisal').slice(0, 20),
        });
      }

      res.status(400).json({ error: 'Ação ELISAL inválida.' });
    });
  });

  // 6.5 FAZENDA & CAMPO VERDE (Colheita 2-4m, Carrinha 1.000 Kz máx. 5 caixas, Entrega na Praça 1.500-2.300 Kz)
  app.get('/api/farm/state', requireAuth, (_req, res) => {
    const db = getDb();
    const now = Date.now();
    const farmPlants = db.worldState.farmPlants || {};
    const plants = FARM_PLANT_NODES.map((node) => {
      const cur = farmPlants[node.id] || { id: node.id, availableAt: 0 };
      const ready = (cur.availableAt || 0) <= now;
      return {
        id: node.id,
        cropName: node.cropName,
        pos: node.pos,
        availableAt: cur.availableAt || 0,
        lastHarvestedBy: cur.lastHarvestedBy,
        ready,
      };
    });
    res.json({
      plants,
      vanRentKz: FARM_VAN_RENT_KZ,
      maxCrates: FARM_MAX_CRATES,
      crateMinKz: FARM_CRATE_MIN_KZ,
      crateMaxKz: FARM_CRATE_MAX_KZ,
      serverNow: now,
    });
  });

  app.post('/api/farm/action', requireAuth, rateLimit(30, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, plantId, payWith = 'cash', drivingModelId, enforceVehicle } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const now = Date.now();
      db.worldState.farmPlants = db.worldState.farmPlants || {};
      const formatPlants = () =>
        FARM_PLANT_NODES.map((node) => {
          const cur = db.worldState.farmPlants![node.id] || { id: node.id, availableAt: 0 };
          return {
            id: node.id,
            cropName: node.cropName,
            pos: node.pos,
            availableAt: cur.availableAt || 0,
            lastHarvestedBy: cur.lastHarvestedBy,
          };
        });

      if (action === 'start_job') {
        char.stats.jobId = 'agricultor_fazenda';
        char.customization.outfitStyle = 'agricultor_uniform';
        char.customization.shirtColor = '#16a34a';
        char.customization.pantsColor = '#78350f';
        await saveDb();
        return res.json({
          character: char,
          plants: formatPlants(),
          message: 'Traje de Agricultor equipado! Colhe as plantas prontas e aluga uma carrinha (1.000 Kz).',
        });
      }

      if (action === 'rent_van') {
        if (payWith === 'bank') {
          if (char.stats.bankKz < FARM_VAN_RENT_KZ) {
            return res.status(400).json({ error: `Saldo bancário insuficiente (${FARM_VAN_RENT_KZ.toLocaleString('pt-PT')} Kz).` });
          }
          char.stats.bankKz -= FARM_VAN_RENT_KZ;
        } else if (char.stats.cashKz >= FARM_VAN_RENT_KZ) {
          char.stats.cashKz -= FARM_VAN_RENT_KZ;
        } else if (char.stats.bankKz >= FARM_VAN_RENT_KZ) {
          char.stats.bankKz -= FARM_VAN_RENT_KZ;
        } else {
          return res.status(400).json({ error: `Alugar carrinha agrícola custa ${FARM_VAN_RENT_KZ.toLocaleString('pt-PT')} Kz.` });
        }

        const existingFarmVans = Object.values(db.sharedVehicles || {}).filter((sv) => sv.id.startsWith('farm-van-')).length;
        const slotOffset = (existingFarmVans % 5) * 4.2;
        const vanId = `farm-van-${char.id}-${now}`;
        const sv = {
          id: vanId,
          ownerId: char.id,
          modelId: 'pickup_fazenda',
          name: `Carrinha Fazenda (${char.stats.name})`,
          type: 'pickup' as const,
          plate: `FZD-${Math.floor(100 + Math.random() * 899)}`,
          color: '#15803d',
          accentColor: '#facc15',
          position: { x: 226 + (slotOffset % 8), y: 0, z: -116 - Math.floor(slotOffset / 2) },
          rotationY: Math.PI / 2,
          speedKmh: 0,
          steeringAngle: 0,
          driverId: null,
          passengers: [],
          headlightsOn: false,
          sirenOn: false,
          engineOn: false,
          blinkerMode: 'off' as const,
          isLocked: false,
          health: 100,
          fuel: 100,
          mileageKm: 0,
          lastUpdatedAt: now,
        };
        db.sharedVehicles = db.sharedVehicles || {};
        db.sharedVehicles[vanId] = sv;
        char.stats.farmVanVehicleId = vanId;
        char.stats.activeWorkVehicleId = vanId;
        broadcastSharedVehicle(sv);
        addTransaction(char.id, 'purchase', -FARM_VAN_RENT_KZ, `Aluguer Carrinha Agrícola [${sv.plate}]`);
        await saveDb();
        return res.json({
          character: char,
          plants: formatPlants(),
          van: sv,
          message: `Carrinha Agrícola [${sv.plate}] estacionada na Fazenda! Capacidade máxima: ${FARM_MAX_CRATES} caixas.`,
        });
      }

      if (action === 'harvest_plant') {
        if (char.stats.jobId !== 'agricultor_fazenda') {
          return res.status(403).json({ error: 'Fala com o NPC da Fazenda para iniciar o trabalho de Agricultor primeiro.' });
        }
        const curCrates = char.stats.farmCrates || 0;
        if (curCrates >= FARM_MAX_CRATES) {
          return res.status(400).json({
            error: `Carrinha cheia com ${FARM_MAX_CRATES}/${FARM_MAX_CRATES} caixas! Leva agora a colheita até à Praça!`,
          });
        }
        const node = FARM_PLANT_NODES.find((p) => p.id === String(plantId || ''));
        if (!node) return res.status(404).json({ error: 'Planta da fazenda não encontrada.' });
        const plantState = db.worldState.farmPlants[node.id] || { id: node.id, availableAt: 0 };
        if (plantState.availableAt > now) {
          const secsLeft = Math.ceil((plantState.availableAt - now) / 1000);
          return res.status(409).json({
            error: `Planta em processo de produção! Aguarda ${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s.`,
          });
        }
        const regrowMs = FARM_REGROW_MIN_MS + Math.floor(Math.random() * (FARM_REGROW_MAX_MS - FARM_REGROW_MIN_MS));
        plantState.availableAt = now + regrowMs;
        plantState.lastHarvestedBy = `${char.stats.name} ${char.stats.surname}`;
        db.worldState.farmPlants[node.id] = plantState;

        char.stats.farmCrates = curCrates + 1;
        await saveDb();
        broadcastDynamicWorldSync();
        return res.json({
          character: char,
          plants: formatPlants(),
          plant: plantState,
          message:
            char.stats.farmCrates >= FARM_MAX_CRATES
              ? `Caixa ${FARM_MAX_CRATES}/${FARM_MAX_CRATES} carregada! Carrinha cheia — leva agora para a Praça!`
              : `Colheste ${node.cropName}! Caixa ${char.stats.farmCrates}/${FARM_MAX_CRATES} colocada na carrinha.`,
        });
      }

      if (action === 'deliver_crates') {
        const crates = char.stats.farmCrates || 0;
        if (crates <= 0) {
          return res.status(400).json({ error: 'Não tens caixas de colheita carregadas para entregar na Praça.' });
        }
        if ((drivingModelId !== undefined || enforceVehicle === true) && drivingModelId !== 'pickup_fazenda' && drivingModelId !== 'pickup_hilux') {
          return res.status(400).json({ error: 'Entrega na Praça exige conduzir a tua Carrinha Agrícola da Fazenda!' });
        }
        const cratePriceKz =
          FARM_CRATE_MIN_KZ + Math.floor(Math.random() * (FARM_CRATE_MAX_KZ - FARM_CRATE_MIN_KZ + 1));
        const totalPay = crates * cratePriceKz;
        char.stats.bankKz += totalPay;
        char.stats.farmCrates = 0;
        char.completedJobsCount += 1;
        char.counters.jobsCompleted += 1;
        addXpAndCheckLevel(char, crates * 15);
        addTransaction(char.id, 'salary', totalPay, `Venda Agrícola Praça (${crates} caixas × ${cratePriceKz} Kz)`);
        db.jobWorkLogs.unshift({
          id: 'jlog-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          jobId: 'fazenda',
          jobTitle: `Fazenda ➔ Praça (${crates} caixas)`,
          payoutKz: totalPay,
          xpEarned: crates * 15,
          completedAt: new Date(now).toISOString(),
        });
        await saveDb();
        return res.json({
          character: char,
          plants: formatPlants(),
          payout: totalPay,
          cratePriceKz,
          cratesDelivered: crates,
          message: `Vendeste ${crates} caixa(s) na Praça a ${cratePriceKz.toLocaleString('pt-PT')} Kz/cx (+${totalPay.toLocaleString('pt-PT')} Kz)!`,
        });
      }

      res.status(400).json({ error: 'Ação da Fazenda inválida.' });
    });
  });

  // 6.6 AEROPORTO INTERNACIONAL 4 DE FEVEREIRO — CHECK-IN E VOOS
  app.post('/api/airport/checkin', requireAuth, rateLimit(12, 30000), async (req: AuthedRequest, res) => {
    const { characterId, flightId, payWith = 'bank' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const flight = AIRPORT_FLIGHTS.find((f) => f.id === String(flightId || ''));
    if (!flight) return res.status(404).json({ error: 'Rota aérea não encontrada.' });

    if (payWith === 'cash') {
      if (char.stats.cashKz < flight.priceKz) return res.status(400).json({ error: 'Cash insuficiente para o bilhete aéreo.' });
      char.stats.cashKz -= flight.priceKz;
    } else if (char.stats.bankKz >= flight.priceKz) {
      char.stats.bankKz -= flight.priceKz;
    } else if (char.stats.cashKz >= flight.priceKz) {
      char.stats.cashKz -= flight.priceKz;
    } else {
      return res.status(400).json({ error: `Bilhete custa ${flight.priceKz.toLocaleString('pt-PT')} Kz.` });
    }

    char.position = { x: flight.destPos[0], y: flight.destPos[1], z: flight.destPos[2] };
    syncConnectedCharacterPosition(char.id, flight.destPos[0], flight.destPos[2]);
    addTransaction(char.id, 'purchase', -flight.priceKz, `Check-in Aeroporto: ${flight.label}`);
    await saveDb();
    res.json({ character: char, flight });
  });

  // 7. ORGANIZAÇÕES & FACÇÕES (REGRA: APENAS ADMIN GOD NOMEIA LÍDER PRINCIPAL)
  app.get('/api/factions', (_req, res) => {
    const db = getDb();
    const onlineIds = new Set(getConnectedPlayersSnapshot().map((p) => p.characterId || p.id));
    res.json({ factions: db.factions, onlineCharacterIds: Array.from(onlineIds) });
  });

  app.post('/api/factions/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, factionId, action, amountKz } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    markCharacterActive(char.id);
    const db = getDb();
    const faction = db.factions.find((f) => f.id === factionId);
    if (!faction) return res.status(404).json({ error: 'Organização não encontrada.' });

    if (action === 'join') {
      if (faction.suspended) {
        return res.status(403).json({ error: 'Esta organização encontra-se suspensa pelo Admin God.' });
      }
      // Remove da anterior caso exista (se era líder, fica sem líder até Admin God nomear outro)
      db.factions.forEach((f) => {
        f.members = f.members.filter((m) => m.characterId !== char.id);
        if (f.leaderId === char.id) {
          f.leaderId = null;
          f.leaderName = 'Aguardando Admin God';
        }
      });
      const firstRank = faction.ranks[0];
      const fullName = `${char.stats.name} ${char.stats.surname}`;
      // NUNCA auto-promove a Líder! Só o Admin God pode escolher o Líder inicial.
      faction.members.push({
        characterId: char.id,
        name: fullName,
        rank: firstRank.name,
        level: firstRank.level,
        bi: char.stats.idNumber,
        phone: char.stats.phone,
        joinedAt: new Date().toISOString(),
      });
      char.stats.factionId = faction.id;
      char.stats.factionRank = firstRank.name;
      faction.auditLogs = faction.auditLogs || [];
      faction.auditLogs.unshift({
        id: 'faud-' + Date.now(),
        actorName: fullName,
        action: 'join',
        details: `${fullName} entrou como ${firstRank.name}`,
        timestamp: new Date().toISOString(),
      });
    } else if (action === 'leave') {
      faction.members = faction.members.filter((m) => m.characterId !== char.id);
      if (faction.leaderId === char.id) {
        faction.leaderId = null;
        faction.leaderName = 'Aguardando Admin God';
      }
      char.stats.factionId = null;
      char.stats.factionRank = 'Civil';
    } else if (action === 'deposit_treasury') {
      const amt = Math.floor(Number(amountKz) || 0);
      if (amt <= 0 || char.stats.bankKz < amt) return res.status(400).json({ error: 'Saldo bancário insuficiente.' });
      char.stats.bankKz -= amt;
      faction.treasuryKz += amt;
      addTransaction(char.id, 'transfer', -amt, `Cofre da Organização: ${faction.name}`);
    } else if (action === 'promote' || action === 'kick') {
      return res.status(400).json({ error: 'Usa /api/factions/manage para gestão hierárquica de membros.' });
    }

    await saveDb();
    syncConnectedPlayerProfile(char.id);
    res.json({ character: char, factions: db.factions });
  });

  // Gestão interna pelo Líder (nomeado pelo Admin God) ou cargos autorizados (Sublíder/Coronel)
  app.post('/api/factions/manage', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, factionId, action, targetCharId, rankLevel, announcement, amountKz } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    markCharacterActive(char.id);
    const db = getDb();
    const faction = db.factions.find((f) => f.id === factionId);
    if (!faction) return res.status(404).json({ error: 'Organização não encontrada.' });
    if (faction.suspended) return res.status(403).json({ error: 'Organização suspensa pelo Admin God.' });

    const meMember = faction.members.find((m) => m.characterId === char.id);
    const isLeader = faction.leaderId === char.id;
    const myRankDef = faction.ranks.find((r) => r.level === (meMember?.level || 0));
    const perms = myRankDef?.permissions;

    if (!meMember && !isLeader) {
      return res.status(403).json({ error: 'Não pertences a esta organização.' });
    }

    const actorName = `${char.stats.name} ${char.stats.surname}`;
    const maxLevel = faction.ranks[faction.ranks.length - 1]?.level || 1;
    faction.auditLogs = faction.auditLogs || [];

    if (action === 'edit_announcement') {
      if (!isLeader && !perms?.canEditAnnouncement) {
        return res.status(403).json({ error: 'Sem permissão para editar comunicado da organização.' });
      }
      faction.announcement = String(announcement || '').trim().slice(0, 220);
      faction.auditLogs.unshift({
        id: 'faud-' + Date.now(),
        actorName,
        action: 'announcement',
        details: `Comunicado atualizado`,
        timestamp: new Date().toISOString(),
      });
    } else if (action === 'withdraw_treasury') {
      if (!isLeader && !perms?.canWithdrawTreasury) {
        return res.status(403).json({ error: 'Sem permissão para levantar fundos do cofre.' });
      }
      const amt = Math.floor(Number(amountKz) || 0);
      if (amt <= 0 || faction.treasuryKz < amt) {
        return res.status(400).json({ error: 'Valor inválido ou saldo insuficiente no cofre.' });
      }
      faction.treasuryKz -= amt;
      char.stats.bankKz += amt;
      addTransaction(char.id, 'transfer', amt, `Levantamento Cofre ${faction.name}`);
    } else if (action === 'promote' || action === 'demote' || action === 'set_rank' || action === 'appoint_subleader' || action === 'kick') {
      const targetMember = faction.members.find((m) => m.characterId === targetCharId);
      const targetChar = db.characters[String(targetCharId || '')];
      if (!targetMember) return res.status(404).json({ error: 'Membro não encontrado nesta organização.' });

      // Nenhum jogador pode alterar o próprio cargo
      if (targetMember.characterId === char.id) {
        return res.status(403).json({ error: 'Nenhum jogador pode promover, rebaixar ou expulsar a si próprio.' });
      }

      // Bloqueia alterar ou destituir o Líder principal sem ser Admin God
      if (targetMember.characterId === faction.leaderId) {
        return res.status(403).json({ error: 'O cargo de Líder Principal só pode ser alterado ou retirado pelo Admin God.' });
      }

      const myLevel = isLeader ? maxLevel : meMember?.level || 0;
      if (!isLeader && targetMember.level >= myLevel) {
        return res.status(403).json({ error: 'Só podes gerir membros com patente estritamente inferior à tua.' });
      }

      if (action === 'promote') {
        if (!isLeader && !perms?.canPromote) return res.status(403).json({ error: 'Sem permissão para promover.' });
        const nextRank = faction.ranks.find((r) => r.level === targetMember.level + 1);
        if (!nextRank || nextRank.level >= maxLevel) {
          return res.status(403).json({ error: 'Apenas o Admin God pode nomear o posto máximo de Líder Principal.' });
        }
        if (!isLeader && nextRank.level >= myLevel) {
          return res.status(403).json({ error: 'Não podes promover um membro para um cargo igual ou superior ao teu.' });
        }
        targetMember.level = nextRank.level;
        targetMember.rank = nextRank.name;
        if (targetChar) targetChar.stats.factionRank = nextRank.name;
        faction.auditLogs.unshift({
          id: 'faud-' + Date.now(),
          actorName,
          action: 'promote',
          details: `${targetMember.name} promovido a ${nextRank.name}`,
          timestamp: new Date().toISOString(),
        });
      } else if (action === 'demote') {
        if (!isLeader && !perms?.canDemote) return res.status(403).json({ error: 'Sem permissão para rebaixar.' });
        const prevRank = faction.ranks.find((r) => r.level === targetMember.level - 1);
        if (!prevRank) return res.status(400).json({ error: 'Membro já está na patente mais baixa.' });
        targetMember.level = prevRank.level;
        targetMember.rank = prevRank.name;
        if (targetChar) targetChar.stats.factionRank = prevRank.name;
        faction.auditLogs.unshift({
          id: 'faud-' + Date.now(),
          actorName,
          action: 'demote',
          details: `${targetMember.name} rebaixado para ${prevRank.name}`,
          timestamp: new Date().toISOString(),
        });
      } else if (action === 'appoint_subleader') {
        if (!isLeader && !perms?.canAppointSubleader) {
          return res.status(403).json({ error: 'Apenas o Líder pode nomear Sublíderes.' });
        }
        const subRank = faction.ranks[Math.max(0, faction.ranks.length - 2)];
        if (!subRank || subRank.level >= maxLevel) {
          return res.status(400).json({ error: 'Patente de Sublíder não configurada.' });
        }
        targetMember.level = subRank.level;
        targetMember.rank = subRank.name;
        if (targetChar) targetChar.stats.factionRank = subRank.name;
        faction.auditLogs.unshift({
          id: 'faud-' + Date.now(),
          actorName,
          action: 'subleader',
          details: `${targetMember.name} nomeado ${subRank.name}`,
          timestamp: new Date().toISOString(),
        });
      } else if (action === 'set_rank') {
        if (!isLeader) return res.status(403).json({ error: 'Apenas o Líder pode definir patentes diretamente.' });
        const lvl = Number(rankLevel) || 1;
        const chosen = faction.ranks.find((r) => r.level === lvl);
        if (!chosen) return res.status(404).json({ error: 'Patente inválida.' });
        if (chosen.level >= maxLevel) {
          return res.status(403).json({ error: 'O posto de Líder Principal é exclusivo do Admin God.' });
        }
        targetMember.level = chosen.level;
        targetMember.rank = chosen.name;
        if (targetChar) targetChar.stats.factionRank = chosen.name;
        faction.auditLogs.unshift({
          id: 'faud-' + Date.now(),
          actorName,
          action: 'set_rank',
          details: `${targetMember.name} colocado em ${chosen.name}`,
          timestamp: new Date().toISOString(),
        });
      } else if (action === 'kick') {
        if (!isLeader && !perms?.canKick) return res.status(403).json({ error: 'Sem permissão para expulsar membros.' });
        faction.members = faction.members.filter((m) => m.characterId !== targetCharId);
        if (targetChar) {
          targetChar.stats.factionId = null;
          targetChar.stats.factionRank = 'Civil';
        }
        faction.auditLogs.unshift({
          id: 'faud-' + Date.now(),
          actorName,
          action: 'kick',
          details: `${targetMember.name} expulso da organização`,
          timestamp: new Date().toISOString(),
        });
      }
      if (targetChar) {
        pushAdminEffectToCharacter(targetChar.id, { action: 'refresh_character' });
        syncConnectedPlayerProfile(targetChar.id);
      }
    } else {
      return res.status(400).json({ error: 'Ação de gestão inválida.' });
    }

    if (faction.auditLogs.length > 60) faction.auditLogs.length = 60;
    await saveDb();
    res.json({ character: char, faction, factions: db.factions });
  });

  // Estação Operacional Única das 3 Facções na Cidade (Desmanche CV, Bancada FTX, Estufa & Branqueamento BMR)
  app.post('/api/factions/station', requireAuth, rateLimit(12, 20000), async (req: AuthedRequest, res) => {
    const { characterId, stationId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const station = FACTION_CITY_STATIONS.find(
      (s) => s.stationId === stationId || s.factionId === char.stats.factionId
    );
    if (!station) return res.status(404).json({ error: 'Estação de facção não encontrada.' });
    if (char.stats.factionId !== station.factionId) {
      return res.status(403).json({
        error: `Apenas membros da facção ${station.factionName} podem operar "${station.stationName}".`,
      });
    }

    const now = Date.now();
    const key = `fstation:${char.id}:${station.stationId}`;
    const readyAt = db.robberyCooldowns[key] || 0;
    if (now < readyAt) {
      const secs = Math.ceil((readyAt - now) / 1000);
      return res.status(429).json({ error: `Operação em recarga! Aguarda ${secs}s.` });
    }

    db.robberyCooldowns[key] = now + station.cooldownSec * 1000;
    const faction = db.factions.find((f) => f.id === station.factionId);
    const treasuryCut = Math.round(station.payoutKz * 0.2);
    const playerCut = station.payoutKz;

    char.stats.cashKz += playerCut;
    char.stats.wantedStars = Math.min(5, char.stats.wantedStars + 1);
    if (faction) faction.treasuryKz += treasuryCut;
    addXpAndCheckLevel(char, 45);
    addTransaction(char.id, 'crime', playerCut, `${station.stationName} (+${treasuryCut.toLocaleString('pt-PT')} Kz cofre)`);

    let bonusItemName = '';
    if (station.roleId === 'desmanche') {
      const cat = SHOP_CATALOG.find((s) => s.catalogId === 'pecas_desmanche');
      if (cat) {
        addItemToInventory(char, {
          catalogId: cat.catalogId,
          name: cat.name,
          description: cat.description,
          category: cat.category,
          quantity: 1,
          weight: cat.weight,
          equipped: false,
          usable: cat.usable,
          sellPriceKz: Math.round(cat.priceKz * 0.65),
        });
        bonusItemName = cat.name;
      }
    } else if (station.roleId === 'estufa_lavagem') {
      const cat = SHOP_CATALOG.find((s) => s.catalogId === 'maconha_erva');
      if (cat) {
        addItemToInventory(char, {
          catalogId: cat.catalogId,
          name: cat.name,
          description: cat.description,
          category: cat.category,
          quantity: 2,
          weight: cat.weight,
          equipped: false,
          usable: cat.usable,
          sellPriceKz: Math.round(cat.priceKz * 0.6),
        });
        bonusItemName = `2x ${cat.name}`;
      }
    } else if (station.roleId === 'fabrica_armas') {
      const targetId = Math.random() < 0.45 ? 'sucata_metal' : 'municao_pack';
      const cat = SHOP_CATALOG.find((s) => s.catalogId === targetId);
      if (cat) {
        addItemToInventory(char, {
          catalogId: cat.catalogId,
          name: cat.name,
          description: cat.description,
          category: cat.category,
          quantity: 1,
          weight: cat.weight,
          equipped: false,
          usable: cat.usable,
          sellPriceKz: Math.round(cat.priceKz * 0.55),
        });
        bonusItemName = cat.name;
      }
    }

    await saveDb();
    res.json({
      character: char,
      factions: db.factions,
      payout: playerCut,
      treasuryCut,
      bonusItemName,
      cooldownUntil: db.robberyCooldowns[key],
      message: `${station.stationName}: +${playerCut.toLocaleString('pt-PT')} Kz${bonusItemName ? ` + ${bonusItemName}` : ''}!`,
    });
  });

  // 7.2 FASE 5 — SISTEMAS DEDICADOS DAS 3 GANGUES (CV, FTX, BMR, BAÚ PARTILHADO, TERRITÓRIO)
  app.get('/api/gangs/state/:characterId', requireAuth, (req: AuthedRequest, res) => {
    const char = assertOwnedChar(req, req.params.characterId, res);
    if (!char) return;
    const db = getDb();
    const faction = db.factions.find((f) => f.id === char.stats.factionId);
    res.json({
      faction,
      recipes: FTX_CRAFT_RECIPES,
      desmancheSessions: Object.values(db.desmancheSessions || {}).filter((s) => s.characterId === char.id),
      craftSessions: Object.values(db.craftSessions || {}).filter((s) => s.characterId === char.id),
      growBatches: Object.values(db.growBatches || {}).filter((g) => g.characterId === char.id),
      activeTerritoryDispute: db.worldState.activeTerritoryDispute || null,
      sharedVehicles: Object.values(db.sharedVehicles || {}).slice(0, 30),
    });
  });

  app.post('/api/gangs/cv/desmanche', requireAuth, rateLimit(20, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, sessionId, vehicleId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const cv = db.factions.find((f) => f.id === 'cv_vianalandia');
    const cvHasLeader = Boolean(cv?.leaderId);
    if (cvHasLeader && char.stats.factionId !== 'cv_vianalandia') {
      return res.status(403).json({ error: 'Exclusivo para membros da gangue CV - VIANALANDIA (liderança ativa).' });
    }
    return await withCharacterLock(char.id, async () => {
      const now = Date.now();
      db.desmancheSessions = db.desmancheSessions || {};

      if (action === 'start') {
        const sv = db.sharedVehicles?.[String(vehicleId || '')];
        if (sv && sv.ownerId === char.id && !sv.id.startsWith('work-') && !sv.id.startsWith('farm-van-')) {
          return res.status(400).json({ error: 'Não podes desmanchar a tua própria viatura — rouba uma viatura de outro cidadão!' });
        }
        const vName = sv?.name || 'Viatura Urbana Interceptada';
        const vPlate = sv?.plate || generatePlate(db);
        const id = 'dsm-' + now;
        const sess = {
          id,
          characterId: char.id,
          vehicleId: sv?.id || 'target-street',
          vehicleName: vName,
          plate: vPlate,
          originalOwnerId: sv?.ownerId || 'npc',
          stage: 0,
          partsYielded: 0,
          startedAt: now,
          stageReadyAt: now + 5000,
        };
        db.desmancheSessions[id] = sess;
        broadcastEmergencyAlert({
          service: 'policia',
          title: '🚨 ALERTA PNA: FURTO & DESMANCHE EM VIANA',
          message: `Sinal de rastreador cortado na oficina clandestina CV (${vPlate})!`,
          x: 272,
          z: -36,
        });
        await saveDb();
        return res.json({ session: sess, character: char });
      }

      const sess = db.desmancheSessions[String(sessionId || '')];
      if (!sess || sess.characterId !== char.id) {
        return res.status(404).json({ error: 'Sessão de desmanche não encontrada.' });
      }

      if (action === 'advance') {
        if (sess.stageReadyAt && now < sess.stageReadyAt) {
          return res.status(400).json({ error: `Desmontagem em curso! Aguarda ${Math.ceil((sess.stageReadyAt - now) / 1000)}s.` });
        }
        sess.stage = Math.min(2, sess.stage + 1);
        sess.stageReadyAt = now + 5000;
        await saveDb();
        return res.json({ session: sess, character: char });
      }

      if (action === 'complete') {
        if (sess.stage < 2) {
          return res.status(400).json({ error: 'Conclui as 2 etapas de desmontagem antes de finalizar o desmanche.' });
        }
        if (sess.stageReadyAt && now < sess.stageReadyAt) {
          return res.status(400).json({ error: `A finalizar chassis! Aguarda ${Math.ceil((sess.stageReadyAt - now) / 1000)}s.` });
        }
        sess.stage = 3;
        sess.partsYielded = 2;
        const partsCat = SHOP_CATALOG.find((c) => c.catalogId === 'pecas_desmanche');
        if (partsCat) {
          addItemToInventory(char, {
            catalogId: partsCat.catalogId,
            name: partsCat.name,
            description: `Extraído no Desmanche CV (${sess.plate})`,
            category: partsCat.category,
            quantity: 2,
            weight: partsCat.weight,
            equipped: false,
            usable: false,
            sellPriceKz: Math.round(partsCat.priceKz * 0.8),
          });
        }

        const svTarget = db.sharedVehicles?.[sess.vehicleId];
        const ownedTarget = db.vehicles?.[sess.vehicleId];
        const modelId = svTarget?.modelId || ownedTarget?.modelId || '';
        const vehCatalogPrice = VEHICLE_CATALOG.find((v) => v.modelId === modelId)?.priceKz || 80000;
        const totalYield = Math.max(20000, Math.round(vehCatalogPrice * 0.25));
        const payout = Math.round(totalYield * 0.6); // 60% assaltante
        const cvCut = Math.round(totalYield * 0.4);  // 40% cofre CV

        if (svTarget) {
          removeSharedVehicleAndBroadcast(svTarget.id);
        }
        if (ownedTarget) {
          ownedTarget.isStoredInGarage = true;
          ownedTarget.health = 25;
        }

        char.stats.cashKz += payout;
        char.stats.wantedStars = Math.min(5, char.stats.wantedStars + 1);
        if (cv) cv.treasuryKz += cvCut;
        delete db.desmancheSessions[sess.id];
        addTransaction(char.id, 'crime', payout, `Desmanche CV 60/40 [${sess.plate}]`);
        await saveDb();
        return res.json({ session: sess, payout, cvCut, character: char });
      }

      res.status(400).json({ error: 'Ação de desmanche inválida.' });
    });
  });

  app.post('/api/gangs/ftx/craft', requireAuth, rateLimit(20, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, recipeId, craftId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    if (char.stats.factionId !== 'ftx_caop2') {
      return res.status(403).json({ error: 'Exclusivo para membros da gangue FTX - CAOP 2.' });
    }
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const now = Date.now();
      db.craftSessions = db.craftSessions || {};

      if (action === 'start') {
        const recipe = FTX_CRAFT_RECIPES.find((r) => r.id === String(recipeId || ''));
        if (!recipe) return res.status(404).json({ error: 'Receita de fabrico não encontrada.' });
        for (const reqMat of recipe.requiredMaterials) {
          const totalOwned = char.inventory
            .filter((i) => i.catalogId === reqMat.catalogId)
            .reduce((s, i) => s + i.quantity, 0);
          if (totalOwned < reqMat.qty) {
            return res.status(400).json({ error: `Faltam materiais: precisa de ${reqMat.qty}x ${reqMat.name}.` });
          }
        }
        for (const reqMat of recipe.requiredMaterials) {
          let remaining = reqMat.qty;
          for (let idx = char.inventory.length - 1; idx >= 0 && remaining > 0; idx--) {
            if (char.inventory[idx].catalogId === reqMat.catalogId) {
              const take = Math.min(char.inventory[idx].quantity, remaining);
              char.inventory[idx].quantity -= take;
              remaining -= take;
              if (char.inventory[idx].quantity <= 0) char.inventory.splice(idx, 1);
            }
          }
        }
        const craft = {
          id: 'crf-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          recipeId: recipe.id,
          outputCatalogId: recipe.outputCatalogId,
          outputName: recipe.outputName,
          readyAt: now + recipe.craftTimeSec * 1000,
          claimed: false,
        };
        db.craftSessions[craft.id] = craft;
        await saveDb();
        return res.json({ craft, character: char });
      }

      if (action === 'claim') {
        const craft = db.craftSessions[String(craftId || '')];
        if (!craft || craft.characterId !== char.id || craft.claimed) {
          return res.status(404).json({ error: 'Fabrico não encontrado ou já recolhido.' });
        }
        if (now < craft.readyAt) {
          return res.status(400).json({ error: `Fabrico em curso! Faltam ${Math.ceil((craft.readyAt - now) / 1000)}s.` });
        }
        const cat = SHOP_CATALOG.find((s) => s.catalogId === craft.outputCatalogId);
        if (cat) {
          addItemToInventory(char, {
            catalogId: cat.catalogId,
            name: cat.name,
            description: `${cat.description} [Fabrico FTX]`,
            category: cat.category,
            quantity: 1,
            weight: cat.weight,
            equipped: false,
            usable: cat.usable,
            sellPriceKz: Math.round(cat.priceKz * 0.55),
          });
        }
        craft.claimed = true;
        char.stats.wantedStars = Math.min(5, char.stats.wantedStars + 1);
        delete db.craftSessions[craft.id];
        await saveDb();
        return res.json({ craft, character: char });
      }

      res.status(400).json({ error: 'Ação de bancada FTX inválida.' });
    });
  });

  app.post('/api/gangs/bmr/grow', requireAuth, rateLimit(20, 15000), async (req: AuthedRequest, res) => {
    const { characterId, action, batchId, amountKz } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    if (char.stats.factionId !== 'bmr_matanga') {
      return res.status(403).json({ error: 'Exclusivo para membros da gangue BMR - MATANGA.' });
    }
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const now = Date.now();
      db.growBatches = db.growBatches || {};

      if (action === 'plant') {
        const activeCount = Object.values(db.growBatches).filter((b) => b.characterId === char.id && b.stage !== 'harvested').length;
        if (activeCount >= 3) return res.status(400).json({ error: 'Máximo de 3 vasos ativos em simultâneo na estufa.' });
        const batch = {
          id: 'grw-' + now + '-' + Math.random().toString(36).slice(2, 5),
          characterId: char.id,
          plantedAt: now,
          readyAt: now + 15000,
          stage: 'growing' as const,
          yieldQty: 3,
        };
        db.growBatches[batch.id] = batch;
        await saveDb();
        return res.json({ batch, character: char });
      }

      if (action === 'harvest') {
        const batch = db.growBatches[String(batchId || '')];
        if (!batch || batch.characterId !== char.id) return res.status(404).json({ error: 'Cultivo não encontrado.' });
        if (now < batch.readyAt) {
          return res.status(400).json({ error: `Planta em maturação! Faltam ${Math.ceil((batch.readyAt - now) / 1000)}s.` });
        }
        batch.stage = 'harvested';
        const cat = SHOP_CATALOG.find((s) => s.catalogId === 'maconha_erva');
        if (cat) {
          addItemToInventory(char, {
            catalogId: cat.catalogId,
            name: cat.name,
            description: `${cat.description} [Estufa BMR]`,
            category: cat.category,
            quantity: batch.yieldQty,
            weight: cat.weight,
            equipped: false,
            usable: cat.usable,
            sellPriceKz: Math.round(cat.priceKz * 0.7),
          });
        }
        delete db.growBatches[batch.id];
        await saveDb();
        return res.json({ batch, character: char });
      }

      if (action === 'sell_network') {
        const herbs = char.inventory.filter((i) => i.catalogId === 'maconha_erva');
        if (herbs.length === 0) return res.status(400).json({ error: 'Sem produto colhido para distribuir.' });
        let qty = 0;
        for (const h of herbs) qty += h.quantity;
        char.inventory = char.inventory.filter((i) => i.catalogId !== 'maconha_erva');
        const gain = qty * 3800;
        char.stats.cashKz += gain;
        char.stats.wantedStars = Math.min(5, char.stats.wantedStars + 1);
        const bmr = db.factions.find((f) => f.id === 'bmr_matanga');
        if (bmr) bmr.treasuryKz += Math.round(gain * 0.15);
        addTransaction(char.id, 'crime', gain, `Rede de Distribuição BMR (${qty} unid.)`);
        await saveDb();
        return res.json({ character: char, gain, soldQty: qty });
      }

      if (action === 'launder_capped') {
        const cdKey = `bmr_launder:${char.id}`;
        if ((db.robberyCooldowns[cdKey] || 0) > now) {
          return res.status(429).json({ error: `Lavagem em arrefecimento! Aguarda ${Math.ceil((db.robberyCooldowns[cdKey] - now) / 1000)}s.` });
        }
        const amt = Math.min(25000, char.stats.cashKz, Math.max(1000, Math.floor(Number(amountKz) || 5000)));
        if (amt <= 0 || char.stats.cashKz < amt) {
          return res.status(400).json({ error: 'Sem cash suficiente para lavar (limite 25.000 Kz por operação).' });
        }
        db.robberyCooldowns[cdKey] = now + 45000;
        const tax = Math.round(amt * 0.12);
        const clean = amt - tax;
        char.stats.cashKz -= amt;
        char.stats.bankKz += clean;
        addTransaction(char.id, 'crime', clean, `Lavagem de Capital BMR (-12% taxa)`);
        await saveDb();
        return res.json({ character: char, laundered: clean, tax });
      }

      res.status(400).json({ error: 'Ação BMR inválida.' });
    });
  });

  app.post('/api/gangs/stash', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, itemId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const faction = db.factions.find((f) => f.id === char.stats.factionId);
      if (!faction) return res.status(403).json({ error: 'Não pertences a nenhuma organização/facção.' });
      faction.stash = faction.stash || [];

      if (action === 'store') {
        const idx = char.inventory.findIndex((i) => i.id === itemId);
        if (idx < 0) return res.status(404).json({ error: 'Item não encontrado na mochila.' });
        const inv = char.inventory[idx];
        if (inv.category === 'document' || inv.category === 'phone') {
          return res.status(400).json({ error: 'Documentos e telemóvel são pessoais.' });
        }
        const existing = faction.stash.find((s) => s.catalogId === inv.catalogId && inv.category !== 'weapon');
        if (existing) existing.quantity += 1;
        else faction.stash.push({ ...inv, id: 'fst-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5), quantity: 1, equipped: false });
        inv.quantity -= 1;
        if (inv.quantity <= 0) char.inventory.splice(idx, 1);
      } else if (action === 'take') {
        const idx = faction.stash.findIndex((s) => s.id === itemId);
        if (idx < 0) return res.status(404).json({ error: 'Item não encontrado no baú da facção.' });
        const sItem = faction.stash[idx];
        addItemToInventory(char, { ...sItem, quantity: 1, equipped: false });
        sItem.quantity -= 1;
        if (sItem.quantity <= 0) faction.stash.splice(idx, 1);
      } else {
        return res.status(400).json({ error: 'Ação de baú inválida.' });
      }

      await saveDb();
      res.json({ character: char, faction, factions: db.factions });
    });
  });

  app.post('/api/gangs/territory', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, district } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const faction = db.factions.find((f) => f.id === char.stats.factionId && f.type === 'gangue');
    if (!faction) return res.status(403).json({ error: 'Apenas membros das 3 gangues podem disputar territórios.' });
    const now = Date.now();

    if (action === 'start_dispute') {
      if (db.worldState.activeTerritoryDispute && db.worldState.activeTerritoryDispute.endsAt > now) {
        return res.status(409).json({ error: 'Já existe uma disputa territorial em curso na cidade!' });
      }
      db.worldState.activeTerritoryDispute = {
        id: 'terr-' + now,
        district: (district || faction.baseDistrict) as any,
        attackerFactionId: faction.id,
        startedAt: now,
        endsAt: now + 90000,
      };
      broadcastSystemChat(`🏴 [DISPUTA TERRITORIAL] ${faction.name} iniciou tomada de território em ${db.worldState.activeTerritoryDispute.district.toUpperCase()}!`, 'geral');
      await saveDb();
      broadcastDynamicWorldSync();
      return res.json({ dispute: db.worldState.activeTerritoryDispute });
    }

    if (action === 'capture') {
      const disp = db.worldState.activeTerritoryDispute;
      if (!disp || disp.attackerFactionId !== faction.id) {
        return res.status(400).json({ error: 'Não tens nenhuma disputa ativa iniciada pela tua gangue.' });
      }
      if (now < disp.endsAt) {
        return res.status(400).json({ error: `Disputa territorial em curso! Faltam ${Math.ceil((disp.endsAt - now) / 1000)}s para dominar o território.` });
      }
      faction.treasuryKz += 15000;
      char.stats.cashKz += 5000;
      db.worldState.activeTerritoryDispute = null;
      broadcastSystemChat(`🏆 [TERRITÓRIO DOMINADO] ${faction.name} assumiu o controlo de ${disp.district.toUpperCase()} (+15.000 Kz cofre)!`, 'geral');
      await saveDb();
      broadcastDynamicWorldSync();
      return res.json({ character: char, faction, dispute: null });
    }

    res.status(400).json({ error: 'Ação territorial inválida.' });
  });

  // GESTÃO DE ORGANIZAÇÕES EXCLUSIVA DO ADMIN GOD
  app.get('/api/admin/organizations', requireAuth, requireRole('admin_god'), (_req, res) => {
    const db = getDb();
    const onlineIds = new Set(getConnectedPlayersSnapshot().map((p) => p.characterId || p.id));
    const eligibleCharacters = Object.values(db.characters).map((c) => ({
      id: c.id,
      name: `${c.stats.name} ${c.stats.surname}`,
      bi: c.stats.idNumber,
      phone: c.stats.phone,
      level: c.stats.level,
      factionId: c.stats.factionId,
      factionRank: c.stats.factionRank,
      online: onlineIds.has(c.id),
    }));
    res.json({ factions: db.factions, eligibleCharacters });
  });

  app.post('/api/admin/organizations', requireAuth, requireRole('admin_god'), async (req: AuthedRequest, res) => {
    const actor = req.account!;
    const actorRole = resolveAccountRole(actor);
    const { action, factionId, targetCharId, ranks } = req.body || {};
    const db = getDb();
    const faction = db.factions.find((f) => f.id === factionId);
    if (!faction) return res.status(404).json({ error: 'Organização não encontrada.' });
    faction.auditLogs = faction.auditLogs || [];

    if (action === 'appoint_leader' || action === 'replace_leader') {
      const target = db.characters[String(targetCharId || '')];
      if (!target) return res.status(404).json({ error: 'Jogador selecionado não encontrado.' });

      // Rebaixa líder anterior desta org para Sublíder (se existir e for diferente)
      if (faction.leaderId && faction.leaderId !== target.id) {
        const prevLeaderChar = db.characters[faction.leaderId];
        const prevMember = faction.members.find((m) => m.characterId === faction.leaderId);
        const subRank = faction.ranks[Math.max(0, faction.ranks.length - 2)];
        if (prevMember && subRank) {
          prevMember.level = subRank.level;
          prevMember.rank = subRank.name;
        }
        if (prevLeaderChar && prevLeaderChar.stats.factionId === faction.id && subRank) {
          prevLeaderChar.stats.factionRank = subRank.name;
          pushAdminEffectToCharacter(prevLeaderChar.id, { action: 'refresh_character' });
          syncConnectedPlayerProfile(prevLeaderChar.id);
        }
      }

      // Remove o escolhido de outra facção caso pertencesse a outra
      db.factions.forEach((f) => {
        if (f.id !== faction.id) {
          f.members = f.members.filter((m) => m.characterId !== target.id);
          if (f.leaderId === target.id) {
            f.leaderId = null;
            f.leaderName = 'Aguardando Admin God';
          }
        }
      });

      const leaderRank = faction.ranks[faction.ranks.length - 1];
      const fullName = `${target.stats.name} ${target.stats.surname}`;
      const existingMember = faction.members.find((m) => m.characterId === target.id);
      if (existingMember) {
        existingMember.level = leaderRank.level;
        existingMember.rank = leaderRank.name;
        existingMember.bi = target.stats.idNumber;
        existingMember.phone = target.stats.phone;
      } else {
        faction.members.push({
          characterId: target.id,
          name: fullName,
          rank: leaderRank.name,
          level: leaderRank.level,
          bi: target.stats.idNumber,
          phone: target.stats.phone,
          joinedAt: new Date().toISOString(),
        });
      }

      faction.leaderId = target.id;
      faction.leaderName = fullName;
      target.stats.factionId = faction.id;
      target.stats.factionRank = leaderRank.name;
      syncConnectedPlayerProfile(target.id);

      faction.auditLogs.unshift({
        id: 'faud-' + Date.now(),
        actorName: `ADMIN GOD (${actor.email})`,
        action: action,
        details: `${fullName} nomeado Líder Principal de ${faction.name}`,
        timestamp: new Date().toISOString(),
      });
      addAdminLog(actor.email, actorRole, action, `${fullName} ➔ Líder de ${faction.name}`);
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
      broadcastSystemChat(`👑 [ADMIN GOD] ${fullName} foi nomeado Líder Oficial de ${faction.name}!`, 'geral');
    } else if (action === 'remove_leader') {
      const oldLeaderId = faction.leaderId;
      const oldName = faction.leaderName;
      if (oldLeaderId) {
        const subRank = faction.ranks[Math.max(0, faction.ranks.length - 2)];
        const m = faction.members.find((x) => x.characterId === oldLeaderId);
        if (m && subRank) {
          m.level = subRank.level;
          m.rank = subRank.name;
        }
        const c = db.characters[oldLeaderId];
        if (c && subRank) {
          c.stats.factionRank = subRank.name;
          pushAdminEffectToCharacter(c.id, { action: 'refresh_character' });
        }
      }
      faction.leaderId = null;
      faction.leaderName = 'Aguardando Admin God';
      faction.auditLogs.unshift({
        id: 'faud-' + Date.now(),
        actorName: `ADMIN GOD`,
        action: 'remove_leader',
        details: `Liderança retirada de ${oldName}`,
        timestamp: new Date().toISOString(),
      });
      addAdminLog(actor.email, actorRole, 'remove_leader', `Retirou liderança de ${oldName} em ${faction.name}`);
    } else if (action === 'suspend_org') {
      faction.suspended = true;
      faction.auditLogs.unshift({
        id: 'faud-' + Date.now(),
        actorName: 'ADMIN GOD',
        action: 'suspend_org',
        details: `Organização suspensa administrativamente`,
        timestamp: new Date().toISOString(),
      });
      addAdminLog(actor.email, actorRole, 'suspend_org', `Suspendeu ${faction.name}`);
    } else if (action === 'reactivate_org') {
      faction.suspended = false;
      faction.auditLogs.unshift({
        id: 'faud-' + Date.now(),
        actorName: 'ADMIN GOD',
        action: 'reactivate_org',
        details: `Organização reativada`,
        timestamp: new Date().toISOString(),
      });
      addAdminLog(actor.email, actorRole, 'reactivate_org', `Reativou ${faction.name}`);
    } else if (action === 'update_ranks' && Array.isArray(ranks) && ranks.length >= 2) {
      faction.ranks = ranks;
      addAdminLog(actor.email, actorRole, 'update_ranks', `Atualizou hierarquia de ${faction.name}`);
    } else {
      return res.status(400).json({ error: 'Ação de organização inválida.' });
    }

    await saveDb();
    res.json({ ok: true, faction, factions: db.factions });
  });

  // 8. POLÍCIA (PNA), JUSTIÇA & ADVOGADOS (OAA) + HOSPITAL INEMA
  app.get('/api/justice/cad', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const q = String(req.query.q || '').trim().toLowerCase();
    const citizens = Object.values(db.characters)
      .filter(
        (c) =>
          !q ||
          c.stats.idNumber.toLowerCase().includes(q) ||
          `${c.stats.name} ${c.stats.surname}`.toLowerCase().includes(q) ||
          c.stats.phone.includes(q)
      )
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        name: `${c.stats.name} ${c.stats.surname}`,
        idNumber: c.stats.idNumber,
        phone: c.stats.phone,
        factionId: c.stats.factionId,
        wantedStars: c.stats.wantedStars,
        jailUntil: c.stats.jailUntil,
        health: c.stats.health,
        isUnconscious: c.stats.isUnconscious,
        handcuffed: !!c.stats.handcuffed,
        escortedByCharId: c.stats.escortedByCharId || null,
      }));
    const vehicles = Object.values(db.vehicles)
      .filter((v) => !q || v.plate.toLowerCase().includes(q))
      .slice(0, 15);
    res.json({
      citizens,
      vehicles,
      warrants: db.warrants.filter((w) => w.active).slice(0, 20),
      criminalRecords: db.criminalRecords.slice(0, 30),
      medicalHistory: db.medicalHistory.slice(0, 30),
      inemaCalls: db.worldState.inemaCalls.slice(0, 20),
      lawyerCases: db.worldState.lawyerCases.slice(0, 25),
      policeStash: db.factions.find((f) => f.id === 'policia')?.stash || [],
    });
  });

  app.post('/api/justice/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, targetCharId, vehiclePlate, amountKz, reason, minutes, payWith = 'bank' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const isCop = char.stats.factionId === 'policia' || resolveAccountRole(req.account!) !== 'player';

    if (action === 'pay_bail') {
      const bailCost = Math.max(5000, char.stats.wantedStars * 4000);
      if (char.stats.bankKz < bailCost) return res.status(400).json({ error: `Fiança custa ${bailCost.toLocaleString('pt-PT')} Kz no banco.` });
      char.stats.bankKz -= bailCost;
      char.stats.jailUntil = 0;
      char.stats.jailReason = '';
      char.stats.assignedCell = 0;
      char.stats.wantedStars = 0;
      char.stats.handcuffed = false;
      char.stats.escortedByCharId = null;
      char.position = { x: PRISON_RELEASE_POS[0], y: 0, z: PRISON_RELEASE_POS[2] };
      addTransaction(char.id, 'fine', -bailCost, 'Pagamento de Fiança — Tribunal de Luanda');
      await saveDb();
      return res.json({ character: char });
    }

    if (action === 'pay_fines') {
      const myVehiclesWithFines = Object.values(db.vehicles).filter((v) => v.ownerId === char.id && v.finesKz > 0);
      const vehFinesTotal = myVehiclesWithFines.reduce((sum, v) => sum + v.finesKz, 0);
      const citizenFines = char.stats.unpaidFinesKz || 0;
      const totalDue = citizenFines + vehFinesTotal;
      if (totalDue <= 0) {
        return res.status(400).json({ error: 'Não tens multas pendentes na PNA!' });
      }
      if (payWith === 'cash') {
        if (char.stats.cashKz < totalDue) return res.status(400).json({ error: `Multas totalizam ${totalDue.toLocaleString('pt-PT')} Kz.` });
        char.stats.cashKz -= totalDue;
      } else if (char.stats.bankKz >= totalDue) {
        char.stats.bankKz -= totalDue;
      } else if (char.stats.cashKz >= totalDue) {
        char.stats.cashKz -= totalDue;
      } else {
        return res.status(400).json({ error: `Saldo insuficiente para liquidar multas (${totalDue.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.unpaidFinesKz = 0;
      for (const v of myVehiclesWithFines) {
        v.finesKz = 0;
        v.isImpounded = false;
      }
      const pnaOrg = db.factions.find((f) => f.id === 'policia');
      if (pnaOrg) pnaOrg.treasuryKz += totalDue;
      addTransaction(char.id, 'fine', -totalDue, 'Pagamento de Multas PNA na Esquadra');
      await saveDb();
      return res.json({ character: char, paidTotalKz: totalDue });
    }

    if (action === 'buy_weapon_license') {
      const now = Date.now();
      if ((char.stats.weaponLicenseUntil || 0) > now) {
        return res.status(400).json({ error: 'Já possuis uma Licença de Porte de Arma ativa! Usa Renovar quando precisar.' });
      }
      if (payWith === 'cash') {
        if (char.stats.cashKz < WEAPON_LICENSE_BUY_KZ) return res.status(400).json({ error: `Porte de Arma custa ${WEAPON_LICENSE_BUY_KZ.toLocaleString('pt-PT')} Kz.` });
        char.stats.cashKz -= WEAPON_LICENSE_BUY_KZ;
      } else if (char.stats.bankKz >= WEAPON_LICENSE_BUY_KZ) {
        char.stats.bankKz -= WEAPON_LICENSE_BUY_KZ;
      } else if (char.stats.cashKz >= WEAPON_LICENSE_BUY_KZ) {
        char.stats.cashKz -= WEAPON_LICENSE_BUY_KZ;
      } else {
        return res.status(400).json({ error: `Saldo insuficiente (${WEAPON_LICENSE_BUY_KZ.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.weaponLicenseUntil = now + WEAPON_LICENSE_DURATION_MS;
      const pnaOrg = db.factions.find((f) => f.id === 'policia');
      if (pnaOrg) pnaOrg.treasuryKz += Math.round(WEAPON_LICENSE_BUY_KZ * 0.5);
      addTransaction(char.id, 'legal', -WEAPON_LICENSE_BUY_KZ, 'Emissão de Licença de Porte de Arma (15 dias)');
      await saveDb();
      return res.json({ character: char });
    }

    if (action === 'renew_weapon_license') {
      const now = Date.now();
      if (!char.stats.weaponLicenseUntil) {
        return res.status(400).json({ error: 'Ainda não tens Licença emitida — compra primeiro a Licença inicial (50.000 Kz).' });
      }
      if (payWith === 'cash') {
        if (char.stats.cashKz < WEAPON_LICENSE_RENEW_KZ) return res.status(400).json({ error: `Renovação custa ${WEAPON_LICENSE_RENEW_KZ.toLocaleString('pt-PT')} Kz.` });
        char.stats.cashKz -= WEAPON_LICENSE_RENEW_KZ;
      } else if (char.stats.bankKz >= WEAPON_LICENSE_RENEW_KZ) {
        char.stats.bankKz -= WEAPON_LICENSE_RENEW_KZ;
      } else if (char.stats.cashKz >= WEAPON_LICENSE_RENEW_KZ) {
        char.stats.cashKz -= WEAPON_LICENSE_RENEW_KZ;
      } else {
        return res.status(400).json({ error: `Saldo insuficiente (${WEAPON_LICENSE_RENEW_KZ.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.weaponLicenseUntil = Math.max(now, char.stats.weaponLicenseUntil) + WEAPON_LICENSE_DURATION_MS;
      const pnaOrg = db.factions.find((f) => f.id === 'policia');
      if (pnaOrg) pnaOrg.treasuryKz += Math.round(WEAPON_LICENSE_RENEW_KZ * 0.5);
      addTransaction(char.id, 'legal', -WEAPON_LICENSE_RENEW_KZ, 'Renovação Licença de Porte de Arma (+15 dias)');
      await saveDb();
      return res.json({ character: char });
    }

    if (!isCop) return res.status(403).json({ error: 'Apenas Agentes da Polícia Nacional (PNA) têm acesso a esta ação.' });

    const officerName = `${char.stats.name} ${char.stats.surname}`;
    const target = targetCharId ? db.characters[String(targetCharId)] : undefined;
    let inspectedProfile = undefined;
    let seizedCount = 0;

    if (action === 'fine' && target) {
      const fine = Math.max(500, Math.min(50000, Math.floor(Number(amountKz) || 2500)));
      target.stats.unpaidFinesKz = (target.stats.unpaidFinesKz || 0) + fine;
      db.criminalRecords.unshift({
        id: 'cr-' + Date.now(),
        characterId: target.id,
        characterName: `${target.stats.name} ${target.stats.surname}`,
        type: 'fine',
        reason: String(reason || 'Infração ao Código de Estrada'),
        amountKz: fine,
        officerName,
        timestamp: new Date().toISOString(),
      });
      addTransaction(target.id, 'fine', -fine, `Auto de Multa PNA: ${reason || 'Infração'} (por pagar na Esquadra)`);
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    } else if (action === 'arrest' && target) {
      const mins = Math.max(1, Math.min(300, Number(minutes) || 2));
      const cellNum = ((Object.keys(db.criminalRecords).length + Math.floor(Math.random() * 4)) % 4) + 1;
      const cell = getAssignedCellData(cellNum);
      target.stats.jailUntil = Date.now() + mins * 60000;
      target.stats.jailReason = String(reason || 'Ordem de Prisão PNA');
      target.stats.assignedCell = cell.cellNumber;
      target.stats.wantedStars = 0;
      target.stats.handcuffed = false;
      target.stats.escortedByCharId = null;
      target.position = { x: cell.spawn[0], y: cell.spawn[1], z: cell.spawn[2] };
      db.criminalRecords.unshift({
        id: 'cr-' + Date.now(),
        characterId: target.id,
        characterName: `${target.stats.name} ${target.stats.surname}`,
        type: 'arrest',
        reason: target.stats.jailReason,
        amountKz: 0,
        officerName,
        timestamp: new Date().toISOString(),
      });
      pushAdminEffectToCharacter(target.id, { action: 'teleport', x: cell.spawn[0], z: cell.spawn[2] });
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    } else if (action === 'warrant' && target) {
      target.stats.wantedStars = Math.min(5, Math.max(1, target.stats.wantedStars + 2));
      db.warrants.unshift({
        id: 'war-' + Date.now(),
        targetCharId: target.id,
        targetName: `${target.stats.name} ${target.stats.surname}`,
        reason: String(reason || 'Mandado Judicial PNA'),
        issuedBy: officerName,
        createdAt: new Date().toISOString(),
        active: true,
      });
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    } else if (action === 'impound' && vehiclePlate) {
      const v = Object.values(db.vehicles).find((x) => x.plate.toLowerCase() === String(vehiclePlate).toLowerCase());
      if (!v) return res.status(404).json({ error: 'Matrícula não encontrada.' });
      v.isImpounded = true;
      v.isStoredInGarage = true;
      v.finesKz += 6000;
      removeSharedVehicleAndBroadcast(v.id);
    } else if ((action === 'handcuff' || action === 'unhandcuff') && target) {
      target.stats.handcuffed = action === 'handcuff';
      if (!target.stats.handcuffed) target.stats.escortedByCharId = null;
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    } else if ((action === 'escort' || action === 'unescort') && target) {
      target.stats.escortedByCharId = action === 'escort' ? char.id : null;
      if (action === 'escort') {
        target.position = { x: char.position.x + 1.1, y: char.position.y, z: char.position.z + 1.1 };
        pushAdminEffectToCharacter(target.id, { action: 'teleport', x: target.position.x, z: target.position.z });
      }
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    } else if (action === 'check_id' && target) {
      inspectedProfile = {
        id: target.id,
        name: `${target.stats.name} ${target.stats.surname}`,
        idNumber: target.stats.idNumber,
        phone: target.stats.phone,
        nationality: target.stats.nationality,
        wantedStars: target.stats.wantedStars,
        factionId: target.stats.factionId,
        inventory: target.inventory.map((i) => ({ name: i.name, category: i.category, quantity: i.quantity })),
      };
    } else if (action === 'seize_items' && target) {
      const illegalIds = new Set(['maconha_erva', 'pacote_contrabando', 'gazua_rp', 'pecas_desmanche', 'pistola_9mm', 'espingarda_12', 'ak47_tatica', 'municao_pack']);
      const policeOrg = db.factions.find((f) => f.id === 'policia');
      if (policeOrg && !policeOrg.stash) policeOrg.stash = [];
      const kept: typeof target.inventory = [];
      for (const item of target.inventory) {
        if (illegalIds.has(item.catalogId)) {
          seizedCount += item.quantity;
          if (policeOrg?.stash) {
            policeOrg.stash.push({ ...item, id: 'evd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5), equipped: false });
          }
        } else {
          kept.push(item);
        }
      }
      target.inventory = kept;
      target.customization.equippedWeapon = 'none';
      pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    }

    await saveDb();
    res.json({
      character: char,
      warrants: db.warrants.slice(0, 20),
      criminalRecords: db.criminalRecords.slice(0, 30),
      inspectedProfile,
      seizedCount,
    });
  });

  app.get('/api/hospital/calls', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({
      calls: db.worldState.inemaCalls.slice(0, 20),
      medicalHistory: db.medicalHistory.slice(0, 30),
    });
  });

  app.post('/api/hospital/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, targetCharId, callId, reason } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const now = Date.now();
    const fullName = `${char.stats.name} ${char.stats.surname}`;

    if (action === 'self_treat') {
      const cost = 1800;
      if (char.stats.cashKz >= cost) char.stats.cashKz -= cost;
      else if (char.stats.bankKz >= cost) char.stats.bankKz -= cost;
      else return res.status(400).json({ error: 'Consulta no Hospital custa 1.800 Kz.' });

      char.stats.health = 100;
      char.stats.bleeding = false;
      char.stats.isUnconscious = false;
      char.stats.hunger = Math.max(char.stats.hunger, 65);
      char.stats.thirst = Math.max(char.stats.thirst, 65);
      char.stats.energy = 100;
      db.medicalHistory.unshift({
        id: 'med-' + now,
        characterId: char.id,
        characterName: fullName,
        treatment: 'Atendimento Urgência Josina Machel',
        doctorName: '[NPC] Médico INEMA',
        costKz: cost,
        timestamp: new Date().toISOString(),
      });
      addTransaction(char.id, 'medical', -cost, 'Consulta Médica — Hospital Josina Machel');
    } else if (action === 'request_112') {
      const call = {
        id: 'inema-' + now + '-' + Math.random().toString(36).slice(2, 5),
        patientCharId: char.id,
        patientName: fullName,
        reason: String(reason || 'Cidadão inconsciente / ferido — Urgência 112'),
        pos: { ...char.position },
        status: 'waiting' as const,
        createdAt: now,
      };
      db.worldState.inemaCalls.unshift(call);
      if (db.worldState.inemaCalls.length > 20) db.worldState.inemaCalls.length = 20;
      broadcastEmergencyAlert({
        service: 'medico',
        title: `🚑 OCORRÊNCIA 112 — ${fullName}`,
        message: call.reason,
        x: char.position.x,
        z: char.position.z,
      });
      await saveDb();
      broadcastDynamicWorldSync();
      return res.json({ character: char, call, calls: db.worldState.inemaCalls, medicalHistory: db.medicalHistory.slice(0, 30) });
    } else if (action === 'accept_call') {
      const isMedic = char.stats.factionId === 'hospital' || resolveAccountRole(req.account!) !== 'player';
      if (!isMedic) return res.status(403).json({ error: 'Apenas equipas INEMA podem aceitar ocorrências 112.' });
      const call = db.worldState.inemaCalls.find((c) => c.id === String(callId || ''));
      if (!call) return res.status(404).json({ error: 'Ocorrência 112 não encontrada.' });
      call.status = 'en_route';
      call.medicCharId = char.id;
      call.medicName = fullName;
      broadcastDynamicWorldSync();
    } else if (action === 'transport_hospital' || action === 'discharge') {
      const isMedic = char.stats.factionId === 'hospital' || resolveAccountRole(req.account!) !== 'player';
      if (!isMedic) return res.status(403).json({ error: 'Exclusivo de profissionais INEMA.' });
      const target = targetCharId ? db.characters[String(targetCharId)] : undefined;
      if (target) {
        if (action === 'transport_hospital') {
          target.position = { x: 48, y: 0, z: 54 };
          syncConnectedCharacterPosition(target.id, 48, 54);
          pushAdminEffectToCharacter(target.id, { action: 'teleport', x: 48, z: 54 });
        }
        target.stats.health = 100;
        target.stats.bleeding = false;
        target.stats.isUnconscious = false;
        pushAdminEffectToCharacter(target.id, { action: 'revive' });
      }
      if (callId) {
        const call = db.worldState.inemaCalls.find((c) => c.id === String(callId));
        if (call) {
          call.status = 'resolved';
          call.resolvedAt = now;
        }
      }
      char.stats.bankKz += 3200;
      char.counters.healsCount += 1;
      addTransaction(char.id, 'medical', 3200, `Socorro & Alta Médica INEMA`);
      broadcastDynamicWorldSync();
    } else if (action === 'respawn_inema') {
      const fee = 2500;
      char.stats.bankKz = Math.max(0, char.stats.bankKz - fee);
      char.stats.health = 80;
      char.stats.bleeding = false;
      char.stats.isUnconscious = false;
      char.position = { x: 48, y: 0, z: 54 };
      syncConnectedCharacterPosition(char.id, 48, 54);
      db.medicalHistory.unshift({
        id: 'med-' + now,
        characterId: char.id,
        characterName: fullName,
        treatment: 'Reanimação de Emergência INEMA',
        doctorName: 'Equipa INEMA',
        costKz: fee,
        timestamp: new Date().toISOString(),
      });
    } else if (action === 'revive_player' && targetCharId) {
      const isMedic = char.stats.factionId === 'hospital' || resolveAccountRole(req.account!) !== 'player';
      if (!isMedic) return res.status(403).json({ error: 'Apenas Médicos INEMA podem reanimar outros cidadãos.' });
      const target = db.characters[String(targetCharId)];
      if (!target) return res.status(404).json({ error: 'Paciente não encontrado.' });
      target.stats.health = 85;
      target.stats.bleeding = false;
      target.stats.isUnconscious = false;
      char.stats.bankKz += 3000;
      char.counters.healsCount += 1;
      if (callId) {
        const call = db.worldState.inemaCalls.find((c) => c.id === String(callId));
        if (call) {
          call.status = 'resolved';
          call.resolvedAt = now;
        }
        broadcastDynamicWorldSync();
      }
      db.medicalHistory.unshift({
        id: 'med-' + now,
        characterId: target.id,
        characterName: `${target.stats.name} ${target.stats.surname}`,
        treatment: 'Reanimação em Campo',
        doctorName: fullName,
        costKz: 3000,
        timestamp: new Date().toISOString(),
      });
      pushAdminEffectToCharacter(target.id, { action: 'revive' });
    } else if (action === 'inema_field_revive') {
      if (targetCharId && String(targetCharId) !== char.id) {
        const isMedic = char.stats.factionId === 'hospital' || resolveAccountRole(req.account!) !== 'player';
        if (!isMedic) return res.status(403).json({ error: 'Apenas Médicos INEMA podem reanimar outros cidadãos em campo.' });
        const target = db.characters[String(targetCharId)];
        if (!target) return res.status(404).json({ error: 'Paciente não encontrado.' });
        target.stats.health = 100;
        target.stats.bleeding = false;
        target.stats.isUnconscious = false;
        target.stats.energy = Math.max(target.stats.energy, 65);
        char.stats.bankKz += 3000;
        char.counters.healsCount += 1;
        addTransaction(char.id, 'medical', 3000, 'Reanimação INEMA em Campo');
        const resolvedCall = callId
          ? db.worldState.inemaCalls.find((c) => c.id === String(callId))
          : db.worldState.inemaCalls.find((c) => c.patientCharId === target.id && c.status !== 'resolved');
        if (resolvedCall) {
          resolvedCall.status = 'resolved';
          resolvedCall.resolvedAt = now;
        }
        db.medicalHistory.unshift({
          id: 'med-' + now,
          characterId: target.id,
          characterName: `${target.stats.name} ${target.stats.surname}`,
          treatment: 'Reanimação em Campo INEMA',
          doctorName: fullName,
          costKz: 3000,
          timestamp: new Date().toISOString(),
        });
        pushAdminEffectToCharacter(target.id, { action: 'revive' });
        broadcastDynamicWorldSync();
      } else {
        const fee = 1000;
        if (char.stats.cashKz >= fee) char.stats.cashKz -= fee;
        else if (char.stats.bankKz >= fee) char.stats.bankKz -= fee;
        char.stats.health = 100;
        char.stats.bleeding = false;
        char.stats.isUnconscious = false;
        char.stats.energy = Math.max(char.stats.energy, 65);
        const resolvedCall = callId
          ? db.worldState.inemaCalls.find((c) => c.id === String(callId))
          : db.worldState.inemaCalls.find((c) => c.patientCharId === char.id && c.status !== 'resolved');
        if (resolvedCall) {
          resolvedCall.status = 'resolved';
          resolvedCall.resolvedAt = now;
        }
        db.medicalHistory.unshift({
          id: 'med-' + now,
          characterId: char.id,
          characterName: fullName,
          treatment: 'Reanimação Ambulância INEMA no Local',
          doctorName: '[NPC] Ambulância INEMA 112',
          costKz: fee,
          timestamp: new Date().toISOString(),
        });
        broadcastDynamicWorldSync();
      }
    }

    await saveDb();
    res.json({ character: char, calls: db.worldState.inemaCalls, medicalHistory: db.medicalHistory.slice(0, 30) });
  });

  // 8.2 ORDEM DOS ADVOGADOS (OAA) & TRIBUNAL DE LUANDA
  app.get('/api/lawyers/cases', requireAuth, (_req, res) => {
    const db = getDb();
    const advOrg = db.factions.find((f) => f.id === 'advogados');
    res.json({
      cases: db.worldState.lawyerCases.slice(0, 30),
      lawyers: advOrg?.members || [],
      criminalRecords: db.criminalRecords.slice(0, 25),
    });
  });

  app.post('/api/lawyers/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, caseId, clientCharId, chargeSummary, feeKz, bailKz, ruling, note } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const now = Date.now();
    const fullName = `${char.stats.name} ${char.stats.surname}`;
    const isLawyer = char.stats.factionId === 'advogados' || resolveAccountRole(req.account!) !== 'player';

    if (action === 'open_case' || action === 'hire_lawyer') {
      const target = clientCharId ? db.characters[String(clientCharId)] : char;
      if (!target) return res.status(404).json({ error: 'Cliente não encontrado.' });
      const fee = Math.max(2500, Math.min(40000, Math.floor(Number(feeKz) || 6500)));
      const rec = {
        id: 'law-' + now + '-' + Math.random().toString(36).slice(2, 5),
        clientCharId: target.id,
        clientName: `${target.stats.name} ${target.stats.surname}`,
        lawyerCharId: isLawyer ? char.id : undefined,
        lawyerName: isLawyer ? fullName : undefined,
        chargeSummary: String(chargeSummary || target.stats.jailReason || 'Defesa Legal / Recurso Judicial'),
        fineKz: Math.max(0, target.stats.wantedStars * 3500),
        bailRequestedKz: Math.max(3000, Number(bailKz) || 4500),
        feeKz: fee,
        status: (isLawyer ? 'hired' : 'open') as 'open' | 'hired',
        createdAt: now,
        updatedAt: now,
      };
      db.worldState.lawyerCases.unshift(rec);
      if (db.worldState.lawyerCases.length > 35) db.worldState.lawyerCases.length = 35;
      await saveDb();
      broadcastDynamicWorldSync();
      return res.json({ record: rec, cases: db.worldState.lawyerCases, character: char });
    }

    if (!isLawyer) {
      return res.status(403).json({ error: 'Apenas membros da Ordem dos Advogados (OAA) podem executar esta ação.' });
    }
    const rec = db.worldState.lawyerCases.find((c) => c.id === String(caseId || ''));
    if (!rec) return res.status(404).json({ error: 'Processo jurídico não encontrado.' });

    if (action === 'hire_accept') {
      rec.lawyerCharId = char.id;
      rec.lawyerName = fullName;
      rec.status = 'hired';
      rec.updatedAt = now;
    } else if (action === 'request_bail') {
      rec.status = 'hearing';
      rec.bailRequestedKz = Math.max(2500, Math.floor(Number(bailKz) || rec.bailRequestedKz || 4000));
      rec.updatedAt = now;
    } else if (action === 'court_hearing' || action === 'conclude_case') {
      const client = db.characters[rec.clientCharId];
      const outcome = ruling === 'acquitted' ? 'acquitted' : 'reduced';
      rec.status = outcome;
      rec.rulingNote = String(note || (outcome === 'acquitted' ? 'Absolvição decretada em Tribunal — Cliente libertado.' : 'Pena reduzida em 50% por acordo de defesa.'));
      rec.updatedAt = now;
      if (client) {
        if (outcome === 'acquitted') {
          client.stats.jailUntil = 0;
          client.stats.jailReason = '';
          client.stats.assignedCell = 0;
          client.stats.wantedStars = 0;
          client.position = { x: PRISON_RELEASE_POS[0], y: 0, z: PRISON_RELEASE_POS[2] };
          syncConnectedCharacterPosition(client.id, PRISON_RELEASE_POS[0], PRISON_RELEASE_POS[2]);
          pushAdminEffectToCharacter(client.id, { action: 'teleport', x: PRISON_RELEASE_POS[0], z: PRISON_RELEASE_POS[2] });
        } else if (client.stats.jailUntil > now) {
          client.stats.jailUntil = now + Math.round((client.stats.jailUntil - now) * 0.5);
        }
        if (client.stats.bankKz >= rec.feeKz) {
          client.stats.bankKz -= rec.feeKz;
          char.stats.bankKz += rec.feeKz;
          addTransaction(client.id, 'legal', -rec.feeKz, `Honorários OAA — ${fullName}`);
          addTransaction(char.id, 'legal', rec.feeKz, `Honorários Defesa: ${rec.clientName}`);
        }
        pushAdminEffectToCharacter(client.id, { action: 'refresh_character' });
      }
      broadcastSystemChat(`⚖️ [TRIBUNAL DE LUANDA] Processo de ${rec.clientName} concluído por Dr(a). ${fullName}: ${rec.rulingNote}`, 'geral');
    }

    await saveDb();
    broadcastDynamicWorldSync();
    res.json({ record: rec, cases: db.worldState.lawyerCases, character: char });
  });

  // 9B. ASSALTO AO COFRE DAS FAA (100.000 Kz, COOLDOWN DE 5 MINUTOS + ALERTA PNA & FAA)
  app.post('/api/crime/faa-heist', requireAuth, rateLimit(6, 20000), async (req: AuthedRequest, res) => {
    const { characterId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const faction = db.factions.find((f) => f.id === char.stats.factionId);
    const isCrimeFaction = Boolean(faction && (faction.type === 'crime' || faction.type === 'gangue'));
    if (!isCrimeFaction) {
      return res.status(403).json({
        error: 'Apenas membros de uma Facção do Crime podem assaltar o Tesouro das FAA!',
      });
    }

    const now = Date.now();
    const readyAt = db.robberyCooldowns['faa_vault'] || 0;
    if (now < readyAt) {
      const secs = Math.ceil((readyAt - now) / 1000);
      const mins = Math.floor(secs / 60);
      const remSecs = secs % 60;
      return res.status(429).json({
        error: `Cofre Militar FAA bloqueado! Próximo assalto disponível em ${mins}m ${String(remSecs).padStart(2, '0')}s.`,
        cooldownUntil: readyAt,
      });
    }

    db.robberyCooldowns['faa_vault'] = now + FAA_HEIST_COOLDOWN_MS;
    char.stats.cashKz += FAA_HEIST_REWARD_KZ;
    char.stats.wantedStars = 5;
    char.counters.robberiesCount += 1;
    addXpAndCheckLevel(char, 150);
    addTransaction(char.id, 'crime', FAA_HEIST_REWARD_KZ, 'Assalto ao Tesouro Militar das FAA (+100.000 Kz)');

    broadcastEmergencyAlert({
      service: 'policia',
      title: '🚨 CÓDIGO VERMELHO: ASSALTO AO TESOURO DAS FAA!',
      message: `${char.stats.name} ${char.stats.surname} (${faction?.name || 'Crime'}) invadiu o Cofre da Base Militar FAA! PNA e FAA autorizados a abater e prender!`,
      x: char.position.x,
      z: char.position.z,
    });
    broadcastSystemChat(
      `🚨 [ALERTA MÁXIMO FAA & PNA] O Tesouro da Base Militar FAA foi assaltado por ${char.stats.name} (${faction?.name})! Forças em fogo aberto!`,
      'geral'
    );

    await saveDb();
    res.json({
      character: char,
      reward: FAA_HEIST_REWARD_KZ,
      cooldownUntil: db.robberyCooldowns['faa_vault'],
    });
  });

  // 9. ATIVIDADES CRIMINAIS RP (com Cooldowns & Alertas Policiais)
  app.post('/api/crime/action', requireAuth, rateLimit(10, 20000), async (req: AuthedRequest, res) => {
    const { characterId, action, targetId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const now = Date.now();

    if (action === 'rob_store' || action === 'rob_bank') {
      const key = `${action}:${targetId || 'default'}`;
      const readyAt = db.robberyCooldowns[key] || 0;
      if (now < readyAt) {
        const secs = Math.ceil((readyAt - now) / 1000);
        return res.status(429).json({ error: `Local sob vigilância reforçada! Aguarda ${secs}s.` });
      }
      const lockpick = char.inventory.find((i) => i.catalogId === 'gazua_rp');
      if (!lockpick) {
        return res.status(400).json({ error: 'Precisas de um Kit de Arrombamento (Mercado Ilegal de Viana).' });
      }

      db.robberyCooldowns[key] = now + (action === 'rob_bank' ? 240000 : 120000);
      const reward = action === 'rob_bank' ? 24000 + Math.floor(Math.random() * 14000) : 7500 + Math.floor(Math.random() * 4500);
      char.stats.cashKz += reward;
      char.stats.wantedStars = Math.min(5, char.stats.wantedStars + (action === 'rob_bank' ? 3 : 2));
      char.counters.robberiesCount += 1;
      addTransaction(char.id, 'crime', reward, action === 'rob_bank' ? 'Assalto RP Banco BFA' : 'Assalto RP Estabelecimento');
      broadcastEmergencyAlert({
        service: 'policia',
        title: action === 'rob_bank' ? '🚨 ALERTA VERMELHO: ASSALTO AO BANCO BFA!' : '🚨 OCORRÊNCIA DE ASSALTO EM CURSO!',
        message: `Suspeito avistado perto de ${action === 'rob_bank' ? 'Centro BFA' : 'Loja / Mercado'}!`,
        x: char.position.x,
        z: char.position.z,
      });
      await saveDb();
      return res.json({ character: char, reward });
    } else if (action === 'smuggle') {
      const pkgIdx = char.inventory.findIndex((i) => i.catalogId === 'pacote_contrabando');
      if (pkgIdx < 0) return res.status(400).json({ error: 'Não tens Mercadoria Sem Fatura na mochila.' });
      const pkg = char.inventory[pkgIdx];
      pkg.quantity -= 1;
      if (pkg.quantity <= 0) char.inventory.splice(pkgIdx, 1);
      const profit = 13500;
      char.stats.cashKz += profit;
      char.stats.wantedStars = Math.min(5, char.stats.wantedStars + 1);
      addTransaction(char.id, 'crime', profit, 'Entrega de Contrabando (Beco Viana RP)');
      await saveDb();
      return res.json({ character: char, reward: profit });
    } else if (action === 'rob_npc') {
      const mode = String(req.body?.mode || 'rob');
      const npcLabel = String(req.body?.npcLabel || 'Cidadão de Luanda');
      const key = `rob_npc:${char.id}`;
      const readyAt = db.robberyCooldowns[key] || 0;
      const canGetCash = mode === 'rob' && now >= readyAt;
      let reward = 0;

      if (canGetCash) {
        db.robberyCooldowns[key] = now + 12000;
        reward = 1200 + Math.floor(Math.random() * 2800);
        char.stats.cashKz += reward;
        char.counters.robberiesCount += 1;
        addTransaction(char.id, 'crime', reward, `Assalto a Cidadão (${npcLabel})`);
      }

      const starBump = mode === 'rob' ? 2 : 1;
      char.stats.wantedStars = Math.min(5, Math.max(1, char.stats.wantedStars + starBump));

      broadcastEmergencyAlert({
        service: 'policia',
        title: mode === 'rob' ? '🚨 ASSALTO A CIDADÃO REPORTADO!' : '🚨 AMEAÇA ARMADA / AGRESSÃO NA VIA PÚBLICA!',
        message: `Polícia Nacional PNA a deslocar-se para deter suspeito perto de ${npcLabel}!`,
        x: char.position.x,
        z: char.position.z,
      });

      await saveDb();
      return res.json({ character: char, reward });
    } else if (action === 'police_capture') {
      const prevStars = Math.max(1, char.stats.wantedStars || 1);
      const jailSeconds = Math.min(180, Math.max(45, 35 + prevStars * 15));
      const reason = String(req.body?.reason || 'Assalto / Ameaça Armada — Detido pela Polícia Nacional');
      const fine = Math.min(char.stats.cashKz, prevStars * 1200);
      if (fine > 0) {
        char.stats.cashKz -= fine;
        addTransaction(char.id, 'fine', -fine, `Coima de Detenção PNA (${prevStars}★)`);
      }
      const cellNum = ((db.criminalRecords.length + Math.floor(Math.random() * 4)) % 4) + 1;
      const cell = getAssignedCellData(cellNum);
      char.stats.jailUntil = now + jailSeconds * 1000;
      char.stats.jailReason = reason;
      char.stats.assignedCell = cell.cellNumber;
      char.stats.wantedStars = 0;
      char.stats.isUnconscious = false;
      char.stats.bleeding = false;
      char.stats.health = Math.max(45, char.stats.health);
      char.position = { x: cell.spawn[0], y: cell.spawn[1], z: cell.spawn[2] };
      syncConnectedCharacterPosition(char.id, cell.spawn[0], cell.spawn[2], Math.PI);

      db.criminalRecords.unshift({
        id: 'cr-' + Date.now(),
        characterId: char.id,
        characterName: `${char.stats.name} ${char.stats.surname}`,
        type: 'arrest',
        reason,
        amountKz: fine,
        officerName: '[PNA] Patrulha Automática',
        timestamp: new Date().toISOString(),
      });

      await saveDb();
      return res.json({ character: char, jailSeconds, fine });
    } else if (action === 'launder') {
      const amt = Math.min(char.stats.cashKz, Math.max(1000, Number(req.body?.amountKz) || 5000));
      if (amt <= 0 || char.stats.cashKz < amt) return res.status(400).json({ error: 'Sem dinheiro em mão suficiente.' });
      const fee = Math.round(amt * 0.2);
      char.stats.cashKz -= amt;
      char.stats.bankKz += amt - fee;
      addTransaction(char.id, 'crime', amt - fee, `Branqueamento RP (-20% comissão)`);
      await saveDb();
      return res.json({ character: char, laundered: amt - fee });
    }

    res.status(400).json({ error: 'Ação inválida.' });
  });

  // 10. PROPRIEDADES & EMPRESAS
  app.get('/api/properties', (_req, res) => {
    res.json({ properties: getDb().properties });
  });

  app.post('/api/properties/:propId/action', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, action, amountKz, targetCharId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    return await withCharacterLock(char.id, async () => {
      const db = getDb();
      const prop = db.properties.find((p) => p.id === req.params.propId);
      if (!prop) return res.status(404).json({ error: 'Propriedade não encontrada.' });
      const fullName = `${char.stats.name} ${char.stats.surname}`;
      if (!prop.sharedKeys) prop.sharedKeys = [];
      const hasHouseKey =
        prop.ownerId === char.id ||
        prop.renterId === char.id ||
        prop.sharedKeys.includes(char.id);

    if (action === 'buy') {
      if (prop.ownerId) return res.status(400).json({ error: 'Este imóvel já tem proprietário.' });
      if (char.stats.bankKz < prop.priceKz) return res.status(400).json({ error: 'Saldo bancário insuficiente.' });
      char.stats.bankKz -= prop.priceKz;
      prop.ownerId = char.id;
      prop.ownerName = fullName;
      prop.sharedKeys = [];
      if (prop.type !== 'business' && !char.stats.homePropertyId) {
        char.stats.homePropertyId = prop.id;
      }
      addTransaction(char.id, 'property', -prop.priceKz, `Compra de Imóvel: ${prop.name}`);
    } else if (action === 'rent') {
      if (prop.renterId || prop.ownerId === char.id) return res.status(400).json({ error: 'Indisponível para arrendamento.' });
      if (char.stats.bankKz < prop.rentKz) return res.status(400).json({ error: 'Saldo bancário insuficiente para renda.' });
      char.stats.bankKz -= prop.rentKz;
      prop.renterId = char.id;
      prop.renterName = fullName;
      if (prop.type !== 'business' && !char.stats.homePropertyId) {
        char.stats.homePropertyId = prop.id;
      }
      addTransaction(char.id, 'property', -prop.rentKz, `Arrendamento: ${prop.name}`);
    } else if (action === 'sell') {
      if (prop.ownerId !== char.id) return res.status(403).json({ error: 'Não és o dono deste imóvel.' });
      const refund = Math.round(prop.priceKz * 0.75);
      char.stats.bankKz += refund;
      prop.ownerId = null;
      prop.ownerName = null;
      prop.sharedKeys = [];
      if (char.stats.homePropertyId === prop.id) char.stats.homePropertyId = null;
      addTransaction(char.id, 'property', refund, `Venda de Imóvel: ${prop.name}`);
    } else if (action === 'set_home') {
      if (!hasHouseKey || prop.type === 'business') {
        return res.status(403).json({ error: 'Precisas da chave de uma casa residencial para definir como residência.' });
      }
      char.stats.homePropertyId = prop.id;
    } else if (action === 'add_key' && targetCharId) {
      if (prop.ownerId !== char.id) return res.status(403).json({ error: 'Apenas o proprietário pode partilhar chaves.' });
      const target = db.characters[String(targetCharId)];
      if (!target) return res.status(404).json({ error: 'Cidadão não encontrado.' });
      if (!prop.sharedKeys.includes(target.id)) {
        prop.sharedKeys.push(target.id);
      }
    } else if (action === 'remove_key' && targetCharId) {
      if (prop.ownerId !== char.id) return res.status(403).json({ error: 'Apenas o proprietário pode revogar chaves.' });
      prop.sharedKeys = prop.sharedKeys.filter((id) => id !== String(targetCharId));
      const target = db.characters[String(targetCharId)];
      if (target && target.stats.homePropertyId === prop.id) {
        target.stats.homePropertyId = null;
      }
    } else if (action === 'safe_deposit' || action === 'safe_withdraw') {
      if (prop.ownerId !== char.id && prop.renterId !== char.id) return res.status(403).json({ error: 'Sem chave do cofre.' });
      const amt = Math.floor(Number(amountKz) || 0);
      if (amt <= 0) return res.status(400).json({ error: 'Valor inválido.' });
      if (action === 'safe_deposit') {
        if (char.stats.cashKz < amt) return res.status(400).json({ error: 'Dinheiro insuficiente em carteira.' });
        char.stats.cashKz -= amt;
        prop.safeKz += amt;
      } else {
        if (prop.safeKz < amt) return res.status(400).json({ error: 'Cofre sem saldo suficiente.' });
        prop.safeKz -= amt;
        char.stats.cashKz += amt;
      }
    } else if (action === 'collect_revenue') {
      if (prop.ownerId !== char.id || prop.type !== 'business') return res.status(403).json({ error: 'Apenas o dono da empresa.' });
      const bonus = prop.employees.length * 1200;
      const rev = (prop.revenueKz || 3500) + bonus;
      char.stats.bankKz += rev;
      if (!prop.bills) prop.bills = { endeKz: 0, epalKz: 0, sonagolKz: 0 };
      prop.bills.endeKz += 450;
      prop.unpaidBillsKz += 450;
      addTransaction(char.id, 'property', rev, `Lucro empresarial: ${prop.name}`);
    } else if (action === 'pay_bills' || action === 'pay_ende' || action === 'pay_epal' || action === 'pay_sonagol') {
      if (prop.ownerId !== char.id && prop.renterId !== char.id && !hasHouseKey) {
        return res.status(403).json({ error: 'Sem acesso às faturas deste imóvel.' });
      }
      if (!prop.bills && prop.type !== 'business') {
        prop.bills = { endeKz: 0, epalKz: 0, sonagolKz: 0 };
      }
      const bills = prop.bills || { endeKz: prop.unpaidBillsKz, epalKz: 0, sonagolKz: 0 };
      let cost = 0;
      let label = 'Faturas ENDE/EPAL/SONAGOL';
      if (action === 'pay_ende') {
        cost = bills.endeKz;
        label = 'ENDE (Energia Elétrica)';
      } else if (action === 'pay_epal') {
        cost = bills.epalKz;
        label = 'EPAL (Água Potável)';
      } else if (action === 'pay_sonagol') {
        cost = bills.sonagolKz;
        label = 'SONAGOL (Gás Doméstico)';
      } else {
        cost = bills.endeKz + bills.epalKz + bills.sonagolKz || prop.unpaidBillsKz;
      }
      if (cost <= 0) return res.status(400).json({ error: `Sem valores em dívida em ${label}.` });
      if (char.stats.bankKz >= cost) char.stats.bankKz -= cost;
      else if (char.stats.cashKz >= cost) char.stats.cashKz -= cost;
      else return res.status(400).json({ error: `Saldo insuficiente (${cost.toLocaleString('pt-PT')} Kz).` });

      if (action === 'pay_ende') bills.endeKz = 0;
      else if (action === 'pay_epal') bills.epalKz = 0;
      else if (action === 'pay_sonagol') bills.sonagolKz = 0;
      else {
        bills.endeKz = 0;
        bills.epalKz = 0;
        bills.sonagolKz = 0;
      }
      prop.bills = bills;
      prop.unpaidBillsKz = bills.endeKz + bills.epalKz + bills.sonagolKz;
      addTransaction(char.id, 'property', -cost, `Pagamento ${label}: ${prop.name}`);
    } else if (action === 'hire' && targetCharId) {
      if (prop.ownerId !== char.id) return res.status(403).json({ error: 'Apenas proprietário.' });
      const t = db.characters[String(targetCharId)];
      if (!t) return res.status(404).json({ error: 'Cidadão não encontrado.' });
      if (!prop.employees.some((e) => e.characterId === t.id)) {
        prop.employees.push({ characterId: t.id, name: `${t.stats.name} ${t.stats.surname}`, salaryKz: 2500 });
      }
    } else if (action === 'hire_self') {
      if (prop.type !== 'business') return res.status(400).json({ error: 'Disponível apenas para empresas.' });
      if (!prop.employees.some((e) => e.characterId === char.id)) {
        prop.employees.push({ characterId: char.id, name: fullName, salaryKz: 2500 });
      }
    } else if (action === 'fire' && targetCharId) {
      if (prop.ownerId !== char.id) return res.status(403).json({ error: 'Apenas o proprietário pode despedir funcionários.' });
      prop.employees = prop.employees.filter((e) => e.characterId !== String(targetCharId));
    } else if (action === 'start_business_job') {
      if (prop.type !== 'business') return res.status(400).json({ error: 'Apenas empresas.' });
      const isWorker = prop.ownerId === char.id || prop.employees.some((e) => e.characterId === char.id) || !prop.ownerId;
      if (!isWorker) return res.status(403).json({ error: 'Precisas ser contratado ou proprietário desta empresa.' });
      if (!prop.ownerId && !prop.employees.some((e) => e.characterId === char.id)) {
        prop.employees.push({ characterId: char.id, name: fullName, salaryKz: 2500 });
      }
      if (prop.businessCategory === 'restaurant') {
        char.customization.outfitStyle = 'restaurante_uniform';
        char.customization.shirtColor = '#f8fafc';
        char.customization.pantsColor = '#1e293b';
      } else {
        char.customization.outfitStyle = 'boutique_uniform';
        char.customization.shirtColor = '#db2777';
        char.customization.pantsColor = '#18181b';
      }
    } else if (action === 'rest_cook' || action === 'rest_collect_plate' || action === 'rest_wash_plate') {
      if (prop.type !== 'business' || prop.businessCategory !== 'restaurant') {
        return res.status(400).json({ error: 'Operação exclusiva do Restaurante Sabores da Ilha.' });
      }
      const isWorker = prop.ownerId === char.id || prop.employees.some((e) => e.characterId === char.id) || !prop.ownerId;
      if (!isWorker) return res.status(403).json({ error: 'Contrata-te primeiro no balcão do Restaurante.' });
      let workerPayKz = 0;
      let ownerProfitKz = 0;
      let message = '';
      if (action === 'rest_cook') {
        prop.cookedDishesReady = (prop.cookedDishesReady || 0) + 1;
        prop.dirtyPlates = (prop.dirtyPlates || 0) + 1;
        workerPayKz = 1400;
        ownerProfitKz = 2100;
        const dishName = ANGOLAN_DISHES[Math.floor(Math.random() * ANGOLAN_DISHES.length)];
        message = `Cozinhaste ${dishName}! +${workerPayKz} Kz para ti / +${ownerProfitKz} Kz para a empresa.`;
        char.stats.cashKz += workerPayKz;
        if (prop.ownerId && db.characters[prop.ownerId] && prop.ownerId !== char.id) {
          db.characters[prop.ownerId].stats.bankKz += ownerProfitKz;
          pushAdminEffectToCharacter(prop.ownerId, { action: 'refresh_character' });
        } else {
          prop.safeKz += ownerProfitKz;
        }
        await saveDb();
        return res.json({ character: char, properties: db.properties, dishName, workerPayKz, ownerProfitKz, message });
      } else if (action === 'rest_collect_plate') {
        prop.dirtyPlates = (prop.dirtyPlates || 0) + 1;
        workerPayKz = 650;
        char.stats.cashKz += workerPayKz;
        message = `Recolheste pratos sujos das mesas (+${workerPayKz} Kz)! Lava-os agora no lavatório.`;
      } else {
        if ((prop.dirtyPlates || 0) <= 0) {
          return res.status(400).json({ error: 'Todos os pratos já estão lavados! Cozinha ou recolhe pratos primeiro.' });
        }
        prop.dirtyPlates = Math.max(0, (prop.dirtyPlates || 1) - 1);
        workerPayKz = 1100;
        ownerProfitKz = 1400;
        char.stats.cashKz += workerPayKz;
        if (prop.ownerId && db.characters[prop.ownerId] && prop.ownerId !== char.id) {
          db.characters[prop.ownerId].stats.bankKz += ownerProfitKz;
          pushAdminEffectToCharacter(prop.ownerId, { action: 'refresh_character' });
        } else {
          prop.safeKz += ownerProfitKz;
        }
        message = `Pratos lavados na pia com sucesso! +${workerPayKz} Kz / +${ownerProfitKz} Kz empresa.`;
      }
      addTransaction(char.id, 'salary', workerPayKz, `Restaurante: ${message}`);
      await saveDb();
      return res.json({ character: char, properties: db.properties, workerPayKz, ownerProfitKz, message });
    } else if (action === 'boutique_craft' || action === 'boutique_sell') {
      if (prop.type !== 'business' || prop.businessCategory !== 'boutique') {
        return res.status(400).json({ error: 'Operação exclusiva da Boutique Moda Luanda.' });
      }
      const isWorker = prop.ownerId === char.id || prop.employees.some((e) => e.characterId === char.id) || !prop.ownerId;
      if (!isWorker) return res.status(403).json({ error: 'Contrata-te primeiro no balcão da Boutique.' });
      let workerPayKz = 0;
      let ownerProfitKz = 0;
      let message = '';
      if (action === 'boutique_craft') {
        prop.craftedClothesStock = (prop.craftedClothesStock || 0) + 1;
        workerPayKz = 1200;
        char.stats.cashKz += workerPayKz;
        message = `Peça exclusiva confeccionada! Stock da loja: ${prop.craftedClothesStock} (+${workerPayKz} Kz).`;
      } else {
        if ((prop.craftedClothesStock || 0) <= 0) {
          return res.status(400).json({ error: 'Stock vazio! Confecciona roupa na bancada antes de vender.' });
        }
        prop.craftedClothesStock = Math.max(0, (prop.craftedClothesStock || 1) - 1);
        const totalSale = 4800;
        workerPayKz = Math.round(totalSale * 0.4);
        ownerProfitKz = totalSale - workerPayKz;
        char.stats.cashKz += workerPayKz;
        if (prop.ownerId && db.characters[prop.ownerId] && prop.ownerId !== char.id) {
          db.characters[prop.ownerId].stats.bankKz += ownerProfitKz;
          pushAdminEffectToCharacter(prop.ownerId, { action: 'refresh_character' });
        } else {
          prop.safeKz += ownerProfitKz;
        }
        message = `Venda de coleção Moda Luanda! +${workerPayKz} Kz trabalhador / +${ownerProfitKz} Kz proprietário.`;
      }
      addTransaction(char.id, 'salary', workerPayKz, `Boutique Moda Luanda: ${message}`);
      await saveDb();
      return res.json({ character: char, properties: db.properties, workerPayKz, ownerProfitKz, message });
    } else if (action === 'rest') {
      if (!hasHouseKey) return res.status(403).json({ error: 'Sem chave desta casa.' });
      char.stats.energy = 100;
      char.stats.sleep = 100;
      char.stats.health = Math.min(100, char.stats.health + 35);
      char.stats.bleeding = false;
      char.stats.isUnconscious = false;
      markCharacterActive(char.id);
    } else if (action === 'cook_eat') {
      if (!hasHouseKey) return res.status(403).json({ error: 'Sem chave desta casa.' });
      char.stats.hunger = 100;
      char.stats.thirst = Math.min(100, char.stats.thirst + 35);
      char.stats.health = Math.min(100, char.stats.health + 10);
      markCharacterActive(char.id);
      const dishName = ANGOLAN_DISHES[Math.floor(Math.random() * ANGOLAN_DISHES.length)];
      await saveDb();
      return res.json({ character: char, properties: db.properties, dishName });
    } else if (action === 'hygiene') {
      if (!hasHouseKey) return res.status(403).json({ error: 'Sem chave desta casa.' });
      char.stats.energy = Math.min(100, char.stats.energy + 20);
      char.stats.sleep = Math.min(100, (char.stats.sleep ?? 100) + 10);
      char.stats.health = Math.min(100, char.stats.health + 10);
      markCharacterActive(char.id);
    } else if (action === 'stash_store') {
      if (!hasHouseKey) return res.status(403).json({ error: 'Sem chave do baú.' });
      const itemId = String(req.body?.itemId || '');
      const idx = char.inventory.findIndex((i) => i.id === itemId);
      if (idx < 0) return res.status(404).json({ error: 'Item não encontrado na mochila.' });
      const invItem = char.inventory[idx];
      if (invItem.category === 'document' || invItem.category === 'phone') {
        return res.status(400).json({ error: 'Documentos pessoais e telemóvel ficam sempre contigo.' });
      }
      if (!prop.stash) prop.stash = [];
      const existing = prop.stash.find((s) => s.catalogId === invItem.catalogId);
      if (existing) {
        existing.quantity += 1;
      } else {
        prop.stash.push({ ...invItem, id: 'stash-' + Date.now(), quantity: 1, equipped: false });
      }
      invItem.quantity -= 1;
      if (invItem.quantity <= 0) char.inventory.splice(idx, 1);
    } else if (action === 'stash_take') {
      if (!hasHouseKey) return res.status(403).json({ error: 'Sem chave do baú.' });
      const stashItemId = String(req.body?.itemId || '');
      if (!prop.stash) prop.stash = [];
      const idx = prop.stash.findIndex((s) => s.id === stashItemId);
      if (idx < 0) return res.status(404).json({ error: 'Item não encontrado no baú.' });
      const sItem = prop.stash[idx];
      addItemToInventory(char, { ...sItem, quantity: 1, equipped: false });
      sItem.quantity -= 1;
      if (sItem.quantity <= 0) prop.stash.splice(idx, 1);
    }

      await saveDb();
      res.json({ character: char, properties: db.properties });
    });
  });

  // 10.2 HOTÉIS ELIMINADOS (Substituídos pelo Condomínio Fechado Vila Atlântica)
  app.get('/api/hotel', (_req, res) => {
    res.status(410).json({ error: 'Hotéis eliminados em Luanda RP. Todas as residências ficam agora no Condomínio Vila Atlântica.' });
  });

  app.post('/api/hotel/action', requireAuth, (_req, res) => {
    res.status(410).json({ error: 'Hotéis eliminados em Luanda RP. Todas as residências ficam agora no Condomínio Vila Atlântica.' });
  });

  // 10.3 MÚSICA PAGA & PESQUISÁVEL + DJ GLOBAL (SEM LINKS YOUTUBE)
  app.get('/api/music/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const genre = String(req.query.genre || '').trim().toLowerCase();
    const tracks = DJ_TRACKS_CATALOG.filter((t) => {
      const matchGenre = !genre || genre === 'todos' || t.genre.toLowerCase() === genre;
      const matchQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q);
      return matchGenre && matchQuery;
    });
    res.json({
      tracks,
      personalCostKz: MUSIC_PERSONAL_COST_KZ,
      globalCostKz: DJ_GLOBAL_COST_KZ,
    });
  });

  app.post('/api/music/play', requireAuth, rateLimit(15, 30000), async (req: AuthedRequest, res) => {
    const { characterId, trackId, mode = 'personal', payWith = 'bank' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    const catalogTrack = trackId ? DJ_TRACKS_CATALOG.find((t) => t.id === String(trackId)) : undefined;
    if (!catalogTrack) {
      return res.status(404).json({ error: 'Música não encontrada no catálogo oficial de Luanda.' });
    }

    const isGlobal = mode === 'global';
    const costKz = isGlobal ? DJ_GLOBAL_COST_KZ : MUSIC_PERSONAL_COST_KZ;

    if (payWith === 'cash') {
      if (char.stats.cashKz < costKz) {
        return res.status(400).json({ error: `Dinheiro insuficiente em carteira (${costKz.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.cashKz -= costKz;
    } else if (payWith === 'bank') {
      if (char.stats.bankKz < costKz) {
        return res.status(400).json({ error: `Saldo bancário insuficiente (${costKz.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.bankKz -= costKz;
    } else {
      return res.status(400).json({ error: 'Método de pagamento inválido.' });
    }

    const db = getDb();
    const now = Date.now();
    const fullName = `${char.stats.name} ${char.stats.surname}`;

    if (isGlobal) {
      const endsAt = now + catalogTrack.durationSec * 1000;
      db.djState.currentTrack = {
        trackId: catalogTrack.id,
        title: catalogTrack.title,
        artist: catalogTrack.artist,
        genre: catalogTrack.genre,
        bpm: catalogTrack.bpm,
        durationSec: catalogTrack.durationSec,
        startedAt: now,
        endsAt,
        paidByCharId: char.id,
        paidByName: fullName,
        costKz: DJ_GLOBAL_COST_KZ,
      };
      db.djState.startedAt = now;
      db.djState.endsAt = endsAt;
      db.djState.paidByCharId = char.id;
      db.djState.paidByName = fullName;
      db.djState.costKz = DJ_GLOBAL_COST_KZ;
      db.djState.history.unshift({
        id: 'djh-' + now,
        trackId: catalogTrack.id,
        title: catalogTrack.title,
        artist: catalogTrack.artist,
        paidByName: fullName,
        costKz: DJ_GLOBAL_COST_KZ,
        playedAt: new Date(now).toISOString(),
      });
      if (db.djState.history.length > 25) db.djState.history = db.djState.history.slice(0, 25);

      addTransaction(char.id, 'dj', -DJ_GLOBAL_COST_KZ, `DJ Global: ${catalogTrack.title}`);
      await saveDb();
      broadcastDjSync();
      broadcastSystemChat(
        `🎧 [DJ GLOBAL — 200.000 Kz] ${fullName} colocou "${catalogTrack.title} — ${catalogTrack.artist}" em toda Luanda!`,
        'geral'
      );
      return res.json({
        character: char,
        track: catalogTrack,
        costKz,
        mode: 'global',
        djState: db.djState,
        serverNow: now,
      });
    }

    addTransaction(char.id, 'music', -MUSIC_PERSONAL_COST_KZ, `Música Pessoal: ${catalogTrack.title}`);
    await saveDb();
    return res.json({
      character: char,
      track: catalogTrack,
      costKz,
      mode: 'personal',
      serverNow: now,
    });
  });

  app.get('/api/dj', (_req, res) => {
    const db = getDb();
    const now = Date.now();
    if (db.djState.currentTrack && (db.djState.currentTrack.endsAt <= now || db.djState.endsAt <= now)) {
      db.djState.currentTrack = null;
      db.djState.startedAt = 0;
      db.djState.endsAt = 0;
    }
    res.json({
      djState: db.djState,
      catalog: DJ_TRACKS_CATALOG,
      personalCostKz: MUSIC_PERSONAL_COST_KZ,
      costKz: DJ_GLOBAL_COST_KZ,
      serverNow: now,
    });
  });

  app.post('/api/dj/play', requireAuth, rateLimit(8, 30000), async (req: AuthedRequest, res) => {
    const { characterId, trackId, youtubeUrl, payWith = 'bank' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    if (youtubeUrl) {
      return res.status(400).json({ error: 'Links do YouTube foram desativados. Pesquisa e escolhe uma música do catálogo pago!' });
    }

    const catalogTrack = trackId ? DJ_TRACKS_CATALOG.find((t) => t.id === String(trackId)) : undefined;
    if (!catalogTrack) {
      return res.status(400).json({ error: 'Seleciona uma faixa válida do catálogo musical.' });
    }

    if (payWith === 'cash') {
      if (char.stats.cashKz < DJ_GLOBAL_COST_KZ) {
        return res.status(400).json({ error: `Saldo em dinheiro insuficiente (${DJ_GLOBAL_COST_KZ.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.cashKz -= DJ_GLOBAL_COST_KZ;
    } else {
      if (char.stats.bankKz < DJ_GLOBAL_COST_KZ) {
        return res.status(400).json({ error: `Saldo bancário insuficiente (${DJ_GLOBAL_COST_KZ.toLocaleString('pt-PT')} Kz).` });
      }
      char.stats.bankKz -= DJ_GLOBAL_COST_KZ;
    }

    const db = getDb();
    const now = Date.now();
    const fullName = `${char.stats.name} ${char.stats.surname}`;
    const endsAt = now + catalogTrack.durationSec * 1000;

    db.djState.currentTrack = {
      trackId: catalogTrack.id,
      title: catalogTrack.title,
      artist: catalogTrack.artist,
      genre: catalogTrack.genre,
      bpm: catalogTrack.bpm,
      durationSec: catalogTrack.durationSec,
      startedAt: now,
      endsAt,
      paidByCharId: char.id,
      paidByName: fullName,
      costKz: DJ_GLOBAL_COST_KZ,
    };
    db.djState.startedAt = now;
    db.djState.endsAt = endsAt;
    db.djState.paidByCharId = char.id;
    db.djState.paidByName = fullName;
    db.djState.costKz = DJ_GLOBAL_COST_KZ;
    db.djState.history.unshift({
      id: 'djh-' + now,
      trackId: catalogTrack.id,
      title: catalogTrack.title,
      artist: catalogTrack.artist,
      paidByName: fullName,
      costKz: DJ_GLOBAL_COST_KZ,
      playedAt: new Date(now).toISOString(),
    });
    if (db.djState.history.length > 25) db.djState.history = db.djState.history.slice(0, 25);

    addTransaction(char.id, 'dj', -DJ_GLOBAL_COST_KZ, `DJ Global: ${catalogTrack.title}`);
    await saveDb();
    broadcastDjSync();
    broadcastSystemChat(
      `🎧 [DJ GLOBAL — 200.000 Kz] ${fullName} colocou "${catalogTrack.title} — ${catalogTrack.artist}" em toda Luanda!`,
      'geral'
    );
    res.json({ character: char, djState: db.djState, serverNow: now });
  });

  // 10.3B PREVISÃO METEOROLÓGICA DINÂMICA DE LUANDA (API + HORA DO DIA)
  app.get('/api/weather/forecast', async (req, res) => {
    const db = getDb();
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const queryHour = Number(req.query.timeOfDay);
    const effectiveHour = Number.isFinite(queryHour)
      ? ((queryHour % 24) + 24) % 24
      : db.worldConfig.timeOfDay;

    const telemetry = await fetchLuandaWeatherTelemetry(effectiveHour, forceRefresh);
    const mode: WeatherMode = db.worldConfig.weatherMode || 'auto';
    if (mode === 'auto') {
      db.worldConfig.weather = telemetry.current.mappedWeather;
    }
    const snapshot = buildWeatherForecastResponse(db.worldConfig.weather, mode, telemetry);
    setLatestForecastSnapshot(snapshot);
    res.json({ forecast: snapshot, worldConfig: db.worldConfig });
  });

  app.post('/api/weather/mode', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const { mode, weather, timeOfDay } = req.body || {};
    const nextMode: WeatherMode = mode === 'manual' ? 'manual' : 'auto';
    db.worldConfig.weatherMode = nextMode;

    if (typeof timeOfDay === 'number' && Number.isFinite(timeOfDay)) {
      db.worldConfig.timeOfDay = ((timeOfDay % 24) + 24) % 24;
    }

    const telemetry = await fetchLuandaWeatherTelemetry(db.worldConfig.timeOfDay, false);
    if (nextMode === 'auto') {
      db.worldConfig.weather = telemetry.current.mappedWeather;
    } else if (weather) {
      db.worldConfig.weather = normalizeWeatherType(String(weather)) as WeatherType;
    }

    const snapshot = buildWeatherForecastResponse(db.worldConfig.weather, nextMode, telemetry);
    await saveDb();
    broadcastWorldSync(snapshot);
    res.json({ ok: true, forecast: snapshot, worldConfig: db.worldConfig });
  });

  // 10.4 SISTEMA POLÍTICO — PARTIDOS, ELEIÇÕES & PRESIDENTE ÚNICO
  app.get('/api/politics', (_req, res) => {
    const db = getDb();
    res.json({ politics: db.politics, serverNow: Date.now() });
  });

  app.post('/api/politics/admin', requireAuth, requireRole('admin_god'), async (req: AuthedRequest, res) => {
    const actor = req.account!;
    const db = getDb();
    const pol = db.politics;
    const {
      action,
      partyId,
      name,
      acronym,
      color,
      ideology,
      manifesto,
      title,
      targetCharId,
      bio,
      slogan,
      proposals,
      electionId,
    } = req.body || {};

    if (action === 'create_party') {
      const cleanName = String(name || '').trim();
      const cleanAcronym = String(acronym || '').trim().toUpperCase().slice(0, 8);
      if (!cleanName || !cleanAcronym) return res.status(400).json({ error: 'Nome e sigla do partido são obrigatórios.' });
      if (pol.parties.some((p) => p.acronym.toUpperCase() === cleanAcronym)) {
        return res.status(400).json({ error: 'Já existe um partido com essa sigla.' });
      }
      const pId = 'party-' + Date.now();
      pol.parties.push({
        id: pId,
        name: cleanName.slice(0, 60),
        acronym: cleanAcronym,
        color: String(color || '#F97316'),
        ideology: String(ideology || manifesto || 'Programa para o desenvolvimento de Luanda.').slice(0, 220),
        approved: true,
        suspended: false,
        createdAt: new Date().toISOString(),
      });
      addAdminLog(actor.email, 'admin_god', 'politics_create_party', `Criou partido ${cleanAcronym} (${cleanName})`);
    } else if (action === 'toggle_party_status' && partyId) {
      const party = pol.parties.find((p) => p.id === String(partyId));
      if (!party) return res.status(404).json({ error: 'Partido não encontrado.' });
      party.suspended = !party.suspended;
      party.approved = !party.suspended;
      addAdminLog(actor.email, 'admin_god', 'politics_party_status', `Partido ${party.acronym} -> ${party.suspended ? 'suspenso' : 'aprovado'}`);
    } else if (action === 'open_election') {
      if (pol.activeElection && pol.activeElection.status === 'open') {
        return res.status(400).json({ error: 'Já existe uma eleição presidencial em curso.' });
      }
      pol.activeElection = {
        id: 'elec-' + Date.now(),
        title: String(title || `Eleições Presidenciais de Luanda #${pol.electionHistory.length + 1}`).slice(0, 90),
        status: 'open',
        openedAt: Date.now(),
        candidates: [],
        voters: {},
        winnerCharId: null,
        winnerName: null,
      };
      addAdminLog(actor.email, 'admin_god', 'politics_open_election', `Abriu eleição: ${pol.activeElection.title}`);
      broadcastSystemChat(`🗳️ [ELEIÇÕES PRESIDENCIAIS] O Admin God abriu "${pol.activeElection.title}"!`, 'geral');
    } else if (action === 'add_candidate') {
      if (!pol.activeElection || pol.activeElection.status !== 'open') {
        return res.status(400).json({ error: 'Abre primeiro uma eleição presidencial.' });
      }
      const target = db.characters[String(targetCharId || '')];
      const party = pol.parties.find((p) => p.id === String(partyId || '') && p.approved && !p.suspended);
      if (!target) return res.status(404).json({ error: 'Cidadão candidato não encontrado.' });
      if (!party) return res.status(400).json({ error: 'Partido inválido ou suspenso.' });
      if (pol.activeElection.candidates.some((c) => c.characterId === target.id)) {
        return res.status(400).json({ error: 'Este cidadão já é candidato nesta eleição.' });
      }
      const propList = Array.isArray(proposals)
        ? proposals.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
        : [String(slogan || bio || 'Segurança, emprego e habitação para Luanda.').slice(0, 140)];
      const cand: PoliticalCandidate = {
        id: 'cand-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        characterId: target.id,
        name: `${target.stats.name} ${target.stats.surname}`,
        partyId: party.id,
        partyAcronym: party.acronym,
        partyColor: party.color,
        bio: String(bio || slogan || 'Por uma Luanda mais forte e segura!').slice(0, 160),
        proposals: propList,
        votes: 0,
      };
      pol.activeElection.candidates.push(cand);
      addAdminLog(actor.email, 'admin_god', 'politics_add_candidate', `Candidato ${cand.name} (${party.acronym})`);
    } else if (action === 'close_election') {
      if (!pol.activeElection || pol.activeElection.status !== 'open') {
        return res.status(400).json({ error: 'Não há eleição aberta para encerrar.' });
      }
      if (pol.activeElection.candidates.length === 0) {
        return res.status(400).json({ error: 'Adiciona pelo menos 1 candidato antes de encerrar a eleição.' });
      }
      const sorted = [...pol.activeElection.candidates].sort((a, b) => b.votes - a.votes);
      const winner = sorted[0];
      const winnerParty = pol.parties.find((p) => p.id === winner.partyId);
      const nowMs = Date.now();
      pol.activeElection.status = 'closed';
      pol.activeElection.closedAt = nowMs;
      pol.activeElection.winnerCharId = winner.characterId;
      pol.activeElection.winnerName = winner.name;

      // REGRA ESTRITA: APENAS 1 PRESIDENTE ATIVO EM SIMULTÂNEO (substitui imediatamente o anterior)
      pol.president = {
        characterId: winner.characterId,
        name: winner.name,
        partyId: winner.partyId,
        partyName: winnerParty?.name || winner.partyAcronym,
        partyAcronym: winner.partyAcronym,
        electedAt: nowMs,
        electionId: pol.activeElection.id,
        votesReceived: winner.votes,
      };
      pol.electionHistory.unshift({ ...pol.activeElection });
      pol.activeElection = null;
      addAdminLog(actor.email, 'admin_god', 'politics_close_election', `Encerrou eleição. Presidente eleito: ${winner.name} (${winner.partyAcronym})`);
      broadcastSystemChat(`🏛️ [PRESIDÊNCIA DA REPÚBLICA] ${winner.name} (${winner.partyAcronym}) foi eleito(a) o único Presidente ativo de Luanda RP!`, 'geral');
    } else if (action === 'annul_election') {
      if (!pol.activeElection) return res.status(400).json({ error: 'Não existe eleição ativa para anular.' });
      pol.activeElection.status = 'annulled';
      pol.activeElection.closedAt = Date.now();
      pol.electionHistory.unshift({ ...pol.activeElection });
      const titleAnn = pol.activeElection.title;
      pol.activeElection = null;
      addAdminLog(actor.email, 'admin_god', 'politics_annul_election', `Anulou eleição: ${titleAnn}`);
      broadcastSystemChat(`⚠️ [ELEIÇÕES] O Admin God anulou a eleição "${titleAnn}".`, 'geral');
    } else if (action === 'remove_president') {
      if (!pol.president) return res.status(400).json({ error: 'Não existe Presidente em exercício neste momento.' });
      const prev = pol.president.name;
      pol.president = null;
      addAdminLog(actor.email, 'admin_god', 'politics_remove_president', `Destituiu o Presidente ${prev}`);
      broadcastSystemChat(`🏛️ [PRESIDÊNCIA] O Admin God destituiu ${prev}. Cargo presidencial vago.`, 'geral');
    } else if (action === 'reopen_history_view' && electionId) {
      return res.json({ politics: pol });
    } else {
      return res.status(400).json({ error: 'Ação política administrativa inválida.' });
    }

    await saveDb();
    broadcastPoliticsSync();
    res.json({ politics: pol });
  });

  app.post('/api/politics/vote', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, candidateId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const pol = getDb().politics;
    if (!pol.activeElection || pol.activeElection.status !== 'open') {
      return res.status(400).json({ error: 'Não existe nenhuma eleição aberta neste momento.' });
    }
    if (pol.activeElection.voters[char.id]) {
      return res.status(400).json({ error: 'Já votaste nesta eleição! Cada cidadão tem direito a apenas 1 voto imutável.' });
    }
    const candidate = pol.activeElection.candidates.find((c) => c.id === String(candidateId || ''));
    if (!candidate) return res.status(404).json({ error: 'Candidato não encontrado.' });

    candidate.votes += 1;
    pol.activeElection.voters[char.id] = candidate.id;
    await saveDb();
    broadcastPoliticsSync();
    res.json({ politics: pol, votedCandidateId: candidate.id });
  });

  app.post('/api/politics/decision', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, title, decree, summary } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const pol = getDb().politics;
    if (!pol.president || pol.president.characterId !== char.id) {
      return res.status(403).json({ error: 'Apenas o Presidente em exercício pode emitir decretos presidenciais.' });
    }
    const cleanTitle = String(title || '').trim().slice(0, 80);
    const cleanDecree = String(decree || summary || '').trim().slice(0, 260);
    if (!cleanTitle || !cleanDecree) return res.status(400).json({ error: 'Título e texto do decreto são obrigatórios.' });

    pol.decisions.unshift({
      id: 'dec-' + Date.now(),
      presidentCharId: char.id,
      presidentName: `${char.stats.name} ${char.stats.surname}`,
      title: cleanTitle,
      decree: cleanDecree,
      timestamp: new Date().toISOString(),
    });
    if (pol.decisions.length > 30) pol.decisions = pol.decisions.slice(0, 30);

    await saveDb();
    broadcastPoliticsSync();
    broadcastSystemChat(`📜 [DECRETO PRESIDENCIAL — ${char.stats.name} ${char.stats.surname}] ${cleanTitle}`, 'geral');
    res.json({ politics: pol });
  });

  // 10.5 COMBATE AUTORITATIVO PVP
  app.post('/api/combat/hit', requireAuth, rateLimit(40, 10000), async (req: AuthedRequest, res) => {
    const { characterId, targetCharId, damage, weaponId } = req.body || {};
    const attacker = assertOwnedChar(req, String(characterId || ''), res);
    if (!attacker) return;
    const db = getDb();
    const target = db.characters[String(targetCharId || '')];
    if (!target) return res.status(404).json({ error: 'Alvo não encontrado.' });

    const dmg = Math.max(5, Math.min(60, Math.round(Number(damage) || 15)));
    let remaining = dmg;
    if (target.stats.armor > 0) {
      const absorbed = Math.min(target.stats.armor, remaining);
      target.stats.armor -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      target.stats.health = Math.max(0, target.stats.health - remaining);
      if (target.stats.health <= 0) {
        target.stats.isUnconscious = true;
      } else if (dmg >= 22 && Math.random() < 0.35) {
        target.stats.bleeding = true;
      }
    }

    const isLawfulForce = attacker.stats.factionId === 'policia' || attacker.stats.factionId === 'faa';
    if (!isLawfulForce && weaponId !== 'none') {
      attacker.stats.wantedStars = Math.min(5, attacker.stats.wantedStars + 1);
    }

    pushAdminEffectToCharacter(target.id, { action: 'refresh_character' });
    await saveDb();
    res.json({ ok: true, attackerStats: attacker.stats, targetHealth: target.stats.health });
  });

  // 11. SMARTPHONE LUANDA 5G (SMS, Classificados, 112/113)
  app.get('/api/phone/:charId', requireAuth, (req: AuthedRequest, res) => {
    const char = assertOwnedChar(req, req.params.charId, res);
    if (!char) return;
    const db = getDb();
    const myPhone = char.stats.phone;
    const sms = db.smsMessages.filter((s) => s.fromPhone === myPhone || s.toPhone === myPhone).slice(0, 40);
    const contacts = Object.values(db.characters)
      .filter((c) => c.id !== char.id)
      .slice(0, 25)
      .map((c) => ({ name: `${c.stats.name} ${c.stats.surname}`, phone: c.stats.phone }));
    res.json({ sms, ads: db.classifiedAds.slice(0, 25), contacts });
  });

  app.post('/api/phone/sms', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, toPhone, text } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    const cleanText = String(text || '').trim().slice(0, 220);
    if (!cleanText) return res.status(400).json({ error: 'Escreve uma mensagem.' });
    db.smsMessages.unshift({
      id: 'sms-' + Date.now(),
      fromPhone: char.stats.phone,
      fromName: `${char.stats.name} ${char.stats.surname}`,
      toPhone: String(toPhone || ''),
      text: cleanText,
      timestamp: new Date().toISOString(),
    });
    await saveDb();
    res.json({ ok: true });
  });

  app.post('/api/phone/ads', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, title, description, priceKz } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    db.classifiedAds.unshift({
      id: 'ad-' + Date.now(),
      authorName: `${char.stats.name} ${char.stats.surname}`,
      authorPhone: char.stats.phone,
      title: String(title || 'Anúncio').slice(0, 60),
      description: String(description || '').slice(0, 160),
      priceKz: Math.max(0, Math.floor(Number(priceKz) || 0)),
      timestamp: new Date().toISOString(),
    });
    await saveDb();
    res.json({ ads: db.classifiedAds.slice(0, 25) });
  });

  app.post('/api/phone/emergency', requireAuth, (req: AuthedRequest, res) => {
    const { characterId, service, message, x, z } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const svc = service === 'medico' ? 'medico' : 'policia';
    broadcastEmergencyAlert({
      service: svc,
      title: svc === 'policia' ? `📞 CHAMADA 113 — ${char.stats.name}` : `🚑 CHAMADA 112 INEMA — ${char.stats.name}`,
      message: String(message || 'Pedido de socorro urgente!').slice(0, 120),
      x: Number(x) || char.position.x,
      z: Number(z) || char.position.z,
    });
    res.json({ ok: true });
  });

  // 12. MISSÕES, RANKING & REPORTES
  app.post('/api/missions/claim', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, missionId } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const m = char.missions.find((x) => x.id === missionId);
    if (!m || m.claimed || m.progress < m.target) {
      return res.status(400).json({ error: 'Missão ainda não concluída ou já resgatada.' });
    }
    m.claimed = true;
    char.stats.bankKz += m.rewardKz;
    addXpAndCheckLevel(char, m.rewardXp);
    addTransaction(char.id, 'salary', m.rewardKz, `Missão Concluída: ${m.title}`);
    await saveDb();
    res.json({ character: char });
  });

  app.get('/api/leaderboard', (_req, res) => {
    const db = getDb();
    const list = Object.values(db.characters)
      .map((c) => ({
        id: c.id,
        name: `${c.stats.name} ${c.stats.surname}`,
        level: c.stats.level,
        netWorthKz: c.stats.cashKz + c.stats.bankKz,
        jobsCompleted: c.completedJobsCount,
        factionId: c.stats.factionId,
      }))
      .sort((a, b) => b.netWorthKz - a.netWorthKz)
      .slice(0, 20);
    res.json({ leaderboard: list });
  });

  app.post('/api/reports', requireAuth, async (req: AuthedRequest, res) => {
    const { characterId, targetName, reason } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;
    const db = getDb();
    db.reports.unshift({
      id: 'rep-' + Date.now(),
      reporterCharId: char.id,
      reporterName: `${char.stats.name} ${char.stats.surname}`,
      targetName: String(targetName || 'Desconhecido').slice(0, 40),
      reason: String(reason || '').slice(0, 200),
      status: 'open',
      timestamp: new Date().toISOString(),
    });
    await saveDb();
    res.json({ ok: true });
  });

  // 13. ADMIN GOD PANEL (Validação estrita de cargo no servidor!)
  app.get('/api/admin/overview', requireAuth, requireRole('moderador'), (req: AuthedRequest, res) => {
    const db = getDb();
    const role = resolveAccountRole(req.account!);
    const accounts = Object.values(db.accounts).map((a) => ({
      id: a.id,
      email: a.email,
      role: resolveAccountRole(a),
      accountStatus: a.accountStatus || 'active',
      bannedUntil: a.bannedUntil,
      banReason: a.banReason,
      suspendedUntil: a.suspendedUntil,
    }));
    const characters = Object.values(db.characters).map((c) => ({
      id: c.id,
      accountId: c.accountId,
      name: `${c.stats.name} ${c.stats.surname}`,
      idNumber: c.stats.idNumber,
      phone: c.stats.phone,
      cashKz: c.stats.cashKz,
      bankKz: c.stats.bankKz,
      level: c.stats.level,
      health: c.stats.health,
      sleep: c.stats.sleep ?? 100,
      jailUntil: c.stats.jailUntil || 0,
      assignedCell: c.stats.assignedCell || 0,
      homePropertyId: c.stats.homePropertyId || null,
      isFrozen: !!c.stats.isFrozen,
      isUnconscious: c.stats.isUnconscious,
      factionId: c.stats.factionId,
      position: c.position,
    }));
    const vehicles = Object.values(db.vehicles).map((v) => {
      const owner = db.characters[v.ownerId];
      return {
        id: v.id,
        ownerId: v.ownerId,
        ownerName: owner ? `${owner.stats.name} ${owner.stats.surname}` : 'Desconhecido',
        modelId: v.modelId,
        name: v.name,
        type: v.type,
        plate: v.plate,
        color: v.color,
        isImpounded: v.isImpounded,
        isStoredInGarage: v.isStoredInGarage,
        finesKz: v.finesKz,
        fuel: v.fuel,
        health: v.health,
      };
    });
    const properties = db.properties.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      category: p.category || p.type,
      district: p.district,
      priceKz: p.priceKz,
      ownerId: p.ownerId,
      ownerName: p.ownerName,
      renterId: p.renterId,
      renterName: p.renterName,
      safeKz: p.safeKz,
      unpaidBillsKz: p.unpaidBillsKz,
    }));
    res.json({
      myRole: role,
      online: getConnectedPlayersSnapshot(),
      accounts,
      characters,
      vehicles,
      properties,
      worldConfig: db.worldConfig,
      worldState: db.worldState,
      factions: db.factions,
      transactions: db.transactions.slice(0, 60),
      serverTelemetry: getServerTelemetrySnapshot(),
      reports: db.reports.slice(0, 30),
      logs: db.adminLogs.slice(0, 50),
    });
  });

  app.post('/api/admin/action', requireAuth, requireRole('moderador'), async (req: AuthedRequest, res) => {
    const actor = req.account!;
    const actorRole = resolveAccountRole(actor);
    const { action, targetCharId, targetAccountId, amountKz, x, z, weather, timeSpeed, timeOfDay, taxRate, economyMultiplier, reason, hours, role, announcement, vehicleModelId } = req.body || {};
    const db = getDb();
    const targetChar = targetCharId ? db.characters[String(targetCharId)] : undefined;
    const targetAcc = targetAccountId ? db.accounts[String(targetAccountId)] : undefined;

    if (action === 'heal' && targetChar) {
      targetChar.stats.health = 100;
      targetChar.stats.armor = 100;
      targetChar.stats.hunger = 100;
      targetChar.stats.thirst = 100;
      targetChar.stats.energy = 100;
      targetChar.stats.bleeding = false;
      targetChar.stats.isUnconscious = false;
      pushAdminEffectToCharacter(targetChar.id, { action: 'heal' });
      addAdminLog(actor.email, actorRole, 'heal', `Curou ${targetChar.stats.name}`);
    } else if (action === 'freeze' && targetChar) {
      targetChar.stats.isFrozen = !targetChar.stats.isFrozen;
      pushAdminEffectToCharacter(targetChar.id, { action: 'freeze', frozen: targetChar.stats.isFrozen });
      addAdminLog(actor.email, actorRole, 'freeze', `${targetChar.stats.isFrozen ? 'Congelou' : 'Descongelou'} ${targetChar.stats.name}`);
    } else if (action === 'teleport' && targetChar) {
      const tx = Number(x) || 0;
      const tz = Number(z) || 0;
      targetChar.position = { x: tx, y: 0, z: tz };
      pushAdminEffectToCharacter(targetChar.id, { action: 'teleport', x: tx, z: tz });
      addAdminLog(actor.email, actorRole, 'teleport', `Teleportou ${targetChar.stats.name} para (${tx}, ${tz})`);
    } else if (action === 'kick' && targetChar) {
      pushAdminEffectToCharacter(targetChar.id, { action: 'kick', reason: String(reason || 'Expulso pela moderação') });
      addAdminLog(actor.email, actorRole, 'kick', `Expulsou ${targetChar.stats.name}: ${reason}`);
    } else if (action === 'give_money' || action === 'set_money') {
      if (actorRole !== 'administrador' && actorRole !== 'gestor' && actorRole !== 'admin_god') {
        return res.status(403).json({ error: 'Apenas Administrador+ pode gerir dinheiro.' });
      }
      if (!targetChar) return res.status(404).json({ error: 'Personagem alvo não encontrado.' });
      const amt = Math.round(Number(amountKz) || 0);
      if (action === 'give_money') targetChar.stats.bankKz += amt;
      else targetChar.stats.bankKz = Math.max(0, amt);
      addTransaction(targetChar.id, 'deposit', amt, `Ajuste Administrativo (${actorRole})`);
      pushAdminEffectToCharacter(targetChar.id, { action: 'refresh_character' });
      addAdminLog(actor.email, actorRole, action, `${action} ${amt} Kz em ${targetChar.stats.name}`);
    } else if (action === 'ban' && targetAcc) {
      if (actorRole !== 'administrador' && actorRole !== 'gestor' && actorRole !== 'admin_god') {
        return res.status(403).json({ error: 'Apenas Administrador+ pode banir contas.' });
      }
      if (targetAcc.email.toLowerCase() === getAdminEmail()) {
        return res.status(403).json({ error: 'A conta Admin God principal é imune a banimento.' });
      }
      const hrs = Math.max(1, Number(hours) || 24);
      targetAcc.accountStatus = 'banned';
      targetAcc.bannedUntil = Date.now() + hrs * 3600000;
      targetAcc.banReason = String(reason || 'Violação das regras Luanda RP');
      Object.values(db.characters)
        .filter((c) => c.accountId === targetAcc.id)
        .forEach((c) => pushAdminEffectToCharacter(c.id, { action: 'ban', reason: targetAcc.banReason }));
      addAdminLog(actor.email, actorRole, 'ban', `Baniu ${targetAcc.email} por ${hrs}h`);
    } else if (action === 'unban' && targetAcc) {
      targetAcc.accountStatus = 'active';
      targetAcc.bannedUntil = 0;
      targetAcc.suspendedUntil = 0;
      targetAcc.banReason = '';
      addAdminLog(actor.email, actorRole, 'unban', `Desbaniu ${targetAcc.email}`);
    } else if (action === 'approve_account' && targetAcc) {
      if (actorRole !== 'administrador' && actorRole !== 'gestor' && actorRole !== 'admin_god') {
        return res.status(403).json({ error: 'Apenas Administrador+ pode aprovar contas.' });
      }
      targetAcc.accountStatus = 'active';
      targetAcc.bannedUntil = 0;
      targetAcc.suspendedUntil = 0;
      targetAcc.banReason = '';
      addAdminLog(actor.email, actorRole, 'approve_account', `Aprovou/Reativou conta ${targetAcc.email}`);
    } else if (action === 'suspend_account' && targetAcc) {
      if (actorRole !== 'administrador' && actorRole !== 'gestor' && actorRole !== 'admin_god') {
        return res.status(403).json({ error: 'Apenas Administrador+ pode suspender contas.' });
      }
      if (targetAcc.email.toLowerCase() === getAdminEmail()) {
        return res.status(403).json({ error: 'A conta Admin God principal é imune a suspensão.' });
      }
      const hrs = Math.max(1, Number(hours) || 24);
      targetAcc.accountStatus = 'suspended';
      targetAcc.suspendedUntil = Date.now() + hrs * 3600000;
      const suspReason = String(reason || `Conta suspensa por ${hrs}h pela Administração`);
      Object.values(db.characters)
        .filter((c) => c.accountId === targetAcc.id)
        .forEach((c) => pushAdminEffectToCharacter(c.id, { action: 'kick', reason: suspReason }));
      addAdminLog(actor.email, actorRole, 'suspend_account', `Suspendeu ${targetAcc.email} por ${hrs}h`);
    } else if (action === 'world') {
      const requestedMode = (req.body?.weatherMode as WeatherMode | undefined);
      if (typeof timeSpeed === 'number') db.worldConfig.timeSpeed = Math.max(0, Math.min(20, timeSpeed));
      if (typeof timeOfDay === 'number') db.worldConfig.timeOfDay = ((timeOfDay % 24) + 24) % 24;
      if (typeof taxRate === 'number' && actorRole === 'admin_god') db.worldConfig.taxRate = Math.max(0, Math.min(0.4, taxRate));
      if (typeof economyMultiplier === 'number' && actorRole === 'admin_god') db.worldConfig.economyMultiplier = Math.max(0.2, Math.min(5, economyMultiplier));

      if (requestedMode === 'auto') {
        db.worldConfig.weatherMode = 'auto';
        const telemetry = await fetchLuandaWeatherTelemetry(db.worldConfig.timeOfDay, true);
        db.worldConfig.weather = telemetry.current.mappedWeather;
        const snapshot = buildWeatherForecastResponse(db.worldConfig.weather, 'auto', telemetry);
        broadcastWorldSync(snapshot);
      } else {
        if (weather) {
          db.worldConfig.weather = weather;
          db.worldConfig.weatherMode = 'manual';
        }
        broadcastWorldSync();
      }
      addAdminLog(actor.email, actorRole, 'world', `Clima=${db.worldConfig.weather} (${db.worldConfig.weatherMode}), Hora=${db.worldConfig.timeOfDay}`);
    } else if (action === 'announce') {
      broadcastSystemChat(`📢 [COMUNICADO OFICIAL] ${String(announcement || '')}`, 'geral');
      addAdminLog(actor.email, actorRole, 'announce', String(announcement || ''));
    } else if (action === 'spawn_vehicle' && targetChar && vehicleModelId) {
      const cat = VEHICLE_CATALOG.find((v) => v.modelId === vehicleModelId);
      if (cat) {
        const vehId = 'veh-adm-' + Date.now();
        db.vehicles[vehId] = {
          id: vehId,
          ownerId: targetChar.id,
          modelId: cat.modelId,
          name: cat.name,
          type: cat.type,
          plate: generatePlate(db),
          color: cat.defaultColor,
          engineLevel: 2,
          suspensionLevel: 2,
          wheelStyle: 'desportiva',
          fuel: 100,
          health: 100,
          isLocked: false,
          isStoredInGarage: false,
          isImpounded: false,
          finesKz: 0,
          position: { ...targetChar.position },
          rotationY: 0,
        };
        pushAdminEffectToCharacter(targetChar.id, { action: 'refresh_character' });
        addAdminLog(actor.email, actorRole, 'spawn_vehicle', `Spawn ${cat.name} para ${targetChar.stats.name}`);
      }
    } else if (action === 'set_role' && targetAcc) {
      if (actorRole !== 'admin_god') {
        return res.status(403).json({ error: 'Apenas Admin God pode alterar cargos de staff.' });
      }
      const allowedRoles = ['player', 'moderador', 'administrador', 'gestor', 'admin_god'];
      const nextRole = String(role || '');
      if (!allowedRoles.includes(nextRole)) {
        return res.status(400).json({ error: 'Cargo de staff inválido.' });
      }
      if (targetAcc.email.toLowerCase() === getAdminEmail() && nextRole !== 'admin_god') {
        return res.status(403).json({ error: 'A conta Admin God principal não pode ser rebaixada.' });
      }
      targetAcc.role = nextRole as AdminRole;
      Object.values(db.characters)
        .filter((c) => c.accountId === targetAcc.id)
        .forEach((c) => syncConnectedPlayerProfile(c.id));
      addAdminLog(actor.email, actorRole, 'set_role', `Cargo de ${targetAcc.email} ➔ ${nextRole}`);
    } else if (action === 'resolve_report') {
      const rep = db.reports.find((r) => r.id === req.body?.reportId);
      if (rep) rep.status = 'resolved';
    } else if (action === 'trigger_blackout' || action === 'clear_blackout') {
      const dist = String(req.body?.district || 'centro');
      if (action === 'trigger_blackout') {
        db.worldState.blackoutDistricts[dist] = {
          faultId: 'adm-blk-' + Date.now(),
          title: `Apagão Administrativo (${dist.toUpperCase()})`,
          since: Date.now(),
        };
        addAdminLog(actor.email, actorRole, 'trigger_blackout', `Ativou apagão em ${dist}`);
      } else {
        delete db.worldState.blackoutDistricts[dist];
        addAdminLog(actor.email, actorRole, 'clear_blackout', `Restabeleceu energia em ${dist}`);
      }
      broadcastDynamicWorldSync();
    } else if (action === 'set_cleanliness') {
      const dist = String(req.body?.district || 'centro');
      const val = Math.max(0, Math.min(100, Math.round(Number(req.body?.value) || 100)));
      db.worldState.cleanlinessByDistrict[dist] = val;
      addAdminLog(actor.email, actorRole, 'set_cleanliness', `Limpeza de ${dist} ➔ ${val}%`);
      broadcastDynamicWorldSync();
    }

    await saveDb();
    res.json({
      ok: true,
      worldConfig: db.worldConfig,
      worldState: db.worldState,
      serverTelemetry: getServerTelemetrySnapshot(),
      logs: db.adminLogs.slice(0, 50),
      targetCharacter: targetChar,
      targetVehicles: targetChar
        ? Object.values(db.vehicles).filter((v) => v.ownerId === targetChar.id)
        : undefined,
    });
  });

  // 14. PREFEITURA DE LUANDA — ANÚNCIOS, EDITAIS & AVISOS MUNICIPAIS
  app.get('/api/prefeitura/announcements', (_req, res) => {
    const db = getDb();
    res.json({ announcements: db.prefeituraAnnouncements.slice(0, 40) });
  });

  app.post('/api/prefeitura/announcements', requireAuth, rateLimit(12, 30000), async (req: AuthedRequest, res) => {
    const { characterId, title, content, category = 'aviso' } = req.body || {};
    const char = assertOwnedChar(req, String(characterId || ''), res);
    if (!char) return;

    const cleanTitle = String(title || '').trim().slice(0, 80);
    const cleanContent = String(content || '').trim().slice(0, 320);
    if (!cleanTitle || !cleanContent) {
      return res.status(400).json({ error: 'Título e conteúdo do anúncio são obrigatórios.' });
    }

    const db = getDb();
    const actorRole = resolveAccountRole(req.account!);
    const isPresident = db.politics.president?.characterId === char.id;
    const isOfficial = actorRole !== 'player' || isPresident;

    const validCategory =
      category === 'edital' || category === 'emprego' || category === 'evento' ? category : 'aviso';

    db.prefeituraAnnouncements.unshift({
      id: 'pref-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      title: cleanTitle,
      content: cleanContent,
      category: validCategory,
      authorName: `${char.stats.name} ${char.stats.surname}`,
      authorRole: isPresident ? 'Presidente de Luanda' : actorRole !== 'player' ? actorRole : 'Cidadão',
      isOfficial,
      createdAt: new Date().toISOString(),
    });
    if (db.prefeituraAnnouncements.length > 40) {
      db.prefeituraAnnouncements = db.prefeituraAnnouncements.slice(0, 40);
    }

    await saveDb();
    if (isOfficial) {
      broadcastSystemChat(`🏛️ [PREFEITURA DE LUANDA] ${cleanTitle}: ${cleanContent}`, 'geral');
    }
    res.json({ announcements: db.prefeituraAnnouncements.slice(0, 40) });
  });
}
