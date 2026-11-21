/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AdminRole,
  AnimationState,
  ChatMessage,
  GlobalDjState,
  GpsWaypoint,
  HudPreferences,
  InteractableObject,
  PlayerStats,
  WeaponId,
  WeatherForecastData,
  WeatherMode,
  WeatherType,
  WorldDynamicState,
} from '../../game/types';
import { MinimapSnapshot, VehicleTelemetry } from '../../game/engine/gameEngine';
import { LUANDA_DISTRICTS, normalizeWeatherType, RP_EMOTES, WEATHER_CATALOG, WEAPON_CATALOG } from '../../game/data/catalog';
import {
  Heart,
  Shield,
  Zap,
  Utensils,
  Droplet,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  CreditCard,
  Map,
  Radio,
  Settings,
  HelpCircle,
  CloudRain,
  Sun,
  CloudFog,
  Sunset,
  Moon,
  Volume2,
  VolumeX,
  MessageSquare,
  Send,
  Users,
  Backpack,
  Smartphone,
  Briefcase,
  Car,
  Home,
  Scale,
  Trophy,
  ShieldAlert,
  Smile,
  Fuel,
  Lock,
  Unlock,
  Lightbulb,
  Power,
  Navigation,
  Gamepad2,
  Crosshair,
  Menu,
  X,
  AlertTriangle,
  Landmark,
  Disc3,
  Cloud,
  Thermometer,
  Pause,
  Play,
  Headphones,
  Globe,
  Wind,
  RefreshCw,
  Mic,
  MicOff,
  Building2,
  Siren,
} from 'lucide-react';
import { AudioPlaybackSnapshot, soundFx } from '../../game/audio/soundFx';

interface Props {
  stats: PlayerStats;
  accountRole: AdminRole;
  currentDistrict: string;
  timeString: string;
  currentWeather: WeatherType;
  weatherMode?: WeatherMode;
  weatherForecast?: WeatherForecastData | null;
  isDriving: boolean;
  vehicleTelemetry?: VehicleTelemetry;
  nearInteractable: InteractableObject | null;
  activeJobTitle?: string;
  activeStepLabel?: string;
  gpsWaypoint: GpsWaypoint | null;
  playerPos: { x: number; z: number };
  getMinimapSnapshot?: () => MinimapSnapshot | null;
  equippedWeapon: WeaponId;
  isAiming: boolean;
  weaponAmmo: { mag: number; reserve: number; reloading: boolean };
  ownedWeapons: { id: WeaponId; label: string }[];
  hudPrefs: HudPreferences;
  djState?: GlobalDjState | null;
  djServerOffsetMs?: number;
  afkWarning?: string | null;
  presidentName?: string | null;
  onEquipWeapon: (weaponId: WeaponId) => void;
  onAimChange: (aiming: boolean) => void;
  onFireWeapon: () => void;
  onReloadWeapon: () => void;
  onOpenIdentity: () => void;
  onOpenInventory: () => void;
  onOpenPhone: () => void;
  onOpenJobs: () => void;
  onOpenGarage: () => void;
  onOpenAtm: () => void;
  onOpenMap: () => void;
  onOpenProperties: () => void;
  onOpenJustice: () => void;
  onOpenMissions: () => void;
  onOpenPolitics?: () => void;
  onOpenDj?: () => void;
  onOpenAdmin: () => void;
  onOpenSettings: () => void;
  onInteract: () => void;
  onSetWeather: (w: WeatherType) => void;
  onSetWeatherMode?: (mode: WeatherMode, w?: WeatherType) => void;
  onRefreshWeatherForecast?: () => void;
  onSetTimeOfDay: (hour: number) => void;
  onToggleDrive: () => void;
  onToggleEngine: () => void;
  onToggleHeadlights: () => void;
  onToggleLock: () => void;
  onToggleSiren?: () => void;
  onToggleBlinker?: (mode: 'left' | 'right' | 'hazard') => void;
  onEmote: (anim: AnimationState | null) => void;
  onPunch: () => void;
  onToggleCrouch: () => void;
  isTouchDevice: boolean;
  onToggleTouchControls?: () => void;
  onAnalogMove?: (x: number, y: number) => void;
  onTouchAction?: (
    action: 'forward' | 'backward' | 'left' | 'right' | 'sprint' | 'jump' | 'handbrake' | 'interact' | 'horn',
    active?: boolean
  ) => void;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, channel: ChatMessage['channel']) => void;
  activeCitizensCount: number;
  toastMessage: string | null;
  nearCivilianNpc?: { name: string; isThreatened: boolean } | null;
  onRobNpc?: () => void;
  micActive?: boolean;
  micError?: string | null;
  onToggleMic?: () => void;
  onOpenPrefeitura?: () => void;
  busStatus?: {
    isRiding: boolean;
    busLabel?: string;
    currentStop?: string | null;
    nextStop?: string;
    nearbyBusName?: string | null;
    nearbyBusDist?: number;
  } | null;
  onBoardBus?: () => void;
  onExitBus?: () => void;
  inemaState?: 'idle' | 'en_route' | 'treating' | 'returning';
  isHouseBlackout?: boolean;
  isInFaaRestrictedZone?: boolean;
  onTogglePassenger?: () => void;
  nearVehicleForPassenger?: boolean;
  worldDynamicState?: WorldDynamicState | null;
  showEmotes?: boolean;
  onToggleEmotes?: () => void;
}

type LayoutMode = 'mobile' | 'tablet' | 'desktop';

