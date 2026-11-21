/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  DistrictId,
  EndeFaultCall,
  FactionData,
  FarmPlantState,
  FishSpeciesDef,
  GangCraftSession,
  GangDesmancheSession,
  GangGrowBatch,
  GpsWaypoint,
  InventoryItem,
  JobCatalog,
  JobWorkLogEntry,
  PlayerStats,
  SharedWorldVehicle,
  SkinPreset,
  WorldDynamicState,
  YangoTripCall,
} from '../../game/types';
import {
  FAA_HEIST_REWARD_KZ,
  FACTION_CITY_STATIONS,
  FARM_PLANT_NODES,
  JOBS_CATALOG,
  LUANDA_DISTRICTS,
  SKIN_PRESETS,
  YANGO_PICKUP_NODES,
} from '../../game/data/catalog';
import { FAA_VAULT_POS } from '../../game/city/terrainPhysics';
import { api, CharacterRecord } from '../../services/api';
import {
  Briefcase,
  Shield,
  Skull,
  Play,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  Navigation,
  Sparkles,
  Crown,
  ArrowUp,
  ArrowDown,
  Megaphone,
  Wallet,
  Moon,
  Car,
  Zap,
  Anchor,
  Trash2,
  Wrench,
  Sprout,
  Package,
  Flag,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  jobStepIndex: number;
  initialTab?: 'jobs' | 'factions' | 'crime';
  initialJobFocus?: 'yango' | 'ende' | 'pescador' | 'elisal' | 'fazenda';
  drivingModelId?: string | null;
  playerPos?: { x: number; y: number; z: number };
  onCharacterSynced: (char: CharacterRecord) => void;
  onJobStarted: (job: JobCatalog, char: CharacterRecord) => void;
  onSpawnFarmVan?: (van: SharedWorldVehicle) => void;
  onApplySkinPreset?: (preset: SkinPreset) => Promise<void> | void;
  onSetGpsWaypoint?: (wp: GpsWaypoint) => void;
  onFaaHeistTriggered?: () => void;
  onClose: () => void;
}

