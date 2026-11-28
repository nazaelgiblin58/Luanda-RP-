/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { GameEngine, VehicleTelemetry } from './game/engine/gameEngine';
import {
  AccountInfo,
  AirportFlightDef,
  AnimationState,
  ChatMessage,
  GlobalDjState,
  GameSettings,
  GpsWaypoint,
  HudPreferences,
  InteractableObject,
  JobCatalog,
  normalizeGraphicsQuality,
  OwnedVehicleRecord,
  PlayerCustomization,
  PlayerStats,
  PoliticsState,
  PropertyRecord,
  SharedWorldVehicle,
  SkinPreset,
  TransactionRecord,
  WeaponId,
  WeatherForecastData,
  WeatherMode,
  WeatherType,
  WorldDynamicState,
} from './game/types';
import {
  AIRPORT_FLIGHTS,
  ANGOLAN_DISHES,
  JOBS_CATALOG,
  LUANDA_DISTRICTS,
  normalizeWeatherType,
  SHOP_CATALOG,
  WEAPON_CATALOG,
} from './game/data/catalog';
import {
  DEFAULT_SPAWN_POS,
  FAA_BASE_BOUNDS,
  getAssignedCellData,
  PRISON_RELEASE_POS,
} from './game/city/terrainPhysics';
import { InemaDispatchState } from './game/city/trafficSystem';
import {
  api,
  API_BASE,
  CharacterRecord,
  DroppedItemRecord,
  getStoredCharId,
  getStoredToken,
  setStoredCharId,
  setStoredToken,
} from './services/api';
import { GameHUD } from './components/hud/GameHUD';
import { AuthScreen } from './components/screens/AuthScreen';
import { StartScreen } from './components/screens/StartScreen';
import { CharacterSelectModal } from './components/modals/CharacterSelectModal';
import { IdentityModal } from './components/modals/IdentityModal';
import { AtmModal } from './components/modals/AtmModal';
import { ShopCategoryFilter, ShopModal } from './components/modals/ShopModal';
import { InventoryModal } from './components/modals/InventoryModal';
import { VehicleModal } from './components/modals/VehicleModal';
import { MapModal } from './components/modals/MapModal';
import { PhoneModal } from './components/modals/PhoneModal';
import { JobsFactionsModal } from './components/modals/JobsFactionsModal';
import { JusticeHospitalModal } from './components/modals/JusticeHospitalModal';
import { PropertyModal } from './components/modals/PropertyModal';
import { MissionsModal } from './components/modals/MissionsModal';
import { AdminGodModal } from './components/modals/AdminGodModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { PoliticsModal } from './components/modals/PoliticsModal';
import { DjModal } from './components/modals/DjModal';
import { PrefeituraModal } from './components/modals/PrefeituraModal';
import { soundFx } from './game/audio/soundFx';
import { VoiceChatManager } from './game/audio/voiceChat';
import { useFirebase } from './contexts/FirebaseContext';
import { useSupabase } from './contexts/SupabaseContext';
import { syncCharacterToFirestore } from './services/firestoreSync';
import { describeFirestoreError } from './firebase';

type ActiveModal =
  | 'start'
  | 'identity'
  | 'inventory'
  | 'atm'
  | 'shop'
  | 'vehicle'
  | 'map'
  | 'phone'
  | 'jobs'
  | 'justice'
  | 'property'
  | 'politics'
  | 'prefeitura'
  | 'dj'
  | 'missions'
  | 'admin'
  | 'settings'
  | null;

const SETTINGS_STORAGE_KEY = 'luandarp_settings_v1';
const HUD_PREFS_STORAGE_KEY = 'luandarp_hud_prefs_v1';

const DEFAULT_SETTINGS: GameSettings = {
  graphicsQuality: 'medium',
  cameraSensitivity: 0.8,
  invertY: false,
  cameraDistance: 4.8,
  renderDistance: 400,
  resolutionScale: 1.0,
  targetFps: 60,
  autoScaleResolution: true,
  soundVolume: 0.6,
  musicVolume: 0.4,
  muted: false,
  shadows: true,
  timeSpeed: 1.0,
  weather: 'ensolarado',
};

