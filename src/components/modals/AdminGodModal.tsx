/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  AccountInfo,
  AdminRole,
  FactionData,
  OwnedVehicleRecord,
  PoliticsState,
  ServerTelemetrySnapshot,
  TransactionRecord,
  WeatherType,
  WorldDynamicState,
} from '../../game/types';
import { LUANDA_DISTRICTS, VEHICLE_CATALOG } from '../../game/data/catalog';
import {
  AdminLogRecord,
  api,
  CharacterRecord,
  ReportRecord,
  WorldConfigState,
} from '../../services/api';
import {
  ShieldAlert,
  DollarSign,
  Heart,
  Snowflake,
  Globe,
  Ban,
  Car,
  CheckCircle2,
  AlertCircle,
  X,
  Crown,
  Landmark,
  Users,
  Vote,
  PauseCircle,
  PlayCircle,
  UserMinus,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  account: AccountInfo;
  currentCharacterId?: string;
  onCharacterUpdated?: (char: CharacterRecord, vehicles?: OwnedVehicleRecord[], action?: string) => void;
  onWorldUpdated?: (cfg: WorldConfigState) => void;
  onClose: () => void;
}

interface EligibleCitizen {
  id: string;
  name: string;
  bi: string;
  phone: string;
  level: number;
  factionId: string | null;
  factionRank: string;
  online: boolean;
}