export const JobsFactionsModal: React.FC<Props> = ({
  characterId,
  stats,
  jobStepIndex,
  initialTab = 'jobs',
  initialJobFocus,
  drivingModelId = null,
  playerPos,
  onCharacterSynced,
  onJobStarted,
  onSpawnFarmVan,
  onApplySkinPreset,
  onSetGpsWaypoint,
  onFaaHeistTriggered,
  onClose,
}) => {
  const [tab, setTab] = useState<'jobs' | 'factions' | 'crime'>(initialTab);
  const [focusedJobId, setFocusedJobId] = useState<'yango' | 'ende' | 'pescador' | 'elisal' | 'fazenda'>(
    initialJobFocus ||
      (stats.jobId === 'agricultor_fazenda'
        ? 'fazenda'
        : (stats.jobId as 'yango' | 'ende' | 'pescador' | 'elisal' | 'fazenda') || 'yango')
  );
  const [factions, setFactions] = useState<FactionData[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [workLogs, setWorkLogs] = useState<JobWorkLogEntry[]>([]);
  const [myInventory, setMyInventory] = useState<InventoryItem[]>([]);
  const [treasuryAmt, setTreasuryAmt] = useState(2000);
  const [announcementDraft, setAnnouncementDraft] = useState<Record<string, string>>({});
  const [rankSelectByMember, setRankSelectByMember] = useState<Record<string, number>>({});
  const [launderAmt, setLaunderAmt] = useState(5000);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // YANGO state
  const [yangoCalls, setYangoCalls] = useState<YangoTripCall[]>([]);
  const [yangoPickupIdx, setYangoPickupIdx] = useState(0);
  const [yangoDestIdx, setYangoDestIdx] = useState(3);
  const [yangoRating, setYangoRating] = useState(5);

  // ENDE state + Electrical Repair Minigame
  const [endeFaults, setEndeFaults] = useState<EndeFaultCall[]>([]);
  const [endeBlackouts, setEndeBlackouts] = useState<WorldDynamicState['blackoutDistricts']>({});
  const [activeRepairFaultId, setActiveRepairFaultId] = useState<string | null>(null);
  const [breakerStates, setBreakerStates] = useState<boolean[]>([false, true, false, false]);

  // PESCADOR state + Cast & Reel Minigame
  const [fishZones, setFishZones] = useState<
    { id: string; name: string; pos: [number, number, number]; radius: number; allowed: boolean; reason?: string }[]
  >([]);
  const [fishSpecies, setFishSpecies] = useState<FishSpeciesDef[]>([]);
  const [fishMarketMult, setFishMarketMult] = useState(1);
  const [reelCursor, setReelCursor] = useState(50);

  // ELISAL state
  const [elisalBins, setElisalBins] = useState<
    { id: string; label: string; district: DistrictId; pos: [number, number, number] }[]
  >([]);
  const [cleanlinessMap, setCleanlinessMap] = useState<Record<string, number>>({});

  // FAZENDA state
  const [farmPlants, setFarmPlants] = useState<FarmPlantState[]>([]);
  const [farmVanRentKz, setFarmVanRentKz] = useState(1000);
  const [farmMaxCrates, setFarmMaxCrates] = useState(5);
  const [farmCrateRange, setFarmCrateRange] = useState<[number, number]>([1500, 2300]);

  // GANG state (CV / FTX / BMR)
  const [gangFaction, setGangFaction] = useState<FactionData | null>(null);
  const [ftxRecipes, setFtxRecipes] = useState<
    {
      id: string;
      outputCatalogId: string;
      outputName: string;
      craftTimeSec: number;
      requiredMaterials: { catalogId: string; name: string; qty: number }[];
      baseSellKz: number;
    }[]
  >([]);
  const [cvSessions, setCvSessions] = useState<GangDesmancheSession[]>([]);
  const [ftxSessions, setFtxSessions] = useState<GangCraftSession[]>([]);
  const [bmrBatches, setBmrBatches] = useState<GangGrowBatch[]>([]);
  const [sharedVehicles, setSharedVehicles] = useState<SharedWorldVehicle[]>([]);
  const [activeDispute, setActiveDispute] = useState<WorldDynamicState['activeTerritoryDispute']>(null);
  const [disputeDistrict, setDisputeDistrict] = useState<DistrictId>('viana');
  const [selectedDesmancheVehId, setSelectedDesmancheVehId] = useState<string>('');
  const [bmrLaunderAmt, setBmrLaunderAmt] = useState<number>(8000);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const loadFactions = useCallback(async () => {
    try {
      const res = await api.getFactions();
      setFactions(res.factions);
      setOnlineIds(new Set(res.onlineCharacterIds || []));
    } catch {}
  }, []);

  const loadWorkLogsAndChar = useCallback(async () => {
    try {
      const res = await api.getCharacter(characterId);
      setWorkLogs(res.jobWorkLogs || []);
      setMyInventory(res.character?.inventory || []);
    } catch {}
  }, [characterId]);

  const loadFocusedJobState = useCallback(async () => {
    try {
      if (focusedJobId === 'yango') {
        const res = await api.yangoGetCalls();
        setYangoCalls(res.calls);
      } else if (focusedJobId === 'ende') {
        const res = await api.endeGetFaults();
        setEndeFaults(res.faults);
        setEndeBlackouts(res.blackoutDistricts || {});
      } else if (focusedJobId === 'pescador') {
        const res = await api.pescadorGetState();
        setFishZones(res.zones);
        setFishSpecies(res.species);
        setFishMarketMult(res.marketMultiplier);
      } else if (focusedJobId === 'elisal') {
        const res = await api.elisalGetState();
        setElisalBins(res.dumpsters);
        setCleanlinessMap(res.cleanlinessByDistrict || {});
      } else if (focusedJobId === 'fazenda') {
        const res = await api.farmGetState();
        setFarmPlants(res.plants || []);
        setFarmVanRentKz(res.vanRentKz || 1000);
        setFarmMaxCrates(res.maxCrates || 5);
        setFarmCrateRange([res.crateMinKz || 1500, res.crateMaxKz || 2300]);
      }
    } catch {}
  }, [focusedJobId]);

  const cvFaction = factions.find((f) => f.id === 'cv_vianalandia');
  const canUseCvDesmanche = stats.factionId === 'cv_vianalandia' || (factions.length > 0 && !cvFaction?.leaderId);

  const isCriminalGangMember =
    stats.factionId === 'cv_vianalandia' ||
    stats.factionId === 'ftx_caop2' ||
    stats.factionId === 'bmr_matanga';

  const loadGangState = useCallback(async () => {
    if (!isCriminalGangMember && !canUseCvDesmanche) return;
    try {
      const res = await api.gangGetState(characterId);
      setGangFaction(res.faction || null);
      setFtxRecipes(res.recipes || []);
      setCvSessions(res.desmancheSessions || []);
      setFtxSessions(res.craftSessions || []);
      setBmrBatches(res.growBatches || []);
      setSharedVehicles(res.sharedVehicles || []);
      setActiveDispute(res.activeTerritoryDispute || null);
      if (res.sharedVehicles && res.sharedVehicles.length > 0 && !selectedDesmancheVehId) {
        setSelectedDesmancheVehId(res.sharedVehicles[0].id);
      }
    } catch {}
  }, [characterId, isCriminalGangMember, canUseCvDesmanche, selectedDesmancheVehId]);

  useEffect(() => {
    loadFactions();
    loadWorkLogsAndChar();
  }, [loadFactions, loadWorkLogsAndChar]);

  useEffect(() => {
    if (tab === 'jobs') {
      loadFocusedJobState();
    } else if (tab === 'factions') {
      loadGangState();
    }
  }, [tab, loadFocusedJobState, loadGangState]);

  // Minigame timer for Fisherman gauge + countdowns for FTX/BMR
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNowTick(t);
      if (tab === 'jobs' && focusedJobId === 'pescador') {
        setReelCursor(Math.round(50 + Math.sin(t * 0.0045) * 46));
      }
    }, 60);
    return () => clearInterval(id);
  }, [tab, focusedJobId]);

  const handleStartJob = async (job: JobCatalog) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.startJob(characterId, job.id);
      soundFx.playInteract();
      onJobStarted(res.job, res.character);
      onClose();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao iniciar emprego.' });
    } finally {
      setLoading(false);
    }
  };

  const handleYango = async (
    action: 'request_ride' | 'generate_call' | 'accept' | 'pickup' | 'complete' | 'cancel',
    callId?: string
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const pickupNode = YANGO_PICKUP_NODES[yangoPickupIdx] || YANGO_PICKUP_NODES[0];
      const destNode = YANGO_PICKUP_NODES[yangoDestIdx] || YANGO_PICKUP_NODES[1];
      const needsTaxi = action === 'pickup' || action === 'complete';
      const res = await api.yangoAction(characterId, action, {
        callId,
        pickupLabel: pickupNode.label,
        pickupPos: pickupNode.pos,
        destLabel: destNode.label,
        destPos: destNode.pos,
        rating: yangoRating,
        ...(needsTaxi ? { drivingModelId: drivingModelId ?? null, enforceVehicle: true } : {}),
      });
      soundFx.playInteract();
      setYangoCalls(res.calls);
      onCharacterSynced(res.character);
      if (res.call?.status === 'completed') soundFx.playCashRegister();
      setFeedback({
        type: 'ok',
        msg:
          action === 'complete' && res.call
            ? `Corrida Yango concluída! +${res.call.fareKz.toLocaleString('pt-AO')} Kz (${res.call.rating}★)`
            : `Operação Yango '${action}' atualizada!`,
      });
      await loadWorkLogsAndChar();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na central Yango.' });
    } finally {
      setLoading(false);
    }
  };

  const handleEnde = async (
    action: 'generate_fault' | 'accept_fault' | 'complete_repair',
    faultId?: string
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.endeAction(characterId, action, {
        faultId,
        ...(action === 'complete_repair' ? { drivingModelId: drivingModelId ?? null, enforceVehicle: true } : {}),
      });
      soundFx.playInteract();
      setEndeFaults(res.faults);
      setEndeBlackouts(res.blackoutDistricts || {});
      onCharacterSynced(res.character);
      if (action === 'complete_repair') {
        soundFx.playCashRegister();
        setActiveRepairFaultId(null);
      }
      setFeedback({
        type: 'ok',
        msg:
          action === 'complete_repair'
            ? `Energia restabelecida em ${res.fault.district}! +${res.fault.rewardKz.toLocaleString('pt-AO')} Kz`
            : `Chamado ENDE '${res.fault.title}' atualizado!`,
      });
      await loadWorkLogsAndChar();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na central ENDE.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePescador = async (action: 'cast_catch' | 'sell_fish') => {
    setLoading(true);
    setFeedback(null);
    try {
      const bonusRoll = reelCursor >= 35 && reelCursor <= 65;
      const res = await api.pescadorAction(characterId, action, {
        position: playerPos,
        bonusRoll,
      });
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setMyInventory(res.character.inventory);
      if (action === 'sell_fish') soundFx.playCashRegister();
      setFeedback({
        type: 'ok',
        msg:
          action === 'cast_catch' && res.caught
            ? `🎣 Capturaste ${res.caught.name} (${res.caught.rarity}) em ${res.zone}${bonusRoll ? ' [Bónus!]' : ''}!`
            : `🐟 Venda concluída (${res.soldCount || 0} peixes): +${(res.payout || 0).toLocaleString('pt-AO')} Kz!`,
      });
      await loadWorkLogsAndChar();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Pesca indisponível nesta zona.' });
    } finally {
      setLoading(false);
    }
  };

  const handleElisal = async (action: 'collect_bin' | 'finish_route', binId?: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.elisalAction(characterId, action, {
        binId,
        drivingModelId: drivingModelId ?? null,
        enforceVehicle: true,
      });
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setCleanlinessMap(res.cleanlinessByDistrict || {});
      if (res.payout > 0) soundFx.playCashRegister();
      setFeedback({
        type: 'ok',
        msg:
          action === 'collect_bin'
            ? `🗑️ Contentor recolhido (+${res.payout.toLocaleString('pt-AO')} Kz)!`
            : `🚛 Rota ELISAL concluída (+${res.payout.toLocaleString('pt-AO')} Kz)!`,
      });
      await loadWorkLogsAndChar();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro no serviço ELISAL.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFarm = async (
    action: 'start_job' | 'rent_van' | 'harvest_plant' | 'deliver_crates',
    plantId?: string
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.farmAction(characterId, action, {
        plantId,
        ...(action === 'deliver_crates' ? { drivingModelId: drivingModelId ?? null, enforceVehicle: true } : {}),
      });
      soundFx.playInteract();
      onCharacterSynced(res.character);
      if (res.plants) setFarmPlants(res.plants);
      if (res.van) onSpawnFarmVan?.(res.van);
      if (res.payout && res.payout > 0) soundFx.playCashRegister();
      setFeedback({
        type: 'ok',
        msg: res.message || 'Operação da Fazenda concluída!',
      });
      await loadWorkLogsAndChar();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na Fazenda Verde.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFaction = async (
    factionId: string,
    action: 'join' | 'leave' | 'deposit_treasury',
    opts?: { amountKz?: number }
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.factionAction(characterId, factionId, action, opts);
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setFactions(res.factions);
      await loadGangState();
      setFeedback({ type: 'ok', msg: `Operação de organização '${action}' concluída!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na organização.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFactionManage = async (
    factionId: string,
    action:
      | 'promote'
      | 'demote'
      | 'set_rank'
      | 'appoint_subleader'
      | 'kick'
      | 'edit_announcement'
      | 'withdraw_treasury',
    opts?: { targetCharId?: string; rankLevel?: number; announcement?: string; amountKz?: number }
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.factionManage(characterId, factionId, action, opts);
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setFactions(res.factions);
      setFeedback({ type: 'ok', msg: `Gestão hierárquica (${action}) executada!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Sem permissão para esta ação.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGangOp = async (fn: () => Promise<void>) => {
    setLoading(true);
    setFeedback(null);
    try {
      await fn();
      await loadGangState();
      await loadFactions();
      await loadWorkLogsAndChar();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Operação da facção falhou.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCrime = async (action: 'rob_store' | 'rob_bank' | 'smuggle' | 'launder') => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.crimeAction(characterId, action, { amountKz: launderAmt });
      soundFx.playCashRegister();
      onCharacterSynced(res.character);
      setFeedback({
        type: 'ok',
        msg: res.reward
          ? `Sucesso RP! Recebeste +${res.reward.toLocaleString('pt-AO')} Kz em dinheiro vivo.`
          : `Branqueamento concluído: +${(res.laundered || 0).toLocaleString('pt-AO')} Kz no banco.`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Ação ilegal falhou.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFactionStation = async (stationId: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.factionStationAction(characterId, stationId);
      soundFx.playCashRegister();
      onCharacterSynced(res.character);
      setFeedback({ type: 'ok', msg: res.message });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Operação indisponível.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFaaHeist = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.faaVaultHeist(characterId);
      soundFx.playSiren();
      onCharacterSynced(res.character);
      onFaaHeistTriggered?.();
      setFeedback({
        type: 'ok',
        msg: `🚨 Assalto ao Tesouro das FAA concluído (+${res.reward.toLocaleString('pt-AO')} Kz)! PNA e FAA a perseguir com fogo letal!`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Assalto ao Cofre das FAA falhou.' });
    } finally {
      setLoading(false);
    }
  };

  const activeJob = JOBS_CATALOG.find((j) => j.id === stats.jobId);
  const activeStep = activeJob?.steps[jobStepIndex] || activeJob?.steps[0];
  const sleepVal = Math.round(stats.sleep ?? 100);
  const caughtFishCount = myInventory
    .filter((i) => i.category === 'fish')
    .reduce((acc, it) => acc + it.quantity, 0);
  const allBreakersGreen = breakerStates.every(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-2 sm:p-4 bg-black/80"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-5xl bg-zinc-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Briefcase size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Empregos Oficiais, Fazenda, Organizações & Facções RP
              </h2>
              <p className="text-xs text-zinc-400 tabular-nums">
                Nível Cidadão: <strong className="text-amber-400">{stats.level}</strong> · Carreira:{' '}
                <strong className="text-emerald-400">Nv.{stats.jobLevel}</strong> · Sono:{' '}
                <strong className={sleepVal < 25 ? 'text-red-400' : 'text-indigo-300'}>{sleepVal}%</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-bold my-4">
          <button
            type="button"
            onClick={() => setTab('jobs')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'jobs' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Briefcase size={14} /> Empregos ({JOBS_CATALOG.length + 1})
          </button>
          <button
            type="button"
            onClick={() => setTab('factions')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 pointer-events-auto cursor-pointer ${
              tab === 'factions' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shield size={14} /> Organizações ({factions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('crime')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'crime' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Skull size={14} /> Crime & FAA
          </button>
        </div>

        {feedback && (
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

        {tab === 'jobs' && (
          <div className="space-y-4">
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Moon size={15} className="text-indigo-400" />
                <span>
                  Empregos Oficiais (YANGO, ENDE, PESCADOR, ELISAL) e Fazenda Verde. Escolhe um emprego ou usa o Painel Operacional abaixo.
                </span>
              </div>
              <div className="font-mono tabular-nums text-zinc-300">
                Fome {Math.round(stats.hunger)}% · Energia {Math.round(stats.energy)}% · Sono {sleepVal}%
              </div>
            </div>

            {activeJob && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/50 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-amber-300">
                    Turno Ativo: {activeJob.title} (Etapa {jobStepIndex + 1}/{activeJob.steps.length})
                  </div>
                  <div className="text-zinc-300 mt-0.5">
                    Objetivo atual: {activeStep?.label} — Segue a baliza dourada 3D!
                  </div>
                </div>
                {activeStep && onSetGpsWaypoint && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetGpsWaypoint({
                        label: `${activeJob.title}: ${activeStep.label}`,
                        x: activeStep.pos[0],
                        z: activeStep.pos[2],
                      });
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-amber-500 text-zinc-950 font-black rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Navigation size={12} /> Marcar Checkpoint GPS
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {JOBS_CATALOG.map((job) => {
                const locked = stats.level < job.minLevel;
                const isActive = stats.jobId === job.id;
                const isFocused = focusedJobId === job.id;
                return (
                  <div
                    key={job.id}
                    className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                      isFocused
                        ? 'bg-amber-500/15 border-amber-400'
                        : isActive
                          ? 'bg-emerald-950/30 border-emerald-500/60'
                          : 'bg-zinc-800/60 border-zinc-700/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="font-bold text-xs text-white">{job.shortTitle}</h4>
                        <span className="text-[11px] font-mono font-bold text-emerald-400 tabular-nums">
                          {job.basePayKz.toLocaleString('pt-AO')} Kz
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{job.description}</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={loading || locked}
                        onClick={() => handleStartJob(job)}
                        className="w-full min-h-[36px] py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-zinc-950 font-black text-[11px] rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Play size={12} />{' '}
                        {locked ? `Nv.${job.minLevel}` : 'Iniciar / Ir para Local'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusedJobId(job.id)}
                        className={`w-full min-h-[34px] py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          isFocused
                            ? 'bg-zinc-950 border-amber-400 text-amber-300'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white'
                        }`}
                      >
                        Painel Operacional
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 5º Card: Fazenda Verde */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                  focusedJobId === 'fazenda'
                    ? 'bg-emerald-500/15 border-emerald-400'
                    : stats.jobId === 'agricultor_fazenda'
                      ? 'bg-emerald-950/30 border-emerald-500/60'
                      : 'bg-zinc-800/60 border-zinc-700/70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-xs text-white">Fazenda Verde</h4>
                    <span className="text-[11px] font-mono font-bold text-emerald-400 tabular-nums">
                      1.500–2.300/cx
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                    Colheita com traje de agricultor, carrinha (máx. 5 caixas) e venda na Praça.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setFocusedJobId('fazenda');
                      void handleFarm('start_job');
                    }}
                    className="w-full min-h-[36px] py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-zinc-950 font-black text-[11px] rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Sprout size={12} /> Iniciar Agricultor
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusedJobId('fazenda')}
                    className={`w-full min-h-[34px] py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                      focusedJobId === 'fazenda'
                        ? 'bg-zinc-950 border-emerald-400 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white'
                    }`}
                  >
                    Painel Operacional
                  </button>
                </div>
              </div>
            </div>

            {/* SUB-PAINEL OPERACIONAL DO EMPREGO SELECIONADO */}
            {focusedJobId === 'yango' && (
              <div className="p-4 bg-zinc-950/85 border border-red-500/50 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-red-300 uppercase">
                    <Car size={16} /> Central YANGO — Corridas & Pedidos em Tempo Real
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleYango('generate_call')}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg cursor-pointer"
                    >
                      + Nova Chamada Passageiro
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-wrap items-center gap-2">
                  <span className="text-zinc-400 font-bold">Pedir Táxi (Passageiro):</span>
                  <select
                    value={yangoPickupIdx}
                    onChange={(e) => setYangoPickupIdx(Number(e.target.value))}
                    className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                  >
                    {YANGO_PICKUP_NODES.map((n, i) => (
                      <option key={n.label} value={i}>
                        Origem: {n.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={yangoDestIdx}
                    onChange={(e) => setYangoDestIdx(Number(e.target.value))}
                    className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                  >
                    {YANGO_PICKUP_NODES.map((n, i) => (
                      <option key={n.label} value={i}>
                        Destino: {n.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleYango('request_ride')}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                  >
                    Solicitar Yango
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {yangoCalls.length === 0 ? (
                    <p className="text-zinc-500">Sem pedidos Yango no momento. Gera uma chamada acima.</p>
                  ) : (
                    yangoCalls.map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {c.passengerName} ·{' '}
                            <span className="text-emerald-400">{c.fareKz.toLocaleString('pt-AO')} Kz</span> ({c.distanceM}m)
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {c.pickupLabel} → {c.destLabel} · Estado: <strong className="uppercase text-amber-300">{c.status}</strong>
                            {c.rating ? ` · ${c.rating}★` : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {onSetGpsWaypoint && c.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => {
                                const target = c.status === 'picked_up' ? c.destPos : c.pickupPos;
                                onSetGpsWaypoint({
                                  label: c.status === 'picked_up' ? `Destino: ${c.destLabel}` : `Recolha: ${c.pickupLabel}`,
                                  x: target[0],
                                  z: target[2],
                                });
                                onClose();
                              }}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Navigation size={11} /> GPS
                            </button>
                          )}
                          {c.status === 'pending' && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleYango('accept', c.id)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold cursor-pointer"
                            >
                              Aceitar
                            </button>
                          )}
                          {c.status === 'accepted' && c.driverId === characterId && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleYango('pickup', c.id)}
                              className="px-2.5 py-1 bg-amber-500 text-zinc-950 font-black rounded-lg cursor-pointer"
                            >
                              Recolher Passageiro
                            </button>
                          )}
                          {c.status === 'picked_up' && c.driverId === characterId && (
                            <>
                              <select
                                value={yangoRating}
                                onChange={(e) => setYangoRating(Number(e.target.value))}
                                className="px-1.5 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px]"
                              >
                                {[5, 4, 3, 2, 1].map((r) => (
                                  <option key={r} value={r}>
                                    {r} ★
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => handleYango('complete', c.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-lg cursor-pointer"
                              >
                                Concluir Corrida
                              </button>
                            </>
                          )}
                          {c.status !== 'completed' && c.status !== 'cancelled' && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleYango('cancel', c.id)}
                              className="px-2 py-1 bg-zinc-800 hover:bg-red-700 rounded-lg font-bold cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {focusedJobId === 'ende' && (
              <div className="p-4 bg-zinc-950/85 border border-amber-500/50 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-amber-300 uppercase">
                    <Zap size={16} /> Central ENDE — Avarias & Apagões por Bairro
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleEnde('generate_fault')}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                  >
                    + Registar Nova Avaria
                  </button>
                </div>

                {Object.keys(endeBlackouts).length > 0 && (
                  <div className="p-2.5 bg-red-950/50 border border-yellow-400/70 rounded-xl text-yellow-200 font-bold">
                    ⚡ Bairros em Apagão Ativo:{' '}
                    {Object.entries(endeBlackouts)
                      .map(([d, info]) => `${d.toUpperCase()} (${info.title})`)
                      .join(' · ')}
                  </div>
                )}

                {activeRepairFaultId && (
                  <div className="p-3 bg-zinc-900 border-2 border-amber-400 rounded-xl space-y-2.5">
                    <div className="font-bold text-amber-300 flex items-center justify-between">
                      <span>⚡ Minijogo Técnico ENDE: Liga todos os 4 disjuntores em VERDE (ON)</span>
                      <button
                        type="button"
                        onClick={() => setActiveRepairFaultId(null)}
                        className="text-zinc-400 hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {breakerStates.map((on, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setBreakerStates((prev) => prev.map((v, i) => (i === idx ? !v : v)))
                          }
                          className={`min-h-[44px] rounded-xl font-black border cursor-pointer ${
                            on
                              ? 'bg-emerald-600 border-emerald-300 text-white'
                              : 'bg-red-900/70 border-red-400 text-red-100'
                          }`}
                        >
                          Disjuntor {idx + 1}: {on ? 'ON' : 'OFF'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={loading || !allBreakersGreen}
                      onClick={() => handleEnde('complete_repair', activeRepairFaultId)}
                      className="w-full min-h-[40px] py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-black rounded-xl cursor-pointer"
                    >
                      {allBreakersGreen
                        ? 'Restabelecer Energia & Receber Pagamento!'
                        : 'Alinha todos os disjuntores para ON primeiro'}
                    </button>
                  </div>
                )}

                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {endeFaults.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {f.title} ({f.repairType.toUpperCase()}) ·{' '}
                          <span className="text-emerald-400">+{f.rewardKz.toLocaleString('pt-AO')} Kz</span>
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Bairro: {f.district.toUpperCase()} · Estado: {f.status}
                          {f.causesBlackout ? ' · ⚡ CAUSA APAGÃO' : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {onSetGpsWaypoint && f.status !== 'fixed' && (
                          <button
                            type="button"
                            onClick={() => {
                              onSetGpsWaypoint({ label: f.title, x: f.pos[0], z: f.pos[2] });
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Navigation size={11} /> GPS
                          </button>
                        )}
                        {f.status === 'open' && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleEnde('accept_fault', f.id)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 font-bold rounded-lg cursor-pointer"
                          >
                            Aceitar Avaria
                          </button>
                        )}
                        {f.status !== 'fixed' && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              setBreakerStates([false, true, false, false]);
                              setActiveRepairFaultId(f.id);
                            }}
                            className="px-2.5 py-1 bg-amber-500 text-zinc-950 font-black rounded-lg cursor-pointer"
                          >
                            Reparar Quadro
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {focusedJobId === 'pescador' && (
              <div className="p-4 bg-zinc-950/85 border border-sky-500/50 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-sky-300 uppercase">
                    <Anchor size={16} /> Pesca Atlântica — Zonas, Minijogo & Mercado
                  </div>
                  <div className="font-mono text-emerald-400 font-bold tabular-nums">
                    Cotação Mercado: {fishMarketMult.toFixed(2)}x · Peixes na Mochila: {caughtFishCount}
                  </div>
                </div>

                {/* Minijogo Lançar & Puxar Cana */}
                <div className="p-3 bg-zinc-900 border border-sky-500/40 rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-bold text-sky-200">
                      🎣 Minijogo de Pesca: Clica quando a barra estiver na Zona Verde (35%–65%) para captura rara!
                    </span>
                    <span className="font-mono text-amber-300">{reelCursor}%</span>
                  </div>
                  <div className="relative w-full h-5 bg-zinc-950 rounded-full border border-zinc-700 overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-500/40 border-x border-emerald-400"
                      style={{ left: '35%', width: '30%' }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-2 bg-amber-400 rounded-full"
                      style={{ left: `calc(${reelCursor}% - 4px)` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handlePescador('cast_catch')}
                      className="flex-1 min-h-[40px] py-2 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-xl cursor-pointer"
                    >
                      🎣 Lançar / Puxar Cana Aqui
                    </button>
                    <button
                      type="button"
                      disabled={loading || caughtFishCount === 0}
                      onClick={() => handlePescador('sell_fish')}
                      className="flex-1 min-h-[40px] py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-black rounded-xl cursor-pointer"
                    >
                      🐟 Vender Pescaria ({caughtFishCount})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="font-bold text-zinc-400 uppercase text-[11px]">Zonas de Pesca</div>
                    {fishZones.map((z) => (
                      <div
                        key={z.id}
                        className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                          z.allowed ? 'bg-zinc-900 border-zinc-800' : 'bg-red-950/35 border-red-500/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{z.name}</div>
                          {z.reason && <div className="text-[10px] text-red-300">{z.reason}</div>}
                        </div>
                        {z.allowed && onSetGpsWaypoint && (
                          <button
                            type="button"
                            onClick={() => {
                              onSetGpsWaypoint({ label: z.name, x: z.pos[0], z: z.pos[2] });
                              onClose();
                            }}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded font-bold shrink-0 cursor-pointer"
                          >
                            GPS
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <div className="font-bold text-zinc-400 uppercase text-[11px]">Espécies & Preços Base</div>
                    {fishSpecies.map((sp) => (
                      <div
                        key={sp.id}
                        className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between"
                      >
                        <span>
                          <strong style={{ color: sp.color }}>{sp.name}</strong> ({sp.rarity})
                        </span>
                        <span className="font-mono text-emerald-400">
                          {Math.round(sp.basePriceKz * fishMarketMult).toLocaleString('pt-AO')} Kz
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {focusedJobId === 'elisal' && (
              <div className="p-4 bg-zinc-950/85 border border-emerald-500/50 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-emerald-300 uppercase">
                    <Trash2 size={16} /> ELISAL — Limpeza Urbana & Contentores
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleElisal('finish_route')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg cursor-pointer"
                  >
                    Concluir Rota ELISAL
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(cleanlinessMap).map(([dist, pct]) => (
                    <div key={dist} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg tabular-nums">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="uppercase">{dist}</span>
                        <span className={pct < 50 ? 'text-amber-400' : 'text-emerald-400'}>
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full ${pct < 50 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {elisalBins.map((bin) => (
                    <div
                      key={bin.id}
                      className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{bin.label}</div>
                        <div className="text-[10px] text-zinc-400 uppercase">{bin.district}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {onSetGpsWaypoint && (
                          <button
                            type="button"
                            onClick={() => {
                              onSetGpsWaypoint({ label: bin.label, x: bin.pos[0], z: bin.pos[2] });
                              onClose();
                            }}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded font-bold cursor-pointer"
                          >
                            GPS
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleElisal('collect_bin', bin.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded font-bold cursor-pointer"
                        >
                          Recolher
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {focusedJobId === 'fazenda' && (
              <div className="p-4 bg-zinc-950/85 border border-emerald-500/50 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-emerald-300 uppercase">
                    <Sprout size={16} /> Fazenda Verde — Cultivo, Carrinha & Praça
                  </div>
                  <div className="font-mono text-amber-300 font-bold tabular-nums">
                    Caixas na Carrinha: {stats.farmCrates || 0}/{farmMaxCrates} · Preço Praça:{' '}
                    {farmCrateRange[0].toLocaleString('pt-AO')}–{farmCrateRange[1].toLocaleString('pt-AO')} Kz/cx
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleFarm('start_job')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg cursor-pointer"
                  >
                    👨‍🌾 {stats.jobId === 'agricultor_fazenda' ? 'Traje Agricultor Ativo' : 'Iniciar Trabalho Agricultor (Traje)'}
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleFarm('rent_van')}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                  >
                    🚚 Alugar Carrinha ({farmVanRentKz.toLocaleString('pt-AO')} Kz)
                  </button>
                  <button
                    type="button"
                    disabled={loading || (stats.farmCrates || 0) <= 0}
                    onClick={() => handleFarm('deliver_crates')}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white font-black rounded-lg cursor-pointer"
                  >
                    📦 Entregar Caixas na Praça ({stats.farmCrates || 0}/{farmMaxCrates})
                  </button>
                  {onSetGpsWaypoint && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onSetGpsWaypoint({ label: 'Fazenda Verde (Agricultor)', x: 240, z: -122 });
                          onClose();
                        }}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Navigation size={11} /> GPS Fazenda
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetGpsWaypoint({ label: 'Praça Central (Descarga Agrícola)', x: 116, z: -36 });
                          onClose();
                        }}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Navigation size={11} /> GPS Praça
                      </button>
                    </>
                  )}
                </div>

                {(stats.farmCrates || 0) >= farmMaxCrates && (
                  <div className="p-2.5 bg-amber-950/60 border border-amber-400 rounded-xl text-amber-200 font-bold">
                    🚚 Carrinha cheia ({farmMaxCrates}/{farmMaxCrates} caixas)! Conduz a Carrinha Agrícola até à Praça Central para vender a colheita!
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                  {FARM_PLANT_NODES.map((node) => {
                    const st = farmPlants.find((p) => p.id === node.id);
                    const remSec = st && st.availableAt > nowTick ? Math.ceil((st.availableAt - nowTick) / 1000) : 0;
                    const isGrowing = remSec > 0;
                    return (
                      <div
                        key={node.id}
                        className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{node.cropName}</div>
                          <div className={`text-[10px] font-bold ${isGrowing ? 'text-amber-300' : 'text-emerald-400'}`}>
                            {isGrowing
                              ? `Em processo de produção (${Math.floor(remSec / 60)}m ${String(remSec % 60).padStart(2, '0')}s)`
                              : 'Pronta para colheita'}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {onSetGpsWaypoint && (
                            <button
                              type="button"
                              onClick={() => {
                                onSetGpsWaypoint({ label: node.cropName, x: node.pos[0], z: node.pos[2] });
                                onClose();
                              }}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded font-bold cursor-pointer"
                            >
                              GPS
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={loading || isGrowing}
                            onClick={() => handleFarm('harvest_plant', node.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 rounded font-bold cursor-pointer"
                          >
                            {isGrowing ? 'A produzir...' : 'Colher Caixa'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {workLogs.length > 0 && (
              <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-1.5">
                <div className="text-xs font-bold uppercase text-emerald-400">Histórico Recente de Turnos</div>
                <div className="space-y-1 max-h-28 overflow-y-auto text-[11px] tabular-nums">
                  {workLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="flex justify-between text-zinc-300 border-b border-zinc-800/70 pb-1">
                      <span>{log.jobTitle}</span>
                      <span className="font-mono text-emerald-400">
                        +{log.payoutKz.toLocaleString('pt-AO')} Kz · +{log.xpEarned} XP
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'factions' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px] text-zinc-300 flex items-center gap-2">
              <Crown size={14} className="text-amber-400 shrink-0" />
              <span>
                3 Organizações Legais (PNA, INEMA, OAA Advogados) e 3 Facções Criminosas (CV, FTX, BMR). Líder Principal é nomeado exclusivamente pelo Admin God.
              </span>
            </div>

            {/* PAINEL ESPECIALIZADO DA GANGUE DO JOGADOR (ou CV Desmanche aberto se CV ainda sem líder Admin) */}
            {(isCriminalGangMember || canUseCvDesmanche) && (
              <div className="p-4 bg-red-950/35 border-2 border-red-500/60 rounded-2xl space-y-3 text-xs">
                <div className="font-black text-sm text-red-200 uppercase flex items-center gap-2">
                  <Skull size={16} /> Operações da Facção ({gangFaction?.name || (canUseCvDesmanche ? 'CV - VIANALANDIA (Desmanche Livre)' : stats.factionId)})
                </div>

                {/* CV - VIANALÂNDIA: Desmanche multi-etapa */}
                {(stats.factionId === 'cv_vianalandia' || canUseCvDesmanche) && (
                  <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Wrench size={14} /> Oficina Secreta & Desmanche CV (60% Gatuno · 40% Cofre CV)
                    </div>
                    {!cvFaction?.leaderId && stats.factionId !== 'cv_vianalandia' && (
                      <p className="text-[11px] text-amber-200/80">
                        A gangue CV ainda não tem líder nomeado pelo Admin — qualquer cidadão pode interagir com o Desmanche de carros roubados.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={selectedDesmancheVehId}
                        onChange={(e) => setSelectedDesmancheVehId(e.target.value)}
                        className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs"
                      >
                        {sharedVehicles.length === 0 ? (
                          <option value="">Sem viaturas disponíveis no mundo</option>
                        ) : (
                          sharedVehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.plate})
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="button"
                        disabled={loading || !selectedDesmancheVehId}
                        onClick={() =>
                          handleGangOp(async () => {
                            await api.gangCvDesmanche(characterId, 'start', {
                              vehicleId: selectedDesmancheVehId,
                            });
                            setFeedback({ type: 'ok', msg: 'Desmanche iniciado na Oficina CV!' });
                          })
                        }
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Iniciar Desmanche
                      </button>
                    </div>
                    {cvSessions.map((s) => (
                      <div
                        key={s.id}
                        className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          <strong>{s.vehicleName}</strong> ({s.plate}) · Etapa {s.stage}/3
                        </span>
                        <div className="flex gap-1.5">
                          {s.stage < 2 && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() =>
                                handleGangOp(async () => {
                                  await api.gangCvDesmanche(characterId, 'advance', { sessionId: s.id });
                                  setFeedback({ type: 'ok', msg: 'Etapa de desmanche avançada!' });
                                })
                              }
                              className="px-2.5 py-1 bg-amber-500 text-zinc-950 font-black rounded cursor-pointer"
                            >
                              Avançar Etapa
                            </button>
                          )}
                          {s.stage >= 2 && s.stage < 3 && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() =>
                                handleGangOp(async () => {
                                  const r = await api.gangCvDesmanche(characterId, 'complete', { sessionId: s.id });
                                  onCharacterSynced(r.character);
                                  soundFx.playCashRegister();
                                  setFeedback({
                                    type: 'ok',
                                    msg: `Desmanche concluído (+${(r.payout || 0).toLocaleString('pt-AO')} Kz + Peças)!`,
                                  });
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded cursor-pointer"
                            >
                              Concluir & Vender Peças
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* FTX - CAOP 2: Bancada de Fabrico de Armas */}
                {stats.factionId === 'ftx_caop2' && (
                  <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                    <div className="font-bold text-red-300">🔫 Bancada Tática FTX — Fabrico Controlado</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ftxRecipes.map((rec) => {
                        const hasAll = rec.requiredMaterials.every((req) => {
                          const ownedQty = myInventory
                            .filter((i) => i.catalogId === req.catalogId)
                            .reduce((a, b) => a + b.quantity, 0);
                          return ownedQty >= req.qty;
                        });
                        return (
                          <div key={rec.id} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1.5">
                            <div className="font-bold text-white">{rec.outputName}</div>
                            <div className="text-[10px] text-zinc-400">
                              Tempo: {rec.craftTimeSec}s · Materiais:{' '}
                              {rec.requiredMaterials.map((m) => `${m.qty}x ${m.name}`).join(', ')}
                            </div>
                            <button
                              type="button"
                              disabled={loading || !hasAll}
                              onClick={() =>
                                handleGangOp(async () => {
                                  const r = await api.gangFtxCraft(characterId, 'start', { recipeId: rec.id });
                                  onCharacterSynced(r.character);
                                  setFeedback({ type: 'ok', msg: `Fabrico de ${rec.outputName} iniciado!` });
                                })
                              }
                              className="w-full py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 text-white font-bold rounded cursor-pointer"
                            >
                              {hasAll ? 'Iniciar Fabrico' : 'Faltam Materiais'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {ftxSessions
                      .filter((cs) => !cs.claimed)
                      .map((cs) => {
                        const rem = Math.max(0, Math.ceil((cs.readyAt - nowTick) / 1000));
                        return (
                          <div
                            key={cs.id}
                            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between"
                          >
                            <span>
                              <strong>{cs.outputName}</strong> · {rem > 0 ? `Faltam ${rem}s` : 'Pronto!'}
                            </span>
                            <button
                              type="button"
                              disabled={loading || rem > 0}
                              onClick={() =>
                                handleGangOp(async () => {
                                  const r = await api.gangFtxCraft(characterId, 'claim', { craftId: cs.id });
                                  onCharacterSynced(r.character);
                                  setFeedback({ type: 'ok', msg: `${cs.outputName} adicionado à mochila!` });
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-600 disabled:bg-zinc-700 rounded font-bold cursor-pointer"
                            >
                              Recolher Armamento
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* BMR - MATANGA: Estufa + Rede + Lavagem */}
                {stats.factionId === 'bmr_matanga' && (
                  <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <Sprout size={14} /> Estufa Botânica & Branqueamento BMR
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          handleGangOp(async () => {
                            const r = await api.gangBmrGrow(characterId, 'plant');
                            onCharacterSynced(r.character);
                            setFeedback({ type: 'ok', msg: 'Lote plantado na estufa BMR!' });
                          })
                        }
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Plantar Semente
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          handleGangOp(async () => {
                            const r = await api.gangBmrGrow(characterId, 'sell_network');
                            onCharacterSynced(r.character);
                            soundFx.playCashRegister();
                            setFeedback({
                              type: 'ok',
                              msg: `Rede BMR: ${r.soldQty} unid. vendidas (+${(r.gain || 0).toLocaleString('pt-AO')} Kz)!`,
                            });
                          })
                        }
                        className="px-3 py-1.5 bg-amber-500 text-zinc-950 font-black rounded-lg cursor-pointer"
                      >
                        Vender na Rede
                      </button>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={bmrLaunderAmt}
                          onChange={(e) => setBmrLaunderAmt(Number(e.target.value))}
                          className="w-24 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono"
                        />
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            handleGangOp(async () => {
                              const r = await api.gangBmrGrow(characterId, 'launder_capped', {
                                amountKz: bmrLaunderAmt,
                              });
                              onCharacterSynced(r.character);
                              soundFx.playCashRegister();
                              setFeedback({
                                type: 'ok',
                                msg: `Branqueamento BMR: +${(r.laundered || 0).toLocaleString('pt-AO')} Kz no banco (taxa ${r.tax || 0} Kz)`,
                              });
                            })
                          }
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg cursor-pointer"
                        >
                          Branquear (Taxa 12%)
                        </button>
                      </div>
                    </div>
                    {bmrBatches
                      .filter((b) => b.stage !== 'harvested')
                      .map((b) => {
                        const rem = Math.max(0, Math.ceil((b.readyAt - nowTick) / 1000));
                        return (
                          <div
                            key={b.id}
                            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between"
                          >
                            <span>
                              Lote #{b.id.slice(-4)} · {rem > 0 ? `Crescimento: ${rem}s` : 'Pronto para colheita!'}
                            </span>
                            <button
                              type="button"
                              disabled={loading || rem > 0}
                              onClick={() =>
                                handleGangOp(async () => {
                                  const r = await api.gangBmrGrow(characterId, 'harvest', { batchId: b.id });
                                  onCharacterSynced(r.character);
                                  setFeedback({ type: 'ok', msg: 'Colheita recolhida para a mochila!' });
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-600 disabled:bg-zinc-700 rounded font-bold cursor-pointer"
                            >
                              Colher
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Comum às 3 gangues: Baú Partilhado + Disputa Territorial */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                    <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Package size={14} /> Baú Partilhado da Facção
                    </div>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {(gangFaction?.stash || []).length === 0 ? (
                        <p className="text-zinc-500 text-[11px]">Baú vazio.</p>
                      ) : (
                        (gangFaction?.stash || []).map((st) => (
                          <div key={st.id} className="flex justify-between items-center bg-zinc-900 px-2 py-1 rounded">
                            <span>
                              {st.name} x{st.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() =>
                                handleGangOp(async () => {
                                  const r = await api.gangStash(characterId, 'take', st.id);
                                  onCharacterSynced(r.character);
                                  setFeedback({ type: 'ok', msg: `Retiraste ${st.name} do baú.` });
                                })
                              }
                              className="px-2 py-0.5 bg-sky-700 rounded text-[10px] font-bold cursor-pointer"
                            >
                              Retirar
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {myInventory.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-zinc-800">
                        {myInventory.slice(0, 4).map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            disabled={loading}
                            onClick={() =>
                              handleGangOp(async () => {
                                const r = await api.gangStash(characterId, 'store', it.id);
                                onCharacterSynced(r.character);
                                setFeedback({ type: 'ok', msg: `Guardaste ${it.name} no baú.` });
                              })
                            }
                            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] cursor-pointer"
                          >
                            + Guardar {it.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Flag size={14} /> Disputa Territorial por Bairro
                    </div>
                    <div className="flex gap-1.5">
                      <select
                        value={disputeDistrict}
                        onChange={(e) => setDisputeDistrict(e.target.value as DistrictId)}
                        className="flex-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs"
                      >
                        {LUANDA_DISTRICTS.slice(0, 11).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          handleGangOp(async () => {
                            await api.gangTerritory(characterId, 'start_dispute', disputeDistrict);
                            setFeedback({ type: 'ok', msg: `Disputa territorial iniciada em ${disputeDistrict}!` });
                          })
                        }
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Contestar
                      </button>
                    </div>
                    {activeDispute && (
                      <div className="p-2 bg-red-950/40 border border-red-500/50 rounded-lg flex items-center justify-between gap-2">
                        <span className="text-[11px]">
                          Em disputa: <strong className="uppercase">{activeDispute.district}</strong>
                        </span>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            handleGangOp(async () => {
                              await api.gangTerritory(characterId, 'capture', activeDispute.district);
                              soundFx.playCashRegister();
                              setFeedback({ type: 'ok', msg: 'Território capturado com sucesso!' });
                            })
                          }
                          className="px-2.5 py-1 bg-amber-500 text-zinc-950 font-black rounded text-[11px] cursor-pointer"
                        >
                          Capturar Zona
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {factions.map((fac) => {
              const isMember = stats.factionId === fac.id;
              const isLeader = fac.leaderId === characterId;
              const meMember = fac.members.find((m) => m.characterId === characterId);
              const myRankDef = fac.ranks.find((r) => r.level === (meMember?.level || 0));
              const perms = myRankDef?.permissions;
              const canManageAny =
                isLeader ||
                Boolean(
                  perms &&
                    (perms.canPromote ||
                      perms.canDemote ||
                      perms.canKick ||
                      perms.canAppointSubleader ||
                      perms.canEditAnnouncement ||
                      perms.canWithdrawTreasury)
                );
              const maxRankLevel = fac.ranks[fac.ranks.length - 1]?.level || 4;

              return (
                <div
                  key={fac.id}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    fac.suspended
                      ? 'bg-red-950/25 border-red-500/60'
                      : isMember
                        ? 'bg-blue-950/30 border-blue-500/70'
                        : 'bg-zinc-800/60 border-zinc-700/70'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-white flex flex-wrap items-center gap-2">
                        {fac.name}
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-300">
                          {fac.type}
                        </span>
                        {fac.suspended && (
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-600/30 text-red-300">
                            Suspensa
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">{fac.announcement}</p>
                    </div>
                    <div className="text-right text-xs font-mono tabular-nums">
                      <div className="text-emerald-400 font-bold">Cofre: {fac.treasuryKz.toLocaleString('pt-AO')} Kz</div>
                      <div className="text-zinc-400 flex items-center justify-end gap-1">
                        <Users size={12} /> {fac.members.length} membros · Líder: {fac.leaderName}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
                    {fac.ranks.map((rk) => (
                      <span key={rk.level} className="px-1.5 py-0.5 bg-zinc-950/80 border border-zinc-800 rounded tabular-nums">
                        Nv.{rk.level} {rk.name} ({rk.salaryKz.toLocaleString('pt-AO')} Kz)
                      </span>
                    ))}
                  </div>

                  {(() => {
                    const station = FACTION_CITY_STATIONS.find((s) => s.factionId === fac.id);
                    if (!station) return null;
                    return (
                      <div className="p-2.5 bg-zinc-950/75 border border-amber-500/35 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-bold text-amber-300">
                            Função na Cidade: {station.stationName}
                          </div>
                          <div className="text-[11px] text-zinc-300">{station.subtitle}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {onSetGpsWaypoint && (
                            <button
                              type="button"
                              onClick={() => {
                                onSetGpsWaypoint({
                                  label: station.stationName,
                                  x: station.pos[0],
                                  z: station.pos[2],
                                });
                                onClose();
                              }}
                              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <Navigation size={11} /> GPS Posto
                            </button>
                          )}
                          {isMember && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleFactionStation(station.stationId)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg text-[11px] cursor-pointer"
                            >
                              Operação Rápida (+{station.payoutKz.toLocaleString('pt-AO')} Kz)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex flex-wrap items-center gap-2">
                    {isMember ? (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleFaction(fac.id, 'leave')}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg pointer-events-auto cursor-pointer"
                        >
                          Sair ({stats.factionRank})
                        </button>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={treasuryAmt}
                            onChange={(e) => setTreasuryAmt(Number(e.target.value))}
                            className="w-24 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono tabular-nums"
                          />
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleFaction(fac.id, 'deposit_treasury', { amountKz: treasuryAmt })}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg pointer-events-auto cursor-pointer"
                          >
                            Depositar Cofre
                          </button>
                          {(isLeader || perms?.canWithdrawTreasury) && !fac.suspended && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() =>
                                handleFactionManage(fac.id, 'withdraw_treasury', { amountKz: treasuryAmt })
                              }
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <Wallet size={12} /> Levantar
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={loading || Boolean(fac.suspended)}
                        onClick={() => handleFaction(fac.id, 'join')}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white text-xs font-bold rounded-lg pointer-events-auto cursor-pointer"
                      >
                        {fac.suspended ? 'Organização Suspensa' : 'Alistar-se / Entrar'}
                      </button>
                    )}

                    {fac.basePos && onSetGpsWaypoint && (
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playInteract();
                          onSetGpsWaypoint({
                            label: fac.name,
                            x: fac.basePos![0],
                            z: fac.basePos![2],
                          });
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg flex items-center gap-1 pointer-events-auto cursor-pointer"
                      >
                        <Navigation size={12} /> Marcar Morro/Base GPS
                      </button>
                    )}

                    {onApplySkinPreset &&
                      SKIN_PRESETS.filter((p) => p.factionId === fac.id).map((preset) => (
                        <button
                          type="button"
                          key={preset.id}
                          disabled={loading}
                          onClick={async () => {
                            await onApplySkinPreset(preset);
                            setFeedback({ type: 'ok', msg: `Skin equipada: ${preset.label}!` });
                          }}
                          className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 pointer-events-auto cursor-pointer"
                        >
                          <Sparkles size={12} /> {preset.label}
                        </button>
                      ))}
                  </div>

                  {canManageAny && !fac.suspended && (
                    <div className="pt-2.5 border-t border-zinc-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-amber-400">
                          Gestão Hierárquica ({isLeader ? 'Líder Principal' : stats.factionRank})
                        </span>
                      </div>

                      {(isLeader || perms?.canEditAnnouncement) && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={announcementDraft[fac.id] ?? fac.announcement}
                            onChange={(e) =>
                              setAnnouncementDraft((prev) => ({ ...prev, [fac.id]: e.target.value }))
                            }
                            placeholder="Novo comunicado interno da organização..."
                            className="flex-1 px-2.5 py-1 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() =>
                              handleFactionManage(fac.id, 'edit_announcement', {
                                announcement: announcementDraft[fac.id] ?? fac.announcement,
                              })
                            }
                            className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Megaphone size={12} /> Guardar Comunicado
                          </button>
                        </div>
                      )}

                      {fac.members.length > 0 && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {fac.members.map((m) => {
                            const isOnline = onlineIds.has(m.characterId);
                            const targetIsLeader = m.characterId === fac.leaderId;
                            const chosenRank = rankSelectByMember[m.characterId] ?? m.level;
                            return (
                              <div
                                key={m.characterId}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs bg-zinc-950/75 px-2.5 py-1.5 rounded-lg border border-zinc-800"
                              >
                                <div>
                                  <span className="font-bold text-white">{m.name}</span>{' '}
                                  <span className="text-zinc-400">
                                    — {m.rank} (Nv.{m.level}) · {isOnline ? 'Online' : 'Offline'}
                                  </span>
                                </div>
                                {!targetIsLeader && m.characterId !== characterId && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {(isLeader || perms?.canPromote) && m.level + 1 < maxRankLevel && (
                                      <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() =>
                                          handleFactionManage(fac.id, 'promote', { targetCharId: m.characterId })
                                        }
                                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 rounded text-[11px] font-bold flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <ArrowUp size={11} /> Promover
                                      </button>
                                    )}
                                    {(isLeader || perms?.canDemote) && m.level > 1 && (
                                      <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() =>
                                          handleFactionManage(fac.id, 'demote', { targetCharId: m.characterId })
                                        }
                                        className="px-2 py-0.5 bg-amber-700 hover:bg-amber-600 rounded text-[11px] font-bold flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <ArrowDown size={11} /> Rebaixar
                                      </button>
                                    )}
                                    {(isLeader || perms?.canAppointSubleader) && fac.ranks.length >= 2 && (
                                      <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() =>
                                          handleFactionManage(fac.id, 'appoint_subleader', {
                                            targetCharId: m.characterId,
                                          })
                                        }
                                        className="px-2 py-0.5 bg-indigo-700 hover:bg-indigo-600 rounded text-[11px] font-bold cursor-pointer"
                                      >
                                        Sublíder
                                      </button>
                                    )}
                                    {isLeader && (
                                      <>
                                        <select
                                          value={chosenRank}
                                          onChange={(e) =>
                                            setRankSelectByMember((prev) => ({
                                              ...prev,
                                              [m.characterId]: Number(e.target.value),
                                            }))
                                          }
                                          className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-[11px]"
                                        >
                                          {fac.ranks
                                            .filter((r) => r.level < maxRankLevel)
                                            .map((r) => (
                                              <option key={r.level} value={r.level}>
                                                {r.name}
                                              </option>
                                            ))}
                                        </select>
                                        <button
                                          type="button"
                                          disabled={loading}
                                          onClick={() =>
                                            handleFactionManage(fac.id, 'set_rank', {
                                              targetCharId: m.characterId,
                                              rankLevel: chosenRank,
                                            })
                                          }
                                          className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 rounded text-[11px] font-bold cursor-pointer"
                                        >
                                          Aplicar
                                        </button>
                                      </>
                                    )}
                                    {(isLeader || perms?.canKick) && (
                                      <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() =>
                                          handleFactionManage(fac.id, 'kick', { targetCharId: m.characterId })
                                        }
                                        className="px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-[11px] font-bold cursor-pointer"
                                      >
                                        Expulsar
                                      </button>
                                    )}
                                  </div>
                                )}
                                {targetIsLeader && (
                                  <span className="text-[10px] font-bold text-amber-400">
                                    Líder (Nomeação Admin God)
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {(fac.auditLogs || []).length > 0 && (
                        <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800 max-h-24 overflow-y-auto text-[10px] text-zinc-400 space-y-0.5">
                          <div className="font-bold text-zinc-300 uppercase">Registo Recente</div>
                          {(fac.auditLogs || []).slice(0, 6).map((al) => (
                            <div key={al.id}>
                              <span className="text-amber-300">{al.actorName}</span>: {al.details}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'crime' && (
          <div className="space-y-3">
            <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-200">
              Operações Ilegais de Roleplay aumentam o teu nível de Procurado e disparam alertas reais em tempo real para a Polícia Nacional!
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 bg-zinc-800/70 border border-zinc-700 rounded-xl space-y-2">
                <h4 className="font-bold text-sm text-white">Assaltar Estabelecimento</h4>
                <p className="text-xs text-zinc-400">Exige Kit de Arrombamento (Mercado Ilegal de Viana). Recompensa 7.500–12.000 Kz.</p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCrime('rob_store')}
                  className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Iniciar Assalto Loja (+2 ★)
                </button>
              </div>

              <div className="p-4 bg-zinc-800/70 border border-zinc-700 rounded-xl space-y-2">
                <h4 className="font-bold text-sm text-white">Assalto Grande ao Banco BFA</h4>
                <p className="text-xs text-zinc-400">Exige Kit de Arrombamento. Alerta Vermelho PNA. Recompensa 24.000–38.000 Kz.</p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCrime('rob_bank')}
                  className="w-full py-2 bg-red-700 hover:bg-red-600 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Assaltar Cofre BFA (+3 ★)
                </button>
              </div>

              <div className="p-4 bg-zinc-800/70 border border-zinc-700 rounded-xl space-y-2">
                <h4 className="font-bold text-sm text-white">Entregar Contrabando</h4>
                <p className="text-xs text-zinc-400">Entrega Mercadoria Sem Fatura no Beco de Viana por 13.500 Kz líquidos.</p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCrime('smuggle')}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Descarregar Contrabando (+1 ★)
                </button>
              </div>

              <div className="p-4 bg-zinc-800/70 border border-zinc-700 rounded-xl space-y-2">
                <h4 className="font-bold text-sm text-white">Branqueamento de Capitais (RP)</h4>
                <p className="text-xs text-zinc-400">Converte Kwanzas vivos sujos para conta bancária (-20% comissão).</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={launderAmt}
                    onChange={(e) => setLaunderAmt(Number(e.target.value))}
                    className="w-1/2 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono tabular-nums"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleCrime('launder')}
                    className="w-1/2 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Branquear
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2 p-4 bg-red-950/45 border-2 border-red-500/70 rounded-xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black text-sm text-red-200 uppercase">
                    ☢️ Assalto ao Tesouro das FAA ({FAA_HEIST_REWARD_KZ.toLocaleString('pt-AO')} Kz)
                  </h4>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-red-900/70 border border-red-400/50 rounded text-amber-300">
                    Cooldown 5 min · Exclusivo Facção Criminosa
                  </span>
                </div>
                <p className="text-xs text-zinc-300">
                  Invade o Paiol/Cofre Militar das FAA para roubar {FAA_HEIST_REWARD_KZ.toLocaleString('pt-AO')} Kz! Ao iniciar o roubo, a Polícia PNA e as Forças Armadas FAA abrem fogo letal até seres abatido ou preso. Invasores sem autorização são executados a tiro!
                </p>
                <div className="flex flex-wrap gap-2">
                  {onSetGpsWaypoint && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetGpsWaypoint({
                          label: 'Cofre Militar FAA (100.000 Kz)',
                          x: FAA_VAULT_POS[0],
                          z: FAA_VAULT_POS[2],
                        });
                        onClose();
                      }}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Navigation size={13} /> Marcar Cofre FAA no GPS
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleFaaHeist}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg cursor-pointer"
                  >
                    Assaltar Tesouro das FAA (+{FAA_HEIST_REWARD_KZ.toLocaleString('pt-AO')} Kz)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