const DEFAULT_HUD_PREFS: HudPreferences = {
  hudScale: 1.0,
  showMinimap: true,
  showChatPreview: true,
  showQuickHints: true,
};

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export default function App() {
  const { firebaseUser, authReady, signOutFirebase } = useFirebase();
  const {
    session: supabaseSession,
    authReady: supabaseAuthReady,
    passwordRecoveryMode,
    signOutSupabase,
  } = useSupabase();
  const firebaseUserRef = useRef(firebaseUser);
  firebaseUserRef.current = firebaseUser;
  const authReadyRef = useRef(authReady);
  authReadyRef.current = authReady;
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const accountRef = useRef<AccountInfo | null>(null);
  accountRef.current = account;
  const [selectingChar, setSelectingChar] = useState(false);
  const [character, setCharacter] = useState<CharacterRecord | null>(null);
  const lastCustomizationJsonRef = useRef<string>('');
  const [vehicles, setVehicles] = useState<OwnedVehicleRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [settings, setSettings] = useState<GameSettings>(() => {
    const loaded = readStoredJson(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
    return { ...loaded, graphicsQuality: normalizeGraphicsQuality(loaded.graphicsQuality) };
  });
  const [hudPrefs, setHudPrefs] = useState<HudPreferences>(() => readStoredJson(HUD_PREFS_STORAGE_KEY, DEFAULT_HUD_PREFS));

  const [currentDistrict, setCurrentDistrict] = useState('Centro & Baixa');
  const currentDistrictRef = useRef(currentDistrict);
  currentDistrictRef.current = currentDistrict;
  const [timeString, setTimeString] = useState('15:30');
  const [timeOfDay, setTimeOfDay] = useState(15.5);
  const [currentWeather, setCurrentWeather] = useState<WeatherType>('ensolarado');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('auto');
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecastData | null>(null);
  const weatherModeRef = useRef<WeatherMode>('auto');
  weatherModeRef.current = weatherMode;
  const [isDriving, setIsDriving] = useState(false);
  const [vehicleTelemetry, setVehicleTelemetry] = useState<VehicleTelemetry | undefined>(undefined);
  const [nearInteractable, setNearInteractable] = useState<InteractableObject | null>(null);
  const [nearCivilianNpc, setNearCivilianNpc] = useState<{ name: string; isThreatened: boolean } | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>('start');
  const [shopContext, setShopContext] = useState<{ type: ShopCategoryFilter; title: string }>({
    type: 'food',
    title: 'Quiosque Gastronómico de Luanda',
  });
  const [vehicleInitialTab, setVehicleInitialTab] = useState<'garage' | 'dealership' | 'workshop' | 'express'>('garage');
  const [justiceInitialTab, setJusticeInitialTab] = useState<'police' | 'court' | 'hospital' | 'lawyers'>('police');
  const [jobsInitialTab, setJobsInitialTab] = useState<'jobs' | 'factions' | 'crime'>('jobs');
  const [jobsInitialFocusId, setJobsInitialFocusId] = useState<'yango' | 'ende' | 'pescador' | 'elisal' | 'fazenda' | undefined>(undefined);
  const [propertyInitialTab, setPropertyInitialTab] = useState<'houses' | 'businesses'>('houses');
  const [focusedPropertyId, setFocusedPropertyId] = useState<string | null>(null);
  const [cookingCutscene, setCookingCutscene] = useState<{ dish: string } | null>(null);
  const cookingCutsceneTimerRef = useRef<number | null>(null);
  const [airportModalOpen, setAirportModalOpen] = useState(false);
  const [airportPayWith, setAirportPayWith] = useState<'bank' | 'cash'>('bank');
  const [airportCheckinLoading, setAirportCheckinLoading] = useState(false);
  const [flightCutscene, setFlightCutscene] = useState<AirportFlightDef | null>(null);
  const [showEmotes, setShowEmotes] = useState(false);
  const [worldDynamicState, setWorldDynamicState] = useState<WorldDynamicState | null>(null);
  const [djState, setDjState] = useState<GlobalDjState | null>(null);
  const [djServerOffsetMs, setDjServerOffsetMs] = useState(0);
  const [afkWarning, setAfkWarning] = useState<string | null>(null);
  const [politicsState, setPoliticsState] = useState<PoliticsState | null>(null);
  const propertiesRef = useRef<PropertyRecord[]>([]);
  const currentInteriorPropIdRef = useRef<string | null>(null);
  const [busStatus, setBusStatus] = useState<{
    isRiding: boolean;
    busLabel?: string;
    currentStop?: string | null;
    nextStop?: string;
    nearbyBusName?: string | null;
    nearbyBusDist?: number;
  } | null>(null);
  const [inemaState, setInemaState] = useState<InemaDispatchState>('idle');
  const [isHouseBlackout, setIsHouseBlackout] = useState(false);
  const afkWarningTimeoutRef = useRef<number | null>(null);
  const djStateRef = useRef<GlobalDjState | null>(null);
  djStateRef.current = djState;
  const [gpsWaypoint, setGpsWaypoint] = useState<GpsWaypoint | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeCitizensCount, setActiveCitizensCount] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [isAiming, setIsAiming] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [ammoByWeapon, setAmmoByWeapon] = useState<Record<string, { mag: number; reserve: number }>>({
    pistola_9mm: { mag: 12, reserve: 36 },
    espingarda_12: { mag: 6, reserve: 18 },
    ak47_tatica: { mag: 30, reserve: 60 },
  });
  const lastShotMsRef = useRef(0);
  const pointerDownPosRef = useRef<{ x: number; y: number; button: number } | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const nearInteractableRef = useRef(nearInteractable);
  nearInteractableRef.current = nearInteractable;
  const isDrivingRef = useRef(isDriving);
  isDrivingRef.current = isDriving;
  const characterRef = useRef(character);
  characterRef.current = character;
  const activeModalRef = useRef(activeModal);
  activeModalRef.current = activeModal;
  const arrestInFlightRef = useRef(false);
  const farmCargoReadyRef = useRef(false);
  const voiceChatRef = useRef<VoiceChatManager | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const coarse =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    setIsTouchDevice(!!coarse);
  }, []);

  const isCurrentlyJailed = Boolean(character && character.stats.jailUntil > Date.now());
  useEffect(() => {
    if (!isCurrentlyJailed) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isCurrentlyJailed]);

  // Sincroniza estado do personagem recebido da API com React + Engine
  const syncCharacterRecord = useCallback((rec: CharacterRecord, nextVehicles?: OwnedVehicleRecord[], nextTxs?: TransactionRecord[]) => {
    setCharacter(rec);
    if (nextVehicles) setVehicles(nextVehicles);
    if (nextTxs) setTransactions(nextTxs);
    if (engineRef.current) {
      engineRef.current.syncStats(rec.stats);
      const nextCustJson = JSON.stringify(rec.customization);
      if (nextCustJson !== lastCustomizationJsonRef.current) {
        lastCustomizationJsonRef.current = nextCustJson;
        engineRef.current.player.updateCustomization(rec.customization);
        engineRef.current.multiplayer.sendCustomizationUpdate(rec.customization);
      }
      if (nextVehicles) {
        engineRef.current.reconcileOwnedVehicles(nextVehicles, rec.id);
      }
    }
  }, []);

  const startCookingCutscene = useCallback((dish?: string) => {
    const selectedDish = dish || ANGOLAN_DISHES[Math.floor(Math.random() * ANGOLAN_DISHES.length)];
    engineRef.current?.triggerCookingEffect(4500);
    setCookingCutscene({ dish: selectedDish });
    if (cookingCutsceneTimerRef.current) clearTimeout(cookingCutsceneTimerRef.current);
    cookingCutsceneTimerRef.current = window.setTimeout(() => {
      setCookingCutscene(null);
    }, 4500);
  }, []);

  const spawnSharedVehicleInEngine = useCallback((sv: SharedWorldVehicle) => {
    if (!engineRef.current) return null;
    const ownedRec: OwnedVehicleRecord = {
      id: sv.id,
      ownerId: sv.ownerId,
      modelId: sv.modelId,
      name: sv.name,
      type: sv.type,
      plate: sv.plate,
      color: sv.color,
      accentColor: sv.accentColor,
      skinId: sv.skinId,
      engineLevel: 1,
      suspensionLevel: 1,
      wheelStyle: sv.type === 'pickup' || sv.type === 'truck' ? 'offroad' : 'padrao',
      fuel: sv.fuel,
      health: sv.health,
      isLocked: sv.isLocked,
      isStoredInGarage: false,
      isImpounded: false,
      finesKz: 0,
      position: sv.position,
      rotationY: sv.rotationY,
      isRental: Boolean(sv.isTestDrive),
      rentedUntil: sv.testDriveExpiresAt,
      mileageKm: sv.mileageKm || 0,
    };
    return engineRef.current.spawnOwnedVehicle(ownedRec);
  }, []);

  const loadCharacterSession = useCallback(
    async (charId: string) => {
      try {
        const [res, propsResInitial] = await Promise.all([
          api.getCharacter(charId),
          api.getProperties().catch(() => null),
        ]);
        if (propsResInitial?.properties) {
          propertiesRef.current = propsResInitial.properties;
        }
        setStoredCharId(charId);
        setSelectingChar(false);
        setCharacter(res.character);
        setVehicles(res.vehicles);
        setTransactions(res.transactions);
        const fbUser = firebaseUserRef.current;
        const accEmail = accountRef.current?.email?.toLowerCase();
        if (
          authReadyRef.current &&
          fbUser &&
          (!accEmail || fbUser.email?.toLowerCase() === accEmail)
        ) {
          void syncCharacterToFirestore(
            fbUser,
            res.character,
            currentDistrictRef.current
          ).catch((err) => {
            const msg = describeFirestoreError(err);
            if (msg.includes('Quota')) showToast(msg);
          });
        }
        if (res.worldConfig) {
          const normalized = normalizeWeatherType(res.worldConfig.weather);
          setCurrentWeather(normalized);
          setWeatherMode(res.worldConfig.weatherMode || 'auto');
          setTimeOfDay(res.worldConfig.timeOfDay);
          setSettings((prev) => ({
            ...prev,
            weather: normalized,
            timeSpeed: res.worldConfig.timeSpeed,
          }));
        }
        Promise.allSettled([
          api.djGet(),
          api.politicsGet(),
          propsResInitial ? Promise.resolve(propsResInitial) : api.getProperties(),
          api.getWeatherForecast({ timeOfDay: res.worldConfig?.timeOfDay }),
          api.getStatus(),
        ]).then(([djRes, polRes, propsRes, weatherRes, statusRes]) => {
          if (djRes.status === 'fulfilled') {
            const offset = djRes.value.serverNow - Date.now();
            setDjState(djRes.value.djState);
            setDjServerOffsetMs(offset);
            soundFx.syncGlobalDjTrack(djRes.value.djState, djRes.value.serverNow);
            engineRef.current?.setDjVisualActive(
              Boolean(djRes.value.djState.currentTrack && djRes.value.djState.currentTrack.endsAt > djRes.value.serverNow)
            );
          }
          if (polRes.status === 'fulfilled') {
            setPoliticsState(polRes.value.politics);
          }
          if (propsRes.status === 'fulfilled') {
            propertiesRef.current = propsRes.value.properties;
          }
          if (weatherRes.status === 'fulfilled') {
            const fc = weatherRes.value.forecast;
            setWeatherForecast(fc);
            setWeatherMode(fc.mode);
            engineRef.current?.setWeatherTelemetry(fc.current);
            if (fc.mode === 'auto') {
              const nw = normalizeWeatherType(fc.activeWeather);
              setCurrentWeather(nw);
              engineRef.current?.setWeather(nw);
              setSettings((prev) => ({ ...prev, weather: nw }));
            }
          }
          if (statusRes.status === 'fulfilled' && statusRes.value.worldState) {
            setWorldDynamicState(statusRes.value.worldState);
          }
        });
        setActiveModal('start');
      } catch (err: unknown) {
        setStoredCharId('');
        setSelectingChar(true);
        showToast(err instanceof Error ? err.message : 'Seleciona um personagem.');
      }
    },
    [showToast]
  );

  // Bootstrap da sessão autenticada (Supabase + Backend JWT)
  useEffect(() => {
    if (!supabaseAuthReady) return;
    let cancelled = false;
    (async () => {
      if (passwordRecoveryMode) {
        if (!cancelled) {
          setAccount(null);
          setCharacter(null);
          setBooting(false);
        }
        return;
      }

      if (supabaseSession?.access_token) {
        try {
          const res = await api.supabaseLogin(supabaseSession.access_token);
          if (cancelled) return;
          setStoredToken(res.token);
          setAccount(res.account);
          const savedCharId = getStoredCharId();
          if (savedCharId) {
            await loadCharacterSession(savedCharId);
          } else {
            setSelectingChar(true);
          }
          if (!cancelled) setBooting(false);
          return;
        } catch (err) {
          if (err instanceof Error && (err.message.includes('banida') || err.message.includes('suspensa') || err.message.includes('aprovação'))) {
            void signOutSupabase();
            api.logout();
            showToast(err.message);
            if (!cancelled) setBooting(false);
            return;
          }
        }
      }

      const token = getStoredToken();
      if (!token) {
        if (!cancelled) setBooting(false);
        return;
      }
      try {
        const me = await api.getMe();
        if (cancelled) return;
        setAccount(me.account);
        const savedCharId = getStoredCharId();
        if (savedCharId) {
          await loadCharacterSession(savedCharId);
        } else {
          setSelectingChar(true);
        }
      } catch {
        api.logout();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseAuthReady, supabaseSession?.access_token, passwordRecoveryMode, loadCharacterSession, signOutSupabase, showToast]);

  // Escuta alterações em tempo real no perfil Supabase (cargo ou suspensão administrativa)
  useEffect(() => {
    const onProfileUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ role?: AccountInfo['role']; account_status?: string; ban_reason?: string }>).detail;
      if (!detail) return;
      if (detail.account_status === 'banned' || detail.account_status === 'suspended') {
        showToast(detail.ban_reason || 'A tua conta foi suspensa ou banida pela Administração.');
        void signOutSupabase();
        api.logout();
        setCharacter(null);
        setAccount(null);
        setSelectingChar(false);
        setActiveModal('start');
        return;
      }
      if (detail.role) {
        setAccount((prev) => (prev ? { ...prev, role: detail.role!, accountStatus: 'active' } : prev));
      }
    };
    window.addEventListener('luanda:supabase_profile_update', onProfileUpdate);
    return () => window.removeEventListener('luanda:supabase_profile_update', onProfileUpdate);
  }, [signOutSupabase, showToast]);

  // Atualiza drops visuais no mundo 3D
  const syncDroppedMeshes = useCallback((drops: DroppedItemRecord[]) => {
    engineRef.current?.syncDroppedItems(drops);
  }, []);

  // Inicialização do Game Engine Three.js quando o personagem é carregado
  useEffect(() => {
    if (!canvasMountRef.current || !character || !account) return;
    setWebglError(null);
    lastCustomizationJsonRef.current = JSON.stringify(character.customization);

    const initialRot = typeof character.rotationY === 'number' && character.rotationY !== 0 ? character.rotationY : Math.PI / 2;
    let computedInitialPos = { x: character.position.x, y: character.position.y || 0, z: character.position.z };
    let computedInitialRot = initialRot;
    if (character.stats.jailUntil > Date.now()) {
      const cell = getAssignedCellData(character.stats.assignedCell || 1);
      computedInitialPos = { x: cell.x, y: 0, z: cell.z };
      computedInitialRot = Math.PI;
    } else if (
      character.stats.homePropertyId &&
      Math.hypot(character.position.x - DEFAULT_SPAWN_POS.x, character.position.z - DEFAULT_SPAWN_POS.z) < 0.35
    ) {
      const homeProp = propertiesRef.current.find((p) => p.id === character.stats.homePropertyId);
      if (homeProp) {
        computedInitialPos = { x: homeProp.position[0], y: 0, z: homeProp.position[2] + 6 };
      }
    }

    let engine: GameEngine;
    try {
      engine = new GameEngine(
        canvasMountRef.current,
        character.customization,
        settings,
        character.stats,
      {
        authOptions: {
          token: getStoredToken(),
          characterId: character.id,
          badge: character.stats.factionRank || 'Cidadão',
          role: account.role,
          initialPosition: computedInitialPos,
          initialRotationY: computedInitialRot,
        },
        onNearInteractable: (obj) => setNearInteractable(obj),
        onDistrictChange: (districtName) => setCurrentDistrict(districtName),
        onStatsTick: (newStats) => {
          setCharacter((prev) => (prev ? { ...prev, stats: newStats } : prev));
        },
        onTimeUpdate: (str, hour) => {
          setTimeString(str);
          setTimeOfDay(hour);
        },
        onDrivingChange: (driving, vehicleName) => {
          setIsDriving(driving);
          if (driving && vehicleName) showToast(`A conduzir: ${vehicleName}`);
        },
        onVehicleTelemetry: (telemetry) => setVehicleTelemetry(telemetry),
        onBusStatusChange: (status) => setBusStatus(status),
        onInemaStatusChange: (state) => {
          setInemaState(state);
          if (state === 'returning') {
            showToast('🚑 Ambulância INEMA regressou ao Hospital Josina Machel.');
          }
        },
        onChatReceived: (msg) =>
          setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev.slice(-60), msg])),
        onCitizenCountChange: (count) => setActiveCitizensCount(count),
        onWorldSync: (ws) => {
          if (ws.weatherMode) {
            setWeatherMode(ws.weatherMode);
          }
          if (ws.forecast) {
            setWeatherForecast(ws.forecast);
            engine.setWeatherTelemetry(ws.forecast.current);
          }
          if (ws.weather) {
            const nw = normalizeWeatherType(ws.weather);
            setCurrentWeather(nw);
            engine.setWeather(nw);
          }
          if (typeof ws.timeOfDay === 'number') {
            engine.timeOfDay = ws.timeOfDay;
            setTimeOfDay(ws.timeOfDay);
          }
        },
        onDynamicWorldSync: (ws) => {
          setWorldDynamicState(ws);
        },
        onAdminEffect: async (eff) => {
          if (eff.action === 'refresh_character' || eff.action === 'heal' || eff.action === 'revive') {
            try {
              const refreshed = await api.getCharacter(character.id);
              syncCharacterRecord(refreshed.character, refreshed.vehicles, refreshed.transactions);
              if (eff.action === 'heal') showToast('Foste curado pela Administração!');
              if (eff.action === 'revive') showToast('Foste reanimado pelo INEMA!');
            } catch {}
          } else if (eff.action === 'teleport' && typeof eff.x === 'number' && typeof eff.z === 'number') {
            engine.teleport(eff.x, eff.z);
            showToast('Foste teleportado.');
          } else if (eff.action === 'freeze') {
            setCharacter((prev) =>
              prev ? { ...prev, stats: { ...prev.stats, isFrozen: !!eff.frozen } } : prev
            );
            if (engineRef.current) engineRef.current.currentStats.isFrozen = !!eff.frozen;
            showToast(eff.frozen ? 'Foste congelado pela moderação.' : 'Foste descongelado.');
          } else if (eff.action === 'kick' || eff.action === 'ban') {
            showToast(eff.reason || 'Desligado pela moderação.');
            api.logout();
            setCharacter(null);
            setAccount(null);
          }
        },
        onEmergencyAlert: (al) => {
          soundFx.playSiren();
          showToast(`${al.title}: ${al.message}`);
          engine.setGpsWaypoint({ label: al.title, x: al.x, z: al.z });
          setGpsWaypoint({ label: al.title, x: al.x, z: al.z });
        },
        onNotice: (msg) => {
          showToast(msg);
        },
        onCheckpointReached: async () => {
          const cur = characterRef.current;
          if (!cur) return;
          try {
            const res = await api.completeJobStep(cur.id, {
              x: engine.player.position.x,
              z: engine.player.position.z,
            });
            syncCharacterRecord(res.character);
            const job = JOBS_CATALOG.find((j) => j.id === res.character.stats.jobId);
            if (job) {
              const nextStep = job.steps[res.nextStepIndex];
              if (nextStep) {
                engine.setActiveCheckpoint(nextStep.pos, nextStep.radius, nextStep.label);
              }
              if (res.completedTurn) {
                showToast(`Turno concluído! +${res.payout.toLocaleString('pt-AO')} Kz depositados no Banco!`);
              } else {
                showToast(`Etapa concluída! Próximo ponto: ${nextStep?.label}`);
              }
            }
          } catch (err: unknown) {
            if (err instanceof Error) showToast(err.message);
          }
        },
        onFallImpact: (dmg) => {
          if (dmg >= 15) showToast(`Queda violenta! -${dmg} Vida`);
        },
        onHitRemotePlayer: async (targetCharacterId, targetName, damage, weaponId) => {
          const cur = characterRef.current;
          if (!cur) return;
          try {
            await api.combatHit(cur.id, targetCharacterId, damage, weaponId);
            showToast(`Acerto em ${targetName} (-${damage} HP)!`);
          } catch {}
        },
        onNearCivilianChange: (info) => setNearCivilianNpc(info),
        onCrimeTrigger: async (mode, npcLabel) => {
          const cur = characterRef.current;
          if (!cur || cur.stats.jailUntil > Date.now()) return;
          try {
            const res = await api.crimeAction(cur.id, 'rob_npc', { mode, npcLabel });
            syncCharacterRecord(res.character);
            soundFx.playSiren();
            if (mode === 'rob') {
              showToast(`🔫 Assalto a ${npcLabel}: +${(res.reward || 0).toLocaleString('pt-AO')} Kz! Polícia PNA a caminho!`);
            } else if (mode === 'threat') {
              showToast(`🚨 Ameaça armada a ${npcLabel}! Polícia PNA acionada!`);
            } else {
              showToast(`🚨 Agressão a ${npcLabel}! Estrelas de procurado ativadas!`);
            }
          } catch (err: unknown) {
            if (mode === 'rob' && err instanceof Error) {
              showToast(err.message);
            }
          }
        },
        onPlayerDamaged: (hp, dmg) => {
          soundFx.playHitMarker();
          if (hp <= 0) {
            showToast('🚨 Foste neutralizado pela Polícia PNA!');
          } else if (dmg >= 8) {
            showToast(`🚓 Tiro da PNA! -${dmg} HP (${Math.round(hp)} restante)`);
          }
        },
        onPoliceArrest: async (reason) => {
          const cur = characterRef.current;
          if (!cur || arrestInFlightRef.current) return;
          arrestInFlightRef.current = true;
          try {
            const res = await api.crimeAction(cur.id, 'police_capture', { reason });
            syncCharacterRecord(res.character);
            setIsAiming(false);
            engine.setAiming(false);
            if (res.character.position) {
              engine.teleport(res.character.position.x, res.character.position.z, Math.PI);
            }
            soundFx.playSiren();
            showToast(
              `🚓 DETIDO PELA PNA! Cela #${res.character.stats.assignedCell || 1} (${res.jailSeconds || 45}s, multa ${(res.fine || 0).toLocaleString('pt-AO')} Kz).`
            );
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Detido pela Polícia Nacional PNA.');
          } finally {
            window.setTimeout(() => {
              arrestInFlightRef.current = false;
            }, 3000);
          }
        },
        onDjSync: (dj, serverNow) => {
          setDjState(dj);
          setDjServerOffsetMs(serverNow - Date.now());
          soundFx.syncGlobalDjTrack(dj, serverNow);
          engine.setDjVisualActive(Boolean(dj.currentTrack && dj.currentTrack.endsAt > serverNow));
        },
        onPoliticsSync: (pol) => {
          setPoliticsState(pol);
        },
        onAfkWarning: (payload) => {
          setAfkWarning(payload.message);
          showToast(payload.message);
          if (afkWarningTimeoutRef.current) clearTimeout(afkWarningTimeoutRef.current);
          afkWarningTimeoutRef.current = window.setTimeout(() => setAfkWarning(null), 15000);
        },
        onAfkArrest: (payload) => {
          const cell = getAssignedCellData(payload.assignedCell || 1);
          setCharacter((prev) =>
            prev
              ? {
                  ...prev,
                  position: { x: cell.x, y: 0, z: cell.z },
                  stats: {
                    ...prev.stats,
                    jailUntil: payload.jailUntil,
                    assignedCell: payload.assignedCell,
                    jailReason: payload.reason,
                    wantedStars: 0,
                  },
                }
              : prev
          );
          engine.syncStats({
            ...(characterRef.current?.stats || engine.currentStats),
            jailUntil: payload.jailUntil,
            assignedCell: payload.assignedCell,
            jailReason: payload.reason,
            wantedStars: 0,
          });
          engine.teleport(cell.x, cell.z, Math.PI);
          soundFx.playSiren();
          setAfkWarning(null);
          showToast('⏰ Detido pela PNA por inatividade prolongada (72m AFK → 5h na Cela).');
        },
        onVoiceChunk: (payload) => {
          const eng = engineRef.current;
          if (eng && voiceChatRef.current) {
            voiceChatRef.current.playRemoteChunk(payload, eng.player.position);
          }
        },
      }
    );

    engineRef.current = engine;
    const initialRot = typeof character.rotationY === 'number' && character.rotationY !== 0 ? character.rotationY : Math.PI / 2;
    if (character.stats.jailUntil > Date.now()) {
      const cell = getAssignedCellData(character.stats.assignedCell || 1);
      engine.teleport(cell.x, cell.z, Math.PI);
    } else if (
      character.stats.homePropertyId &&
      Math.hypot(character.position.x - DEFAULT_SPAWN_POS.x, character.position.z - DEFAULT_SPAWN_POS.z) < 0.35
    ) {
      const homeProp = propertiesRef.current.find((p) => p.id === character.stats.homePropertyId);
      if (homeProp) {
        engine.teleport(homeProp.position[0], homeProp.position[2] + 6, initialRot);
      } else {
        engine.teleport(character.position.x, character.position.z, initialRot);
      }
    } else {
      engine.teleport(character.position.x, character.position.z, initialRot);
    }

    if (djStateRef.current) {
      const sNow = Date.now() + djServerOffsetMs;
      engine.setDjVisualActive(Boolean(djStateRef.current.currentTrack && djStateRef.current.currentTrack.endsAt > sNow));
    }
    if (weatherForecast?.current) {
      engine.setWeatherTelemetry(weatherForecast.current);
    }

    // Spawn viaturas pessoais fora da garagem
    vehicles.filter((v) => !v.isStoredInGarage && !v.isImpounded).forEach((v) => {
      engine.spawnOwnedVehicle(v);
    });

    // Ativa baliza de trabalho se houver turno em curso
    if (character.stats.jobId) {
      const job = JOBS_CATALOG.find((j) => j.id === character.stats.jobId);
      const step = job?.steps[character.jobStepIndex];
      if (step) {
        engine.setActiveCheckpoint(step.pos, step.radius, step.label);
      }
    }

    api.getDroppedItems().then((r) => syncDroppedMeshes(r.droppedItems)).catch(() => {});

    if (!voiceChatRef.current) {
      voiceChatRef.current = new VoiceChatManager();
    }
    voiceChatRef.current.setMuted(!!settings.muted);
    voiceChatRef.current.setVolume(settings.soundVolume);

    return () => {
      voiceChatRef.current?.stopTalking();
      setMicActive(false);
      engine.destroy();
      engineRef.current = null;
    };
    } catch (err: unknown) {
      setWebglError(
        err instanceof Error
          ? err.message
          : 'O teu navegador não suporta WebGL ou a aceleração gráfica está desativada.'
      );
      return;
    }
    // Inicializa apenas quando muda o ID do personagem selecionado
  }, [character?.id, account?.id]);

  // Auto-save periódico (30s) + keepalive ao fechar/sair da página
  useEffect(() => {
    if (!character) return;
    const buildSavePayload = () => {
      const eng = engineRef.current;
      const cur = characterRef.current;
      if (!eng || !cur) return null;
      return {
        id: cur.id,
        body: {
          position: {
            x: eng.player.position.x,
            y: eng.player.position.y,
            z: eng.player.position.z,
          },
          rotationY: eng.player.rotationY,
          hunger: cur.stats.hunger,
          thirst: cur.stats.thirst,
          energy: cur.stats.energy,
          sleep: cur.stats.sleep,
          health: cur.stats.health,
        },
      };
    };

    const timer = window.setInterval(async () => {
      const payload = buildSavePayload();
      if (!payload) return;
      try {
        await api.autosaveCharacter(payload.id, payload.body);
      } catch {}
      const fbUser = firebaseUserRef.current;
      const accEmail = accountRef.current?.email?.toLowerCase();
      if (
        authReadyRef.current &&
        fbUser &&
        characterRef.current &&
        (!accEmail || fbUser.email?.toLowerCase() === accEmail)
      ) {
        try {
          await syncCharacterToFirestore(
            fbUser,
            characterRef.current,
            currentDistrictRef.current
          );
        } catch (err) {
          const msg = describeFirestoreError(err);
          if (msg.includes('Quota')) showToast(msg);
        }
      }
    }, 30000);

    const handlePageHide = () => {
      const payload = buildSavePayload();
      const token = getStoredToken();
      if (payload && token) {
        try {
          const saveUrl = `${API_BASE}/api/characters/${encodeURIComponent(payload.id)}/autosave`;
          void fetch(saveUrl, {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload.body),
          });
        } catch {}
      }
      engineRef.current?.multiplayer.destroy();
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [character?.id]);

  const refreshWeatherForecast = useCallback(async (forceRefresh = false, hourOverride?: number) => {
    try {
      const hr = typeof hourOverride === 'number' ? hourOverride : engineRef.current?.timeOfDay;
      const res = await api.getWeatherForecast({ refresh: forceRefresh, timeOfDay: hr });
      setWeatherForecast(res.forecast);
      setWeatherMode(res.forecast.mode);
      engineRef.current?.setWeatherTelemetry(res.forecast.current);
      if (res.forecast.mode === 'auto') {
        const nw = normalizeWeatherType(res.forecast.activeWeather);
        setCurrentWeather(nw);
        engineRef.current?.setWeather(nw);
        setSettings((prev) => ({ ...prev, weather: nw }));
      }
    } catch {}
  }, []);

  // Atualização periódica (2 min) da meteorologia em tempo real para Luanda
  useEffect(() => {
    if (!character) return;
    refreshWeatherForecast(false);
    const id = window.setInterval(() => {
      refreshWeatherForecast(false);
    }, 120000);
    return () => clearInterval(id);
  }, [character?.id, refreshWeatherForecast]);

  const handleToggleDrive = useCallback(() => {
    if (!engineRef.current) return;
    if (characterRef.current && characterRef.current.stats.jailUntil > Date.now()) {
      showToast('Estás detido na Cela PNA! Paga a fiança ou cumpre a pena.');
      return;
    }
    if (engineRef.current.isDriving) {
      engineRef.current.exitVehicle();
      showToast('Saíste do veículo.');
    } else {
      engineRef.current.toggleDriveCandongueiro();
    }
  }, [showToast]);

  const handleRobNpc = useCallback(() => {
    const res = engineRef.current?.triggerRobNearestNpc();
    if (res && !res.ok && res.message) {
      showToast(res.message);
    }
  }, [showToast]);

  const handleToggleMic = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!voiceChatRef.current) {
      voiceChatRef.current = new VoiceChatManager();
    }
    const vc = voiceChatRef.current;
    if (vc.getTalking()) {
      vc.stopTalking();
      setMicActive(false);
      setMicError(null);
      showToast('Microfone desligado');
      return;
    }
    const res = await vc.startTalking((base64, mimeType) => {
      const e = engineRef.current;
      if (!e) return;
      e.multiplayer.sendVoiceChunk(base64, mimeType, e.player.position, 'proximity');
    });
    if (res.ok) {
      setMicActive(true);
      setMicError(null);
      showToast('Microfone ligado — voz por proximidade até 55m');
    } else {
      setMicActive(false);
      setMicError(res.error || 'Não foi possível ligar o microfone.');
      showToast(res.error || 'Permissão de microfone recusada.');
    }
  }, [showToast]);

  const resolveHabitationPropertyId = useCallback(async (charId: string, preferredId?: string | null) => {
    let props = propertiesRef.current;
    if (props.length === 0) {
      try {
        const res = await api.getProperties();
        props = res.properties;
        propertiesRef.current = props;
      } catch {}
    }
    if (preferredId) {
      const found = props.find(
        (p) => p.id === preferredId && (p.ownerId === charId || p.renterId === charId || p.sharedKeys?.includes(charId))
      );
      if (found) return found.id;
    }
    const owned = props.find((p) => p.ownerId === charId || p.renterId === charId || p.sharedKeys?.includes(charId));
    return owned?.id || null;
  }, []);

  const openFocusedHouse = useCallback((propId: string) => {
    setFocusedPropertyId(propId);
    setPropertyInitialTab('houses');
    setActiveModal('property');
  }, []);

  const enterHouseByPropertyId = useCallback(
    async (prop: PropertyRecord) => {
      const cur = characterRef.current;
      const eng = engineRef.current;
      if (!cur || !eng) return;
      const hasAccess =
        prop.ownerId === cur.id ||
        prop.renterId === cur.id ||
        Boolean(prop.sharedKeys?.includes(cur.id));
      if (!hasAccess) {
        showToast('Residência trancada! Compra, arrenda ou pede chave partilhada.');
        return;
      }
      const doorObj = eng.getInteractables().find(
        (it) => it.type === 'interior_door' && it.data?.propertyId === prop.id
      );
      const tx = typeof doorObj?.data?.targetX === 'number' ? doorObj.data.targetX : 640;
      const tz = typeof doorObj?.data?.targetZ === 'number' ? doorObj.data.targetZ : 645.2;
      const trot = typeof doorObj?.data?.targetRot === 'number' ? doorObj.data.targetRot : 0;
      const rx = typeof doorObj?.data?.returnX === 'number' ? doorObj.data.returnX : prop.position[0];
      const rz = typeof doorObj?.data?.returnZ === 'number' ? doorObj.data.returnZ : prop.position[2] + 6;
      eng.setLastHouseReturn(rx, rz, Math.PI);
      currentInteriorPropIdRef.current = prop.id;
      eng.setActiveHouseInteriorId(prop.id);
      const endeUnpaid = (prop.bills?.endeKz ?? prop.unpaidBillsKz ?? 0) > 0;
      eng.setHouseBlackout(endeUnpaid);
      setIsHouseBlackout(endeUnpaid);
      soundFx.playDoorOpen();
      eng.teleport(tx, tz, trot);
      setFocusedPropertyId(null);
      setActiveModal(null);
      if (endeUnpaid) {
        showToast('⚡ Energia ENDE cortada por falta de pagamento! A casa está às escuras.');
      } else {
        showToast(`Entraste em ${prop.name}`);
      }
    },
    [showToast]
  );

  const triggerInteraction = useCallback(async () => {
    if (engineRef.current?.ridingBus) {
      engineRef.current.exitBus();
      showToast('Saíste do Autocarro ANGO REAL.');
      return;
    }
    if (engineRef.current?.passengerVehicle) {
      engineRef.current.exitPassengerSeat();
      showToast('Saíste do banco de passageiro.');
      return;
    }
    if (isDrivingRef.current) {
      handleToggleDrive();
      return;
    }
    const item = nearInteractableRef.current;
    if (!item) return;

    soundFx.playInteract();

    if (item.type === 'candongueiro' || item.type === 'vehicle') {
      const curChar = characterRef.current;
      if (curChar && curChar.stats.jailUntil > Date.now()) {
        showToast('Estás detido na Cela PNA! Não podes entrar em viaturas.');
        return;
      }
      if (item.data?.factionOnly && curChar?.stats.factionId !== item.data.factionOnly) {
        showToast('Acesso restrito a membros autorizados desta organização!');
        return;
      }
      if (item.data?.jobOnly && curChar?.stats.jobId !== item.data.jobOnly) {
        showToast('Viatura exclusiva de serviço! Inicia o trabalho correspondente primeiro.');
        return;
      }
      const vId = (item.data?.vehicleId as string) || '';
      if (vId && engineRef.current) {
        const v = engineRef.current.cityData.drivableVehicles.find((veh) => veh.id === vId);
        if (v) {
          const ok = engineRef.current.enterVehicle(v);
          if (!ok) showToast('Viatura trancada pelo proprietário!');
          return;
        }
      }
      handleToggleDrive();
    } else if (item.type === 'moto_rental') {
      const cur = characterRef.current;
      if (!cur) return;
      try {
        const res = await api.rentMoto(cur.id, cur.stats.cashKz >= 2500 ? 'cash' : 'bank');
        syncCharacterRecord(res.character, res.vehicles);
        showToast('🛵 Kupapata alugada por 20 min! Está estacionada ao teu lado na praia.');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Saldo insuficiente para alugar Kupapata.');
      }
    } else if (item.type === 'bus_stop') {
      const ok = engineRef.current?.boardNearestBus();
      if (ok) {
        showToast('🚌 Embarcaste no Autocarro ANGO REAL! Carrega [E] para descer na próxima paragem.');
      } else if (engineRef.current) {
        const nearest = engineRef.current.busController.getNearestBusInfo(
          engineRef.current.player.position.x,
          engineRef.current.player.position.z
        );
        showToast(
          nearest
            ? `🚌 Aguarda na Paragem ANGO REAL — próximo autocarro a ${Math.round(nearest.dist)}m (${nearest.bus.nextStopName}).`
            : '🚌 Aguarda a chegada do próximo Autocarro ANGO REAL.'
        );
      }
    } else if (item.type === 'atm') {
      setActiveModal('atm');
    } else if (
      item.type === 'food' ||
      item.type === 'market' ||
      item.type === 'pharmacy' ||
      item.type === 'clothing' ||
      item.type === 'blackmarket' ||
      item.type === 'armory'
    ) {
      setShopContext({ type: item.type, title: item.title });
      setActiveModal('shop');
    } else if (item.type === 'faction_base' || item.type === 'gang_workbench') {
      setJobsInitialTab('factions');
      setJobsInitialFocusId(undefined);
      setActiveModal('jobs');
    } else if (item.type === 'dealership') {
      setVehicleInitialTab('dealership');
      setActiveModal('vehicle');
    } else if (item.type === 'garage') {
      setVehicleInitialTab('garage');
      setActiveModal('vehicle');
    } else if (item.type === 'workshop') {
      setVehicleInitialTab('workshop');
      setActiveModal('vehicle');
    } else if (item.type === 'police') {
      setJusticeInitialTab('police');
      setActiveModal('justice');
    } else if (item.type === 'lawyer_office') {
      setJusticeInitialTab('lawyers');
      setActiveModal('justice');
    } else if (item.type === 'court' || item.type === 'tribunal') {
      setJusticeInitialTab('court');
      setActiveModal('justice');
    } else if (item.type === 'hospital') {
      setJusticeInitialTab('hospital');
      setActiveModal('justice');
    } else if (item.type === 'property') {
      setFocusedPropertyId(null);
      setPropertyInitialTab('houses');
      setActiveModal('property');
    } else if (item.type === 'business_station') {
      const bizId = typeof item.data?.businessId === 'string' ? item.data.businessId : null;
      setFocusedPropertyId(bizId);
      setPropertyInitialTab('businesses');
      setActiveModal('property');
    } else if (item.type === 'farm_npc') {
      const cur = characterRef.current;
      if (!cur) return;
      try {
        const res = await api.farmAction(cur.id, 'start_job');
        syncCharacterRecord(res.character);
        showToast(res.message || 'Traje de Agricultor equipado! Colhe as plantas da Fazenda.');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Erro ao iniciar trabalho agrícola.');
      }
    } else if (item.type === 'farm_crop') {
      const cur = characterRef.current;
      if (!cur) return;
      const plantId = typeof item.data?.plantId === 'string' ? item.data.plantId : '';
      try {
        const res = await api.farmAction(cur.id, 'harvest_plant', { plantId });
        syncCharacterRecord(res.character);
        showToast(res.message || 'Caixa colhida para a carrinha!');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Planta em processo de produção.');
      }
    } else if (item.type === 'farm_unload') {
      const cur = characterRef.current;
      if (!cur) return;
      try {
        const res = await api.farmAction(cur.id, 'deliver_crates', {
          drivingModelId: engineRef.current?.getDrivingModelId() ?? null,
          enforceVehicle: true,
        });
        syncCharacterRecord(res.character);
        soundFx.playCashRegister();
        showToast(res.message || 'Caixas vendidas na Praça!');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Erro ao descarregar caixas na Praça.');
      }
    } else if (item.type === 'volleyball') {
      engineRef.current?.hitVolleyball();
      showToast('🏐 Bote! Bola rebatida no Voleibol da Praia!');
    } else if (item.type === 'airport_checkin') {
      setAirportModalOpen(true);
    } else if (item.type === 'dj_booth') {
      setActiveModal('dj');
    } else if (item.type === 'politics') {
      setActiveModal('politics');
    } else if (item.type === 'prefeitura') {
      setActiveModal('prefeitura');
    } else if (item.type === 'yango_hub') {
      setJobsInitialTab('jobs');
      setJobsInitialFocusId('yango');
      setActiveModal('jobs');
    } else if (item.type === 'ende_hub' || item.type === 'ende_box') {
      setJobsInitialTab('jobs');
      setJobsInitialFocusId('ende');
      setActiveModal('jobs');
    } else if (item.type === 'pescador_hub' || item.type === 'fishing_spot' || item.type === 'fish_market') {
      setJobsInitialTab('jobs');
      setJobsInitialFocusId('pescador');
      setActiveModal('jobs');
    } else if (item.type === 'elisal_hub' || item.type === 'elisal_bin') {
      setJobsInitialTab('jobs');
      setJobsInitialFocusId('elisal');
      setActiveModal('jobs');
    } else if (item.type === 'prison_door') {
      const cur = characterRef.current;
      if (cur && cur.stats.jailUntil > Date.now()) {
        showToast('Pena ativa! Paga a fiança ou cumpre o tempo restante na Cela.');
        setJusticeInitialTab('police');
        setActiveModal('justice');
        return;
      }
      if (item.data?.isPrisonExit) {
        soundFx.playDoorOpen();
        engineRef.current?.teleport(PRISON_RELEASE_POS[0], PRISON_RELEASE_POS[2], Math.PI);
        showToast('Saíste em liberdade do Complexo PNA!');
      } else {
        setJusticeInitialTab('police');
        setActiveModal('justice');
      }
    } else if (item.type === 'bed') {
      const cur = characterRef.current;
      if (!cur) return;
      const propId = await resolveHabitationPropertyId(cur.id, cur.stats.homePropertyId);
      if (!propId) {
        showToast('Precisas de ter casa ou chave partilhada para usar esta cama.');
        return;
      }
      try {
        const res = await api.propertyAction(propId, cur.id, 'rest');
        syncCharacterRecord(res.character);
        engineRef.current?.triggerSleepWakeAnimation();
        soundFx.playBedSleepSound();
        showToast('Dormiste na tua residência! Sono e Energia restaurados a 100%.');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Não foi possível descansar.');
      }
    } else if (item.type === 'kitchen') {
      const cur = characterRef.current;
      if (!cur) return;
      const propId = await resolveHabitationPropertyId(cur.id, cur.stats.homePropertyId);
      if (!propId) {
        showToast('Precisas de ter casa ou chave partilhada para cozinhar.');
        return;
      }
      try {
        const res = await api.propertyAction(propId, cur.id, 'cook_eat');
        syncCharacterRecord(res.character);
        soundFx.playInteract();
        const dish = res.dishName || ANGOLAN_DISHES[Math.floor(Math.random() * ANGOLAN_DISHES.length)];
        startCookingCutscene(dish);
        showToast(`🍳 A cozinhar ${dish}! Fome e Sede recuperadas.`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Erro ao cozinhar.');
      }
    } else if (item.type === 'bathroom') {
      const cur = characterRef.current;
      if (!cur) return;
      const propId = await resolveHabitationPropertyId(cur.id, cur.stats.homePropertyId);
      if (!propId) {
        showToast('Precisas de ter casa ou chave partilhada para usar a casa de banho.');
        return;
      }
      try {
        const res = await api.propertyAction(propId, cur.id, 'hygiene');
        syncCharacterRecord(res.character);
        soundFx.playInteract();
        showToast('Banho tomado! Higiene e Energia renovadas.');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Erro ao tomar banho.');
      }
    } else if (item.type === 'dining_table') {
      const cur = characterRef.current;
      if (!cur) return;
      const propId = await resolveHabitationPropertyId(cur.id, cur.stats.homePropertyId);
      if (!propId) {
        showToast('Precisas de ter casa ou chave partilhada para comer à mesa.');
        return;
      }
      try {
        const res = await api.propertyAction(propId, cur.id, 'cook_eat');
        syncCharacterRecord(res.character);
        soundFx.playInteract();
        showToast('🍽️ Refeição servida na mesa de jantar! Fome e Sede recuperadas.');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Erro ao comer à mesa.');
      }
    } else if (item.type === 'faction_station') {
      const cur = characterRef.current;
      const stationId = typeof item.data?.stationId === 'string' ? item.data.stationId : '';
      if (!cur || !stationId) return;
      try {
        const res = await api.factionStationAction(cur.id, stationId);
        syncCharacterRecord(res.character);
        soundFx.playCashRegister();
        showToast(res.message);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Operação da facção indisponível.');
      }
    } else if (item.type === 'faa_vault') {
      const cur = characterRef.current;
      if (!cur) return;
      try {
        const res = await api.faaVaultHeist(cur.id);
        syncCharacterRecord(res.character);
        engineRef.current?.notifyFaaHeistAlert(90000);
        showToast(`🚨 ALARME FAA! +${res.reward.toLocaleString('pt-AO')} Kz roubados! PNA e Exército FAA em fogo letal!`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Assalto ao Cofre das FAA falhou.');
      }
    } else if (item.type === 'house_panel') {
      const cur = characterRef.current;
      if (!cur) return;
      const propId =
        currentInteriorPropIdRef.current ||
        (await resolveHabitationPropertyId(cur.id, cur.stats.homePropertyId));
      if (!propId) {
        showToast('Nenhuma residência associada a este painel.');
        return;
      }
      openFocusedHouse(propId);
      return;
    } else if (item.type === 'interior_door') {
      const tx = typeof item.data?.targetX === 'number' ? item.data.targetX : 0;
      const tz = typeof item.data?.targetZ === 'number' ? item.data.targetZ : 10;
      const trot = typeof item.data?.targetRot === 'number' ? item.data.targetRot : undefined;
      const entryLabel =
        typeof item.data?.label === 'string'
          ? item.data.label
          : typeof item.data?.entryLabel === 'string'
            ? item.data.entryLabel
            : item.title;

      if (item.data?.isDynamicHouseExit) {
        const ret = engineRef.current?.getLastHouseReturn();
        soundFx.playDoorOpen();
        currentInteriorPropIdRef.current = null;
        engineRef.current?.setActiveHouseInteriorId(null);
        engineRef.current?.setHouseBlackout(false);
        setIsHouseBlackout(false);
        engineRef.current?.teleport(ret ? ret.x : tx, ret ? ret.z : tz, ret ? ret.rot : trot);
        showToast('Saíste para a rua.');
        return;
      }

      if (typeof item.data?.propertyId === 'string') {
        openFocusedHouse(item.data.propertyId);
        return;
      }

      soundFx.playDoorOpen();
      engineRef.current?.teleport(tx, tz, trot);
      if (!isHouseBlackout) showToast(entryLabel);
    } else if (item.type === 'job_hub') {
      setJobsInitialTab('jobs');
      setJobsInitialFocusId(undefined);
      setActiveModal('jobs');
    } else if (item.type === 'monument') {
      soundFx.playCandongueiroHorn();
      showToast('Monumento da Independência 🇦🇴: "Paz, progresso e união ao povo angolano!"');
    } else if (item.type === 'leisure') {
      const eng = engineRef.current;
      if (eng) {
        const nextStats = {
          ...eng.currentStats,
          energy: Math.min(100, eng.currentStats.energy + 35),
          health: Math.min(100, eng.currentStats.health + 10),
        };
        eng.syncStats(nextStats);
        setCharacter((prev) => (prev ? { ...prev, stats: nextStats } : prev));
      }
      showToast('🏖️ Praia & Lazer: Relaxaste no pontão e recuperaste +35 Energia!');
    } else if (item.type === 'airport' || item.type === 'port') {
      setJobsInitialTab('jobs');
      setActiveModal('jobs');
    } else if (item.type === 'station') {
      setVehicleInitialTab('workshop');
      setActiveModal('vehicle');
    }
  }, [handleToggleDrive, isHouseBlackout, openFocusedHouse, resolveHabitationPropertyId, showToast, startCookingCutscene, syncCharacterRecord]);

  const equippedWeapon: WeaponId = (character?.customization?.equippedWeapon as WeaponId) || 'none';

  const ownedWeapons: { id: WeaponId; label: string; itemId: string }[] = (character?.inventory || [])
    .filter((it) => it.category === 'weapon')
    .map((it) => {
      const cat = SHOP_CATALOG.find((c) => c.catalogId === it.catalogId);
      return {
        id: (cat?.weaponId || 'none') as WeaponId,
        label: it.name.split(' ')[0],
        itemId: it.id,
      };
    })
    .filter((w) => w.id !== 'none');

  const handleEquipWeapon = useCallback(
    async (targetWeaponId: WeaponId) => {
      const cur = characterRef.current;
      if (!cur) return;
      const targetEntry =
        targetWeaponId === 'none'
          ? cur.inventory.find((i) => i.category === 'weapon' && i.equipped)
          : cur.inventory.find((i) => {
              const cat = SHOP_CATALOG.find((c) => c.catalogId === i.catalogId);
              return cat?.weaponId === targetWeaponId;
            });
      if (!targetEntry) return;
      try {
        const res = await api.inventoryAction(cur.id, targetEntry.id, 'equip');
        soundFx.playInteract();
        syncCharacterRecord(res.character);
      } catch {}
    },
    [syncCharacterRecord]
  );

  const handleReloadWeapon = useCallback(async () => {
    const cur = characterRef.current;
    const wId = (cur?.customization?.equippedWeapon as WeaponId) || 'none';
    if (!cur || wId === 'none' || reloading) return;
    const spec = WEAPON_CATALOG[wId];
    if (!spec || spec.isMelee) return;

    const currentAmmo = ammoByWeapon[wId] || { mag: spec.magSize, reserve: spec.magSize * 2 };
    if (currentAmmo.mag >= spec.magSize) return;

    let availableReserve = currentAmmo.reserve;
    if (availableReserve <= 0) {
      const ammoPack = cur.inventory.find((i) => i.catalogId === 'municao_pack' && i.quantity > 0);
      if (ammoPack) {
        try {
          const res = await api.inventoryAction(cur.id, ammoPack.id, 'use');
          syncCharacterRecord(res.character);
          availableReserve += 60;
        } catch {}
      }
    }
    if (availableReserve <= 0) {
      soundFx.playEmptyClick();
      showToast('Sem munições de reserva! Compra Caixa de Munições no Paiol ou Mercado.');
      return;
    }

    setReloading(true);
    soundFx.playReload();
    engineRef.current?.triggerReloadAnimation();
    window.setTimeout(() => {
      const needed = spec.magSize - currentAmmo.mag;
      const take = Math.min(needed, availableReserve);
      setAmmoByWeapon((prev) => ({
        ...prev,
        [wId]: { mag: currentAmmo.mag + take, reserve: availableReserve - take },
      }));
      setReloading(false);
    }, spec.reloadMs);
  }, [ammoByWeapon, reloading, showToast, syncCharacterRecord]);

  const handleFireWeapon = useCallback(() => {
    const eng = engineRef.current;
    const cur = characterRef.current;
    if (!eng || !cur || isDrivingRef.current || cur.stats.isUnconscious || cur.stats.isFrozen) return;
    const wId = (cur.customization?.equippedWeapon as WeaponId) || 'none';
    if (wId === 'none') return;
    const spec = WEAPON_CATALOG[wId];
    const now = performance.now();
    if (now - lastShotMsRef.current < spec.fireRateMs) return;
    lastShotMsRef.current = now;

    if (!spec.isMelee) {
      if (reloading) return;
      const curAmmo = ammoByWeapon[wId] || { mag: spec.magSize, reserve: spec.magSize * 2 };
      if (curAmmo.mag <= 0) {
        soundFx.playEmptyClick();
        handleReloadWeapon();
        return;
      }
      setAmmoByWeapon((prev) => ({
        ...prev,
        [wId]: { ...curAmmo, mag: curAmmo.mag - 1 },
      }));
    }

    const res = eng.fireWeapon(wId);
    if (res.hitNpc) {
      showToast(`Acertaste em ${res.hitNpc}!`);
    }
  }, [ammoByWeapon, handleReloadWeapon, reloading, showToast]);

  // Teclado PC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      const eng = engineRef.current;
      if (!eng) return;

      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') eng.currentInput.forward = true;
      if (key === 's' || key === 'arrowdown') eng.currentInput.backward = true;
      if (key === 'a' || key === 'arrowleft') eng.currentInput.left = true;
      if (key === 'd' || key === 'arrowright') eng.currentInput.right = true;
      if (key === 'shift') eng.currentInput.sprint = true;
      if (key === 'control') eng.currentInput.crouch = true;
      if (key === 'c') eng.currentInput.crouch = !eng.currentInput.crouch;
      if (key === ' ') {
        e.preventDefault();
        eng.currentInput.jump = true;
        if (isDrivingRef.current) eng.currentInput.handbrake = true;
      }
      if (key === 'e') {
        eng.currentInput.interact = true;
        triggerInteraction();
      }
      if (key === 'r') handleReloadWeapon();
      if (key === 'q') handleRobNpc();
      if (key === 'f') {
        const hit = eng.triggerPunch();
        if (hit.hitTargetName) showToast(`Acertaste um golpe RP em ${hit.hitTargetName}!`);
      }
      if (key === 'k' && isDrivingRef.current) eng.toggleEngine();
      if (key === 'l' && isDrivingRef.current) eng.toggleHeadlights();
      if (key === 'z' && isDrivingRef.current) eng.setBlinker('left');
      if (key === 'x' && isDrivingRef.current) eng.setBlinker('right');
      if (key === 'n' && isDrivingRef.current) eng.setBlinker('hazard');
      if (key === 'u') {
        const locked = eng.toggleLock();
        showToast(locked ? 'Viatura trancada 🔒' : 'Viatura destrancada 🔓');
      }
      if (key === 'h' && isDrivingRef.current) soundFx.playCandongueiroHorn();
      if (key === 'y' && isDrivingRef.current) {
        const sirenActive = eng.toggleVehicleSiren();
        showToast(sirenActive ? '🚨 Sirene ativada!' : 'Sirene desligada.');
      }
      if (key === 'm') setActiveModal((p) => (p === 'map' ? null : 'map'));
      if (key === 'b') setShowEmotes((p) => !p);
      if (key === 'i') setActiveModal((p) => (p === 'inventory' ? null : 'inventory'));
      if (key === 'p') setActiveModal((p) => (p === 'phone' ? null : 'phone'));
      if (key === 'j') {
        setJobsInitialFocusId(undefined);
        setActiveModal((p) => (p === 'jobs' ? null : 'jobs'));
      }
      if (key === 'g') {
        if (eng.passengerVehicle || (!isDrivingRef.current && eng.findNearestVehicle(6.5))) {
          eng.togglePassengerSeat();
        } else {
          setActiveModal((p) => (p === 'vehicle' ? null : 'vehicle'));
        }
      }
      if (key === 'v' && !e.repeat) {
        void handleToggleMic();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') eng.currentInput.forward = false;
      if (key === 's' || key === 'arrowdown') eng.currentInput.backward = false;
      if (key === 'a' || key === 'arrowleft') eng.currentInput.left = false;
      if (key === 'd' || key === 'arrowright') eng.currentInput.right = false;
      if (key === 'shift') eng.currentInput.sprint = false;
      if (key === 'control') eng.currentInput.crouch = false;
      if (key === ' ') {
        eng.currentInput.jump = false;
        eng.currentInput.handbrake = false;
      }
      if (key === 'e') eng.currentInput.interact = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [triggerInteraction, showToast, handleReloadWeapon, handleRobNpc, handleToggleMic]);

  // Pointer Câmara 360° (multi-touch seguro por pointerId) + Mira ADS & Disparo
  const cameraPointerIdRef = useRef<number | null>(null);
  const lastPointerXRef = useRef(0);
  const lastPointerYRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2 && !isDrivingRef.current && equippedWeapon !== 'none' && activeModalRef.current === null) {
      setIsAiming(true);
      engineRef.current?.setAiming(true);
    }
    if (cameraPointerIdRef.current !== null) return;
    cameraPointerIdRef.current = e.pointerId;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY, button: e.button };
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraPointerIdRef.current !== e.pointerId || !engineRef.current) return;
    const dx = e.clientX - lastPointerXRef.current;
    const dy = e.clientY - lastPointerYRef.current;
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
    if (e.pointerType === 'touch') {
      engineRef.current.touchRotateCamera(dx, dy);
    } else {
      engineRef.current.rotateCamera(dx, dy);
    }
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      setIsAiming(false);
      engineRef.current?.setAiming(false);
    }
    if (
      e.button === 0 &&
      pointerDownPosRef.current &&
      pointerDownPosRef.current.button === 0 &&
      Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y) < 6 &&
      !isDrivingRef.current &&
      activeModalRef.current === null
    ) {
      if (equippedWeapon !== 'none') {
        handleFireWeapon();
      } else {
        const pickedHouseId = engineRef.current?.pickHouseAtScreenPoint(e.clientX, e.clientY);
        if (pickedHouseId) {
          soundFx.playInteract();
          openFocusedHouse(pickedHouseId);
        }
      }
    }
    if (cameraPointerIdRef.current === e.pointerId) {
      cameraPointerIdRef.current = null;
      pointerDownPosRef.current = null;
    }
  };
  const handleWheel = (e: React.WheelEvent) => {
    engineRef.current?.zoomCamera(e.deltaY * 0.005);
  };

  const handleAnalogMove = useCallback((x: number, y: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.currentInput.analogX = x;
    eng.currentInput.analogY = y;
  }, []);

  const handleTouchAction = useCallback(
    (
      action: 'forward' | 'backward' | 'left' | 'right' | 'sprint' | 'jump' | 'handbrake' | 'interact' | 'horn',
      active?: boolean
    ) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (action === 'forward' || action === 'backward' || action === 'left' || action === 'right' || action === 'handbrake') {
        eng.currentInput[action] = active !== undefined ? active : !eng.currentInput[action];
      } else if (action === 'sprint') {
        eng.currentInput.sprint = active !== undefined ? active : !eng.currentInput.sprint;
      } else if (action === 'jump') {
        eng.currentInput.jump = active !== undefined ? active : true;
        if (active === undefined) {
          setTimeout(() => {
            if (eng) eng.currentInput.jump = false;
          }, 180);
        }
      } else if (action === 'interact') {
        triggerInteraction();
      } else if (action === 'horn') {
        soundFx.playCandongueiroHorn();
      }
    },
    [triggerInteraction]
  );

  const handleSendChat = (text: string, channel: ChatMessage['channel']) => {
    if (!engineRef.current || !character) return;
    const eng = engineRef.current;
    eng.multiplayer.sendChat(`${character.stats.name} ${character.stats.surname}`, text, channel, {
      x: eng.player.position.x,
      z: eng.player.position.z,
    });
  };

  const handleTeleport = (x: number, z: number, districtName: string) => {
    if (!engineRef.current) return;
    engineRef.current.teleport(x, z);
    setCurrentDistrict(districtName);
    showToast(`Viajou para ${districtName}`);
  };

  const handleLiveCustomization = (newCust: PlayerCustomization) => {
    setCharacter((prev) => (prev ? { ...prev, customization: newCust } : prev));
    engineRef.current?.player.updateCustomization(newCust);
  };

  const handleSetWeather = (w: WeatherType) => {
    const nw = normalizeWeatherType(w);
    setWeatherMode('manual');
    setCurrentWeather(nw);
    setSettings((prev) => ({ ...prev, weather: nw }));
    engineRef.current?.setWeather(nw);
    api.setWeatherMode('manual', { weather: nw, timeOfDay: engineRef.current?.timeOfDay }).then((r) => {
      setWeatherForecast(r.forecast);
    }).catch(() => {});
  };

  const handleSetWeatherMode = async (mode: WeatherMode, weather?: WeatherType) => {
    setWeatherMode(mode);
    try {
      const res = await api.setWeatherMode(mode, {
        weather: weather ? normalizeWeatherType(weather) : undefined,
        timeOfDay: engineRef.current?.timeOfDay,
      });
      setWeatherForecast(res.forecast);
      setWeatherMode(res.forecast.mode);
      engineRef.current?.setWeatherTelemetry(res.forecast.current);
      const nw = normalizeWeatherType(res.forecast.activeWeather);
      setCurrentWeather(nw);
      setSettings((prev) => ({ ...prev, weather: nw }));
      engineRef.current?.setWeather(nw);
      showToast(
        res.forecast.mode === 'auto'
          ? `Clima sincronizado com Luanda (${res.forecast.current.tempC}°C · ${res.forecast.current.conditionLabel})`
          : `Clima manual aplicado: ${nw}`
      );
    } catch {
      if (weather) {
        const nw = normalizeWeatherType(weather);
        setCurrentWeather(nw);
        engineRef.current?.setWeather(nw);
      }
    }
  };

  const handleSetTimeOfDay = (hour: number) => {
    setTimeOfDay(hour);
    if (engineRef.current) engineRef.current.timeOfDay = hour;
    if (weatherModeRef.current === 'auto') {
      void refreshWeatherForecast(false, hour);
    }
  };

  const handleUpdateSettings = (newSettings: GameSettings) => {
    const normalized: GameSettings = {
      ...newSettings,
      graphicsQuality: normalizeGraphicsQuality(newSettings.graphicsQuality),
    };
    setSettings(normalized);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
    if (normalized.weather !== currentWeather) setCurrentWeather(normalizeWeatherType(normalized.weather));
    engineRef.current?.updateSettings(normalized);
    voiceChatRef.current?.setMuted(!!normalized.muted);
    voiceChatRef.current?.setVolume(normalized.soundVolume);
    showToast('Definições atualizadas');
  };

  const handleUpdateHudPrefs = (nextPrefs: HudPreferences) => {
    setHudPrefs(nextPrefs);
    try {
      window.localStorage.setItem(HUD_PREFS_STORAGE_KEY, JSON.stringify(nextPrefs));
    } catch {}
  };

  const handleJobStarted = (job: JobCatalog, updatedChar: CharacterRecord) => {
    syncCharacterRecord(updatedChar);
    const step = job.steps[0];
    if (engineRef.current && step) {
      const landed = engineRef.current.teleportToJobSite(step.pos, step.radius);
      engineRef.current.setActiveCheckpoint(step.pos, step.radius, step.label);
      setCharacter((prev) =>
        prev ? { ...prev, position: { x: landed.x, y: 0, z: landed.z } } : prev
      );
      showToast(`Trabalho iniciado: ${job.title}! Teleportado para o local — entra na baliza dourada 3D.`);
    } else {
      showToast(`Trabalho iniciado: ${job.title}! Segue a baliza dourada 3D.`);
    }
  };

  const handleLogout = () => {
    voiceChatRef.current?.destroy();
    voiceChatRef.current = null;
    setMicActive(false);
    setMicError(null);
    void signOutSupabase();
    void signOutFirebase();
    api.logout();
    setCharacter(null);
    setAccount(null);
    setSelectingChar(false);
    setActiveModal('start');
  };

  const activeJob = character?.stats.jobId ? JOBS_CATALOG.find((j) => j.id === character.stats.jobId) : undefined;
  const activeStep = activeJob?.steps[character?.jobStepIndex || 0];
  const jailSecsLeft = character ? Math.max(0, Math.ceil((character.stats.jailUntil - nowMs) / 1000)) : 0;
  const pPosX = engineRef.current ? engineRef.current.player.position.x : (character?.position.x ?? 0);
  const pPosZ = engineRef.current ? engineRef.current.player.position.z : (character?.position.z ?? 0);
  const isInsideFaaBounds =
    pPosX >= FAA_BASE_BOUNDS.minX &&
    pPosX <= FAA_BASE_BOUNDS.maxX &&
    pPosZ >= FAA_BASE_BOUNDS.minZ &&
    pPosZ <= FAA_BASE_BOUNDS.maxZ;
  const isInFaaRestrictedZone = Boolean(
    isInsideFaaBounds &&
      character &&
      character.stats.factionId !== 'faa' &&
      character.stats.factionId !== 'policia'
  );

  return (
    <div
      onContextMenu={(e) => {
        if (
          !(
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          )
        ) {
          e.preventDefault();
        }
      }}
      className="relative w-screen h-[100dvh] overflow-hidden bg-black font-sans select-none"
    >
      {/* 1. CANVAS WEBGL THREE.JS */}
      <div
        ref={canvasMountRef}
        className="game-control-surface absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* 2. ECRÃ DE ARRANQUE & FLUXO DE AUTENTICAÇÃO */}
      {booting && (
        <div className="fixed inset-0 z-[1000] bg-gradient-to-b from-black via-zinc-950 to-black flex flex-col items-center justify-center p-6 text-white text-center space-y-4">
          <div className="text-4xl font-black tracking-tight uppercase">
            <span>LUANDA</span>
            <span className="text-amber-400 ml-2">RP</span>
            <span className="ml-2">🇦🇴</span>
          </div>
          <div className="w-10 h-10 rounded-full border-4 border-amber-500/30 border-t-amber-400 animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">A ligar aos servidores de Luanda...</p>
        </div>
      )}

      {webglError && (
        <div className="fixed inset-0 z-[1000] bg-zinc-950/95 flex items-center justify-center p-6 text-white">
          <div className="max-w-md w-full bg-zinc-900 border-2 border-red-500/60 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <h2 className="text-xl font-black text-amber-400 uppercase">Motor Gráfico 3D Indisponível</h2>
            <p className="text-xs text-zinc-300 leading-relaxed">{webglError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase rounded-xl cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {!booting && !account && (
          <AuthScreen
            key="auth-screen"
            onAuthenticated={(acc) => {
              if (firebaseUser && firebaseUser.email?.toLowerCase() !== acc.email.toLowerCase()) {
                void signOutFirebase();
              }
              setAccount(acc);
              setSelectingChar(true);
            }}
          />
        )}

        {!booting && account && (selectingChar || !character) && (
          <CharacterSelectModal
            key="char-select"
            account={account}
            onSelectCharacter={(charId) => loadCharacterSession(charId)}
            onLogout={handleLogout}
          />
        )}
      </AnimatePresence>

      {/* 3. HUD DO JOGO QUANDO PERSONAGEM ESTÁ ATIVO */}
      {account && character && !selectingChar && activeModal !== 'start' && (
        <GameHUD
          stats={character.stats}
          accountRole={account.role}
          currentDistrict={currentDistrict}
          timeString={timeString}
          currentWeather={currentWeather}
          weatherMode={weatherMode}
          weatherForecast={weatherForecast}
          isDriving={isDriving}
          vehicleTelemetry={vehicleTelemetry}
          nearInteractable={nearInteractable}
          activeJobTitle={activeJob?.title}
          activeStepLabel={activeStep?.label}
          gpsWaypoint={gpsWaypoint}
          playerPos={{
            x: engineRef.current ? engineRef.current.player.position.x : character.position.x,
            z: engineRef.current ? engineRef.current.player.position.z : character.position.z,
          }}
          getMinimapSnapshot={() => engineRef.current?.getMinimapSnapshot() || null}
          equippedWeapon={equippedWeapon}
          isAiming={isAiming}
          weaponAmmo={{
            mag: ammoByWeapon[equippedWeapon]?.mag ?? 0,
            reserve: ammoByWeapon[equippedWeapon]?.reserve ?? 0,
            reloading,
          }}
          ownedWeapons={ownedWeapons}
          hudPrefs={hudPrefs}
          djState={djState}
          djServerOffsetMs={djServerOffsetMs}
          afkWarning={afkWarning}
          presidentName={politicsState?.president?.name || null}
          onEquipWeapon={handleEquipWeapon}
          onAimChange={(aiming) => {
            setIsAiming(aiming);
            engineRef.current?.setAiming(aiming);
          }}
          onFireWeapon={handleFireWeapon}
          onReloadWeapon={handleReloadWeapon}
          onOpenIdentity={() => setActiveModal('identity')}
          onOpenInventory={() => setActiveModal('inventory')}
          onOpenPhone={() => setActiveModal('phone')}
          onOpenJobs={() => { setJobsInitialTab('jobs'); setJobsInitialFocusId(undefined); setActiveModal('jobs'); }}
          onOpenGarage={() => { setVehicleInitialTab('garage'); setActiveModal('vehicle'); }}
          onOpenAtm={() => setActiveModal('atm')}
          onOpenMap={() => setActiveModal('map')}
          onOpenProperties={() => { setFocusedPropertyId(null); setPropertyInitialTab('houses'); setActiveModal('property'); }}
          onOpenPolitics={() => setActiveModal('politics')}
          onOpenDj={() => setActiveModal('dj')}
          onOpenJustice={() => { setJusticeInitialTab('police'); setActiveModal('justice'); }}
          onOpenMissions={() => setActiveModal('missions')}
          onOpenAdmin={() => setActiveModal('admin')}
          onOpenSettings={() => setActiveModal('settings')}
          onInteract={triggerInteraction}
          onSetWeather={handleSetWeather}
          onSetWeatherMode={handleSetWeatherMode}
          onRefreshWeatherForecast={() => {
            void refreshWeatherForecast(true);
            showToast('Previsão meteorológica de Luanda atualizada.');
          }}
          onSetTimeOfDay={handleSetTimeOfDay}
          onToggleDrive={handleToggleDrive}
          onTogglePassenger={() => engineRef.current?.togglePassengerSeat()}
          nearVehicleForPassenger={Boolean(
            !isDriving &&
            !vehicleTelemetry?.isPassenger &&
            (nearInteractable?.type === 'vehicle' || nearInteractable?.type === 'candongueiro')
          )}
          worldDynamicState={worldDynamicState}
          showEmotes={showEmotes}
          onToggleEmotes={() => setShowEmotes((v) => !v)}
          onToggleEngine={() => engineRef.current?.toggleEngine()}
          onToggleHeadlights={() => engineRef.current?.toggleHeadlights()}
          onToggleLock={() => engineRef.current?.toggleLock()}
          onToggleSiren={() => {
            if (!engineRef.current) return;
            const sirenActive = engineRef.current.toggleVehicleSiren();
            showToast(sirenActive ? '🚨 Sirene ativada!' : 'Sirene desligada.');
          }}
          onToggleBlinker={(mode) => engineRef.current?.setBlinker(mode)}
          onEmote={(anim: AnimationState | null) => engineRef.current?.setEmote(anim)}
          onPunch={() => { engineRef.current?.triggerPunch(); }}
          onToggleCrouch={() => {
            if (engineRef.current) engineRef.current.currentInput.crouch = !engineRef.current.currentInput.crouch;
          }}
          isTouchDevice={isTouchDevice}
          onToggleTouchControls={() => setIsTouchDevice((v) => !v)}
          onAnalogMove={handleAnalogMove}
          onTouchAction={handleTouchAction}
          chatMessages={chatMessages}
          onSendChat={handleSendChat}
          activeCitizensCount={activeCitizensCount}
          toastMessage={toastMessage}
          nearCivilianNpc={nearCivilianNpc}
          onRobNpc={handleRobNpc}
          micActive={micActive}
          micError={micError}
          onToggleMic={handleToggleMic}
          onOpenPrefeitura={() => setActiveModal('prefeitura')}
          busStatus={busStatus}
          onBoardBus={() => {
            const ok = engineRef.current?.boardNearestBus();
            if (ok) showToast('🚌 Embarcaste no Autocarro ANGO REAL!');
            else showToast('Aproxima-te mais do autocarro para entrar.');
          }}
          onExitBus={() => {
            engineRef.current?.exitBus();
            showToast('Saíste do Autocarro ANGO REAL.');
          }}
          inemaState={inemaState}
          isHouseBlackout={isHouseBlackout}
          isInFaaRestrictedZone={isInFaaRestrictedZone}
        />
      )}

      {/* 4. OVERLAY DE INCONSCIENTE */}
      {character?.stats.isUnconscious && (
        <div className="fixed inset-0 z-[950] pointer-events-auto bg-red-950/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-950 border-2 border-red-500 rounded-2xl p-6 text-center text-white space-y-4 shadow-2xl">
            <h2 className="text-2xl font-black text-red-400">ESTADO CRÍTICO • INCONSCIENTE</h2>
            <p className="text-xs text-zinc-300">
              A tua vida chegou a zero. Chama o INEMA (112) para a ambulância vir reanimar-te no local ou ativa transporte urgente para o Hospital Josina Machel (2.500 Kz).
            </p>
            {(inemaState === 'en_route' || inemaState === 'treating') && (
              <div className="p-2.5 bg-blue-950/80 border border-sky-400 rounded-xl text-xs font-bold text-sky-200">
                {inemaState === 'en_route'
                  ? '🚑 Ambulância INEMA saiu do Hospital Josina Machel e está a caminho em tempo real!'
                  : '🩺 Equipa médica INEMA chegou ao local — a reanimar...'}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={inemaState === 'en_route' || inemaState === 'treating'}
                onClick={async () => {
                  try {
                    const eng = engineRef.current;
                    await api.callEmergency(
                      character.id,
                      'medico',
                      'Cidadão inconsciente a precisar de reanimação!',
                      eng ? eng.player.position.x : 0,
                      eng ? eng.player.position.z : 0
                    );
                    if (eng) {
                      showToast('🚑 Ambulância INEMA (112) a caminho a partir do Hospital!');
                      eng.dispatchInemaAmbulance(async () => {
                        try {
                          const res = await api.hospitalAction(character.id, 'inema_field_revive');
                          syncCharacterRecord(res.character);
                          showToast('🚑 Equipa INEMA chegou e reanimou-te! Ambulância regressa ao Hospital.');
                        } catch (err: unknown) {
                          showToast(err instanceof Error ? err.message : 'Erro na reanimação INEMA.');
                        }
                      });
                    } else {
                      showToast('Chamada 112 INEMA enviada!');
                    }
                  } catch (err: unknown) {
                    showToast(err instanceof Error ? err.message : 'Falha ao chamar o INEMA.');
                  }
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                {inemaState === 'en_route' || inemaState === 'treating'
                  ? '🚑 INEMA a caminho...'
                  : '🚑 Chamar INEMA (112)'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.hospitalAction(character.id, 'respawn_inema');
                    syncCharacterRecord(res.character);
                    engineRef.current?.teleport(48, 54);
                    showToast('Reanimado no Hospital Josina Machel!');
                  } catch (err: unknown) {
                    showToast(err instanceof Error ? err.message : 'Saldo insuficiente para transporte INEMA (2.500 Kz).');
                  }
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 font-bold text-xs rounded-xl cursor-pointer"
              >
                🏥 Transporte Urgente (2.500 Kz)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. OVERLAY DE PRISÃO PNA */}
      {character && jailSecsLeft > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[940] pointer-events-auto bg-zinc-950 border-2 border-blue-500 rounded-2xl px-6 py-3 text-white text-center shadow-2xl flex items-center gap-4">
          <div className="text-left text-xs">
            <div className="font-black text-blue-400 uppercase">
              Detido na Prisão Central • Cela #{character.stats.assignedCell || 1}
            </div>
            <div className="text-zinc-300 tabular-nums">
              {character.stats.jailReason} •{' '}
              {String(Math.floor(jailSecsLeft / 3600)).padStart(2, '0')}h{' '}
              {String(Math.floor((jailSecsLeft % 3600) / 60)).padStart(2, '0')}m{' '}
              {String(jailSecsLeft % 60).padStart(2, '0')}s
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await api.justiceAction(character.id, 'pay_bail');
                syncCharacterRecord(res.character);
                engineRef.current?.teleport(PRISON_RELEASE_POS[0], PRISON_RELEASE_POS[2], Math.PI);
                showToast('Fiança paga! Estás em liberdade.');
              } catch (err: unknown) {
                showToast(err instanceof Error ? err.message : 'Saldo insuficiente para fiança.');
              }
            }}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-xl cursor-pointer"
          >
            Pagar Fiança
          </button>
        </div>
      )}

      {/* 6. MODAIS DO JOGO */}
      {account && character && !selectingChar && (
        <AnimatePresence mode="wait">
          {activeModal === 'start' && (
            <StartScreen
              key="modal-start"
              playerName={`${character.stats.name} ${character.stats.surname}`}
              idNumber={character.stats.idNumber}
              phone={character.stats.phone}
              role={account.role}
              onStartGame={() => {
                setActiveModal(null);
                showToast(`Bem-vindo a Luanda, ${character.stats.name}!`);
              }}
              onOpenIdentity={() => setActiveModal('identity')}
              onOpenSettings={() => setActiveModal('settings')}
              onSwitchCharacter={() => setSelectingChar(true)}
              onLogout={handleLogout}
            />
          )}

          {activeModal === 'identity' && (
            <IdentityModal
              key="modal-identity"
              characterId={character.id}
              stats={character.stats}
              customization={character.customization}
              onSaved={(rec) => {
                syncCharacterRecord(rec);
                showToast(`Identidade atualizada: ${rec.stats.name} ${rec.stats.surname}`);
              }}
              onLiveUpdate={handleLiveCustomization}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'inventory' && (
            <InventoryModal
              key="modal-inventory"
              characterId={character.id}
              inventory={character.inventory}
              playerPos={{
                x: engineRef.current ? engineRef.current.player.position.x : character.position.x,
                z: engineRef.current ? engineRef.current.player.position.z : character.position.z,
              }}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onDroppedItemsChanged={syncDroppedMeshes}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'atm' && (
            <AtmModal
              key="modal-atm"
              characterId={character.id}
              stats={character.stats}
              transactions={transactions}
              onCharacterSynced={(rec, txs) => syncCharacterRecord(rec, undefined, txs)}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'shop' && (
            <ShopModal
              key="modal-shop"
              characterId={character.id}
              stats={character.stats}
              shopType={shopContext.type}
              shopTitle={shopContext.title}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'vehicle' && (
            <VehicleModal
              key="modal-vehicle"
              characterId={character.id}
              stats={character.stats}
              vehicles={vehicles}
              initialTab={vehicleInitialTab}
              playerPos={{
                x: engineRef.current ? engineRef.current.player.position.x : character.position.x,
                z: engineRef.current ? engineRef.current.player.position.z : character.position.z,
              }}
              getVehicleMileageKm={(vehId) => engineRef.current?.getVehicleMileageKm(vehId)}
              onStartTestDrive={(sv) => {
                const veh = spawnSharedVehicleInEngine(sv);
                if (veh) engineRef.current?.enterVehicle(veh);
                setActiveModal(null);
                showToast(`🏎️ Test Drive iniciado: ${sv.name} (90s)!`);
              }}
              onCharacterSynced={(rec, nextVehs) => syncCharacterRecord(rec, nextVehs)}
              onSpawnVehicleInWorld={(v) => engineRef.current?.spawnOwnedVehicle(v)}
              onRemoveVehicleFromWorld={(vId) => engineRef.current?.removeVehicleById(vId)}
              onTeleport={handleTeleport}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'map' && (
            <MapModal
              key="modal-map"
              districts={LUANDA_DISTRICTS}
              interactables={engineRef.current ? engineRef.current.getInteractables() : []}
              playerPos={{
                x: engineRef.current ? engineRef.current.player.position.x : character.position.x,
                z: engineRef.current ? engineRef.current.player.position.z : character.position.z,
              }}
              currentDistrict={currentDistrict}
              activeGps={gpsWaypoint}
              onSetGpsWaypoint={(wp) => {
                setGpsWaypoint(wp);
                engineRef.current?.setGpsWaypoint(wp);
              }}
              onTeleport={handleTeleport}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'phone' && (
            <PhoneModal
              key="modal-phone"
              characterId={character.id}
              stats={character.stats}
              playerPos={{
                x: engineRef.current ? engineRef.current.player.position.x : character.position.x,
                z: engineRef.current ? engineRef.current.player.position.z : character.position.z,
              }}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onOpenBank={() => setActiveModal('atm')}
              onOpenJobs={() => setActiveModal('jobs')}
              onOpenMap={() => setActiveModal('map')}
              onSetGpsWaypoint={(wp) => {
                setGpsWaypoint(wp);
                engineRef.current?.setGpsWaypoint(wp);
              }}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'jobs' && (
            <JobsFactionsModal
              key="modal-jobs"
              characterId={character.id}
              stats={character.stats}
              jobStepIndex={character.jobStepIndex}
              initialTab={jobsInitialTab}
              initialJobFocus={jobsInitialFocusId}
              drivingModelId={engineRef.current?.getDrivingModelId() ?? null}
              playerPos={{
                x: engineRef.current ? engineRef.current.player.position.x : character.position.x,
                y: engineRef.current ? engineRef.current.player.position.y : character.position.y,
                z: engineRef.current ? engineRef.current.player.position.z : character.position.z,
              }}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onJobStarted={handleJobStarted}
              onSpawnFarmVan={(van) => {
                spawnSharedVehicleInEngine(van);
                showToast(`🚚 Carrinha Agrícola [${van.plate}] pronta na Fazenda!`);
              }}
              onApplySkinPreset={async (preset: SkinPreset) => {
                const res = await api.updateAppearance(character.id, {
                  customization: {
                    ...character.customization,
                    ...preset.customization,
                    equippedWeapon: character.customization.equippedWeapon,
                  },
                });
                syncCharacterRecord(res.character);
                showToast(`Skin equipada: ${preset.label}!`);
              }}
              onSetGpsWaypoint={(wp) => {
                setGpsWaypoint(wp);
                engineRef.current?.setGpsWaypoint(wp);
              }}
              onFaaHeistTriggered={() => engineRef.current?.notifyFaaHeistAlert(90000)}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'justice' && (
            <JusticeHospitalModal
              key="modal-justice"
              characterId={character.id}
              stats={character.stats}
              initialTab={justiceInitialTab}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onSetGpsWaypoint={(wp) => {
                setGpsWaypoint(wp);
                engineRef.current?.setGpsWaypoint(wp);
              }}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'property' && (
            <PropertyModal
              key={`modal-property-${focusedPropertyId || propertyInitialTab}`}
              characterId={character.id}
              stats={character.stats}
              inventory={character.inventory}
              initialTab={propertyInitialTab}
              focusedPropertyId={focusedPropertyId}
              isInsideHouse={Boolean(
                focusedPropertyId && currentInteriorPropIdRef.current === focusedPropertyId
              )}
              onEnterHouse={(prop) => {
                void enterHouseByPropertyId(prop);
              }}
              onCookingStarted={(dishName) => startCookingCutscene(dishName)}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onPropertiesUpdated={(nextProps) => {
                propertiesRef.current = nextProps;
                const activePropId = currentInteriorPropIdRef.current || character.stats.homePropertyId;
                if (activePropId) {
                  const prop = nextProps.find((p) => p.id === activePropId);
                  if (prop) {
                    const endeUnpaid = (prop.bills?.endeKz ?? prop.unpaidBillsKz ?? 0) > 0;
                    if (!endeUnpaid) {
                      engineRef.current?.setHouseBlackout(false);
                      setIsHouseBlackout(false);
                    }
                  }
                }
              }}
              onSetGpsWaypoint={(wp) => {
                setGpsWaypoint(wp);
                engineRef.current?.setGpsWaypoint(wp);
              }}
              onClose={() => {
                setFocusedPropertyId(null);
                setActiveModal(null);
              }}
            />
          )}

          {activeModal === 'politics' && (
            <PoliticsModal
              key="modal-politics"
              characterId={character.id}
              initialPolitics={politicsState}
              onPoliticsUpdated={(pol) => setPoliticsState(pol)}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'prefeitura' && (
            <PrefeituraModal
              key="modal-prefeitura"
              characterId={character.id}
              stats={character.stats}
              initialPolitics={politicsState}
              onPoliticsUpdated={(pol) => setPoliticsState(pol)}
              onJobStarted={handleJobStarted}
              onSetGpsWaypoint={(wp) => {
                setGpsWaypoint(wp);
                engineRef.current?.setGpsWaypoint(wp);
              }}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'dj' && (
            <DjModal
              key="modal-dj"
              characterId={character.id}
              stats={character.stats}
              initialDjState={djState}
              serverOffsetMs={djServerOffsetMs}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onDjSynced={(nextDj, serverNow) => {
                setDjState(nextDj);
                setDjServerOffsetMs(serverNow - Date.now());
                soundFx.syncGlobalDjTrack(nextDj, serverNow);
                engineRef.current?.setDjVisualActive(
                  Boolean(nextDj.currentTrack && nextDj.currentTrack.endsAt > serverNow)
                );
              }}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'missions' && (
            <MissionsModal
              key="modal-missions"
              characterId={character.id}
              missions={character.missions}
              achievements={character.achievements}
              onCharacterSynced={(rec) => syncCharacterRecord(rec)}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'admin' && account.role !== 'player' && (
            <AdminGodModal
              key="modal-admin"
              account={account}
              currentCharacterId={character.id}
              onCharacterUpdated={(char, vehs, action) => {
                if (char.id === character.id) {
                  syncCharacterRecord(char, vehs);
                  if (action === 'teleport') {
                    engineRef.current?.teleport(char.position.x, char.position.z);
                  }
                }
              }}
              onWorldUpdated={(cfg) => {
                const nw = normalizeWeatherType(cfg.weather);
                setCurrentWeather(nw);
                setWeatherMode(cfg.weatherMode || 'manual');
                setTimeOfDay(cfg.timeOfDay);
                if (engineRef.current) {
                  engineRef.current.setWeather(nw);
                  engineRef.current.timeOfDay = cfg.timeOfDay;
                }
              }}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'settings' && (
            <SettingsModal
              key="modal-settings"
              settings={settings}
              hudPrefs={hudPrefs}
              timeOfDay={timeOfDay}
              weatherMode={weatherMode}
              onUpdateSettings={handleUpdateSettings}
              onUpdateHudPrefs={handleUpdateHudPrefs}
              onSetTimeOfDay={handleSetTimeOfDay}
              onSetWeatherMode={handleSetWeatherMode}
              onClose={() => setActiveModal(null)}
            />
          )}
        </AnimatePresence>
      )}

      {/* 7. CUTSCENE DE COZINHA ANGOLANA */}
      {cookingCutscene && (
        <div className="fixed inset-x-0 bottom-24 z-[980] pointer-events-none flex justify-center px-4">
          <div className="bg-zinc-950/95 border-2 border-orange-500 rounded-2xl px-6 py-4 text-center text-white shadow-2xl max-w-md w-full space-y-1.5">
            <div className="text-xs font-black tracking-widest uppercase text-orange-400 animate-pulse">
              🔥 A COZINHAR NA COZINHA ANGOLANA...
            </div>
            <div className="text-base font-black text-amber-200">{cookingCutscene.dish}</div>
            <div className="text-[11px] text-zinc-400">
              Fumo suave e aroma tradicional a sair do fogão.
            </div>
          </div>
        </div>
      )}

      {/* 8. CUTSCENE DE VOO TAAG AEROPORTO */}
      {flightCutscene && (
        <div className="fixed inset-x-0 top-16 z-[980] pointer-events-none flex justify-center px-4">
          <div className="bg-zinc-950/95 border-2 border-sky-400 rounded-2xl px-6 py-4 text-center text-white shadow-2xl max-w-lg w-full space-y-1">
            <div className="text-xs font-black tracking-widest uppercase text-sky-300 animate-pulse">
              ✈️ VOO TAAG EM CURSO
            </div>
            <div className="text-base font-black text-white">{flightCutscene.label}</div>
            <div className="text-[11px] text-zinc-400">
              A sobrevoar Luanda rumo a {flightCutscene.district.toUpperCase()}...
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL DE CHECK-IN DO AEROPORTO 4 DE FEVEREIRO */}
      {airportModalOpen && character && (
        <div className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-lg bg-zinc-900 border-2 border-sky-500/70 rounded-2xl p-5 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-black text-sky-300">✈️ Aeroporto 4 de Fevereiro — Check-in TAAG</h2>
                <p className="text-xs text-zinc-400">Escolhe o teu voo panorâmico ou executivo por Luanda.</p>
              </div>
              <button
                type="button"
                onClick={() => setAirportModalOpen(false)}
                className="px-2.5 py-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
              <span className="text-zinc-400">Método de pagamento:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setAirportPayWith('bank')}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    airportPayWith === 'bank' ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Banco ({character.stats.bankKz.toLocaleString('pt-AO')} Kz)
                </button>
                <button
                  type="button"
                  onClick={() => setAirportPayWith('cash')}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    airportPayWith === 'cash' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Cash ({character.stats.cashKz.toLocaleString('pt-AO')} Kz)
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {AIRPORT_FLIGHTS.map((flight) => (
                <div
                  key={flight.id}
                  className="p-3 bg-zinc-950/90 border border-zinc-800 rounded-xl flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm text-white">{flight.label}</div>
                    <div className="text-[11px] text-zinc-400">
                      Destino: <strong className="uppercase text-sky-300">{flight.district}</strong> · Duração: ~{flight.durationSec}s
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={airportCheckinLoading}
                    onClick={async () => {
                      setAirportCheckinLoading(true);
                      try {
                        const res = await api.airportCheckin(character.id, flight.id, airportPayWith);
                        setAirportModalOpen(false);
                        setFlightCutscene(res.flight);
                        showToast(`✈️ Embarque confirmado: ${res.flight.label}!`);
                        if (engineRef.current) {
                          engineRef.current.startAirportFlight(res.flight, () => {
                            syncCharacterRecord(res.character);
                            setFlightCutscene(null);
                            showToast(`✈️ Aterraste em ${res.flight.label}!`);
                          });
                        } else {
                          syncCharacterRecord(res.character);
                          setFlightCutscene(null);
                        }
                      } catch (err: unknown) {
                        showToast(err instanceof Error ? err.message : 'Erro no check-in TAAG.');
                      } finally {
                        setAirportCheckinLoading(false);
                      }
                    }}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white text-xs font-black rounded-xl shrink-0 cursor-pointer"
                  >
                    Embarcar ({flight.priceKz.toLocaleString('pt-AO')} Kz)
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