export const GameHUD: React.FC<Props> = ({
  stats,
  accountRole,
  currentDistrict,
  timeString,
  currentWeather,
  weatherMode,
  weatherForecast,
  isDriving,
  vehicleTelemetry,
  nearInteractable,
  activeJobTitle,
  activeStepLabel,
  gpsWaypoint,
  playerPos,
  getMinimapSnapshot,
  equippedWeapon,
  isAiming,
  weaponAmmo,
  ownedWeapons,
  hudPrefs,
  djState = null,
  djServerOffsetMs = 0,
  afkWarning = null,
  presidentName = null,
  onEquipWeapon,
  onAimChange,
  onFireWeapon,
  onReloadWeapon,
  onOpenIdentity,
  onOpenInventory,
  onOpenPhone,
  onOpenJobs,
  onOpenGarage,
  onOpenAtm,
  onOpenMap,
  onOpenProperties,
  onOpenJustice,
  onOpenMissions,
  onOpenPolitics,
  onOpenDj,
  onOpenAdmin,
  onOpenSettings,
  onInteract,
  onSetWeather,
  onSetWeatherMode,
  onRefreshWeatherForecast,
  onSetTimeOfDay,
  onToggleDrive,
  onToggleEngine,
  onToggleHeadlights,
  onToggleLock,
  onToggleSiren,
  onToggleBlinker,
  onEmote,
  onPunch,
  onToggleCrouch,
  isTouchDevice,
  onToggleTouchControls,
  onAnalogMove,
  onTouchAction,
  chatMessages,
  onSendChat,
  activeCitizensCount,
  toastMessage,
  nearCivilianNpc,
  onRobNpc,
  micActive = false,
  micError = null,
  onToggleMic,
  onOpenPrefeitura,
  busStatus = null,
  onBoardBus,
  onExitBus,
  inemaState = 'idle',
  isHouseBlackout = false,
  isInFaaRestrictedZone = false,
  onTogglePassenger,
  nearVehicleForPassenger = false,
  worldDynamicState = null,
  showEmotes: showEmotesProp,
  onToggleEmotes,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640
      ? 'mobile'
      : typeof window !== 'undefined' && window.innerWidth < 1024
      ? 'tablet'
      : 'desktop'
  );

  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [minimapExpanded, setMinimapExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showControlsGuide, setShowControlsGuide] = useState(false);
  const [showEnvironmentPanel, setShowEnvironmentPanel] = useState(false);
  const [localShowEmotes, setLocalShowEmotes] = useState(false);
  const showEmotes = typeof showEmotesProp === 'boolean' ? showEmotesProp : localShowEmotes;
  const setShowEmotes = (next: boolean) => {
    if (onToggleEmotes) {
      if (next !== showEmotes) onToggleEmotes();
    } else {
      setLocalShowEmotes(next);
    }
  };
  const [showChat, setShowChat] = useState(false);
  const [chatChannel, setChatChannel] = useState<ChatMessage['channel']>('geral');
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [radioActive, setRadioActive] = useState(() => soundFx.getRadioPlaying());
  const [audioSnap, setAudioSnap] = useState<AudioPlaybackSnapshot>(() => soundFx.getAudioSnapshot());
  const [djClockTick, setDjClockTick] = useState(() => Date.now());

  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sprintLocked, setSprintLocked] = useState(false);

  // ResizeObserver responsivo para alternar automaticamente entre Mobile, Tablet e Desktop
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const classify = (w: number) => {
      const next: LayoutMode = w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
      setLayoutMode(next);
    };
    classify(el.clientWidth || window.innerWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        classify(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const unsub = soundFx.subscribeAudioSnapshot((snap) => setAudioSnap(snap));
    const id = window.setInterval(() => {
      setDjClockTick(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  const updateJoystickFromClient = (clientX: number, clientY: number) => {
    const el = joystickBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.36;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(maxRadius, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const ky = dist > 0 ? Math.sin(angle) * clampedDist : 0;
    setKnobOffset({ x: kx, y: ky });
    const normX = maxRadius > 0 ? kx / maxRadius : 0;
    const normForward = maxRadius > 0 ? -ky / maxRadius : 0;
    onAnalogMove?.(normX, normForward);
  };

  const resetJoystick = () => {
    joystickPointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onAnalogMove?.(0, 0);
  };

  const suppressWebMenu = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    if (showChat) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showChat]);

  const shouldRenderMinimap = hudPrefs.showMinimap && minimapExpanded && !!getMinimapSnapshot;

  // Radar GPS 2D em tempo real (8 Hz)
  useEffect(() => {
    if (!shouldRenderMinimap) return;
    const id = window.setInterval(() => {
      const canvas = minimapCanvasRef.current;
      const snap = getMinimapSnapshot?.();
      if (!canvas || !snap) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const scale = 0.42;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Oceano Atlântico (x < -49)
      const oceanEdgePx = cx + (-49 - snap.playerX) * scale;
      if (oceanEdgePx > 0) {
        ctx.fillStyle = '#075985';
        ctx.fillRect(0, 0, Math.min(w, oceanEdgePx), h);
        ctx.fillStyle = '#d6b67d';
        ctx.fillRect(Math.max(0, oceanEdgePx - 2), 0, 5, h);
      }

      // Malha viária principal
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 2.2;
      for (let rx = -380; rx <= 380; rx += 95) {
        const sx = cx + (rx - snap.playerX) * scale;
        if (sx >= -10 && sx <= w + 10) {
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, h);
          ctx.stroke();
        }
      }
      for (let rz = -380; rz <= 380; rz += 95) {
        const sz = cy + (rz - snap.playerZ) * scale;
        if (sz >= -10 && sz <= h + 10) {
          ctx.beginPath();
          ctx.moveTo(0, sz);
          ctx.lineTo(w, sz);
          ctx.stroke();
        }
      }

      // NPCs
      for (const npc of snap.npcs) {
        const nx = cx + (npc.x - snap.playerX) * scale;
        const nz = cy + (npc.z - snap.playerZ) * scale;
        if (nx >= 2 && nx <= w - 2 && nz >= 2 && nz <= h - 2) {
          ctx.fillStyle = npc.isGuard ? '#ef4444' : '#94a3b8';
          ctx.beginPath();
          ctx.arc(nx, nz, npc.isGuard ? 2.6 : 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Jogadores Online
      for (const rp of snap.remotePlayers) {
        const px = cx + (rp.x - snap.playerX) * scale;
        const pz = cy + (rp.z - snap.playerZ) * scale;
        if (px >= 2 && px <= w - 2 && pz >= 2 && pz <= h - 2) {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(px, pz, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Marcador GPS
      if (snap.gps) {
        const gx = cx + (snap.gps.x - snap.playerX) * scale;
        const gz = cy + (snap.gps.z - snap.playerZ) * scale;
        const clampedX = Math.max(7, Math.min(w - 7, gx));
        const clampedZ = Math.max(7, Math.min(h - 7, gz));
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(clampedX, clampedZ, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Seta direcional do jogador
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-snap.playerYaw + Math.PI);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }, 125);
    return () => clearInterval(id);
  }, [getMinimapSnapshot, shouldRenderMinimap]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput, chatChannel);
    setChatInput('');
  };

  const formatKz = (val: number) => `${Math.round(val).toLocaleString('pt-AO')} Kz`;

  const gpsDistance = gpsWaypoint
    ? Math.round(Math.hypot(gpsWaypoint.x - playerPos.x, gpsWaypoint.z - playerPos.z))
    : 0;

  const weatherIcons: Record<WeatherType, React.ReactNode> = {
    ensolarado: <Sun size={14} className="text-amber-400" />,
    nublado: <Cloud size={14} className="text-slate-300" />,
    calor_extremo: <Thermometer size={14} className="text-orange-400" />,
    cacimbo: <CloudFog size={14} className="text-slate-300" />,
    chuva: <CloudRain size={14} className="text-blue-400" />,
    pordosol: <Sunset size={14} className="text-orange-400" />,
    noite: <Moon size={14} className="text-indigo-300" />,
  };
  const safeWeather = normalizeWeatherType(currentWeather);
  const forecastCurrent = weatherForecast?.current;
  const activeWeatherMode: WeatherMode = weatherMode || weatherForecast?.mode || 'auto';
  const djUnlocked = audioSnap.djUnlocked;
  const djMuted = audioSnap.djMuted;
  const isPersonalAudio = audioSnap.mode === 'personal' && !!audioSnap.personalTrack;

  const vitalBars = [
    { label: 'Vida', short: 'VID', val: stats.health, icon: <Heart size={11} />, bar: 'bg-red-500', text: 'text-red-300' },
    { label: 'Colete', short: 'COL', val: stats.armor, icon: <Shield size={11} />, bar: 'bg-sky-400', text: 'text-sky-300' },
    { label: 'Energia', short: 'ENE', val: stats.energy, icon: <Zap size={11} />, bar: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Fome', short: 'FOM', val: stats.hunger, icon: <Utensils size={11} />, bar: 'bg-orange-400', text: 'text-orange-300' },
    { label: 'Sede', short: 'SED', val: stats.thirst, icon: <Droplet size={11} />, bar: 'bg-cyan-400', text: 'text-cyan-300' },
    { label: 'Sono', short: 'SON', val: stats.sleep ?? 100, icon: <Moon size={11} />, bar: 'bg-indigo-400', text: 'text-indigo-300' },
  ];

  const quickNavItems = [
    { label: 'Cidadão', icon: <User size={14} className="text-amber-300" />, onClick: onOpenIdentity },
    { label: 'Mochila', keyHint: 'I', icon: <Backpack size={14} className="text-orange-300" />, onClick: onOpenInventory },
    { label: 'Telefone', keyHint: 'P', icon: <Smartphone size={14} className="text-cyan-300" />, onClick: onOpenPhone },
    { label: 'Empregos', keyHint: 'J', icon: <Briefcase size={14} className="text-amber-300" />, onClick: onOpenJobs },
    { label: 'Garagem', icon: <Car size={14} className="text-blue-300" />, onClick: onOpenGarage },
    { label: 'Banco', icon: <CreditCard size={14} className="text-emerald-300" />, onClick: onOpenAtm },
    { label: 'Casas', icon: <Home size={14} className="text-emerald-200" />, onClick: onOpenProperties },
    { label: 'Justiça', icon: <Scale size={14} className="text-blue-200" />, onClick: onOpenJustice },
    ...(onOpenPolitics ? [{ label: 'Política', icon: <Landmark size={14} className="text-amber-300" />, onClick: onOpenPolitics }] : []),
    ...(onOpenPrefeitura ? [{ label: 'Prefeitura', icon: <Building2 size={14} className="text-yellow-300" />, onClick: onOpenPrefeitura }] : []),
    ...(onOpenDj ? [{ label: 'Música & DJ', icon: <Disc3 size={14} className="text-purple-300" />, onClick: onOpenDj }] : []),
    { label: 'Missões', icon: <Trophy size={14} className="text-yellow-300" />, onClick: onOpenMissions },
    { label: 'Mapa', keyHint: 'M', icon: <Map size={14} className="text-sky-300" />, onClick: onOpenMap },
  ];

  const matchedDistrictId = LUANDA_DISTRICTS.find(
    (d) =>
      d.name.toLowerCase() === currentDistrict.toLowerCase() ||
      d.fullName.toLowerCase() === currentDistrict.toLowerCase() ||
      currentDistrict.toLowerCase().includes(d.id)
  )?.id;
  const districtBlackout = matchedDistrictId ? worldDynamicState?.blackoutDistricts?.[matchedDistrictId] : undefined;
  const districtCleanliness =
    matchedDistrictId && typeof worldDynamicState?.cleanlinessByDistrict?.[matchedDistrictId] === 'number'
      ? worldDynamicState.cleanlinessByDistrict[matchedDistrictId]
      : null;

  const syncedDjNow = djClockTick + djServerOffsetMs;
  const activeDjTrack =
    djState?.currentTrack && djState.currentTrack.endsAt > syncedDjNow ? djState.currentTrack : null;
  const djRemainingSec = activeDjTrack
    ? Math.max(0, Math.ceil((activeDjTrack.endsAt - syncedDjNow) / 1000))
    : 0;

  const isCompactViewport = layoutMode !== 'desktop';
  const clampedScale = Math.max(0.85, Math.min(1.2, hudPrefs.hudScale || 1));
  const recentPreviewMessages = chatMessages.slice(-2);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col justify-between overflow-hidden text-crisp"
    >
      {/* EFEITO VISUAL ATMOSFÉRICO SUTIL (CALOR EXTREMO / CHUVA) */}
      {safeWeather === 'calor_extremo' && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none bg-gradient-to-b from-amber-500/12 via-transparent to-orange-600/10"
        />
      )}
      {safeWeather === 'chuva' && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none bg-gradient-to-b from-sky-950/15 via-transparent to-slate-900/10"
        />
      )}

      {/* TOAST DE NOTIFICAÇÃO */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key="toast-banner"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="absolute top-14 sm:top-4 left-1/2 -translate-x-1/2 pointer-events-auto z-50 max-w-[92vw]"
          >
            <div className="px-4 py-2 hud-surface border border-amber-400 rounded-xl shadow-2xl text-white font-bold text-xs sm:text-sm flex items-center gap-2">
              <span>🇦🇴</span>
              <span className="truncate">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/* 1. CABEÇALHO SUPERIOR RESPONSIVO (MOBILE COMPACTO vs DESKTOP)     */}
      {/* ================================================================= */}
      {isCompactViewport ? (
        <header className="w-full safe-top safe-x pointer-events-none space-y-1 z-20">
          {/* Barra superior compacta (<= 14% altura móvel) */}
          <div className="hud-landscape-compact-header pointer-events-auto hud-surface border rounded-xl px-2.5 py-1.5 shadow-xl flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-white truncate">
                <span className="text-amber-300 shrink-0">LUANDA RP</span>
                <span className="text-zinc-500">·</span>
                <span className="truncate">{stats.name}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-amber-200 font-mono tabular-nums shrink-0">{timeString}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-200 tabular-nums truncate">
                <span className="text-amber-300 font-bold">{formatKz(stats.cashKz)}</span>
                <span className="text-zinc-500">/</span>
                <span className="text-emerald-300 font-bold">{formatKz(stats.bankKz)}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-300 truncate">{currentDistrict}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onToggleMic && (
                <button
                  type="button"
                  onClick={onToggleMic}
                  aria-label={micActive ? 'Desligar Microfone' : 'Ligar Microfone'}
                  title={micError || (micActive ? 'Microfone Ativo [V]' : 'Ligar Microfone [V]')}
                  className={`min-w-[44px] min-h-[44px] rounded-lg border flex items-center justify-center cursor-pointer ${
                    micActive
                      ? 'bg-emerald-600 text-white border-emerald-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-200'
                  }`}
                >
                  {micActive ? <Mic size={17} /> : <MicOff size={17} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowChat(!showChat)}
                aria-label="Abrir Chat"
                className={`min-w-[44px] min-h-[44px] rounded-lg border flex items-center justify-center cursor-pointer ${
                  showChat ? 'bg-amber-500 text-zinc-950 border-amber-300' : 'bg-zinc-900 border-zinc-700 text-zinc-200'
                }`}
              >
                <MessageSquare size={17} />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Menu Luanda RP"
                className="min-w-[44px] min-h-[44px] rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-amber-300 flex items-center justify-center cursor-pointer"
              >
                <Menu size={19} />
              </button>
            </div>
          </div>

          {/* Tira compacta de 6 barras vitais */}
          <div className="flex items-center justify-between gap-2">
            <div className="pointer-events-auto hud-surface border rounded-lg px-2 py-1 grid grid-cols-6 gap-1 flex-1">
              {vitalBars.map((b) => (
                <div key={b.label} className="min-w-0">
                  <div className="flex items-center justify-between text-[9px] font-bold leading-none mb-0.5 tabular-nums">
                    <span className={b.text}>{b.short}</span>
                    <span className="text-white">{Math.round(b.val)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full ${b.bar}`} style={{ width: `${Math.max(0, Math.min(100, b.val))}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {shouldRenderMinimap && layoutMode === 'tablet' && (
              <button
                type="button"
                onClick={onOpenMap}
                className="pointer-events-auto rounded-lg overflow-hidden border border-amber-400 shrink-0 cursor-pointer"
              >
                <canvas ref={minimapCanvasRef} width={68} height={68} className="block w-14 h-14" />
              </button>
            )}
          </div>

          {(isPersonalAudio || activeDjTrack) && (
            <div className="pointer-events-auto hud-surface border border-purple-500/60 rounded-lg px-2.5 py-1 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={onOpenDj}
                className="flex items-center gap-1.5 min-w-0 truncate text-purple-200 font-bold cursor-pointer"
              >
                {isPersonalAudio ? (
                  <Headphones size={12} className="text-cyan-400 shrink-0" />
                ) : (
                  <Disc3 size={12} className="text-purple-400 shrink-0" />
                )}
                <span className="truncate">
                  {isPersonalAudio && audioSnap.personalTrack
                    ? audioSnap.personalTrack.title
                    : activeDjTrack?.title}
                </span>
                {!isPersonalAudio && activeDjTrack && (
                  <span className="font-mono tabular-nums text-amber-300 shrink-0">{djRemainingSec}s</span>
                )}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {isPersonalAudio ? (
                  <>
                    <button
                      type="button"
                      onClick={() => soundFx.togglePersonalPause()}
                      className="px-2 py-0.5 bg-cyan-600 text-white font-bold rounded text-[10px] cursor-pointer"
                    >
                      {audioSnap.personalTrack?.paused ? 'Play' : 'Pausa'}
                    </button>
                    <button
                      type="button"
                      onClick={() => soundFx.switchToGlobalDjMode()}
                      className="px-2 py-0.5 bg-purple-600 text-white font-bold rounded text-[10px] cursor-pointer"
                    >
                      DJ Global
                    </button>
                  </>
                ) : (
                  !djUnlocked && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await soundFx.unlockDjAudio();
                        if (ok && djState) soundFx.syncGlobalDjTrack(djState, Date.now() + djServerOffsetMs);
                      }}
                      className="px-2 py-0.5 bg-emerald-600 text-white font-bold rounded text-[10px] cursor-pointer"
                    >
                      Ativar Áudio
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => soundFx.setDjMuted(!djMuted)}
                  className="p-1 bg-zinc-900 rounded border border-zinc-700 cursor-pointer"
                >
                  {djMuted ? <VolumeX size={11} className="text-red-400" /> : <Volume2 size={11} className="text-emerald-300" />}
                </button>
              </div>
            </div>
          )}

          {afkWarning && (
            <div className="pointer-events-auto px-2.5 py-1 rounded-lg bg-amber-950/95 border border-amber-400 text-[11px] font-bold text-amber-100">
              {afkWarning}
            </div>
          )}

          {stats.wantedStars > 0 && (
            <div className="pointer-events-auto px-2.5 py-1 rounded-lg bg-red-950/95 border border-red-500 flex items-center justify-between text-[11px] font-black text-red-100">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-300" /> PNA EM PERSEGUIÇÃO
              </span>
              <span className="text-amber-300 tracking-widest">{'★'.repeat(stats.wantedStars)}</span>
            </div>
          )}

          {(activeStepLabel || gpsWaypoint) && (
            <div className="pointer-events-auto hud-surface border rounded-lg px-2.5 py-1 text-[11px] text-amber-200 font-semibold flex items-center justify-between gap-2 truncate">
              <span className="truncate">{activeStepLabel ? `${activeJobTitle}: ${activeStepLabel}` : ''}</span>
              {gpsWaypoint && (
                <span className="text-cyan-300 font-mono tabular-nums shrink-0">
                  GPS {gpsDistance}m
                </span>
              )}
            </div>
          )}
        </header>
      ) : (
        /* CABEÇALHO DESKTOP (>= 1024px) */
        <header
          className="w-full p-3 flex items-start justify-between pointer-events-none gap-3 z-20 origin-top"
          style={{ transform: clampedScale !== 1 ? `scale(${clampedScale})` : undefined }}
        >
          {/* Card Identidade & Finanças */}
          <div className="pointer-events-auto hud-surface border rounded-2xl p-3 shadow-2xl text-white w-80">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-sm font-black tracking-wide text-amber-300">
                <span>LUANDA RP</span>
                <span className="text-xs font-bold text-zinc-400">· Nv.{stats.level}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-200">
                <span className="flex items-center gap-1 text-emerald-300 font-bold" title="Cidadãos online">
                  <Users size={12} /> {activeCitizensCount}
                </span>
                <span className="text-zinc-600">|</span>
                <button
                  type="button"
                  onClick={() => setShowEnvironmentPanel(!showEnvironmentPanel)}
                  className="flex items-center gap-1.5 text-amber-200 hover:text-amber-300 font-bold cursor-pointer"
                  title="Previsão Meteorológica e Hora de Luanda"
                >
                  {weatherIcons[safeWeather]}
                  {forecastCurrent && (
                    <span className="text-white">{Math.round(forecastCurrent.tempC)}°C</span>
                  )}
                  <Clock size={12} />
                  <span>{timeString}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <span className="truncate">{stats.name} {stats.surname}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-amber-300 flex items-center gap-1 truncate">
                <MapPin size={12} className="text-red-400 shrink-0" />
                {currentDistrict}
              </span>
            </div>

            {stats.wantedStars > 0 && (
              <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-red-950/95 border border-red-500 flex items-center justify-between gap-2 text-[11px] font-black text-red-100">
                <span className="flex items-center gap-1">
                  <AlertTriangle size={13} className="text-amber-300" /> POLÍCIA PNA EM PERSEGUIÇÃO
                </span>
                <span className="text-amber-300">{'★'.repeat(stats.wantedStars)}</span>
              </div>
            )}

            {presidentName && (
              <div className="mt-1 text-[10px] text-zinc-400 truncate">
                Presidente: <strong className="text-amber-300">{presidentName}</strong>
              </div>
            )}

            <div className="mt-2 pt-1.5 border-t border-zinc-800 flex items-center justify-between text-xs tabular-nums">
              <div>
                <span className="text-zinc-400 mr-1">Mão:</span>
                <span className="font-black text-amber-300 font-mono">{formatKz(stats.cashKz)}</span>
              </div>
              <div>
                <span className="text-zinc-400 mr-1">Banco:</span>
                <span className="font-black text-emerald-300 font-mono">{formatKz(stats.bankKz)}</span>
              </div>
            </div>

            {(activeStepLabel || gpsWaypoint) && (
              <div className="mt-2 pt-1.5 border-t border-zinc-800 space-y-1 text-xs">
                {activeStepLabel && (
                  <div className="text-amber-200 font-semibold truncate">
                    Missão {activeJobTitle}: {activeStepLabel}
                  </div>
                )}
                {gpsWaypoint && (
                  <div className="text-cyan-300 font-mono font-bold tabular-nums flex items-center gap-1">
                    <Navigation size={12} /> {gpsWaypoint.label} ({gpsDistance}m)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Barra Central Desktop: DJ Global Sync / Música Pessoal & Aviso AFK */}
          <div className="flex flex-col items-center gap-1.5 pointer-events-none">
            {(isPersonalAudio || activeDjTrack) && (
              <div className="pointer-events-auto hud-surface border border-purple-500/70 rounded-2xl px-3.5 py-2 shadow-2xl flex items-center gap-3 text-xs max-w-md">
                <button
                  type="button"
                  onClick={onOpenDj}
                  className="flex items-center gap-2 text-left cursor-pointer min-w-0"
                >
                  {isPersonalAudio ? (
                    <Headphones size={16} className="text-cyan-400 shrink-0" />
                  ) : (
                    <Disc3 size={16} className="text-purple-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-black text-white leading-tight truncate">
                      {isPersonalAudio && audioSnap.personalTrack
                        ? `${audioSnap.personalTrack.title} — ${audioSnap.personalTrack.artist}`
                        : `${activeDjTrack?.title} — ${activeDjTrack?.artist}`}
                    </div>
                    <div className="text-[10px] text-zinc-300 tabular-nums truncate">
                      {isPersonalAudio && audioSnap.personalTrack
                        ? `Tua Música · ${audioSnap.personalTrack.genre}`
                        : `DJ Global (${activeDjTrack?.genre || 'Rádio'} Sync) por ${activeDjTrack?.paidByName} · ${djRemainingSec}s`}
                    </div>
                  </div>
                </button>
                {isPersonalAudio ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => soundFx.togglePersonalPause()}
                      title={audioSnap.personalTrack?.paused ? 'Retomar música' : 'Pausar música'}
                      className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg cursor-pointer"
                    >
                      {audioSnap.personalTrack?.paused ? <Play size={13} /> : <Pause size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => soundFx.switchToGlobalDjMode()}
                      title="Voltar ao DJ Global Sincronizado"
                      className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer"
                    >
                      <Globe size={11} /> DJ Global
                    </button>
                  </div>
                ) : (
                  !djUnlocked && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await soundFx.unlockDjAudio();
                        if (ok && djState) soundFx.syncGlobalDjTrack(djState, Date.now() + djServerOffsetMs);
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg text-[11px] cursor-pointer shrink-0"
                    >
                      Ativar Áudio
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => soundFx.setDjMuted(!djMuted)}
                  title="Silenciar/Ativar Música"
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer shrink-0"
                >
                  {djMuted ? <VolumeX size={14} className="text-red-400" /> : <Volume2 size={14} className="text-emerald-300" />}
                </button>
              </div>
            )}

            {afkWarning && (
              <div className="pointer-events-auto px-3.5 py-1.5 rounded-xl bg-amber-950/95 border border-amber-400 text-xs font-bold text-amber-100 shadow-xl">
                {afkWarning}
              </div>
            )}
          </div>

          {/* Botões utilitários canto superior direito */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            {accountRole !== 'player' && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl border border-red-400 shadow-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <ShieldAlert size={15} />
                <span>Admin</span>
              </button>
            )}
            {onToggleMic && (
              <button
                type="button"
                onClick={onToggleMic}
                title={micError || 'Falar no Microfone por Proximidade [V]'}
                className={`px-3 py-2 rounded-xl border shadow-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  micActive
                    ? 'bg-emerald-600 text-white border-emerald-300'
                    : 'hud-surface hover:border-emerald-500 text-zinc-200'
                }`}
              >
                {micActive ? <Mic size={15} /> : <MicOff size={15} />}
                <span>{micActive ? 'Mic ON [V]' : 'Mic [V]'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowEmotes(!showEmotes)}
              className={`px-3 py-2 rounded-xl border shadow-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                showEmotes
                  ? 'bg-purple-600 text-white border-purple-400'
                  : 'hud-surface hover:border-purple-500 text-zinc-200'
              }`}
            >
              <Smile size={15} />
              <span>Emotes [B]</span>
            </button>
            <button
              type="button"
              onClick={() => setShowChat(!showChat)}
              className={`px-3 py-2 rounded-xl border shadow-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                showChat
                  ? 'bg-amber-500 text-zinc-950 border-amber-300'
                  : 'hud-surface hover:border-amber-500 text-zinc-200'
              }`}
            >
              <MessageSquare size={15} />
              <span>Chat RP</span>
            </button>
            {onToggleTouchControls && (
              <button
                type="button"
                onClick={onToggleTouchControls}
                title="Alternar Controlo Tátil"
                className={`p-2 rounded-xl border shadow-lg cursor-pointer ${
                  isTouchDevice
                    ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                    : 'hud-surface hover:border-amber-500 text-zinc-300'
                }`}
              >
                <Gamepad2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowControlsGuide(!showControlsGuide)}
              title="Teclas de Atalho"
              className="p-2 hud-surface border hover:border-amber-500 text-zinc-300 rounded-xl shadow-lg cursor-pointer"
            >
              <HelpCircle size={16} className="text-amber-400" />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              title="Definições e Gráficos"
              className="p-2 hud-surface border hover:border-amber-500 text-zinc-300 rounded-xl shadow-lg cursor-pointer"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>
      )}

      {/* ================================================================= */}
      {/* 2. GAVETA LATERAL MOBILE / TABLET (TODOS OS ATALHOS SEM OVERFLOW) */}
      {/* ================================================================= */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 pointer-events-auto flex justify-end"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: 280 }}
              animate={{ x: 0 }}
              exit={{ x: 280 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-72 max-w-[85vw] h-full bg-zinc-950 border-l border-zinc-800 p-4 flex flex-col gap-3 overflow-y-auto safe-top safe-bottom"
            >
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div>
                  <div className="text-sm font-black text-amber-300">LUANDA RP 🇦🇴</div>
                  <div className="text-[11px] text-zinc-400">
                    {stats.name} {stats.surname} · {activeCitizensCount} online
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-900 text-zinc-300 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {quickNavItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      item.onClick();
                    }}
                    className="min-h-[44px] px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    const next = soundFx.toggleRadio();
                    setRadioActive(next);
                  }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    radioActive ? 'bg-amber-500/25 border-amber-400 text-amber-200' : 'bg-zinc-900 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <Radio size={15} /> Rádio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowEmotes(true);
                  }}
                  className="min-h-[44px] px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-bold text-purple-300 flex items-center gap-2 cursor-pointer"
                >
                  <Smile size={15} /> Emotes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowEnvironmentPanel(true);
                  }}
                  className="min-h-[44px] px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-bold text-amber-200 flex items-center gap-2 cursor-pointer"
                >
                  {weatherIcons[safeWeather]} Clima
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="min-h-[44px] px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-bold text-zinc-200 flex items-center gap-2 cursor-pointer"
                >
                  <Settings size={15} /> Definições
                </button>
              </div>

              {ownedWeapons.length > 0 && (
                <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                  <div className="text-[11px] font-bold text-zinc-400">Armamento Equipado</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ownedWeapons.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onEquipWeapon(w.id === equippedWeapon ? 'none' : w.id)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                          equippedWeapon === w.id
                            ? 'bg-amber-400 text-zinc-950 border-white'
                            : 'bg-zinc-900 text-zinc-200 border-zinc-700'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {accountRole !== 'player' && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAdmin();
                  }}
                  className="min-h-[44px] px-3 py-2 bg-red-600 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldAlert size={16} /> Painel Admin God
                </button>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* POPOVER EMOTES RP [B] AGRUPADOS POR CATEGORIA */}
      <AnimatePresence>
        {showEmotes && (
          <motion.div
            key="emotes-drawer"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 right-3 sm:right-24 w-72 max-w-[92vw] max-h-[68dvh] overflow-y-auto hud-surface border border-purple-500/60 rounded-2xl p-3 shadow-2xl pointer-events-auto z-40 space-y-2.5"
          >
            <div className="flex justify-between items-center text-xs font-bold text-purple-300 pb-1.5 border-b border-zinc-800 sticky top-0 bg-zinc-950/95 z-10">
              <span>Animações RP [B]</span>
              <button
                type="button"
                onClick={() => { onEmote(null); setShowEmotes(false); }}
                className="text-red-300 hover:text-white cursor-pointer px-2 py-1 rounded bg-zinc-900 border border-zinc-700"
              >
                Parar Animação ✕
              </button>
            </div>
            {(
              [
                { id: 'social', label: 'Social & Festa' },
                { id: 'acao', label: 'Ações & Documentos' },
                { id: 'trabalho', label: 'Profissões & Serviços' },
                { id: 'postura', label: 'Posturas' },
              ] as const
            ).map((cat) => {
              const items = RP_EMOTES.filter((em) => em.category === cat.id);
              if (items.length === 0) return null;
              return (
                <div key={cat.id} className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 px-1">
                    {cat.label}
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {items.map((em) => (
                      <button
                        type="button"
                        key={em.id}
                        onClick={() => {
                          onEmote(em.anim);
                          setShowEmotes(false);
                        }}
                        className="w-full min-h-[40px] text-left px-2.5 py-2 bg-zinc-900 hover:bg-purple-600/30 border border-zinc-800 rounded-lg text-xs text-zinc-200 cursor-pointer"
                      >
                        {em.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHAT RP */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            key="chat-drawer"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            className="absolute top-16 right-3 left-3 sm:left-auto sm:right-4 sm:w-96 max-h-[420px] hud-surface border rounded-2xl shadow-2xl flex flex-col pointer-events-auto z-40"
          >
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <span className="text-xs font-bold uppercase text-amber-400">
                Chat Luanda RP · {activeCitizensCount} online
              </span>
              <button type="button" onClick={() => setShowChat(false)} className="text-zinc-400 hover:text-white text-xs cursor-pointer p-1">
                ✕
              </button>
            </div>

            <div className="flex border-b border-zinc-800 bg-zinc-900/70 p-1 gap-1 text-xs font-black">
              {(['geral', 'proximidade', 'radio', 'faccao', 'admin'] as ChatMessage['channel'][]).map((ch) => (
                <button
                  type="button"
                  key={ch}
                  onClick={() => setChatChannel(ch)}
                  className={`flex-1 py-1.5 rounded-lg uppercase cursor-pointer ${
                    chatChannel === ch ? 'bg-amber-500 text-zinc-950' : 'text-zinc-200 hover:text-white'
                  }`}
                >
                  {ch === 'proximidade' ? 'Prox' : ch}
                </button>
              ))}
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs max-h-52">
              {chatMessages.length === 0 ? (
                <p className="text-zinc-400 text-center py-4 italic">
                  Comandos: /me, /do, /ooc, /s, /l, /f, /r, /pm
                </p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                    <div className="flex items-center justify-between mb-0.5 text-[11px]">
                      <span className="font-bold text-amber-300">
                        {msg.senderRole && msg.senderRole !== 'player' ? `[${msg.senderRole}] ` : ''}
                        {msg.senderName}
                      </span>
                      <span className="text-zinc-400 font-mono tabular-nums">{msg.channel} · {msg.timestamp}</span>
                    </div>
                    <p className={msg.channel === 'rp' ? 'text-fuchsia-200 italic font-medium' : 'text-white'}>{msg.text}</p>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-2 border-t border-zinc-800 flex gap-1.5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Falar ou comando (/me, /ooc)..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold cursor-pointer"
              >
                <Send size={14} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PAINEL PREVISÃO METEOROLÓGICA DINÂMICA & HORAS */}
      <AnimatePresence>
        {showEnvironmentPanel && (
          <motion.div
            key="env-drawer"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-20 left-3 right-3 sm:right-auto sm:left-4 sm:w-96 p-4 hud-surface border border-zinc-700 rounded-2xl shadow-2xl text-white pointer-events-auto z-40 space-y-3 max-h-[82vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                {weatherIcons[safeWeather]}
                <span className="text-xs font-bold text-amber-300">
                  Previsão Meteorológica · {weatherForecast?.locationName || 'Luanda, AO'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowEnvironmentPanel(false)}
                className="min-w-[36px] min-h-[36px] text-zinc-400 hover:text-white text-xs cursor-pointer flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Controlo Auto API vs Manual */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1.5 flex-1">
                <button
                  type="button"
                  onClick={() => onSetWeatherMode?.('auto')}
                  className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    activeWeatherMode === 'auto'
                      ? 'bg-sky-600 text-white border-sky-400'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                  }`}
                >
                  Auto API Luanda
                </button>
                <button
                  type="button"
                  onClick={() => onSetWeatherMode?.('manual', safeWeather)}
                  className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    activeWeatherMode === 'manual'
                      ? 'bg-amber-500 text-zinc-950 border-amber-400'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                  }`}
                >
                  Manual
                </button>
              </div>
              {onRefreshWeatherForecast && (
                <button
                  type="button"
                  onClick={onRefreshWeatherForecast}
                  title="Atualizar dados da API Open-Meteo"
                  className="min-w-[38px] min-h-[38px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center text-sky-300 cursor-pointer"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>

            {/* Telemetria Atual de Luanda */}
            {forecastCurrent && (
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2 tabular-nums">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black font-mono text-white leading-none">
                      {Math.round(forecastCurrent.tempC)}°C
                    </div>
                    <div className="text-[11px] text-zinc-300 mt-1">{forecastCurrent.conditionLabel}</div>
                  </div>
                  <div className="text-right text-[11px] text-zinc-400">
                    <div>Sensação: <strong className="text-amber-300">{Math.round(forecastCurrent.feelsLikeC)}°C</strong></div>
                    <div>Fonte: {forecastCurrent.source === 'open-meteo' ? 'API Open-Meteo' : 'Modelo Local'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-zinc-800 text-[10px] text-zinc-300">
                  <div>
                    <div className="text-zinc-500">Nuvens</div>
                    <div className="font-mono font-bold">{Math.round(forecastCurrent.cloudCover)}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Humidade</div>
                    <div className="font-mono font-bold">{Math.round(forecastCurrent.humidity)}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Chuva</div>
                    <div className="font-mono font-bold">{forecastCurrent.precipMm.toFixed(1)}mm</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 flex items-center gap-0.5"><Wind size={10} /> Vento</div>
                    <div className="font-mono font-bold">{Math.round(forecastCurrent.windKmh)}km/h</div>
                  </div>
                </div>
              </div>
            )}

            {/* Previsão Próximas Horas */}
            {weatherForecast && weatherForecast.hourly.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-zinc-400">Previsão Próximas Horas</div>
                <div className="grid grid-cols-6 gap-1 tabular-nums">
                  {weatherForecast.hourly.slice(0, 6).map((slot) => (
                    <div
                      key={slot.timeLabel}
                      className="p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-lg text-center space-y-1"
                    >
                      <div className="text-[10px] font-mono text-zinc-400">{slot.timeLabel}</div>
                      <div className="flex justify-center">{weatherIcons[normalizeWeatherType(slot.mappedWeather)]}</div>
                      <div className="text-xs font-black font-mono text-white">{Math.round(slot.tempC)}°</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seleção Rápida de Clima (Manual) */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-zinc-400">Simular Condição Atmosférica</div>
              <div className="grid grid-cols-2 gap-1.5">
                {WEATHER_CATALOG.map((w) => (
                  <button
                    type="button"
                    key={w.id}
                    onClick={() => onSetWeather(w.id)}
                    className={`min-h-[38px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border cursor-pointer ${
                      safeWeather === w.id
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {weatherIcons[w.id]}
                    <span className="truncate">{w.shortLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Horário */}
            <div className="grid grid-cols-3 gap-1.5 tabular-nums">
              {[
                { label: '08:00', hour: 8 },
                { label: '13:00', hour: 13 },
                { label: '16:00', hour: 16 },
                { label: '18:30', hour: 18.5 },
                { label: '21:00', hour: 21 },
                { label: '00:00', hour: 0 },
              ].map((h) => (
                <button
                  type="button"
                  key={h.label}
                  onClick={() => onSetTimeOfDay(h.hour)}
                  className="min-h-[36px] py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono cursor-pointer"
                >
                  {h.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GUIA DE TECLAS PC */}
      <AnimatePresence>
        {showControlsGuide && (
          <motion.div
            key="controls-drawer"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 right-4 p-4 hud-surface border rounded-xl shadow-2xl text-white pointer-events-auto max-w-xs z-40"
          >
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-zinc-800">
              <span className="text-xs font-bold uppercase text-amber-400">Teclas Luanda RP</span>
              <button type="button" onClick={() => setShowControlsGuide(false)} className="text-zinc-400 hover:text-white text-xs cursor-pointer">
                ✕
              </button>
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">WASD / Setas</span><span>Mover / Conduzir</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">Shift / Espaço</span><span>Correr / Saltar / Freio</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">Esq/Dir Rato</span><span>Disparar / Mirar (ADS)</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">R / C / F / Q</span><span>Recarr. / Agach. / Soco / Assaltar</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">E / G</span><span>Condutor / Passageiro</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">Z / X / N</span><span>Pisca Esq / Dir / 4-Piscas</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">K / L / U / H / Y</span><span>Motor / Faróis / Trancar / Bibi / Sirene</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">V</span><span>Microfone (Voz em Jogo)</span></div>
              <div className="flex justify-between gap-4"><span className="font-mono text-amber-400">I / P / J / B / M</span><span>Menus & Emotes [B]</span></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MIRA CENTRAL ADS QUANDO COM ARMA */}
      {!isDriving && equippedWeapon !== 'none' && (isAiming || !isTouchDevice) && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-10">
          <div
            className={`rounded-full transition-all flex items-center justify-center ${
              isAiming
                ? 'w-7 h-7 border-2 border-amber-400 bg-amber-400/10'
                : 'w-4 h-4 border border-white/50'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isAiming ? 'bg-red-500' : 'bg-white/80'}`} />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. CENTRO CONTEXTUAL COMPACTO (BUS ANGO REAL / INEMA / [E] / [Q]) */}
      {/* ================================================================= */}
      <div className="flex-1 flex flex-col items-center justify-end pb-3 gap-1.5 pointer-events-none px-4">
        <AnimatePresence>
          {isInFaaRestrictedZone && (
            <motion.div
              key="faa-warning"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto px-3 py-1 rounded-xl bg-red-950/90 border border-red-400 text-[11px] font-black text-red-100 shadow-xl"
            >
              ☢️ ÁREA MILITAR FAA RESTRITA — Autorização obrigatória ou execução a tiro!
            </motion.div>
          )}
          {isHouseBlackout && (
            <motion.div
              key="ende-blackout-warning"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto px-3 py-1 rounded-xl bg-zinc-950/95 border border-yellow-400 text-[11px] font-bold text-yellow-200 shadow-xl flex items-center gap-2"
            >
              <span>⚡ Energia cortada pela ENDE — Paga a fatura de energia em Casas para acender as luzes.</span>
            </motion.div>
          )}
          {(inemaState === 'en_route' || inemaState === 'treating') && (
            <motion.div
              key="inema-dispatch-banner"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto px-3 py-1.5 rounded-xl bg-blue-950/95 border border-sky-400 text-xs font-bold text-sky-100 shadow-xl"
            >
              {inemaState === 'en_route'
                ? '🚑 Ambulância INEMA (112) a caminho em tempo real...'
                : '🩺 Equipa INEMA chegou — a reanimar no local!'}
            </motion.div>
          )}
          {busStatus?.isRiding && (
            <motion.div
              key="bus-riding-banner"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto hud-surface border border-amber-400 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5 text-xs"
            >
              <div className="text-left">
                <div className="font-black text-amber-300">
                  🚌 {busStatus.busLabel || 'Autocarro ANGO REAL'}
                </div>
                <div className="text-[11px] text-zinc-200">
                  {busStatus.currentStop
                    ? `Parado em: ${busStatus.currentStop}`
                    : `Em viagem · Próxima paragem: ${busStatus.nextStop || 'Rota Luanda'}`}
                </div>
              </div>
              {onExitBus && (
                <button
                  type="button"
                  onClick={onExitBus}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[11px] rounded-lg cursor-pointer"
                >
                  Sair [E]
                </button>
              )}
            </motion.div>
          )}
          {!isDriving && !busStatus?.isRiding && busStatus?.nearbyBusName && onBoardBus && (
            <motion.div
              key="bus-board-banner"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto hud-surface border border-sky-400 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5 text-xs"
            >
              <div className="text-left">
                <div className="font-bold text-white">{busStatus.nearbyBusName}</div>
                <div className="text-[10px] text-sky-200">
                  Próxima: {busStatus.nextStop || 'Centro'} ({busStatus.nearbyBusDist ?? 0}m)
                </div>
              </div>
              <button
                type="button"
                onClick={onBoardBus}
                className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-black text-[11px] rounded-lg cursor-pointer"
              >
                Entrar no Autocarro
              </button>
            </motion.div>
          )}
          {!isDriving && nearCivilianNpc && onRobNpc && (
            <motion.div
              key="rob-npc-prompt"
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              className="pointer-events-auto hud-surface border border-red-500 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5 max-w-xs"
            >
              <div className="text-left min-w-0">
                <div className="text-[11px] font-black text-white truncate">{nearCivilianNpc.name}</div>
                <div className="text-[10px] text-red-300 truncate">
                  {nearCivilianNpc.isThreatened ? 'Cidadão rendido!' : 'Cidadão próximo'}
                </div>
              </div>
              <button
                type="button"
                onClick={onRobNpc}
                className="min-h-[34px] px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-black text-[11px] rounded-lg border border-red-300 cursor-pointer shrink-0"
              >
                Assaltar [Q]
              </button>
            </motion.div>
          )}
          {districtBlackout && (
            <motion.div
              key="district-blackout-badge"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto px-3 py-1 rounded-xl bg-amber-950/95 border border-yellow-400 text-[11px] font-bold text-yellow-200 shadow-xl"
            >
              ⚡ Apagão ENDE neste bairro: {districtBlackout.title}
            </motion.div>
          )}
          {districtCleanliness !== null && districtCleanliness < 50 && (
            <motion.div
              key="district-cleanliness-badge"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto px-3 py-1 rounded-xl bg-emerald-950/90 border border-emerald-400 text-[11px] font-bold text-emerald-200 shadow-xl"
            >
              🗑️ Limpeza urbana baixa neste bairro: {Math.round(districtCleanliness)}%
            </motion.div>
          )}
          {!isDriving && !vehicleTelemetry?.isPassenger && nearVehicleForPassenger && onTogglePassenger && (
            <motion.div
              key="passenger-board-prompt"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-auto hud-surface border border-sky-400 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5 max-w-xs"
            >
              <span className="text-[11px] font-bold text-sky-200">Lugar do Passageiro</span>
              <button
                type="button"
                onClick={onTogglePassenger}
                className="min-h-[32px] px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-black text-[11px] rounded-lg cursor-pointer shrink-0"
              >
                Entrar Passageiro [G]
              </button>
            </motion.div>
          )}
          {!isDriving && nearInteractable && (
            <motion.div
              key={`interact-${nearInteractable.id}`}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              className="pointer-events-auto hud-surface border border-amber-500 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5 max-w-xs sm:max-w-sm"
            >
              <div className="text-left min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{nearInteractable.title}</div>
                <div className="text-[10px] text-zinc-300 truncate">{nearInteractable.subtitle}</div>
              </div>
              <button
                type="button"
                onClick={onInteract}
                className="min-h-[34px] px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[11px] uppercase rounded-lg cursor-pointer shrink-0 whitespace-nowrap"
              >
                {nearInteractable.prompt.length > 24 ? '[E] Abrir' : nearInteractable.prompt}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ================================================================= */}
      {/* 4. BLOCO INFERIOR: TELEMETRIA DE CONDUÇÃO + TOUCH / DESKTOP DOCK  */}
      {/* ================================================================= */}
      <div className="w-full flex flex-col gap-1.5 pointer-events-none z-20">
        {/* Velocímetro SVG compacto estilo FiveM (Condutor ou Passageiro) */}
        <AnimatePresence>
          {(isDriving || vehicleTelemetry?.isPassenger) && vehicleTelemetry && (() => {
            const maxSpeed = Math.max(90, vehicleTelemetry.maxSpeedKmh || 160);
            const speedRatio = Math.max(0, Math.min(1, vehicleTelemetry.speedKmh / maxSpeed));
            const rpmRatio = Math.max(
              0,
              Math.min(1, vehicleTelemetry.rpm / Math.max(1, vehicleTelemetry.maxRpm || 7000))
            );
            const arcRadius = 24;
            const arcLength = Math.PI * arcRadius;
            const needleAngleDeg = -180 + speedRatio * 180;
            const needleRad = (needleAngleDeg * Math.PI) / 180;
            const nx = 32 + Math.cos(needleRad) * 18;
            const ny = 34 + Math.sin(needleRad) * 18;
            return (
              <motion.div
                key="speedometer-drawer"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="pointer-events-auto mx-auto px-3 py-1.5 hud-surface border border-amber-400/80 rounded-xl shadow-2xl flex flex-wrap items-center justify-center gap-2.5 text-white max-w-[94vw]"
              >
                {/* SVG Arc Speedometer */}
                <div className="flex items-center gap-2.5 tabular-nums">
                  <div className="relative w-16 h-10 shrink-0">
                    <svg viewBox="0 0 64 40" className="w-full h-full overflow-visible">
                      <path
                        d="M 8 34 A 24 24 0 0 1 56 34"
                        fill="none"
                        stroke="rgba(255,255,255,0.16)"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 8 34 A 24 24 0 0 1 56 34"
                        fill="none"
                        stroke={speedRatio > 0.78 ? '#ef4444' : speedRatio > 0.45 ? '#f59e0b' : '#34d399'}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={arcLength}
                        strokeDashoffset={arcLength * (1 - speedRatio)}
                      />
                      <line
                        x1="32"
                        y1="34"
                        x2={nx}
                        y2={ny}
                        stroke="#fde047"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx="32" cy="34" r="2.5" fill="#fde047" />
                    </svg>
                    <div className="absolute inset-x-0 bottom-0 text-center leading-none">
                      <span className="text-xs font-black font-mono text-amber-300">
                        {vehicleTelemetry.speedKmh}
                      </span>
                      <span className="text-[8px] font-bold text-zinc-400 ml-0.5">km/h</span>
                    </div>
                  </div>

                  <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-600 flex items-center justify-center font-mono font-black text-xs text-emerald-300 shrink-0">
                    {vehicleTelemetry.gear}
                  </div>

                  <div className="min-w-[110px] max-w-[155px] space-y-0.5 text-[10px]">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-bold text-white truncate leading-tight">
                        {vehicleTelemetry.vehicleName}
                      </span>
                      <span className="text-[9px] font-mono text-cyan-300 shrink-0">
                        {vehicleTelemetry.horsePower}cv · {vehicleTelemetry.drivetrain.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${rpmRatio > 0.85 ? 'bg-red-500' : rpmRatio > 0.65 ? 'bg-amber-400' : 'bg-sky-400'}`}
                          style={{ width: `${Math.round(rpmRatio * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-zinc-300 shrink-0">
                        {Math.round(vehicleTelemetry.rpm)} rpm
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-0.5 text-amber-300 font-mono">
                        <Fuel size={9} />
                        {vehicleTelemetry.fuel}%
                      </span>
                      <span className="text-[9px] font-mono text-cyan-300 shrink-0">
                        {(vehicleTelemetry.mileageKm || 0).toFixed(1)}km
                      </span>
                      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${vehicleTelemetry.health < 45 ? 'bg-red-500' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.max(0, Math.min(100, vehicleTelemetry.health))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botões do veículo (Condutor vs Passageiro) */}
                {vehicleTelemetry.isPassenger ? (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-md bg-sky-500/20 border border-sky-400/60 text-sky-200 text-[10px] font-bold">
                      Passageiro · Lugar {vehicleTelemetry.seatIndex}
                    </span>
                    <button
                      type="button"
                      onClick={() => onTogglePassenger?.()}
                      className="h-7 px-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[10px] rounded-md cursor-pointer"
                    >
                      Sair [G]
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {onToggleBlinker && (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleBlinker('left')}
                          title="Pisca Esquerda [Z]"
                          className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md text-[10px] font-black border cursor-pointer ${
                            vehicleTelemetry.blinkerMode === 'left' || vehicleTelemetry.blinkerMode === 'hazard'
                              ? 'bg-amber-500 text-zinc-950 border-white'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                          }`}
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleBlinker('hazard')}
                          title="4-Piscas [N]"
                          className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md text-[10px] font-black border cursor-pointer ${
                            vehicleTelemetry.blinkerMode === 'hazard'
                              ? 'bg-red-500 text-white border-white'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                          }`}
                        >
                          ⚠
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleBlinker('right')}
                          title="Pisca Direita [X]"
                          className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md text-[10px] font-black border cursor-pointer ${
                            vehicleTelemetry.blinkerMode === 'right' || vehicleTelemetry.blinkerMode === 'hazard'
                              ? 'bg-amber-500 text-zinc-950 border-white'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                          }`}
                        >
                          ▶
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={onToggleEngine}
                      className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md border cursor-pointer flex items-center justify-center ${
                        vehicleTelemetry.engineOn ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                      }`}
                      title="Motor [K]"
                    >
                      <Power size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={onToggleHeadlights}
                      className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md border cursor-pointer flex items-center justify-center ${
                        vehicleTelemetry.headlightsOn ? 'bg-amber-500/30 border-amber-400 text-amber-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                      }`}
                      title="Faróis [L]"
                    >
                      <Lightbulb size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={onToggleLock}
                      className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md border cursor-pointer flex items-center justify-center ${
                        vehicleTelemetry.isLocked ? 'bg-red-600/30 border-red-500 text-red-300' : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                      }`}
                      title="Trancar [U]"
                    >
                      {vehicleTelemetry.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => soundFx.playCandongueiroHorn()}
                      title="Buzina [H]"
                      className="w-9 h-9 sm:w-7 sm:h-7 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center justify-center cursor-pointer"
                    >
                      <Volume2 size={12} />
                    </button>
                    {onToggleSiren && (
                      <button
                        type="button"
                        onClick={onToggleSiren}
                        title="Sirene [Y]"
                        className={`w-9 h-9 sm:w-7 sm:h-7 rounded-md border cursor-pointer flex items-center justify-center ${
                          vehicleTelemetry.sirenOn
                            ? 'bg-red-600 border-red-300 text-white animate-pulse'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <Siren size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onToggleDrive}
                      className="h-9 px-2.5 sm:h-7 sm:px-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[10px] rounded-md cursor-pointer"
                    >
                      Sair
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* CONTROLOS TÁTEIS (TOUCH MOBILE/TABLET OU SIMULAÇÃO PC) */}
        {isTouchDevice && isDriving && (
          <div
            onContextMenu={suppressWebMenu}
            className="game-control-surface w-full safe-x safe-bottom flex items-end justify-between pointer-events-none"
          >
            <div onContextMenu={suppressWebMenu} className="game-control-surface pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                onContextMenu={suppressWebMenu}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('left', true); }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('left', false); }}
                onPointerCancel={() => onTouchAction?.('left', false)}
                className="game-control-surface w-15 h-15 rounded-2xl bg-zinc-950/90 active:bg-amber-500 active:text-zinc-950 border-2 border-amber-500/70 text-white font-black text-xl shadow-xl cursor-pointer"
              >
                ◀
              </button>
              <button
                type="button"
                onContextMenu={suppressWebMenu}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('right', true); }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('right', false); }}
                onPointerCancel={() => onTouchAction?.('right', false)}
                className="game-control-surface w-15 h-15 rounded-2xl bg-zinc-950/90 active:bg-amber-500 active:text-zinc-950 border-2 border-amber-500/70 text-white font-black text-xl shadow-xl cursor-pointer"
              >
                ▶
              </button>
            </div>

            <div onContextMenu={suppressWebMenu} className="game-control-surface pointer-events-auto flex items-end gap-2">
              <button
                type="button"
                onContextMenu={suppressWebMenu}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('handbrake', true); }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('handbrake', false); }}
                onPointerCancel={() => onTouchAction?.('handbrake', false)}
                className="game-control-surface w-14 h-14 rounded-2xl bg-amber-500 active:bg-amber-300 text-zinc-950 font-black text-xs border-2 border-white shadow-xl cursor-pointer"
              >
                Freio
              </button>
              <button
                type="button"
                onContextMenu={suppressWebMenu}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('backward', true); }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('backward', false); }}
                onPointerCancel={() => onTouchAction?.('backward', false)}
                className="game-control-surface w-16 h-15 rounded-2xl bg-red-600 active:bg-red-500 text-white font-black text-xs border-2 border-red-200 shadow-xl cursor-pointer"
              >
                TRAVÃO
              </button>
              <button
                type="button"
                onContextMenu={suppressWebMenu}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('forward', true); }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('forward', false); }}
                onPointerCancel={() => onTouchAction?.('forward', false)}
                className="game-control-surface w-16 h-18 rounded-2xl bg-emerald-600 active:bg-emerald-400 text-white font-black text-sm border-2 border-emerald-200 shadow-xl cursor-pointer"
              >
                GÁS
              </button>
            </div>
          </div>
        )}

        {isTouchDevice && !isDriving && (
          <div
            onContextMenu={suppressWebMenu}
            className="game-control-surface w-full safe-x safe-bottom flex items-end justify-between pointer-events-none"
          >
            {/* Joystick Analógico 360° */}
            <div
              ref={joystickBaseRef}
              onContextMenu={suppressWebMenu}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (joystickPointerIdRef.current === null) {
                  joystickPointerIdRef.current = e.pointerId;
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                  updateJoystickFromClient(e.clientX, e.clientY);
                }
              }}
              onPointerMove={(e) => {
                if (joystickPointerIdRef.current === e.pointerId) {
                  e.preventDefault();
                  e.stopPropagation();
                  updateJoystickFromClient(e.clientX, e.clientY);
                }
              }}
              onPointerUp={(e) => {
                if (joystickPointerIdRef.current === e.pointerId) {
                  e.preventDefault();
                  e.stopPropagation();
                  resetJoystick();
                }
              }}
              onPointerCancel={resetJoystick}
              onLostPointerCapture={resetJoystick}
              className="game-control-surface hud-landscape-joystick pointer-events-auto relative w-28 h-28 rounded-full bg-zinc-950/75 border-2 border-amber-400/75 flex items-center justify-center shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full border border-dashed border-amber-400/35 pointer-events-none" />
              <div
                style={{ transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)` }}
                className="w-11 h-11 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center text-zinc-950 font-black text-[11px] pointer-events-none"
              >
                ANDAR
              </div>
            </div>

            {/* Botões táteis ergonomicamente espaçados (>= 48x48px) */}
            <div onContextMenu={suppressWebMenu} className="game-control-surface pointer-events-auto flex flex-col gap-2 items-end">
              {equippedWeapon !== 'none' && (
                <div className="flex gap-2">
                  {!WEAPON_CATALOG[equippedWeapon]?.isMelee && (
                    <>
                      <button
                        type="button"
                        onContextMenu={suppressWebMenu}
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onReloadWeapon(); }}
                        className="game-control-surface min-w-[48px] min-h-[48px] rounded-full bg-zinc-900 active:bg-zinc-700 text-amber-300 font-black text-[11px] border-2 border-amber-400 shadow-lg cursor-pointer"
                      >
                        Recar
                      </button>
                      <button
                        type="button"
                        onContextMenu={suppressWebMenu}
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onAimChange(!isAiming); }}
                        className={`game-control-surface min-w-[48px] min-h-[48px] rounded-full font-black text-[11px] border-2 shadow-lg cursor-pointer ${
                          isAiming ? 'bg-amber-400 text-zinc-950 border-white' : 'bg-zinc-900 text-white border-zinc-400'
                        }`}
                      >
                        Mirar
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onContextMenu={suppressWebMenu}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onFireWeapon(); }}
                    className="game-control-surface w-14 h-14 rounded-full bg-red-600 active:bg-red-400 text-white font-black text-xs border-2 border-red-200 shadow-lg cursor-pointer"
                  >
                    Tiro
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                {nearVehicleForPassenger && onTogglePassenger && (
                  <button
                    type="button"
                    onContextMenu={suppressWebMenu}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePassenger(); }}
                    className="game-control-surface min-w-[48px] min-h-[48px] rounded-full bg-sky-500 active:bg-sky-400 text-zinc-950 font-black text-xs border-2 border-white shadow-lg cursor-pointer"
                  >
                    G
                  </button>
                )}
                <button
                  type="button"
                  onContextMenu={suppressWebMenu}
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCrouch(); }}
                  className="game-control-surface min-w-[48px] min-h-[48px] rounded-full bg-zinc-900 active:bg-zinc-700 text-white font-bold text-[11px] border-2 border-zinc-400 shadow-lg cursor-pointer"
                >
                  Agach
                </button>
                <button
                  type="button"
                  onContextMenu={suppressWebMenu}
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onPunch(); }}
                  className="game-control-surface min-w-[48px] min-h-[48px] rounded-full bg-red-600 active:bg-red-500 text-white font-bold text-[11px] border-2 border-red-300 shadow-lg cursor-pointer"
                >
                  Soco
                </button>
                <button
                  type="button"
                  onContextMenu={suppressWebMenu}
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onInteract(); }}
                  className="game-control-surface w-13 h-13 rounded-full bg-amber-400 active:bg-amber-300 text-zinc-950 font-black text-base border-2 border-white shadow-lg cursor-pointer"
                >
                  E
                </button>
              </div>
              <div className="flex gap-2">
                {onToggleMic && (
                  <button
                    type="button"
                    onContextMenu={suppressWebMenu}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleMic();
                    }}
                    className={`game-control-surface w-13 h-13 rounded-full font-bold text-[11px] border-2 shadow-lg cursor-pointer flex items-center justify-center ${
                      micActive ? 'bg-emerald-600 border-white text-white' : 'bg-zinc-900 border-zinc-400 text-zinc-200'
                    }`}
                  >
                    {micActive ? <Mic size={18} /> : <MicOff size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  onContextMenu={suppressWebMenu}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = !sprintLocked;
                    setSprintLocked(next);
                    onTouchAction?.('sprint', next);
                  }}
                  className={`game-control-surface w-13 h-13 rounded-full font-bold text-[11px] border-2 shadow-lg cursor-pointer ${
                    sprintLocked ? 'bg-blue-500 border-white text-white' : 'bg-blue-700 border-blue-300 text-white'
                  }`}
                >
                  {sprintLocked ? 'Correr✓' : 'Correr'}
                </button>
                <button
                  type="button"
                  onContextMenu={suppressWebMenu}
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('jump', true); }}
                  onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onTouchAction?.('jump', false); }}
                  onPointerCancel={() => onTouchAction?.('jump', false)}
                  className="game-control-surface w-13 h-13 rounded-full bg-emerald-600 active:bg-emerald-500 text-white font-bold text-[11px] border-2 border-emerald-300 shadow-lg cursor-pointer"
                >
                  Saltar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 5. RODAPÉ DESKTOP: RADAR GPS + ARMAMENTO + DOCK COLAPSÁVEL        */}
        {/* ================================================================= */}
        {!isCompactViewport && (
          <footer
            className="w-full px-3 pb-2.5 flex items-end justify-between gap-3 pointer-events-none origin-bottom"
            style={{ transform: clampedScale !== 1 ? `scale(${clampedScale})` : undefined }}
          >
            {/* Canto Inferior Esquerdo: Minimap Radar + Armamento + Prévia Chat */}
            <div className="pointer-events-auto flex flex-col gap-2 w-60 shrink-0">
              {hudPrefs.showChatPreview && !showChat && recentPreviewMessages.length > 0 && (
                <div className="hud-surface border rounded-xl p-2 space-y-1 text-[11px]">
                  {recentPreviewMessages.map((m) => (
                    <div key={m.id} className="truncate text-zinc-200">
                      <span className="font-bold text-amber-300">{m.senderName}: </span>
                      <span>{m.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="hud-surface border rounded-2xl p-2.5 flex items-center gap-2.5 shadow-2xl">
                {hudPrefs.showMinimap && getMinimapSnapshot && (
                  minimapExpanded ? (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={onOpenMap}
                        title="Abrir Mapa Completo [M]"
                        className="relative rounded-xl overflow-hidden border-2 border-amber-400 shadow-lg block cursor-pointer"
                      >
                        <canvas ref={minimapCanvasRef} width={84} height={84} className="block w-20 h-20" />
                        <span className="absolute bottom-0.5 right-1 text-[9px] font-black text-amber-300 bg-black/85 px-1 rounded">
                          GPS
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMinimapExpanded(false)}
                        title="Minimizar Radar"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-600 text-[10px] font-black text-white flex items-center justify-center cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMinimapExpanded(true)}
                      className="px-2.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-amber-400/60 rounded-xl text-[11px] font-bold text-amber-300 shrink-0 cursor-pointer"
                    >
                      Radar
                    </button>
                  )
                )}

                <div className="text-xs text-zinc-100 space-y-1 min-w-0 flex-1">
                  <div className="font-bold text-white flex items-center gap-1">
                    <Crosshair size={12} className="text-amber-300 shrink-0" />
                    <span className="truncate">{WEAPON_CATALOG[equippedWeapon]?.name || 'Desarmado'}</span>
                  </div>
                  {equippedWeapon !== 'none' && !WEAPON_CATALOG[equippedWeapon]?.isMelee && (
                    <div className="font-mono tabular-nums text-amber-300 font-black text-[11px]">
                      {weaponAmmo.reloading ? 'A recarregar...' : `${weaponAmmo.mag} / ${weaponAmmo.reserve}`}
                    </div>
                  )}
                  {ownedWeapons.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {ownedWeapons.slice(0, 3).map((w) => (
                        <button
                          type="button"
                          key={w.id}
                          onClick={() => onEquipWeapon(w.id === equippedWeapon ? 'none' : w.id)}
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                            equippedWeapon === w.id
                              ? 'bg-amber-400 text-zinc-950 border-white'
                              : 'bg-zinc-900 text-zinc-100 border-zinc-600'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Centro-Inferior: Dock Colapsável com Barras Vitais + Atalhos */}
            <div className="flex-1 flex flex-col items-center min-w-0">
              <button
                type="button"
                onClick={() => setIsDockCollapsed(!isDockCollapsed)}
                className="pointer-events-auto mb-1 px-3 py-0.5 hud-surface border border-b-0 text-white rounded-t-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                {isDockCollapsed ? <ChevronUp size={13} className="text-amber-400" /> : <ChevronDown size={13} className="text-amber-400" />}
                <span>{isDockCollapsed ? 'Mostrar Painel' : 'Ocultar Painel'}</span>
              </button>

              <AnimatePresence>
                {!isDockCollapsed && (
                  <motion.div
                    key="bottom-dock-panel"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    className="pointer-events-auto w-full max-w-5xl hud-surface border rounded-2xl p-2.5 shadow-2xl space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      {/* 6 Barras Vitais */}
                      <div className="grid grid-cols-6 gap-2">
                        {vitalBars.map((b) => (
                          <div key={b.label} className="min-w-[62px]">
                            <div className="flex justify-between text-[11px] font-bold text-white mb-0.5 tabular-nums">
                              <span className={`flex items-center gap-1 ${b.text}`}>
                                {b.icon} {b.label}
                              </span>
                              <span>{Math.round(b.val)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                              <div className={`h-full ${b.bar}`} style={{ width: `${Math.max(0, Math.min(100, b.val))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Atalhos Modais */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-white">
                        {quickNavItems.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={item.onClick}
                            className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            {item.icon}
                            <span>{item.label}</span>
                            {hudPrefs.showQuickHints && item.keyHint && (
                              <span className="text-[10px] font-mono text-zinc-400">[{item.keyHint}]</span>
                            )}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setRadioActive(soundFx.toggleRadio())}
                          className={`px-2.5 py-1.5 border rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                            radioActive ? 'bg-amber-500/25 border-amber-400 text-amber-200' : 'bg-zinc-900 border-zinc-700 text-zinc-100'
                          }`}
                        >
                          <Radio size={14} /> Rádio
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