export const AdminGodModal: React.FC<Props> = ({
  account,
  currentCharacterId,
  onCharacterUpdated,
  onWorldUpdated,
  onClose,
}) => {
  const [tab, setTab] = useState<'players' | 'orgs' | 'politics' | 'world' | 'accounts' | 'logs'>('players');
  const [myRole, setMyRole] = useState<AdminRole>(account.role);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<{
    id: string;
    accountId: string;
    name: string;
    idNumber: string;
    phone: string;
    cashKz: number;
    bankKz: number;
    level: number;
    health: number;
    sleep?: number;
    jailUntil?: number;
    assignedCell?: number;
    isFrozen: boolean;
    position: { x: number; y: number; z: number };
  }[]>([]);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [logs, setLogs] = useState<AdminLogRecord[]>([]);
  const [serverTelemetry, setServerTelemetry] = useState<ServerTelemetrySnapshot | null>(null);
  const [worldState, setWorldState] = useState<WorldDynamicState | null>(null);
  const [serverTransactions, setServerTransactions] = useState<TransactionRecord[]>([]);
  const [ctrlDistrict, setCtrlDistrict] = useState<string>(LUANDA_DISTRICTS[0].id);
  const [ctrlCleanliness, setCtrlCleanliness] = useState(85);
  const [worldConfig, setWorldConfig] = useState<WorldConfigState>({
    weather: 'ensolarado',
    timeSpeed: 1,
    timeOfDay: 15.5,
    taxRate: 0.05,
    economyMultiplier: 1.0,
  });

  // Gestão de Organizações (exclusivo Admin God)
  const [orgs, setOrgs] = useState<FactionData[]>([]);
  const [eligibleCitizens, setEligibleCitizens] = useState<EligibleCitizen[]>([]);
  const [selectedLeaderByOrg, setSelectedLeaderByOrg] = useState<Record<string, string>>({});
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // Política (Admin God)
  const [politics, setPolitics] = useState<PoliticsState | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partyAcronym, setPartyAcronym] = useState('');
  const [partyColor, setPartyColor] = useState('#F97316');
  const [partyIdeology, setPartyIdeology] = useState('');
  const [electionTitle, setElectionTitle] = useState('Eleições Presidenciais de Luanda RP');
  const [candCharId, setCandCharId] = useState('');
  const [candPartyId, setCandPartyId] = useState('');
  const [candBio, setCandBio] = useState('');

  const [moneyAmt, setMoneyAmt] = useState(50000);
  const [tpX, setTpX] = useState(0);
  const [tpZ, setTpZ] = useState(10);
  const [announcement, setAnnouncement] = useState('');
  const [spawnModelId, setSpawnModelId] = useState(VEHICLE_CATALOG[0].modelId);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getAdminOverview();
      const safeChars = Array.isArray(res?.characters) ? res.characters : [];
      const safeAccounts = Array.isArray(res?.accounts) ? res.accounts : [];
      const safeReports = Array.isArray(res?.reports) ? res.reports : [];
      const safeLogs = Array.isArray(res?.logs) ? res.logs : [];
      setMyRole(res?.myRole || account.role);
      setCharacters(safeChars);
      setAccounts(safeAccounts);
      if (res?.worldConfig) setWorldConfig(res.worldConfig);
      if (res?.worldState) setWorldState(res.worldState);
      if (res?.serverTelemetry) setServerTelemetry(res.serverTelemetry);
      if (Array.isArray(res?.transactions)) setServerTransactions(res.transactions);
      setReports(safeReports);
      setLogs(safeLogs);
      if (safeChars.length > 0 && !candCharId) {
        setCandCharId(safeChars[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sem acesso administrativo.';
      setLoadError(msg);
      setFeedback({ type: 'err', msg });
    } finally {
      setLoading(false);
    }
  }, [account.role, candCharId]);

  const loadOrganizations = useCallback(async () => {
    if (account.role !== 'admin_god' && myRole !== 'admin_god') return;
    try {
      const res = await api.adminOrganizationsGet();
      const safeFactions = Array.isArray(res?.factions) ? res.factions : [];
      const safeCitizens = Array.isArray(res?.eligibleCharacters) ? res.eligibleCharacters : [];
      setOrgs(safeFactions);
      setEligibleCitizens(safeCitizens);
      if (safeCitizens.length > 0) {
        setSelectedLeaderByOrg((prev) => {
          const next = { ...prev };
          safeFactions.forEach((f) => {
            if (!next[f.id]) next[f.id] = safeCitizens[0].id;
          });
          return next;
        });
      }
    } catch {}
  }, [account.role, myRole]);

  const loadPolitics = useCallback(async () => {
    try {
      const res = await api.politicsGet();
      if (res?.politics) {
        setPolitics(res.politics);
        const partiesList = Array.isArray(res.politics.parties) ? res.politics.parties : [];
        const validParties = partiesList.filter((p) => p.approved && !p.suspended);
        if (validParties.length > 0 && !candPartyId) {
          setCandPartyId(validParties[0].id);
        }
      }
    } catch {}
  }, [candPartyId]);

  useEffect(() => {
    loadOverview();
    loadPolitics();
  }, [loadOverview, loadPolitics]);

  useEffect(() => {
    if (myRole === 'admin_god' || account.role === 'admin_god') {
      loadOrganizations();
    }
  }, [account.role, myRole, loadOrganizations]);

  const execAdmin = async (payload: Parameters<typeof api.adminAction>[0]) => {
    setFeedback(null);
    try {
      const res = await api.adminAction(payload);
      soundFx.playInteract();
      if (res.worldConfig) {
        setWorldConfig(res.worldConfig);
        onWorldUpdated?.(res.worldConfig);
      }
      if (Array.isArray(res.logs)) setLogs(res.logs);
      if (res.targetCharacter) {
        onCharacterUpdated?.(res.targetCharacter, res.targetVehicles, payload.action);
      } else if (
        payload.action === 'spawn_vehicle' &&
        payload.targetCharId === currentCharacterId &&
        currentCharacterId
      ) {
        try {
          const refreshed = await api.getCharacter(currentCharacterId);
          onCharacterUpdated?.(refreshed.character, refreshed.vehicles, payload.action);
        } catch {}
      }
      await loadOverview();
      setFeedback({ type: 'ok', msg: `Comando Admin '${payload.action}' aplicado em tempo real!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Ação admin rejeitada.' });
    }
  };

  const execOrgAdmin = async (payload: Parameters<typeof api.adminOrganizationAction>[0]) => {
    setFeedback(null);
    try {
      const res = await api.adminOrganizationAction(payload);
      soundFx.playInteract();
      setOrgs(res.factions);
      await loadOrganizations();
      await loadOverview();
      setFeedback({ type: 'ok', msg: `Organização "${res.faction.name}" atualizada pelo Admin God!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao gerir organização.' });
    }
  };

  const execPoliticsAdmin = async (payload: Parameters<typeof api.politicsAdmin>[0]) => {
    setFeedback(null);
    try {
      const res = await api.politicsAdmin(payload);
      soundFx.playInteract();
      setPolitics(res.politics);
      await loadOverview();
      setFeedback({ type: 'ok', msg: `Operação política '${payload.action}' executada!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na gestão política.' });
    }
  };

  const isGod = myRole === 'admin_god';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-black/85"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-5xl bg-zinc-900 border-2 border-red-500/80 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-600/20 text-red-400 rounded-xl border border-red-500/40">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-red-400 uppercase tracking-wide">
                Painel Supremo Staff • Cargo: {myRole}
              </h2>
              <p className="text-xs text-zinc-400">
                Autoridade total validada no servidor • {account.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {serverTelemetry && (
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px] tabular-nums">
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400">Online</div>
              <div className="font-mono font-black text-emerald-400">
                {serverTelemetry.connectedPlayers}/{serverTelemetry.maxPlayers}
              </div>
            </div>
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400">Viaturas</div>
              <div className="font-mono font-black text-sky-400">{serverTelemetry.activeVehicles}</div>
            </div>
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400">Memória RSS</div>
              <div className="font-mono font-black text-amber-300">{serverTelemetry.memoryRssMb} MB</div>
            </div>
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400">Tick</div>
              <div className="font-mono font-black text-white">{serverTelemetry.tickMs} ms</div>
            </div>
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400">Apagões</div>
              <div className="font-mono font-black text-yellow-400">{serverTelemetry.activeBlackouts}</div>
            </div>
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400">Uptime</div>
              <div className="font-mono font-black text-zinc-200">{serverTelemetry.uptimeSec}s</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] sm:text-xs font-bold my-4">
          {[
            { id: 'players', label: `Cidadãos (${characters.length})`, godOnly: false },
            { id: 'orgs', label: `Organizações (${orgs.length})`, godOnly: true },
            { id: 'politics', label: 'Política', godOnly: true },
            { id: 'world', label: 'Mundo & Economia', godOnly: false },
            { id: 'accounts', label: `Contas (${accounts.length})`, godOnly: false },
            { id: 'logs', label: `Logs (${reports.filter((r) => r.status === 'open').length})`, godOnly: false },
          ]
            .filter((t) => !t.godOnly || isGod)
            .map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`py-2 px-2 rounded-lg cursor-pointer truncate ${
                  tab === t.id ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>

        {loading && characters.length === 0 && (
          <div className="mb-4 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-between">
            <span>A carregar dados do Painel Admin God...</span>
          </div>
        )}

        {loadError && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/60 text-xs text-red-200 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <AlertCircle size={15} /> {loadError}
            </span>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {feedback && !loadError && (
          <div
            className={`mb-4 p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedback.type === 'err' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {tab === 'players' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-800/70 rounded-xl border border-zinc-700 text-xs">
              <span>Valor Kz:</span>
              <input
                type="number"
                value={moneyAmt}
                onChange={(e) => setMoneyAmt(Number(e.target.value))}
                className="w-28 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
              />
              <span>Teleport X/Z:</span>
              <input
                type="number"
                value={tpX}
                onChange={(e) => setTpX(Number(e.target.value))}
                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
              />
              <input
                type="number"
                value={tpZ}
                onChange={(e) => setTpZ(Number(e.target.value))}
                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
              />
              <span>Spawn Viatura:</span>
              <select
                value={spawnModelId}
                onChange={(e) => setSpawnModelId(e.target.value)}
                className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg"
              >
                {VEHICLE_CATALOG.map((v) => (
                  <option key={v.modelId} value={v.modelId}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {characters.map((c) => {
                const jailed = (c.jailUntil || 0) > Date.now();
                return (
                  <div
                    key={c.id}
                    className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white text-sm">
                        {c.name}{' '}
                        {c.isFrozen && <span className="text-cyan-400">[CONGELADO]</span>}{' '}
                        {jailed && <span className="text-amber-400">[PRESO CELA {c.assignedCell || 1}]</span>}
                      </div>
                      <div className="font-mono text-[11px] text-zinc-400 tabular-nums">
                        BI: {c.idNumber} · Banco: {c.bankKz.toLocaleString('pt-AO')} Kz · Vida: {Math.round(c.health)}% · Sono: {Math.round(c.sleep ?? 100)}%
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'give_money', targetCharId: c.id, amountKz: moneyAmt })}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <DollarSign size={12} /> +Kz
                      </button>
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'heal', targetCharId: c.id })}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 rounded font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Heart size={12} /> Curar
                      </button>
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'freeze', targetCharId: c.id })}
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 rounded font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Snowflake size={12} /> {c.isFrozen ? 'Descongelar' : 'Congelar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'teleport', targetCharId: c.id, x: tpX, z: tpZ })}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded font-bold cursor-pointer"
                      >
                        TP ({tpX},{tpZ})
                      </button>
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'spawn_vehicle', targetCharId: c.id, vehicleModelId: spawnModelId })}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 rounded font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Car size={12} /> Dar Viatura
                      </button>
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'kick', targetCharId: c.id, reason: 'Expulso pelo Admin' })}
                        className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded font-bold cursor-pointer"
                      >
                        Kick
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'orgs' && isGod && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-950/35 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-center gap-2">
              <Crown size={16} className="text-amber-400 shrink-0" />
              <span>
                Regra Exclusiva Admin God: Apenas o Admin God pode nomear, substituir ou retirar o Líder Principal de cada organização e suspender/reativar instituições.
              </span>
            </div>

            <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
              {orgs.map((org) => {
                const chosenCharId = selectedLeaderByOrg[org.id] || eligibleCitizens[0]?.id || '';
                const isExpanded = expandedOrgId === org.id;
                return (
                  <div
                    key={org.id}
                    className={`p-3.5 rounded-xl border space-y-2.5 ${
                      org.suspended
                        ? 'bg-red-950/25 border-red-500/60'
                        : 'bg-zinc-800/60 border-zinc-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-white flex flex-wrap items-center gap-2">
                          <span>{org.name}</span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-300">
                            {org.type}
                          </span>
                          {org.suspended && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-red-600/30 border border-red-500/50 rounded text-red-300">
                              SUSPENSA
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 tabular-nums">
                          Líder Atual:{' '}
                          <strong className={org.leaderId ? 'text-amber-400' : 'text-zinc-300'}>
                            {org.leaderName}
                          </strong>{' '}
                          · {org.members.length} membros · Cofre: {org.treasuryKz.toLocaleString('pt-AO')} Kz
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setExpandedOrgId(isExpanded ? null : org.id)}
                          className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Users size={12} /> {isExpanded ? 'Ocultar Dados' : 'Membros & Logs'}
                        </button>
                        {org.suspended ? (
                          <button
                            type="button"
                            onClick={() => execOrgAdmin({ action: 'reactivate_org', factionId: org.id })}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <PlayCircle size={12} /> Reativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => execOrgAdmin({ action: 'suspend_org', factionId: org.id })}
                            className="px-2.5 py-1 bg-red-700 hover:bg-red-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <PauseCircle size={12} /> Suspender
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-700/60 text-xs">
                      <select
                        value={chosenCharId}
                        onChange={(e) =>
                          setSelectedLeaderByOrg((prev) => ({ ...prev, [org.id]: e.target.value }))
                        }
                        className="flex-1 min-w-[200px] px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                      >
                        {eligibleCitizens.length === 0 && (
                          <option value="">Sem cidadãos registados</option>
                        )}
                        {eligibleCitizens.map((cz) => (
                          <option key={cz.id} value={cz.id}>
                            {cz.name} · BI {cz.bi} · Nv.{cz.level} {cz.online ? '[ONLINE]' : '[OFFLINE]'}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!chosenCharId}
                        onClick={() =>
                          execOrgAdmin({
                            action: org.leaderId ? 'replace_leader' : 'appoint_leader',
                            factionId: org.id,
                            targetCharId: chosenCharId,
                          })
                        }
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-zinc-950 font-black rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Crown size={13} /> {org.leaderId ? 'Substituir Líder' : 'Nomear Líder'}
                      </button>
                      {org.leaderId && (
                        <button
                          type="button"
                          onClick={() => execOrgAdmin({ action: 'remove_leader', factionId: org.id })}
                          className="px-2.5 py-1.5 bg-zinc-700 hover:bg-red-700 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <UserMinus size={13} /> Retirar Líder
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="pt-2 border-t border-zinc-700/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                        <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800 space-y-1 max-h-40 overflow-y-auto">
                          <div className="font-bold text-amber-400 uppercase">Membros ({org.members.length})</div>
                          {org.members.length === 0 ? (
                            <p className="text-zinc-500">Sem membros alistados.</p>
                          ) : (
                            org.members.map((m) => {
                              const cit = eligibleCitizens.find((c) => c.id === m.characterId);
                              return (
                                <div key={m.characterId} className="flex justify-between gap-2 border-b border-zinc-800/70 pb-1">
                                  <span>
                                    <strong className="text-white">{m.name}</strong> · {m.rank} (Nv.{m.level})
                                  </span>
                                  <span className="font-mono text-zinc-400">
                                    {m.bi || cit?.bi || '—'} · {cit?.online ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800 space-y-1 max-h-40 overflow-y-auto">
                          <div className="font-bold text-cyan-400 uppercase">Auditoria da Organização</div>
                          {(org.auditLogs || []).length === 0 ? (
                            <p className="text-zinc-500">Sem registos de auditoria.</p>
                          ) : (
                            (org.auditLogs || []).slice(0, 12).map((al) => (
                              <div key={al.id} className="border-b border-zinc-800/70 pb-1">
                                <span className="text-amber-300 font-bold">{al.actorName}:</span>{' '}
                                <span className="text-zinc-300">{al.details}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'politics' && isGod && politics && (
          <div className="space-y-4">
            <div className="p-3.5 bg-zinc-800/70 border border-zinc-700 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Landmark size={18} className="text-amber-400" />
                <div>
                  <div className="text-zinc-400 uppercase text-[10px] font-bold">Presidente em Exercício (Máx. 1)</div>
                  <div className="font-bold text-sm text-white">
                    {politics.president
                      ? `${politics.president.name} (${politics.president.partyAcronym}) · ${politics.president.votesReceived} votos`
                      : 'Cargo Vago — Aguardando Eleições'}
                  </div>
                </div>
              </div>
              {politics.president && (
                <button
                  type="button"
                  onClick={() => execPoliticsAdmin({ action: 'remove_president' })}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg font-bold cursor-pointer"
                >
                  Destituir Presidente
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-zinc-800/60 border border-zinc-700 rounded-xl space-y-2.5">
                <div className="font-bold text-amber-400 uppercase">Registar Novo Partido</div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Nome do Partido"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="col-span-2 px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Sigla"
                    value={partyAcronym}
                    onChange={(e) => setPartyAcronym(e.target.value.toUpperCase())}
                    className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg font-mono uppercase"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={partyColor}
                    onChange={(e) => setPartyColor(e.target.value)}
                    className="w-10 h-8 bg-zinc-950 border border-zinc-700 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    placeholder="Ideologia / Programa resumido"
                    value={partyIdeology}
                    onChange={(e) => setPartyIdeology(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    execPoliticsAdmin({
                      action: 'create_party',
                      name: partyName,
                      acronym: partyAcronym,
                      color: partyColor,
                      ideology: partyIdeology,
                    });
                    setPartyName('');
                    setPartyAcronym('');
                    setPartyIdeology('');
                  }}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                >
                  Aprovar & Registar Partido
                </button>

                <div className="pt-2 border-t border-zinc-700 space-y-1.5 max-h-36 overflow-y-auto">
                  {politics.parties.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-zinc-950/70 px-2.5 py-1.5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
                        <span className="font-bold">{p.acronym}</span>
                        <span className="text-zinc-400 truncate max-w-[140px]">{p.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => execPoliticsAdmin({ action: 'toggle_party_status', partyId: p.id })}
                        className={`px-2 py-0.5 rounded font-bold text-[10px] cursor-pointer ${
                          p.suspended ? 'bg-emerald-700 text-white' : 'bg-red-800 text-white'
                        }`}
                      >
                        {p.suspended ? 'Reaprovar' : 'Suspender'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-zinc-800/60 border border-zinc-700 rounded-xl space-y-2.5">
                <div className="font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                  <Vote size={14} /> Gestão Eleitoral
                </div>

                {!politics.activeElection ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={electionTitle}
                      onChange={(e) => setElectionTitle(e.target.value)}
                      placeholder="Título da Eleição Presidencial"
                      className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => execPoliticsAdmin({ action: 'open_election', title: electionTitle })}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg cursor-pointer"
                    >
                      Abrir Eleição Presidencial
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="p-2 bg-zinc-950 rounded-lg border border-emerald-500/40 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white">{politics.activeElection.title}</div>
                        <div className="text-[11px] text-zinc-400 tabular-nums">
                          {politics.activeElection.candidates.length} candidatos ·{' '}
                          {Object.keys(politics.activeElection.voters || {}).length} votos registados
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">ABERTA</span>
                    </div>

                    <div className="space-y-1.5 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase">Adicionar Candidato</div>
                      <select
                        value={candCharId}
                        onChange={(e) => setCandCharId(e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs"
                      >
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.idNumber})
                          </option>
                        ))}
                      </select>
                      <select
                        value={candPartyId}
                        onChange={(e) => setCandPartyId(e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs"
                      >
                        {politics.parties
                          .filter((p) => p.approved && !p.suspended)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.acronym} — {p.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={candBio}
                        onChange={(e) => setCandBio(e.target.value)}
                        placeholder="Slogan / Proposta de campanha..."
                        className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          execPoliticsAdmin({
                            action: 'add_candidate',
                            targetCharId: candCharId,
                            partyId: candPartyId,
                            bio: candBio,
                          });
                          setCandBio('');
                        }}
                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded cursor-pointer"
                      >
                        Inscrever Candidato
                      </button>
                    </div>

                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {politics.activeElection.candidates.map((cd) => (
                        <div key={cd.id} className="flex justify-between items-center bg-zinc-950/70 px-2 py-1 rounded text-[11px] tabular-nums">
                          <span>
                            <strong>{cd.name}</strong> ({cd.partyAcronym})
                          </span>
                          <span className="font-mono text-amber-400 font-bold">{cd.votes} votos</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => execPoliticsAdmin({ action: 'close_election' })}
                        className="py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                      >
                        Encerrar & Eleger
                      </button>
                      <button
                        type="button"
                        onClick={() => execPoliticsAdmin({ action: 'annul_election' })}
                        className="py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Anular Eleição
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'world' && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold uppercase">
                  <Globe size={15} /> Sincronização Global de Mundo
                </div>
                <span className="text-[11px] font-mono text-zinc-300">
                  Modo Clima: <strong className="text-amber-300">{worldConfig.weatherMode === 'manual' ? 'Manual (Admin)' : 'Automático (API Luanda)'}</strong>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Clima Global</label>
                  <select
                    value={worldConfig.weather}
                    onChange={(e) => setWorldConfig({ ...worldConfig, weather: e.target.value as WeatherType, weatherMode: 'manual' })}
                    className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg"
                  >
                    <option value="ensolarado">Ensolarado Tropical</option>
                    <option value="nublado">Nublado / Nebulosidade</option>
                    <option value="calor_extremo">Calor Extremo (&gt;32°C)</option>
                    <option value="cacimbo">Cacimbo Costeiro</option>
                    <option value="chuva">Chuva Tropical</option>
                    <option value="pordosol">Pôr-do-Sol na Baía</option>
                    <option value="noite">Noite de Luanda</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Hora Global (0-23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={Math.round(worldConfig.timeOfDay)}
                    onChange={(e) => setWorldConfig({ ...worldConfig, timeOfDay: Number(e.target.value) })}
                    className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Taxa Imposto (0-0.4)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={0.4}
                    value={worldConfig.taxRate}
                    onChange={(e) => setWorldConfig({ ...worldConfig, taxRate: Number(e.target.value) })}
                    className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Multiplicador Salário</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0.2}
                    max={5}
                    value={worldConfig.economyMultiplier}
                    onChange={(e) => setWorldConfig({ ...worldConfig, economyMultiplier: Number(e.target.value) })}
                    className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    execAdmin({
                      action: 'world',
                      weatherMode: 'manual',
                      weather: worldConfig.weather,
                      timeOfDay: worldConfig.timeOfDay,
                      taxRate: worldConfig.taxRate,
                      economyMultiplier: worldConfig.economyMultiplier,
                    })
                  }
                  className="min-h-[40px] px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl cursor-pointer"
                >
                  Aplicar Clima Manual a Todos Jogadores
                </button>
                <button
                  type="button"
                  onClick={() =>
                    execAdmin({
                      action: 'world',
                      weatherMode: 'auto',
                      timeOfDay: worldConfig.timeOfDay,
                      taxRate: worldConfig.taxRate,
                      economyMultiplier: worldConfig.economyMultiplier,
                    })
                  }
                  className="min-h-[40px] px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl cursor-pointer"
                >
                  Sincronizar Clima Real Luanda (API Auto)
                </button>
              </div>
            </div>

            <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl flex gap-2">
              <input
                type="text"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Comunicado Oficial Global no Chat..."
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  execAdmin({ action: 'announce', announcement });
                  setAnnouncement('');
                }}
                className="px-4 py-2 bg-amber-500 text-zinc-950 font-black text-xs rounded-xl cursor-pointer"
              >
                Transmitir
              </button>
            </div>

            <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl space-y-3 text-xs">
              <div className="font-bold text-amber-400 uppercase">
                Controlo ENDE (Apagões) & ELISAL (Limpeza Urbana por Bairro)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ctrlDistrict}
                  onChange={(e) => setCtrlDistrict(e.target.value)}
                  className="px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg"
                >
                  {LUANDA_DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => execAdmin({ action: 'trigger_blackout', district: ctrlDistrict })}
                  className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg cursor-pointer"
                >
                  Provocar Apagão ENDE
                </button>
                <button
                  type="button"
                  onClick={() => execAdmin({ action: 'clear_blackout', district: ctrlDistrict })}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer"
                >
                  Restaurar Energia
                </button>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={ctrlCleanliness}
                  onChange={(e) => setCtrlCleanliness(Number(e.target.value))}
                  className="w-20 px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg font-mono tabular-nums"
                  title="Índice de Limpeza (%)"
                />
                <button
                  type="button"
                  onClick={() =>
                    execAdmin({ action: 'set_cleanliness', district: ctrlDistrict, value: ctrlCleanliness })
                  }
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                >
                  Aplicar Limpeza (%)
                </button>
              </div>
              {worldState && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {Object.entries(worldState.cleanlinessByDistrict || {}).slice(0, 8).map(([distId, pct]) => {
                    const isOut = Boolean(worldState.blackoutDistricts?.[distId]);
                    return (
                      <div
                        key={distId}
                        className={`p-2 rounded-lg border text-[11px] tabular-nums ${
                          isOut ? 'bg-red-950/40 border-yellow-500/60' : 'bg-zinc-950/80 border-zinc-800'
                        }`}
                      >
                        <div className="font-bold text-white uppercase">{distId}</div>
                        <div className="text-emerald-400">Limpeza: {Math.round(pct)}%</div>
                        {isOut && <div className="text-yellow-300 font-bold">⚡ Sem Energia</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'accounts' && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold text-white">
                    {acc.email}{' '}
                    <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-300 uppercase text-[10px]">
                      {acc.role}
                    </span>
                  </div>
                  {acc.bannedUntil > Date.now() && (
                    <div className="text-red-400">Banido até {new Date(acc.bannedUntil).toLocaleString('pt-AO')}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isGod && (
                    <select
                      value={acc.role}
                      onChange={(e) =>
                        execAdmin({ action: 'set_role', targetAccountId: acc.id, role: e.target.value as AdminRole })
                      }
                      className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg text-xs"
                    >
                      <option value="player">player</option>
                      <option value="moderador">moderador</option>
                      <option value="administrador">administrador</option>
                      <option value="gestor">gestor</option>
                      <option value="admin_god">admin_god</option>
                    </select>
                  )}
                  {acc.bannedUntil > Date.now() ? (
                    <button
                      type="button"
                      onClick={() => execAdmin({ action: 'unban', targetAccountId: acc.id })}
                      className="px-2.5 py-1 bg-emerald-600 rounded font-bold cursor-pointer"
                    >
                      Desbanir
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        execAdmin({
                          action: 'ban',
                          targetAccountId: acc.id,
                          hours: 24,
                          reason: 'Banido pela Staff Luanda RP',
                        })
                      }
                      className="px-2.5 py-1 bg-red-700 hover:bg-red-600 rounded font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Ban size={12} /> Ban 24h
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2 max-h-72 overflow-y-auto">
                <span className="text-xs font-bold uppercase text-amber-400">Reportes de Jogadores</span>
                {reports.map((r) => (
                  <div key={r.id} className="p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between font-bold">
                      <span>{r.reporterName} → {r.targetName}</span>
                      <span className={r.status === 'open' ? 'text-red-400' : 'text-emerald-400'}>{r.status}</span>
                    </div>
                    <p className="text-zinc-300">{r.reason}</p>
                    {r.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => execAdmin({ action: 'resolve_report', reportId: r.id })}
                        className="px-2 py-0.5 bg-emerald-600 rounded text-[11px] font-bold cursor-pointer"
                      >
                        Marcar Resolvido
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                <span className="text-xs font-bold uppercase text-red-400">Logs de Auditoria Staff</span>
                {logs.map((l) => (
                  <div key={l.id} className="p-2 bg-zinc-800/60 border border-zinc-700 rounded-xl text-[11px]">
                    <div className="font-bold text-amber-300">
                      [{l.actorRole}] {l.action}
                    </div>
                    <div className="text-zinc-300">{l.details}</div>
                  </div>
                ))}
              </div>
            </div>

            {serverTransactions.length > 0 && (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                <span className="text-xs font-bold uppercase text-emerald-400">
                  Transações Financeiras Recentes ({serverTransactions.length})
                </span>
                {serverTransactions.slice(0, 20).map((tx) => (
                  <div
                    key={tx.id}
                    className="p-2 bg-zinc-950/75 border border-zinc-800 rounded-xl text-[11px] flex justify-between gap-2 tabular-nums"
                  >
                    <span className="text-zinc-200 truncate">
                      <strong className="uppercase text-amber-300">[{tx.type}]</strong> {tx.description}
                    </span>
                    <span className="font-mono font-bold text-emerald-400 shrink-0">
                      {tx.amountKz.toLocaleString('pt-AO')} Kz
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Fechar Painel Staff
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
