/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildLuandaCity, CityData, setDistrictBlackouts } from '../city/cityBuilder';
import {
  createSkyEnvironment,
  disposeCachedEnvironmentTextures,
  getWaveHeightAt,
  SkyEnvironment,
} from '../city/worldEnvironment';
import { PlayerCharacter, PlayerControlsInput } from '../player/playerController';
import { ThirdPersonCamera } from '../camera/thirdPersonCamera';
import {
  clampToValidWorldBounds,
  DEFAULT_SPAWN_POS,
  getAssignedCellData,
  getSurfaceHeightAt,
  getVehicleSlopeAngles,
  INTERIOR_ORIGINS,
  isInInteriorPocket,
  isInsideValidWorldBounds,
} from '../city/terrainPhysics';
import {
  AdminRole,
  AirportFlightDef,
  AnimationState,
  ChatMessage,
  GameSettings,
  GlobalDjState,
  GpsWaypoint,
  InteractableObject,
  normalizeGraphicsQuality,
  OwnedVehicleRecord,
  PlayerCustomization,
  PlayerStats,
  PoliticsState,
  SharedWorldVehicle,
  VolleyballState,
  WeaponId,
  WeatherTelemetry,
  WeatherType,
  WorldDynamicState,
} from '../types';
import {
  FARM_PLANT_NODES,
  normalizeWeatherType,
  VOLLEYBALL_COURT_CENTER,
  WEAPON_CATALOG,
} from '../data/catalog';
import { NpcSystem } from '../city/npcSystem';
import {
  AngoRealBusController,
  AngoRealBusUnit,
  applyVehicleUpgrades,
  createVehicleFromRecord,
  DrivableVehicle,
  getVehicleSeatWorldPosition,
  InemaAmbulanceController,
  InemaDispatchState,
  TrafficPhase,
  updateTrafficVehicles,
} from '../city/trafficSystem';
import {
  AdminEffectPayload,
  EmergencyAlertPayload,
  MultiplayerManager,
  VoiceChunkPayload,
  WorldSyncPayload,
} from '../multiplayer/multiplayerManager';
import { soundFx } from '../audio/soundFx';

export interface VehicleTelemetry {
  speedKmh: number;
  maxSpeedKmh: number;
  gear: string;
  rpm: number;
  maxRpm: number;
  horsePower: number;
  drivetrain: 'fwd' | 'rwd' | 'awd';
  vehicleName: string;
  vehicleId: string;
  plate: string;
  fuel: number;
  health: number;
  engineOn: boolean;
  headlightsOn: boolean;
  blinkerMode: 'off' | 'left' | 'right' | 'hazard';
  isLocked: boolean;
  sirenOn: boolean;
  mileageKm: number;
  isDriving: boolean;
  isPassenger: boolean;
  seatIndex: number;
}

export function resolveCurrentInteriorId(x: number, z: number): string | null {
  if (!isInInteriorPocket(x, z)) return null;
  for (const [id, [ox, oz]] of Object.entries(INTERIOR_ORIGINS)) {
    const dx = x - ox;
    const dz = z - oz;
    if (dx * dx + dz * dz <= 44 * 44) return id;
  }
  const houseTypes: [string, number, number][] = [
    ['casa_t1', 640, 640],
    ['casa_t2', 640, 700],
    ['casa_t3', 640, 760],
    ['casa_t4', 640, 820],
  ];
  for (const [hid, hx, hz] of houseTypes) {
    if (Math.abs(x - hx) <= 18 && Math.abs(z - hz) <= 18) return hid;
  }
  return 'interior_generic';
}

export interface MinimapSnapshot {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  remotePlayers: { x: number; z: number; name: string }[];
  npcs: { x: number; z: number; isGuard: boolean }[];
  gps: GpsWaypoint | null;
}

const _vehBox = new THREE.Box3();
const _vehMin = new THREE.Vector3();
const _vehMax = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _seatWorldPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _shootRay = new THREE.Ray();
const _rayHitPt = new THREE.Vector3();
const _targetSphere = new THREE.Sphere();
const _targetCenter = new THREE.Vector3();
const _skyZenith = new THREE.Color(0x0284c7);
const _skyHorizon = new THREE.Color(0x7dd3fc);
const _skyColor = new THREE.Color(0x7dd3fc);
const _cTmpA = new THREE.Color();
const _cTmpB = new THREE.Color();
const _sunDirVec = new THREE.Vector3(0.4, 0.7, 0.3);
const _gateCenter = new THREE.Vector3();
const _gateSizeCond = new THREE.Vector3(9.8, 3.0, 0.7);
const _gateSizePna = new THREE.Vector3(11.8, 3.4, 0.8);
const _flightCamLook = new THREE.Vector3();

interface SmokePuff {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
}

interface BrassCasing {
  mesh: THREE.Mesh;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  groundY: number;
}

interface ImpactSpark {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
}

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  public cameraSystem: ThirdPersonCamera;
  public cityData: CityData;
  public npcSystem: NpcSystem;
  public player: PlayerCharacter;
  public multiplayer: MultiplayerManager;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private skyEnv: SkyEnvironment;
  private isSoftwareGl = false;
  private resizeObserver: ResizeObserver | null = null;

  public currentWeather: WeatherType = 'ensolarado';
  public weatherTelemetry: WeatherTelemetry = {
    tempC: 29,
    feelsLikeC: 31,
    humidity: 72,
    cloudCover: 25,
    precipMm: 0,
    windKmh: 15,
    weatherCode: 1,
    conditionLabel: 'Ensolarado Tropical',
    mappedWeather: 'ensolarado',
    source: 'fallback',
    fetchedAt: 0,
  };
  private rainMesh: THREE.Points | null = null;
  private heatDustMesh: THREE.Points | null = null;
  private heatDustCount = 240;
  private lightningFlash = 0;
  private lightningCooldown = 6;
  private maxRainCount = 1100;
  private rainCount = 450;
  private showClouds = true;

  private smokePool: SmokePuff[] = [];
  private smokeGeo: THREE.SphereGeometry | null = null;
  private smokeMat: THREE.MeshStandardMaterial | null = null;
  private smokeSpawnTimer = 0;
  private prevVehicleVel = 0;
  private lastBlinkerPhase = false;

  // Pool de VFX de Combate
  private muzzleLight: THREE.PointLight | null = null;
  private muzzleLightTimer = 0;
  private casingPool: BrassCasing[] = [];
  private casingGeo: THREE.CylinderGeometry | null = null;
  private casingMat: THREE.MeshStandardMaterial | null = null;
  private sparkPool: ImpactSpark[] = [];
  private sparkGeo: THREE.SphereGeometry | null = null;
  private sparkMat: THREE.MeshBasicMaterial | null = null;
  private hitRingMesh: THREE.Mesh | null = null;
  private hitRingTimer = 0;

  private djVisualActive = false;
  private lastHouseReturn: { x: number; z: number; rot: number } | null = null;
  private houseBlackoutActive = false;
  public currentInteriorId: string | null = null;
  private activeHouseInteriorId: string | null = null;

  public isDriving = false;
  public currentVehicle: DrivableVehicle | null = null;
  public passengerVehicle: DrivableVehicle | null = null;
  public passengerSeatIndex = -1;
  private dynamicWorldState: WorldDynamicState | null = null;
  private lastFrameTimestamp = performance.now();
  private frameTimeAvgMs = 16.6;
  private dynamicDprFactor = 1.0;
  private lastAutoDprCheckMs = performance.now();

  public busController: AngoRealBusController;
  public inemaAmbulance: InemaAmbulanceController;
  public ridingBus: AngoRealBusUnit | null = null;
  private lastInemaState: InemaDispatchState = 'idle';
  private busStatusThrottle = 0;
  private lastBusStatusKey = '';
  private faaHeistActiveUntil = 0;
  private trafficHitCooldown = 0;
  private vehicleSirenOn = false;
  private cookingEffectUntil = 0;
  private volleyballState: VolleyballState = {
    x: VOLLEYBALL_COURT_CENTER[0],
    y: 1.4,
    z: VOLLEYBALL_COURT_CENTER[1],
    vx: 0,
    vy: 0,
    vz: 0,
    scoreLeft: 0,
    scoreRight: 0,
    updatedAt: 0,
  };
  private farmDisplayTimer = 0;
  private condGateOpen = 0;
  private pnaGateOpen = 0;
  private airportFlightCutscene: {
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    startedAt: number;
    durationMs: number;
    onComplete: () => void;
  } | null = null;

  private trafficLightTimer = 0;
  private trafficLightPhase: 'ns_green' | 'ns_yellow' | 'ew_green' | 'ew_yellow' = 'ns_green';

  public timeOfDay = 15.5;
  private clock = new THREE.Clock();
  private frameId = 0;
  private isRunning = false;
  private settings: GameSettings;

  public currentInput: PlayerControlsInput & { handbrake?: boolean } = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    analogX: 0,
    analogY: 0,
    sprint: false,
    jump: false,
    crouch: false,
    interact: false,
    handbrake: false,
  };
  public currentStats: PlayerStats;
  private selfRole: AdminRole = 'player';

  private activeCheckpoint: { pos: [number, number, number]; radius: number; label: string } | null = null;
  private checkpointCompletedFlag = false;
  private gpsWaypoint: GpsWaypoint | null = null;
  private activeTracers: { obj: THREE.Object3D; expiresAt: number }[] = [];
  private houseRaycaster = new THREE.Raycaster();
  private housePickNdc = new THREE.Vector2();

  private onNearInteractable?: (obj: InteractableObject | null) => void;
  private onDistrictChange?: (districtName: string) => void;
  private onStatsTick?: (stats: PlayerStats) => void;
  private onTimeUpdate?: (timeString: string, hour: number) => void;
  private onDrivingChange?: (isDriving: boolean, vehicleName?: string) => void;
  private onVehicleTelemetry?: (telemetry: VehicleTelemetry) => void;
  private onCheckpointReached?: () => void;
  private onFallImpact?: (damage: number) => void;
  private onHitRemotePlayer?: (targetCharacterId: string, targetName: string, damage: number, weaponId: WeaponId) => void;
  private onNearCivilianChange?: (info: { name: string; isThreatened: boolean } | null) => void;
  private onCrimeTrigger?: (mode: 'rob' | 'threat' | 'assault', npcLabel: string) => void;
  private onPoliceArrest?: (reason: string) => void;
  private onPlayerDamaged?: (hp: number, dmg: number) => void;
  private onBusStatusChange?: (status: {
    isRiding: boolean;
    busLabel?: string;
    currentStop?: string | null;
    nextStop?: string;
    nearbyBusName?: string | null;
    nearbyBusDist?: number;
  }) => void;
  private onInemaStatusChange?: (state: InemaDispatchState) => void;
  private onDynamicWorldSync?: (worldState: WorldDynamicState) => void;
  private onNotice?: (message: string, level?: 'warning' | 'danger') => void;

  private policeSpawnTimer = 2.0;
  private nearCivCheckTimer = 0;
  private lastNearCivKey = '';
  private aimThreatNpcId: string | null = null;
  private aimThreatDuration = 0;
  private lastThreatReportAt = 0;
  private lastArrestAt = 0;

  private currentDistrict = 'Centro & Baixa';
  private statsTimer = 0;
  private clockThrottleTimer = 0;
  private lastTimeString = '';
  private lastInteractableId: string | null = null;
  private lastTelemetry: VehicleTelemetry = {
    speedKmh: 0,
    maxSpeedKmh: 160,
    gear: 'N',
    rpm: 850,
    maxRpm: 7500,
    horsePower: 140,
    drivetrain: 'fwd',
    vehicleName: '',
    vehicleId: '',
    plate: '',
    fuel: 100,
    health: 100,
    engineOn: true,
    headlightsOn: true,
    blinkerMode: 'off',
    isLocked: false,
    sirenOn: false,
    mileageKm: 0,
    isDriving: false,
    isPassenger: false,
    seatIndex: -1,
  };
  private telemetryThrottleTimer = 0;

  constructor(
    container: HTMLElement,
    customization: PlayerCustomization,
    settings: GameSettings,
    stats: PlayerStats,
    callbacks: {
      onNearInteractable?: (obj: InteractableObject | null) => void;
      onDistrictChange?: (districtName: string) => void;
      onStatsTick?: (stats: PlayerStats) => void;
      onTimeUpdate?: (timeString: string, hour: number) => void;
      onDrivingChange?: (isDriving: boolean, vehicleName?: string) => void;
      onVehicleTelemetry?: (telemetry: VehicleTelemetry) => void;
      onChatReceived?: (msg: ChatMessage) => void;
      onCitizenCountChange?: (count: number) => void;
      onWorldSync?: (payload: WorldSyncPayload) => void;
      onDynamicWorldSync?: (worldState: WorldDynamicState) => void;
      onAdminEffect?: (payload: AdminEffectPayload) => void;
      onEmergencyAlert?: (payload: EmergencyAlertPayload) => void;
      onCheckpointReached?: () => void;
      onFallImpact?: (damage: number) => void;
      onHitRemotePlayer?: (targetCharacterId: string, targetName: string, damage: number, weaponId: WeaponId) => void;
      onNearCivilianChange?: (info: { name: string; isThreatened: boolean } | null) => void;
      onCrimeTrigger?: (mode: 'rob' | 'threat' | 'assault', npcLabel: string) => void;
      onPoliceArrest?: (reason: string) => void;
      onPlayerDamaged?: (hp: number, dmg: number) => void;
      onBusStatusChange?: (status: {
        isRiding: boolean;
        busLabel?: string;
        currentStop?: string | null;
        nextStop?: string;
        nearbyBusName?: string | null;
        nearbyBusDist?: number;
      }) => void;
      onInemaStatusChange?: (state: InemaDispatchState) => void;
      onDjSync?: (djState: GlobalDjState, serverNow: number) => void;
      onPoliticsSync?: (politics: PoliticsState) => void;
      onAfkWarning?: (payload: { stage: number; remainingMinutes: number; message: string }) => void;
      onAfkArrest?: (payload: {
        jailUntil: number;
        assignedCell: number;
        reason: string;
        position: { x: number; y: number; z: number };
      }) => void;
      onVoiceChunk?: (payload: VoiceChunkPayload) => void;
      onNotice?: (message: string, level?: 'warning' | 'danger') => void;
      authOptions?: {
        token?: string;
        characterId?: string;
        badge?: string;
        role?: AdminRole;
        initialPosition?: { x: number; y: number; z: number };
        initialRotationY?: number;
      };
    }
  ) {
    this.container = container;
    this.settings = settings;
    this.currentStats = stats;
    this.selfRole = callbacks.authOptions?.role || 'player';
    this.currentWeather = settings.weather || 'ensolarado';
    this.onNearInteractable = callbacks.onNearInteractable;
    this.onDistrictChange = callbacks.onDistrictChange;
    this.onStatsTick = callbacks.onStatsTick;
    this.onTimeUpdate = callbacks.onTimeUpdate;
    this.onDrivingChange = callbacks.onDrivingChange;
    this.onVehicleTelemetry = callbacks.onVehicleTelemetry;
    this.onCheckpointReached = callbacks.onCheckpointReached;
    this.onFallImpact = callbacks.onFallImpact;
    this.onHitRemotePlayer = callbacks.onHitRemotePlayer;
    this.onNearCivilianChange = callbacks.onNearCivilianChange;
    this.onCrimeTrigger = callbacks.onCrimeTrigger;
    this.onPoliceArrest = callbacks.onPoliceArrest;
    this.onPlayerDamaged = callbacks.onPlayerDamaged;
    this.onBusStatusChange = callbacks.onBusStatusChange;
    this.onInemaStatusChange = callbacks.onInemaStatusChange;
    this.onDynamicWorldSync = callbacks.onDynamicWorldSync;
    this.onNotice = callbacks.onNotice;

    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const isHighQuality = normalizeGraphicsQuality(settings.graphicsQuality) === 'high';
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && isHighQuality,
      powerPreference: 'high-performance',
      alpha: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.applyRendererQuality(settings);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.isRunning = false;
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.startMasterLoop();
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x38bdf8);
    this.scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0028);

    try {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch {}

    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x854d0e, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffedd5, 1.65);
    this.sunLight.position.set(60, 90, 45);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 95;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.skyEnv = createSkyEnvironment();
    this.scene.add(this.skyEnv.group);

    const aspect = container.clientWidth / container.clientHeight;
    const initialDraw = Math.max(220, settings.renderDistance || 400);
    this.cameraSystem = new ThirdPersonCamera(62, aspect, 0.1, initialDraw + 320);
    this.cameraSystem.setBaseDistance(settings.cameraDistance || 4.8);

    this.cityData = buildLuandaCity(this.isSoftwareGl);
    this.scene.add(this.cityData.rootGroup);
    this.npcSystem = new NpcSystem(this.cityData.rootGroup);
    this.busController = new AngoRealBusController(this.cityData.rootGroup);
    this.inemaAmbulance = new InemaAmbulanceController(this.cityData.rootGroup);
    this.updateTrafficLights('ns_green');

    this.player = new PlayerCharacter(customization, (dmg) => {
      if (this.onFallImpact) this.onFallImpact(dmg);
    });
    const initPos = callbacks.authOptions?.initialPosition || DEFAULT_SPAWN_POS;
    const initRot =
      typeof callbacks.authOptions?.initialRotationY === 'number'
        ? callbacks.authOptions.initialRotationY
        : Math.PI / 2;
    this.player.position.set(initPos.x, initPos.y, initPos.z);
    this.player.rotationY = initRot;
    this.player.mesh.position.copy(this.player.position);
    this.player.mesh.rotation.y = this.player.rotationY;
    this.cameraSystem.resetBehind(this.player.rotationY);
    this.scene.add(this.player.mesh);

    this.setupRainSystem();
    this.setupHeatDustSystem();
    this.setupSmokeSystem();
    this.setupCombatVfx();
    this.applyRendererQuality(settings);
    this.setWeather(this.currentWeather);
    soundFx.setVolume(settings.soundVolume);
    soundFx.setMusicVolume(settings.musicVolume);
    soundFx.setMuted(!!settings.muted);

    this.multiplayer = new MultiplayerManager(this.scene, {
      onChatReceived: callbacks.onChatReceived,
      onCitizenCountChange: callbacks.onCitizenCountChange,
      onWorldSync: callbacks.onWorldSync,
      onDynamicWorldSync: (worldState) => {
        this.dynamicWorldState = worldState;
        if (worldState.volleyball) {
          this.volleyballState = worldState.volleyball;
        }
        setDistrictBlackouts(this.cityData, worldState.blackoutDistricts || {}, 1.0);
        this.updateFarmPlantDisplays();
        this.onDynamicWorldSync?.(worldState);
      },
      onVolleyballSync: (vb) => {
        this.volleyballState = vb;
      },
      onSharedVehicleUpdated: (sv) => this.syncRemoteSharedVehicle(sv),
      onSharedVehicleRemoved: (vehicleId) => this.removeRemoteSharedVehicle(vehicleId),
      onAdminEffect: callbacks.onAdminEffect,
      onEmergencyAlert: callbacks.onEmergencyAlert,
      onDjSync: callbacks.onDjSync,
      onPoliticsSync: callbacks.onPoliticsSync,
      onAfkWarning: callbacks.onAfkWarning,
      onAfkArrest: callbacks.onAfkArrest,
      onVoiceChunk: callbacks.onVoiceChunk,
      onWeaponFired: (payload) => {
        this.spawnBulletTracer(payload.from, payload.to);
        soundFx.playGunshot(payload.weaponId);
        this.npcSystem.triggerGunshotPanic(payload.from.x, payload.from.z, 34);
      },
      onPositionCorrection: ({ position, rotationY, reason }) => {
        this.player.position.set(position.x, position.y ?? this.player.position.y, position.z);
        if (typeof rotationY === 'number') this.player.rotationY = rotationY;
        if (reason) callbacks.onNotice?.(reason, 'warning');
      },
      onSessionConflict: (reason) => {
        callbacks.onNotice?.(reason, 'danger');
      },
    });
    this.multiplayer.connect(`${stats.name} ${stats.surname}`, customization, callbacks.authOptions);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
    this.startMasterLoop();
  }

  private applyRendererQuality(settings: GameSettings) {
    const q = normalizeGraphicsQuality(settings.graphicsQuality);
    const scale = (settings.resolutionScale || 1.0) * this.dynamicDprFactor;
    const presetRatio = q === 'high' ? 1.25 : q === 'medium' ? 0.95 : 0.75;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.max(0.65, Math.min(window.devicePixelRatio, presetRatio) * scale));

    const shadowsWanted = !this.isSoftwareGl && q !== 'low' && (settings.shadows || q === 'high');
    this.renderer.shadowMap.enabled = shadowsWanted;
    this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    if (this.sunLight) {
      const targetSize = q === 'high' ? 1536 : 1024;
      this.sunLight.castShadow = shadowsWanted;
      if (this.sunLight.shadow.mapSize.width !== targetSize) {
        this.sunLight.shadow.mapSize.width = targetSize;
        this.sunLight.shadow.mapSize.height = targetSize;
        if (this.sunLight.shadow.map) {
          this.sunLight.shadow.map.dispose();
          this.sunLight.shadow.map = null;
        }
      }
    }

    if (this.scene) {
      this.scene.environmentIntensity = q === 'high' ? 1.05 : q === 'medium' ? 0.72 : 0.0;
    }
    this.renderer.toneMappingExposure = q === 'high' ? 1.14 : q === 'medium' ? 1.06 : 0.98;
    this.rainCount = q === 'high' ? 900 : q === 'medium' ? 450 : 180;
    this.showClouds = q !== 'low';
    if (this.rainMesh) {
      this.rainMesh.geometry.setDrawRange(0, this.rainCount);
    }
  }

  private setupRainSystem() {
    const rainGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxRainCount * 3);
    for (let i = 0; i < this.maxRainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    rainGeo.setDrawRange(0, this.rainCount);
    const rainMat = new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.16, transparent: true, opacity: 0.75 });
    this.rainMesh = new THREE.Points(rainGeo, rainMat);
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  private setupHeatDustSystem() {
    const dustGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.heatDustCount * 3);
    for (let i = 0; i < this.heatDustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 8 + 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xfde68a,
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.heatDustMesh = new THREE.Points(dustGeo, dustMat);
    this.heatDustMesh.visible = false;
    this.scene.add(this.heatDustMesh);
  }

  private setupSmokeSystem() {
    this.smokeGeo = new THREE.SphereGeometry(0.24, 6, 5);
    this.smokeMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.95,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(this.smokeGeo, this.smokeMat);
      m.visible = false;
      this.scene.add(m);
      this.smokePool.push({ mesh: m, life: 0, maxLife: 1.0, vx: 0, vy: 1.5, vz: 0 });
    }
  }

  private setupCombatVfx() {
    this.muzzleLight = new THREE.PointLight(0xfbbf24, 0, 8);
    this.scene.add(this.muzzleLight);

    this.casingGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.048, 6);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(this.casingGeo, this.casingMat);
      m.visible = false;
      this.scene.add(m);
      this.casingPool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, groundY: 0 });
    }

    this.sparkGeo = new THREE.SphereGeometry(0.045, 5, 5);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.visible = false;
      this.scene.add(m);
      this.sparkPool.push({ mesh: m, life: 0, maxLife: 0.25, vx: 0, vy: 0, vz: 0 });
    }

    this.hitRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 16),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.hitRingMesh.visible = false;
    this.scene.add(this.hitRingMesh);
  }

  private spawnMuzzleSmoke(pos: { x: number; y: number; z: number }) {
    const slot = this.smokePool.find((p) => p.life <= 0);
    if (!slot) return;
    slot.life = 0.42;
    slot.maxLife = 0.42;
    slot.mesh.position.set(pos.x, pos.y + 0.04, pos.z);
    slot.vx = (Math.random() - 0.5) * 0.5;
    slot.vy = 0.8 + Math.random() * 0.5;
    slot.vz = (Math.random() - 0.5) * 0.5;
    slot.mesh.scale.setScalar(0.28);
    slot.mesh.visible = true;
  }

  private spawnShellCasing(pos: { x: number; y: number; z: number }) {
    const slot = this.casingPool.find((c) => c.life <= 0);
    if (!slot) return;
    slot.life = 0.85;
    slot.mesh.position.set(pos.x, pos.y, pos.z);
    const rightAngle = this.player.rotationY + Math.PI / 2;
    slot.vx = Math.sin(rightAngle) * (1.8 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.5;
    slot.vy = 2.1 + Math.random() * 1.0;
    slot.vz = Math.cos(rightAngle) * (1.8 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.5;
    slot.groundY = getSurfaceHeightAt(pos.x, pos.z, pos.y) + 0.03;
    slot.mesh.visible = true;
  }

  private spawnImpactVfx(point: { x: number; y: number; z: number }, isTargetHit: boolean) {
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < 6; i++) {
      const s = this.sparkPool[i];
      if (s.life <= 0) {
        s.life = 0.24;
        s.maxLife = 0.24;
        s.mesh.position.set(point.x, point.y, point.z);
        s.vx = (Math.random() - 0.5) * 4.2;
        s.vy = 1.2 + Math.random() * 2.8;
        s.vz = (Math.random() - 0.5) * 4.2;
        s.mesh.scale.setScalar(isTargetHit ? 1.25 : 0.9);
        s.mesh.visible = true;
        spawned++;
      }
    }
    if (isTargetHit && this.hitRingMesh) {
      this.hitRingMesh.position.set(point.x, point.y, point.z);
      this.hitRingMesh.lookAt(this.cameraSystem.camera.position);
      this.hitRingMesh.scale.setScalar(0.6);
      this.hitRingMesh.visible = true;
      this.hitRingTimer = 0.22;
    }
  }

  public triggerReloadAnimation() {
    this.player.triggerReload();
  }

  public triggerSleepWakeAnimation() {
    this.player.triggerSleepWakeAnimation();
  }

  public setDjVisualActive(active: boolean) {
    this.djVisualActive = active;
  }

  public setLastHouseReturn(x: number, z: number, rot = Math.PI) {
    this.lastHouseReturn = { x, z, rot };
  }

  public getLastHouseReturn(): { x: number; z: number; rot: number } | null {
    return this.lastHouseReturn;
  }

  public setHouseBlackout(active: boolean) {
    this.houseBlackoutActive = active;
    for (let i = 0; i < this.cityData.houseInteriorLights.length; i++) {
      this.cityData.houseInteriorLights[i].intensity = active ? 0 : 1.4;
    }
    for (let i = 0; i < this.cityData.houseInteriorGlowMeshes.length; i++) {
      const m = this.cityData.houseInteriorGlowMeshes[i].material as THREE.MeshStandardMaterial;
      if (m) m.emissiveIntensity = active ? 0 : 0.65;
    }
  }

  public setActiveHouseInteriorId(propId: string | null) {
    this.activeHouseInteriorId = propId;
  }

  public notifyFaaHeistAlert(durationMs = 90000) {
    this.faaHeistActiveUntil = Date.now() + durationMs;
    this.npcSystem.spawnPolicePursuit(this.player.position.x, this.player.position.z, 5, true);
    soundFx.playSiren();
  }

  public boardNearestBus(): boolean {
    if (this.isDriving || this.ridingBus || this.currentStats.isUnconscious || this.currentStats.jailUntil > Date.now()) {
      return false;
    }
    const bus = this.busController.getBoardableBus(this.player.position.x, this.player.position.z, 10.5);
    if (!bus) return false;
    this.ridingBus = bus;
    this.player.mesh.visible = false;
    soundFx.playInteract();
    this.emitBusStatus(true);
    return true;
  }

  public exitBus() {
    if (!this.ridingBus) return;
    const bPos = this.ridingBus.vehicle.mesh.position;
    const clamped = clampToValidWorldBounds(bPos.x - 2.6, bPos.z);
    const surfY = getSurfaceHeightAt(clamped.x, clamped.z, bPos.y);
    this.player.position.set(clamped.x, surfY, clamped.z);
    this.player.mesh.position.copy(this.player.position);
    this.player.mesh.visible = true;
    this.ridingBus = null;
    soundFx.playInteract();
    this.emitBusStatus(true);
  }

  public dispatchInemaAmbulance(onArrived: () => void) {
    this.inemaAmbulance.dispatchTo(this.player.position.x, this.player.position.z, onArrived);
    soundFx.playSiren();
    this.lastInemaState = this.inemaAmbulance.state;
    this.onInemaStatusChange?.(this.inemaAmbulance.state);
  }

  private emitBusStatus(force: boolean) {
    if (!this.onBusStatusChange) return;
    if (this.ridingBus) {
      const key = `ride:${this.ridingBus.id}:${this.ridingBus.currentStopName || ''}:${this.ridingBus.nextStopName}`;
      if (force || key !== this.lastBusStatusKey) {
        this.lastBusStatusKey = key;
        this.onBusStatusChange({
          isRiding: true,
          busLabel: this.ridingBus.label,
          currentStop: this.ridingBus.currentStopName,
          nextStop: this.ridingBus.nextStopName,
        });
      }
      return;
    }
    const info = this.busController.getNearestBusInfo(this.player.position.x, this.player.position.z);
    const nearby = info && info.dist <= 11.5 ? info : null;
    const key = nearby ? `near:${nearby.bus.id}:${nearby.bus.currentStopName || ''}` : 'none';
    if (force || key !== this.lastBusStatusKey) {
      this.lastBusStatusKey = key;
      this.onBusStatusChange({
        isRiding: false,
        nearbyBusName: nearby ? nearby.bus.label : null,
        nearbyBusDist: nearby ? Math.round(nearby.dist) : undefined,
        currentStop: nearby?.bus.currentStopName || null,
        nextStop: nearby?.bus.nextStopName,
      });
    }
  }

  public setWeather(weather: WeatherType | string) {
    const normalized = normalizeWeatherType(weather) as WeatherType;
    this.currentWeather = normalized;
    this.applyWeather(normalized);
  }

  public setWeatherTelemetry(telemetry: WeatherTelemetry) {
    this.weatherTelemetry = telemetry;
    this.applyWeather(this.currentWeather);
  }

  private applyWeather(weather: WeatherType) {
    const isRaining = weather === 'chuva' || this.weatherTelemetry.precipMm >= 0.4;
    if (isRaining) {
      if (this.rainMesh) this.rainMesh.visible = true;
      soundFx.startRain();
    } else {
      if (this.rainMesh) this.rainMesh.visible = false;
      soundFx.stopRain();
    }
    if (this.heatDustMesh) {
      this.heatDustMesh.visible = weather === 'calor_extremo';
    }
  }

  public setEmote(anim: AnimationState | null) {
    if (!this.isDriving) {
      this.player.setEmote(anim);
    }
  }

  public setAiming(aiming: boolean) {
    const canAim = !this.isDriving && !this.currentStats.isUnconscious && !this.currentStats.isFrozen;
    const active = aiming && canAim;
    this.player.isAiming = active;
    this.cameraSystem.isAiming = active;
  }

  public spawnBulletTracer(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number }
  ) {
    const pts = [new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.activeTracers.push({ obj: line, expiresAt: performance.now() + 95 });
  }

  public fireWeapon(weaponId: WeaponId): { hitNpc?: string; hitPlayer?: string } {
    if (this.isDriving || this.currentStats.isUnconscious || this.currentStats.isFrozen) return {};
    const spec = WEAPON_CATALOG[weaponId] || WEAPON_CATALOG.none;
    if (spec.isMelee) {
      this.player.triggerPunch();
      this.player.triggerWeaponRecoil();
      const remotes = this.multiplayer.getRemotePlayersList(this.currentInteriorId);
      for (const r of remotes) {
        if (r.position.distanceTo(this.player.position) <= spec.range) {
          soundFx.playHitMarker();
          this.onHitRemotePlayer?.(r.characterId || r.id, r.name, spec.damage, weaponId);
          return { hitPlayer: r.name };
        }
      }
      for (const npc of this.npcSystem.npcs) {
        if (npc.position.distanceTo(this.player.position) <= spec.range) {
          this.npcSystem.damageNpc(npc, spec.damage);
          soundFx.playHitMarker();
          if (this.currentStats.factionId !== 'policia' && this.currentStats.factionId !== 'faa') {
            this.onCrimeTrigger?.('assault', npc.label);
          }
          return { hitNpc: npc.label };
        }
      }
      return {};
    }

    this.player.triggerWeaponRecoil();
    soundFx.playGunshot(weaponId);
    this.player.getMuzzleWorldPosition(_muzzlePos);
    if (this.muzzleLight) {
      this.muzzleLight.position.copy(_muzzlePos);
      this.muzzleLight.intensity = 4.2;
      this.muzzleLightTimer = 0.08;
    }
    this.spawnMuzzleSmoke({ x: _muzzlePos.x, y: _muzzlePos.y, z: _muzzlePos.z });
    this.spawnShellCasing({ x: _muzzlePos.x, y: _muzzlePos.y, z: _muzzlePos.z });
    this.npcSystem.triggerGunshotPanic(_muzzlePos.x, _muzzlePos.z, 40);

    const pellets = spec.pellets || 1;
    let hitNpcName: string | undefined;
    let hitPlayerName: string | undefined;

    for (let p = 0; p < pellets; p++) {
      this.cameraSystem.camera.getWorldDirection(_camDir);
      if (spec.spread > 0) {
        _camDir.x += (Math.random() - 0.5) * spec.spread;
        _camDir.y += (Math.random() - 0.5) * spec.spread * 0.6;
        _camDir.z += (Math.random() - 0.5) * spec.spread;
        _camDir.normalize();
      }

      // Direciona a bala do cano da arma na direção do foco da câmara
      const rayOrigin = this.cameraSystem.camera.position;
      let maxDist = spec.range;
      _shootRay.set(rayOrigin, _camDir);

      // Obstáculos estáticos reduzem alcance do raio
      for (let i = 0; i < this.cityData.colliders.length; i++) {
        const hit = _shootRay.intersectBox(this.cityData.colliders[i], _rayHitPt);
        if (hit) {
          const d = rayOrigin.distanceTo(hit);
          if (d > 2.2 && d < maxDist) maxDist = d;
        }
      }

      // Hit em jogadores remotos
      let bestPlayer: { id: string; characterId?: string; name: string } | null = null;
      const remotes = this.multiplayer.getRemotePlayersList(this.currentInteriorId);
      for (const r of remotes) {
        _targetCenter.set(r.position.x, r.position.y + 1.1, r.position.z);
        _targetSphere.set(_targetCenter, 0.62);
        const hit = _shootRay.intersectSphere(_targetSphere, _rayHitPt);
        if (hit) {
          const d = rayOrigin.distanceTo(hit);
          if (d > 1.8 && d < maxDist) {
            maxDist = d;
            bestPlayer = r;
          }
        }
      }

      // Hit em NPCs do mundo
      let bestNpc = null as (typeof this.npcSystem.npcs)[number] | null;
      for (const npc of this.npcSystem.npcs) {
        if (!npc.mesh.visible || npc.knockedOutUntil > Date.now()) continue;
        _targetCenter.set(npc.position.x, npc.baseY + 1.05, npc.position.z);
        _targetSphere.set(_targetCenter, 0.58);
        const hit = _shootRay.intersectSphere(_targetSphere, _rayHitPt);
        if (hit) {
          const d = rayOrigin.distanceTo(hit);
          if (d > 1.8 && d < maxDist) {
            maxDist = d;
            bestNpc = npc;
            bestPlayer = null;
          }
        }
      }

      const endPoint = {
        x: rayOrigin.x + _camDir.x * maxDist,
        y: Math.max(0.15, rayOrigin.y + _camDir.y * maxDist),
        z: rayOrigin.z + _camDir.z * maxDist,
      };
      const muzzleObj = { x: _muzzlePos.x, y: _muzzlePos.y, z: _muzzlePos.z };
      this.spawnBulletTracer(muzzleObj, endPoint);
      if (p === 0) {
        this.multiplayer.sendWeaponFired(weaponId, muzzleObj, endPoint);
      }

      if (bestPlayer) {
        soundFx.playHitMarker();
        hitPlayerName = bestPlayer.name;
        this.spawnImpactVfx(endPoint, true);
        this.onHitRemotePlayer?.(bestPlayer.characterId || bestPlayer.id, bestPlayer.name, spec.damage, weaponId);
      } else if (bestNpc) {
        this.npcSystem.damageNpc(bestNpc, spec.damage);
        soundFx.playHitMarker();
        this.spawnImpactVfx(endPoint, true);
        hitNpcName = bestNpc.label;
      } else {
        this.spawnImpactVfx(endPoint, false);
      }
    }

    if (hitNpcName && this.currentStats.factionId !== 'policia' && this.currentStats.factionId !== 'faa') {
      this.onCrimeTrigger?.('assault', hitNpcName);
    }

    return { hitNpc: hitNpcName, hitPlayer: hitPlayerName };
  }

  public syncStats(nextStats: PlayerStats) {
    this.currentStats = nextStats;
    if (nextStats.wantedStars <= 0 || nextStats.jailUntil > Date.now()) {
      this.npcSystem.clearPolicePursuit();
    }
  }

  public triggerRobNearestNpc(): { ok: boolean; label?: string; message?: string } {
    if (this.isDriving || this.currentStats.isUnconscious || this.currentStats.isFrozen) {
      return { ok: false, message: 'Sai da viatura para abordar um cidadão.' };
    }
    if (this.currentStats.jailUntil > Date.now()) {
      return { ok: false, message: 'Estás detido na cela da Esquadra PNA!' };
    }
    this.cameraSystem.camera.getWorldDirection(_camDir);
    const nearCiv =
      this.npcSystem.findNearestCivilian(this.player.position.x, this.player.position.z, 4.5) ||
      this.npcSystem.findAimedCivilian(this.cameraSystem.camera.position, _camDir, 11);

    if (!nearCiv) {
      return { ok: false, message: 'Aproxima-te ou aponta para um cidadão para o assaltar!' };
    }
    if (nearCiv.robbedCooldownUntil > Date.now()) {
      return { ok: false, message: `${nearCiv.label} já entregou tudo o que tinha!` };
    }

    this.npcSystem.markNpcThreatened(nearCiv, true);
    soundFx.playInteract();
    this.onCrimeTrigger?.('rob', nearCiv.label);
    return { ok: true, label: nearCiv.label };
  }

  public triggerPunch(): { hitTargetCharacterId?: string; hitTargetName?: string } {
    if (this.isDriving || this.currentStats.isUnconscious || this.currentStats.isFrozen) return {};
    this.player.triggerPunch();
    const remotes = this.multiplayer.getRemotePlayersList(this.currentInteriorId);
    for (const r of remotes) {
      const dist = r.position.distanceTo(this.player.position);
      if (dist <= 2.4) {
        soundFx.playHitMarker();
        return { hitTargetCharacterId: r.characterId || r.id, hitTargetName: r.name };
      }
    }
    for (const npc of this.npcSystem.npcs) {
      if (npc.position.distanceTo(this.player.position) <= 2.4) {
        this.npcSystem.damageNpc(npc, 18);
        soundFx.playHitMarker();
        if (this.currentStats.factionId !== 'policia' && this.currentStats.factionId !== 'faa') {
          this.onCrimeTrigger?.('assault', npc.label);
        }
        break;
      }
    }
    return {};
  }

  public getMinimapSnapshot(): MinimapSnapshot {
    const activePos = this.isDriving && this.currentVehicle ? this.currentVehicle.position : this.player.position;
    const activeYaw = this.isDriving && this.currentVehicle ? this.currentVehicle.rotationY : this.player.rotationY;
    return {
      playerX: activePos.x,
      playerZ: activePos.z,
      playerYaw: activeYaw,
      remotePlayers: this.multiplayer.getRemotePlayersList(this.currentInteriorId).map((r) => ({
        x: r.position.x,
        z: r.position.z,
        name: r.name,
      })),
      npcs: this.npcSystem.npcs
        .filter((n) => n.mesh.visible && n.knockedOutUntil <= Date.now())
        .map((n) => ({ x: n.position.x, z: n.position.z, isGuard: n.isGuard })),
      gps: this.gpsWaypoint,
    };
  }

  public getDistrictByPosition(x: number, z: number): string {
    let nearestName = 'Centro & Baixa';
    let bestSq = Infinity;
    for (const d of this.cityData.districts) {
      const dx = x - d.center[0];
      const dz = z - d.center[1];
      const sq = dx * dx + dz * dz;
      if (sq < bestSq) {
        bestSq = sq;
        nearestName = d.name;
      }
    }
    return nearestName;
  }

  public setActiveCheckpoint(pos: [number, number, number] | null, radius = 6, label = '') {
    if (pos) {
      this.activeCheckpoint = { pos, radius, label };
      this.checkpointCompletedFlag = false;
      this.cityData.checkpointBeacon.position.set(pos[0], 0, pos[2]);
      this.cityData.checkpointBeacon.visible = true;
    } else {
      this.activeCheckpoint = null;
      this.cityData.checkpointBeacon.visible = false;
    }
  }

  public setGpsWaypoint(wp: GpsWaypoint | null) {
    this.gpsWaypoint = wp;
    if (wp) {
      this.cityData.gpsBeacon.position.set(wp.x, 0, wp.z);
      this.cityData.gpsBeacon.visible = true;
    } else {
      this.cityData.gpsBeacon.visible = false;
    }
  }

  public syncDroppedItems(drops: { id: string; x: number; z: number }[]) {
    const group = this.cityData.droppedItemsGroup;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }
    for (const d of drops) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.35, 0.55),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.2 })
      );
      box.position.set(d.x, 0.22, d.z);
      box.name = d.id;
      group.add(box);
    }
  }

  public spawnOwnedVehicle(rec: OwnedVehicleRecord): DrivableVehicle {
    const existingIdx = this.cityData.drivableVehicles.findIndex((v) => v.id === rec.id);
    if (existingIdx >= 0) {
      const v = this.cityData.drivableVehicles[existingIdx];
      v.color = rec.color;
      v.accentColor = rec.accentColor;
      v.skinId = rec.skinId;
      v.wheelStyle = rec.wheelStyle;
      v.fuel = rec.fuel;
      v.health = rec.health;
      v.engineLevel = rec.engineLevel;
      v.suspensionLevel = rec.suspensionLevel;
      v.isLocked = rec.isLocked;
      v.mileageKm = rec.mileageKm || v.mileageKm || 0;
      applyVehicleUpgrades(v);
      return v;
    }
    const veh = createVehicleFromRecord(rec);
    this.cityData.rootGroup.add(veh.mesh);
    this.cityData.drivableVehicles.push(veh);
    this.cityData.interactables.push({
      id: veh.id,
      type: 'vehicle',
      title: `${veh.name} [${veh.plate}]`,
      subtitle: 'Viatura Pessoal Registada',
      prompt: '[E] Entrar na Viatura',
      position: [veh.position.x, 0.5, veh.position.z],
      radius: 4.2,
      district: 'centro',
      data: { vehicleId: veh.id, isDrivable: true },
    });
    return veh;
  }

  public reconcileOwnedVehicles(vehicles: OwnedVehicleRecord[], selfCharacterId: string) {
    const now = Date.now();
    const active = vehicles.filter(
      (v) => !v.isStoredInGarage && !v.isImpounded && (!v.rentedUntil || v.rentedUntil > now)
    );
    const activeIds = new Set(active.map((v) => v.id));

    for (const existing of [...this.cityData.drivableVehicles]) {
      const isMine = existing.ownerId === selfCharacterId || existing.ownerId === this.multiplayer.selfId;
      if (isMine && !activeIds.has(existing.id)) {
        this.removeVehicleById(existing.id);
      }
    }

    for (const rec of active) {
      const veh = this.spawnOwnedVehicle(rec);
      veh.ownerId = rec.ownerId;
    }
  }

  private syncRemoteSharedVehicle(sv: SharedWorldVehicle) {
    if (this.currentVehicle?.id === sv.id) return;
    let veh = this.cityData.drivableVehicles.find((v) => v.id === sv.id);
    if (!veh) {
      veh = createVehicleFromRecord({
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
        wheelStyle: 'padrao',
        fuel: sv.fuel,
        health: sv.health,
        isLocked: sv.isLocked,
        isStoredInGarage: false,
        isImpounded: false,
        finesKz: 0,
        mileageKm: sv.mileageKm || 0,
        position: sv.position,
        rotationY: sv.rotationY,
      });
      this.cityData.rootGroup.add(veh.mesh);
      this.cityData.drivableVehicles.push(veh);
      this.cityData.interactables.push({
        id: veh.id,
        type: 'vehicle',
        title: `${veh.name} [${veh.plate}]`,
        subtitle: sv.driverName ? `Condutor: ${sv.driverName}` : 'Viatura no Mundo',
        prompt: '[E] Entrar na Viatura | [G] Passageiro',
        position: [veh.position.x, 0.5, veh.position.z],
        radius: 4.5,
        district: 'centro',
        data: { vehicleId: veh.id, isDrivable: true },
      });
    }
    veh.position.set(sv.position.x, sv.position.y, sv.position.z);
    veh.mesh.position.copy(veh.position);
    veh.rotationY = sv.rotationY;
    veh.mesh.rotation.y = sv.rotationY;
    veh.velocity = (sv.speedKmh || 0) / 3.6;
    veh.steering = sv.steeringAngle || 0;
    veh.headlightsOn = sv.headlightsOn;
    veh.engineOn = sv.engineOn;
    veh.blinkerMode = sv.blinkerMode;
    veh.isLocked = sv.isLocked;
    veh.health = sv.health;
    veh.fuel = sv.fuel;
    if (typeof sv.mileageKm === 'number') veh.mileageKm = sv.mileageKm;
    if (veh.steeringWheelMesh) {
      veh.steeringWheelMesh.rotation.z = -veh.steering * 2.6;
    }
    const vInt = this.cityData.interactables.find((i) => i.id === veh!.id);
    if (vInt) vInt.position = [veh.position.x, veh.position.y + 0.5, veh.position.z];
  }

  private removeRemoteSharedVehicle(vehicleId: string) {
    if (this.passengerVehicle?.id === vehicleId) {
      this.exitPassengerSeat();
    }
    this.removeVehicleById(vehicleId);
  }

  public removeVehicleById(vehicleId: string) {
    if (this.currentVehicle?.id === vehicleId) {
      this.exitVehicle();
    }
    if (this.passengerVehicle?.id === vehicleId) {
      this.exitPassengerSeat();
    }
    const idx = this.cityData.drivableVehicles.findIndex((v) => v.id === vehicleId);
    if (idx >= 0) {
      const v = this.cityData.drivableVehicles[idx];
      this.cityData.rootGroup.remove(v.mesh);
      this.cityData.drivableVehicles.splice(idx, 1);
    }
    const iIdx = this.cityData.interactables.findIndex((i) => i.id === vehicleId);
    if (iIdx >= 0) {
      this.cityData.interactables.splice(iIdx, 1);
    }
  }

  public enterVehicle(vehicle: DrivableVehicle): boolean {
    if (this.passengerVehicle) {
      this.exitPassengerSeat();
    }
    const sv = this.multiplayer.sharedVehicles.get(vehicle.id);
    if (sv && sv.driverId && sv.driverId !== this.multiplayer.selfId) {
      soundFx.playLock(true);
      this.onNotice?.('Esta viatura já tem condutor! Usa [G] para entrar como passageiro.');
      return false;
    }
    if (vehicle.isLocked && vehicle.ownerId && vehicle.ownerId !== this.multiplayer.selfId) {
      soundFx.playLock(true);
      return false;
    }
    this.currentVehicle = vehicle;
    this.isDriving = true;
    this.player.mesh.visible = false;
    this.cameraSystem.resetBehind(vehicle.rotationY);
    this.multiplayer.enterVehicleSeat(vehicle.id, 0, {
      ownerId: vehicle.ownerId || this.multiplayer.selfId,
      modelId: vehicle.modelId,
      name: vehicle.name,
      type: vehicle.type,
      plate: vehicle.plate,
      color: vehicle.color,
      accentColor: vehicle.accentColor,
      skinId: vehicle.skinId,
      position: { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z },
      rotationY: vehicle.rotationY,
      health: vehicle.health,
      fuel: vehicle.fuel,
    });
    if (this.onDrivingChange) this.onDrivingChange(true, vehicle.name);
    if (vehicle.type === 'candongueiro') soundFx.playCandongueiroHorn();
    if (vehicle.engineOn) soundFx.playVehicleIgnition(vehicle.type);
    return true;
  }

  public exitVehicle() {
    if (!this.isDriving || !this.currentVehicle) return;
    this.vehicleSirenOn = false;
    soundFx.stopSirenLoop();
    soundFx.stopContinuousVehicleAudio();
    const vPos = this.currentVehicle.mesh.position;
    const exitX = vPos.x - 2.2;
    const exitZ = vPos.z;
    const exitY = getSurfaceHeightAt(exitX, exitZ, vPos.y);
    this.player.position.set(exitX, exitY, exitZ);
    this.player.mesh.position.copy(this.player.position);
    this.player.mesh.visible = true;

    const interactable = this.cityData.interactables.find((i) => i.id === this.currentVehicle?.id);
    if (interactable) {
      interactable.position = [vPos.x, 0.5, vPos.z];
    }

    this.multiplayer.exitVehicleSeat(this.currentVehicle.id);
    this.isDriving = false;
    const vName = this.currentVehicle.name;
    this.currentVehicle.velocity = 0;
    this.currentVehicle.rpm = 850;
    this.currentVehicle.bodyPivot.rotation.set(0, 0, 0);
    this.currentVehicle = null;
    this.prevVehicleVel = 0;
    if (this.onDrivingChange) this.onDrivingChange(false, vName);
    soundFx.playInteract();
  }

  public enterPassengerSeat(vehicle?: DrivableVehicle): boolean {
    if (this.isDriving || this.passengerVehicle || this.ridingBus || this.currentStats.isUnconscious) return false;
    const target = vehicle || this.findNearestVehicle(6.5);
    if (!target) return false;
    if (target.isLocked && target.ownerId && target.ownerId !== this.multiplayer.selfId) {
      soundFx.playLock(true);
      return false;
    }
    const maxSeats = Math.max(2, target.seatOffsets.length);
    const occupied = new Set(
      (this.multiplayer.sharedVehicles.get(target.id)?.passengers || []).map((p) => p.seatIndex)
    );
    let freeSeat = 1;
    for (let s = 1; s < maxSeats; s++) {
      if (!occupied.has(s)) {
        freeSeat = s;
        break;
      }
    }
    this.passengerVehicle = target;
    this.passengerSeatIndex = freeSeat;
    this.player.animState = 'passenger';
    this.player.mesh.visible = true;
    this.multiplayer.enterVehicleSeat(target.id, freeSeat, {
      ownerId: target.ownerId || this.multiplayer.selfId,
      modelId: target.modelId,
      name: target.name,
      type: target.type,
      plate: target.plate,
      color: target.color,
      accentColor: target.accentColor,
      skinId: target.skinId,
      position: { x: target.position.x, y: target.position.y, z: target.position.z },
      rotationY: target.rotationY,
      health: target.health,
      fuel: target.fuel,
    });
    this.cameraSystem.resetBehind(target.rotationY);
    soundFx.playInteract();
    return true;
  }

  public exitPassengerSeat() {
    if (!this.passengerVehicle) return;
    const vPos = this.passengerVehicle.mesh.position;
    const exitX = vPos.x + 2.1;
    const exitZ = vPos.z;
    const exitY = getSurfaceHeightAt(exitX, exitZ, vPos.y);
    this.player.position.set(exitX, exitY, exitZ);
    this.player.mesh.position.copy(this.player.position);
    this.player.animState = 'idle';
    this.multiplayer.exitVehicleSeat(this.passengerVehicle.id);
    this.passengerVehicle = null;
    this.passengerSeatIndex = -1;
    this.lastTelemetry = { ...this.lastTelemetry, isPassenger: false, seatIndex: -1, speedKmh: 0 };
    this.onVehicleTelemetry?.(this.lastTelemetry);
    soundFx.playInteract();
  }

  public togglePassengerSeat() {
    if (this.passengerVehicle) {
      this.exitPassengerSeat();
    } else if (!this.isDriving && !this.ridingBus) {
      this.enterPassengerSeat();
    }
  }

  public toggleEngine() {
    if (!this.currentVehicle) return;
    this.currentVehicle.engineOn = !this.currentVehicle.engineOn;
    if (this.currentVehicle.engineOn) soundFx.playVehicleIgnition(this.currentVehicle.type);
    else {
      soundFx.stopContinuousVehicleAudio();
      soundFx.playInteract();
    }
  }

  public toggleHeadlights() {
    if (!this.currentVehicle) return;
    this.currentVehicle.headlightsOn = !this.currentVehicle.headlightsOn;
    const intensity = this.currentVehicle.headlightsOn ? 0.85 : 0.05;
    for (const hl of this.currentVehicle.headlights) {
      (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
    soundFx.playInteract();
  }

  public setBlinker(mode: 'left' | 'right' | 'hazard') {
    if (!this.currentVehicle) return;
    const next = this.currentVehicle.blinkerMode === mode ? 'off' : mode;
    this.currentVehicle.blinkerMode = next;
    soundFx.playBlinkerTick(next !== 'off');
    this.lastTelemetry = { ...this.lastTelemetry, blinkerMode: next };
    if (this.onVehicleTelemetry) this.onVehicleTelemetry(this.lastTelemetry);
  }

  public toggleLock(): boolean {
    const v = this.currentVehicle || this.findNearestVehicle(6);
    if (!v) return false;
    v.isLocked = !v.isLocked;
    soundFx.playLock(v.isLocked);
    return v.isLocked;
  }

  public findNearestVehicle(maxRadius = 6): DrivableVehicle | null {
    let best: DrivableVehicle | null = null;
    let minDist = maxRadius;
    for (const v of this.cityData.drivableVehicles) {
      const dx = this.player.position.x - v.position.x;
      const dz = this.player.position.z - v.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) {
        minDist = dist;
        best = v;
      }
    }
    return best;
  }

  public toggleDriveCandongueiro() {
    if (this.ridingBus) {
      this.exitBus();
      return;
    }
    if (this.passengerVehicle) {
      this.exitPassengerSeat();
      return;
    }
    if (this.isDriving) {
      this.exitVehicle();
    } else {
      const nearest = this.findNearestVehicle(6.5) || this.cityData.drivableVan;
      if (!nearest) return;
      this.enterVehicle(nearest);
    }
  }

  public getInteractables(): InteractableObject[] {
    return this.cityData.interactables;
  }

  public pickHouseAtScreenPoint(clientX: number, clientY: number, maxDistance = 65): string | null {
    if (!this.renderer || !this.cityData.housePickObjects?.length) return null;
    if (isInInteriorPocket(this.player.position.x, this.player.position.z)) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.housePickNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.houseRaycaster.setFromCamera(this.housePickNdc, this.cameraSystem.camera);
    this.houseRaycaster.far = maxDistance + 25;
    const hits = this.houseRaycaster.intersectObjects(this.cityData.housePickObjects, true);
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (!hit.object.visible) continue;
      let cur: THREE.Object3D | null = hit.object;
      let propId: string | null = null;
      while (cur) {
        if (!cur.visible) {
          propId = null;
          break;
        }
        if (typeof cur.userData?.propertyId === 'string') {
          propId = cur.userData.propertyId;
          break;
        }
        cur = cur.parent;
      }
      if (!propId) continue;
      const distToPlayer = this.player.position.distanceTo(hit.point);
      if (distToPlayer <= maxDistance) {
        return propId;
      }
    }
    return null;
  }

  public rotateCamera(dx: number, dy: number) {
    this.cameraSystem.rotate(dx, dy, this.settings.cameraSensitivity * 0.0024, !!this.settings.invertY);
  }

  public touchRotateCamera(dx: number, dy: number) {
    this.cameraSystem.rotateTouch(dx, dy, this.settings.cameraSensitivity * 0.0032, !!this.settings.invertY);
  }

  public zoomCamera(delta: number) {
    this.cameraSystem.zoom(delta);
  }

  public updateSettings(newSettings: GameSettings) {
    this.settings = newSettings;
    if (newSettings.weather !== this.currentWeather) {
      this.setWeather(newSettings.weather);
    }
    soundFx.setVolume(newSettings.soundVolume);
    soundFx.setMusicVolume(newSettings.musicVolume);
    soundFx.setMuted(!!newSettings.muted);
    this.cameraSystem.setBaseDistance(newSettings.cameraDistance || 4.8);
    this.cameraSystem.setRenderDistance(Math.max(240, newSettings.renderDistance || 560) + 420);
    if (this.renderer) {
      this.applyRendererQuality(newSettings);
    }
  }

  private handleResize = () => {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.cameraSystem.camera.aspect = width / height;
    this.cameraSystem.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private startMasterLoop() {
    this.isRunning = true;
    this.clock.start();
    this.lastFrameTimestamp = performance.now();

    const tick = () => {
      if (!this.isRunning) return;
      const nowPerf = performance.now();
      const targetFps = this.settings.targetFps || 60;
      if (!this.isSoftwareGl && targetFps < 120) {
        const minInterval = 1000 / targetFps;
        if (nowPerf - this.lastFrameTimestamp < minInterval - 1.5) {
          this.frameId = requestAnimationFrame(tick);
          return;
        }
      }
      const frameElapsed = nowPerf - this.lastFrameTimestamp;
      this.lastFrameTimestamp = nowPerf;
      this.frameTimeAvgMs = this.frameTimeAvgMs * 0.9 + Math.min(100, frameElapsed) * 0.1;

      if (
        !this.isSoftwareGl &&
        this.settings.autoScaleResolution !== false &&
        nowPerf - this.lastAutoDprCheckMs > 2500
      ) {
        this.lastAutoDprCheckMs = nowPerf;
        if (this.frameTimeAvgMs > 28 && this.dynamicDprFactor > 0.65) {
          this.dynamicDprFactor = Math.max(0.65, Number((this.dynamicDprFactor - 0.1).toFixed(2)));
          this.applyRendererQuality(this.settings);
        } else if (this.frameTimeAvgMs < 13 && this.dynamicDprFactor < 1.0) {
          this.dynamicDprFactor = Math.min(1.0, Number((this.dynamicDprFactor + 0.08).toFixed(2)));
          this.applyRendererQuality(this.settings);
        }
      }

      const delta = Math.min(this.clock.getDelta(), 0.06);
      this.simulateFrame(delta);
      this.renderer.render(this.scene, this.cameraSystem.camera);
      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) this.afterDraw(tick);
    else this.frameId = requestAnimationFrame(tick);
  }

  private afterDraw(cb: () => void) {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 6);
        } else {
          gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 40);
        }
      };
      this.frameId = window.setTimeout(poll, 6);
    } catch {
      this.frameId = window.setTimeout(cb, 50);
    }
  }

  private simulateFrame(delta: number) {
    const time = this.clock.getElapsedTime();
    const input = this.currentInput;
    const vehicle = this.currentVehicle;

    this.busController.update(delta);
    this.inemaAmbulance.update(delta);
    if (this.inemaAmbulance.state !== this.lastInemaState) {
      this.lastInemaState = this.inemaAmbulance.state;
      this.onInemaStatusChange?.(this.inemaAmbulance.state);
    }
    if (this.trafficHitCooldown > 0) {
      this.trafficHitCooldown = Math.max(0, this.trafficHitCooldown - delta);
    }

    // A. VIAGEM EM AUTOCARRO ANGO REAL vs PASSAGEIRO vs CONDUÇÃO vs A PÉ
    if (this.ridingBus) {
      const busPos = this.ridingBus.vehicle.mesh.position;
      this.player.position.set(busPos.x, busPos.y + 1.1, busPos.z);
      this.player.rotationY = this.ridingBus.vehicle.rotationY;
      this.cameraSystem.update(
        delta,
        busPos,
        this.cityData.colliders,
        true,
        this.ridingBus.currentSpeed,
        this.ridingBus.vehicle.rotationY,
        false
      );
      if (this.lastTelemetry.isDriving || this.lastTelemetry.isPassenger) {
        this.lastTelemetry = {
          ...this.lastTelemetry,
          speedKmh: 0,
          gear: 'N',
          sirenOn: false,
          isDriving: false,
          isPassenger: false,
          seatIndex: -1,
        };
        if (this.onVehicleTelemetry) this.onVehicleTelemetry(this.lastTelemetry);
      }
    } else if (this.passengerVehicle) {
      const pv = this.passengerVehicle;
      getVehicleSeatWorldPosition(pv, this.passengerSeatIndex, _seatWorldPos);
      this.player.position.copy(_seatWorldPos);
      this.player.rotationY = pv.rotationY;
      this.player.animState = 'passenger';
      this.player.mesh.position.copy(_seatWorldPos);
      this.player.mesh.rotation.y = pv.rotationY;
      this.cameraSystem.update(
        delta,
        pv.position,
        this.cityData.colliders,
        true,
        Math.abs(pv.velocity),
        pv.rotationY,
        false
      );
      this.telemetryThrottleTimer += delta;
      if (this.telemetryThrottleTimer >= 0.12) {
        this.telemetryThrottleTimer = 0;
        this.lastTelemetry = {
          speedKmh: Math.round(Math.abs(pv.velocity) * 3.6),
          maxSpeedKmh: Math.round(Math.max(pv.maxSpeed * 3.6, pv.physics.maxSpeedKmh || 160)),
          gear: pv.currentGear > 0 ? String(pv.currentGear) : 'N',
          rpm: Math.round(pv.rpm || 850),
          maxRpm: 7500,
          horsePower: pv.physics.horsePower,
          drivetrain: pv.physics.drivetrain,
          vehicleName: pv.name,
          vehicleId: pv.id,
          plate: pv.plate,
          fuel: Math.round(pv.fuel),
          health: Math.round(pv.health),
          engineOn: pv.engineOn,
          headlightsOn: pv.headlightsOn,
          blinkerMode: pv.blinkerMode || 'off',
          isLocked: pv.isLocked,
          sirenOn: false,
          mileageKm: Number((pv.mileageKm || 0).toFixed(2)),
          isDriving: false,
          isPassenger: true,
          seatIndex: this.passengerSeatIndex,
        };
        this.onVehicleTelemetry?.(this.lastTelemetry);
      }
    } else if (this.isDriving && vehicle) {
      const canDrive = vehicle.engineOn && vehicle.fuel > 0 && vehicle.health > 5 && !this.currentStats.isFrozen;
      const isBraking = !!input.handbrake || !!input.jump;
      const isRainyNow = this.currentWeather === 'chuva' || this.weatherTelemetry.precipMm >= 0.4;
      let accel = 0;
      if (canDrive && !isBraking) {
        if (input.analogY !== undefined && Math.abs(input.analogY) > 0.1) {
          accel = input.analogY > 0 ? input.analogY : input.analogY * 0.65;
        } else {
          if (input.forward) accel += 1;
          if (input.backward) accel -= 0.65;
        }
      }

      const phys = vehicle.physics;
      const maxVelMs = Math.max(vehicle.maxSpeed, phys.maxSpeedKmh / 3.6);
      const rainGripMult = isRainyNow ? 0.78 : 1.0;
      const torqueAccel = ((phys.maxTorqueNm / Math.max(140, phys.massKg)) * 24 + (vehicle.acceleration || 4.5)) * rainGripMult;
      const dragDecel = 0.009 * phys.dragCoeff * vehicle.velocity * Math.abs(vehicle.velocity);

      if (accel !== 0) {
        const targetVel = accel * maxVelMs;
        vehicle.velocity = THREE.MathUtils.damp(vehicle.velocity, targetVel, Math.max(2.2, torqueAccel * 0.42), delta);
        vehicle.fuel = Math.max(0, vehicle.fuel - delta * 0.3);
      } else {
        const brakeRate = isBraking ? Math.max(8, phys.brakingForce * 0.32 * rainGripMult) : 1.9;
        vehicle.velocity = THREE.MathUtils.damp(vehicle.velocity - dragDecel * delta, 0, brakeRate, delta);
      }

      const speedKmhExact = Math.abs(vehicle.velocity) * 3.6;
      const maxGears = Math.max(3, phys.gears || 5);
      const gearSpan = Math.max(20, phys.maxSpeedKmh / maxGears);
      const autoGear = vehicle.velocity < -0.5 ? 0 : Math.min(maxGears, Math.max(1, Math.ceil(speedKmhExact / gearSpan)));
      vehicle.currentGear = autoGear;
      const gearRatioFrac = autoGear === 0 ? Math.min(1, speedKmhExact / 35) : ((speedKmhExact % gearSpan) / gearSpan);
      const targetRpm = !vehicle.engineOn
        ? 0
        : Math.min(7500, Math.max(850, 950 + gearRatioFrac * 4900 + (accel !== 0 ? 1200 : 0)));
      vehicle.rpm = THREE.MathUtils.damp(vehicle.rpm || 850, targetRpm, 9, delta);
      const inCabinView = this.cameraSystem.currentRadius < 2.8 && vehicle.type !== 'moto';
      soundFx.updateContinuousVehicleAudio(
        vehicle.engineOn,
        speedKmhExact,
        Math.min(1, (vehicle.rpm || 0) / 7500),
        vehicle.currentGear || 1,
        accel !== 0 && vehicle.engineOn,
        isBraking && speedKmhExact > 16,
        isBraking && speedKmhExact > 30 ? 0.5 : 0,
        vehicle.type,
        inCabinView
      );

      // Luzes traseiras de travagem / marcha-atrás
      const brakeGlow =
        isBraking ||
        input.backward ||
        (input.analogY !== undefined && input.analogY < -0.1) ||
        vehicle.velocity < -0.5;
      for (let i = 0; i < vehicle.taillights.length; i++) {
        (vehicle.taillights[i].material as THREE.MeshStandardMaterial).emissiveIntensity = brakeGlow
          ? 2.0
          : vehicle.headlightsOn
          ? 0.55
          : 0.1;
      }

      let steerInput = 0;
      if (input.analogX !== undefined && Math.abs(input.analogX) > 0.1) {
        steerInput = -input.analogX;
      } else {
        if (input.left) steerInput += 1;
        if (input.right) steerInput -= 1;
      }
      vehicle.steering = THREE.MathUtils.damp(vehicle.steering, steerInput * 0.45, 10, delta);
      if (vehicle.steeringWheelMesh) {
        vehicle.steeringWheelMesh.rotation.z = -vehicle.steering * 2.6;
      }

      if (Math.abs(vehicle.velocity) > 0.15) {
        const driftYawBonus = isBraking ? 1 + phys.driftFactor * 1.4 : 1.0;
        const speedNorm = Math.min(1.0, Math.abs(vehicle.velocity) / Math.max(14, maxVelMs * 0.65));
        const sign = vehicle.velocity >= 0 ? 1 : -1;
        const turnSpeed = sign * speedNorm * steerInput * 2.05 * driftYawBonus * (phys.grip || 0.9);
        vehicle.rotationY += turnSpeed * delta;
      }

      const forwardX = Math.sin(vehicle.rotationY);
      const forwardZ = Math.cos(vehicle.rotationY);
      const nextX = vehicle.position.x + forwardX * vehicle.velocity * delta;
      const nextZ = vehicle.position.z + forwardZ * vehicle.velocity * delta;

      // Colisão de Veículo por eixos separados + impulso elástico veículo-a-veículo (Zero GC)
      const vRadius = vehicle.type === 'moto' ? 0.85 : 1.45;
      const checkBoxBlocked = (cx: number, cz: number): DrivableVehicle | boolean => {
        _vehMin.set(cx - vRadius, 0.25, cz - vRadius);
        _vehMax.set(cx + vRadius, 2.2, cz + vRadius);
        _vehBox.set(_vehMin, _vehMax);
        for (let i = 0; i < this.cityData.colliders.length; i++) {
          if (_vehBox.intersectsBox(this.cityData.colliders[i])) {
            const c = this.cityData.colliders[i];
            if (c.max.x - c.min.x > 1.2 && c.max.z - c.min.z > 1.2) return true;
          }
        }
        for (let i = 0; i < this.cityData.drivableVehicles.length; i++) {
          const other = this.cityData.drivableVehicles[i];
          if (other.id === vehicle.id) continue;
          const minSep = vRadius + (other.type === 'moto' ? 0.9 : 1.5);
          const dx = cx - other.position.x;
          const dz = cz - other.position.z;
          if (dx * dx + dz * dz < minSep * minSep) return other;
        }
        return false;
      };

      const hitX = checkBoxBlocked(nextX, vehicle.position.z);
      const hitZ = checkBoxBlocked(vehicle.position.x, nextZ);

      if (!hitX) {
        vehicle.position.x = Math.max(-44, Math.min(450, nextX));
      } else if (typeof hitX === 'object') {
        hitX.velocity = THREE.MathUtils.clamp(hitX.velocity + vehicle.velocity * 0.45, -18, 18);
      }
      if (!hitZ) {
        vehicle.position.z = Math.max(-450, Math.min(450, nextZ));
      } else if (typeof hitZ === 'object') {
        hitZ.velocity = THREE.MathUtils.clamp(hitZ.velocity + vehicle.velocity * 0.45, -18, 18);
      }
      if (hitX && hitZ) {
        if (Math.abs(vehicle.velocity) > 6) {
          vehicle.health = Math.max(0, vehicle.health - Math.round(Math.abs(vehicle.velocity) * 0.45));
          soundFx.playCrash();
        }
        vehicle.velocity *= -0.32;
      } else if (hitX || hitZ) {
        vehicle.velocity *= 0.9;
      }

      // Alinhamento contínuo do veículo aos Morros, rampas, ponte FAA e declives do terreno
      const slope = getVehicleSlopeAngles(
        vehicle.position.x,
        vehicle.position.z,
        vehicle.rotationY,
        vehicle.type === 'moto' ? 1.05 : 1.85,
        vehicle.type === 'moto' ? 0.42 : 0.92
      );
      vehicle.position.y = THREE.MathUtils.damp(vehicle.position.y, slope.centerHeight, 16, delta);

      // Inclinação física de suspensão + inclinação natural da rampa/morro
      const accelImpulse = (vehicle.velocity - this.prevVehicleVel) / Math.max(0.016, delta);
      this.prevVehicleVel = vehicle.velocity;
      const suspScale = Math.max(0.45, 1.0 - ((vehicle.suspensionLevel || 1) - 1) * 0.18);
      const targetPitch =
        slope.pitch + THREE.MathUtils.clamp(-accelImpulse * 0.0045 * suspScale, -0.065, 0.065);
      const targetRoll =
        slope.roll +
        THREE.MathUtils.clamp((vehicle.velocity / Math.max(8, maxVelMs)) * steerInput * 0.075 * suspScale, -0.07, 0.07);
      vehicle.bodyPivot.rotation.x = THREE.MathUtils.damp(vehicle.bodyPivot.rotation.x, targetPitch, 10, delta);
      vehicle.bodyPivot.rotation.z = THREE.MathUtils.damp(vehicle.bodyPivot.rotation.z, targetRoll, 10, delta);

      // Piscas esquerdos / direitos / 4-piscas
      const blinkOn = Math.floor(time * 3.6) % 2 === 0;
      if (vehicle.blinkerMode !== 'off' && blinkOn !== this.lastBlinkerPhase) {
        this.lastBlinkerPhase = blinkOn;
        soundFx.playBlinkerTick(blinkOn);
      }
      const leftActive = vehicle.blinkerMode === 'left' || vehicle.blinkerMode === 'hazard';
      const rightActive = vehicle.blinkerMode === 'right' || vehicle.blinkerMode === 'hazard';
      for (let i = 0; i < vehicle.leftBlinkers.length; i++) {
        (vehicle.leftBlinkers[i].material as THREE.MeshStandardMaterial).emissiveIntensity =
          leftActive && blinkOn ? 2.4 : 0.06;
      }
      for (let i = 0; i < vehicle.rightBlinkers.length; i++) {
        (vehicle.rightBlinkers[i].material as THREE.MeshStandardMaterial).emissiveIntensity =
          rightActive && blinkOn ? 2.4 : 0.06;
      }

      // Fumo de motor danificado (< 45% lataria)
      if (vehicle.health < 45 && vehicle.engineOn && this.smokePool.length > 0) {
        this.smokeSpawnTimer += delta;
        if (this.smokeSpawnTimer >= 0.09) {
          this.smokeSpawnTimer = 0;
          const slot = this.smokePool.find((p) => p.life <= 0);
          if (slot) {
            slot.life = 0.95;
            slot.maxLife = 0.95;
            slot.mesh.position.set(
              vehicle.position.x + forwardX * 1.45 + (Math.random() - 0.5) * 0.35,
              vehicle.position.y + 1.1,
              vehicle.position.z + forwardZ * 1.45 + (Math.random() - 0.5) * 0.35
            );
            slot.vx = (Math.random() - 0.5) * 0.8;
            slot.vy = 1.6 + Math.random() * 0.8;
            slot.vz = (Math.random() - 0.5) * 0.8;
            slot.mesh.scale.setScalar(0.6);
            slot.mesh.visible = true;
          }
        }
      }

      vehicle.mileageKm = (vehicle.mileageKm || 0) + (Math.abs(vehicle.velocity) * delta) / 1000;
      vehicle.mesh.position.copy(vehicle.position);
      vehicle.mesh.rotation.y = vehicle.rotationY;

      const vInt = this.cityData.interactables.find((i) => i.id === vehicle.id);
      if (vInt) vInt.position = [vehicle.position.x, vehicle.position.y + 0.5, vehicle.position.z];

      const wheelRoll = (vehicle.velocity / 0.42) * delta;
      for (let i = 0; i < vehicle.wheels.length; i++) {
        vehicle.wheels[i].rotation.x += wheelRoll;
        if (i < 2) vehicle.wheels[i].rotation.y = vehicle.steering;
      }

      if (vehicle.sirenMeshes && vehicle.sirenMeshes.length > 0) {
        const flash = Math.sin(time * 14) > 0;
        vehicle.sirenMeshes.forEach((m, idx) => {
          (m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.vehicleSirenOn
            ? (idx % 2 === 0 ? flash : !flash)
              ? 2.2
              : 0.2
            : 0.08;
        });
      }

      this.cameraSystem.update(
        delta,
        vehicle.position,
        this.cityData.colliders,
        true,
        Math.abs(vehicle.velocity),
        vehicle.rotationY,
        false
      );
      this.player.position.copy(vehicle.position);

      this.telemetryThrottleTimer += delta;
      if (this.telemetryThrottleTimer >= 0.08) {
        this.telemetryThrottleTimer = 0;
        const speedKmh = Math.round(speedKmhExact);
        const gear = vehicle.velocity < -0.5 ? 'R' : speedKmh < 1 ? 'N' : String(vehicle.currentGear);

        this.lastTelemetry = {
          speedKmh,
          maxSpeedKmh: Math.round(Math.max(vehicle.maxSpeed * 3.6, phys.maxSpeedKmh || 160)),
          gear,
          rpm: Math.round(vehicle.rpm),
          maxRpm: 7500,
          horsePower: phys.horsePower,
          drivetrain: phys.drivetrain,
          vehicleName: vehicle.name,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          fuel: Math.round(vehicle.fuel),
          health: Math.round(vehicle.health),
          engineOn: vehicle.engineOn,
          headlightsOn: vehicle.headlightsOn,
          blinkerMode: vehicle.blinkerMode || 'off',
          isLocked: vehicle.isLocked,
          sirenOn: this.vehicleSirenOn,
          mileageKm: Number((vehicle.mileageKm || 0).toFixed(2)),
          isDriving: true,
          isPassenger: false,
          seatIndex: 0,
        };
        if (this.onVehicleTelemetry) this.onVehicleTelemetry(this.lastTelemetry);
      }
    } else {
      soundFx.stopContinuousVehicleAudio();
      const waveAmp = this.currentWeather === 'chuva' ? 1.45 : 1.0;
      const escortId = this.currentStats.escortedByCharId;
      let escortedByOfficer = false;
      if (escortId) {
        for (const rp of this.multiplayer.remotePlayers.values()) {
          if (rp.characterId === escortId || rp.id === escortId) {
            const backX = rp.targetPosition.x - Math.sin(rp.targetRotationY) * 1.35;
            const backZ = rp.targetPosition.z - Math.cos(rp.targetRotationY) * 1.35;
            this.player.position.x = THREE.MathUtils.damp(this.player.position.x, backX, 10, delta);
            this.player.position.z = THREE.MathUtils.damp(this.player.position.z, backZ, 10, delta);
            this.player.position.y = getSurfaceHeightAt(this.player.position.x, this.player.position.z, this.player.position.y);
            this.player.rotationY = rp.targetRotationY;
            this.player.mesh.position.copy(this.player.position);
            this.player.mesh.rotation.y = rp.targetRotationY;
            this.player.animState = 'walk';
            escortedByOfficer = true;
            break;
          }
        }
      }
      if (!escortedByOfficer) {
        this.player.update(delta, input, this.cameraSystem.yaw, this.cityData.colliders, this.currentStats, time, waveAmp);
      }
      const inInt = isInInteriorPocket(this.player.position.x, this.player.position.z);
      this.cameraSystem.update(delta, this.player.position, this.cityData.colliders, false, 0, 0, inInt);

      if (this.lastTelemetry.isDriving || this.lastTelemetry.isPassenger) {
        this.lastTelemetry = {
          ...this.lastTelemetry,
          speedKmh: 0,
          gear: 'N',
          rpm: 0,
          sirenOn: false,
          isDriving: false,
          isPassenger: false,
          seatIndex: -1,
        };
        if (this.onVehicleTelemetry) this.onVehicleTelemetry(this.lastTelemetry);
      }
    }

    // Atualiza partículas de fumo + VFX de Combate (luz do disparo, cápsulas, faíscas, anel)
    for (let i = 0; i < this.smokePool.length; i++) {
      const sp = this.smokePool[i];
      if (sp.life > 0) {
        sp.life -= delta;
        if (sp.life <= 0) {
          sp.mesh.visible = false;
        } else {
          sp.mesh.position.x += sp.vx * delta;
          sp.mesh.position.y += sp.vy * delta;
          sp.mesh.position.z += sp.vz * delta;
          const progress = 1 - sp.life / sp.maxLife;
          sp.mesh.scale.setScalar(0.6 + progress * 1.9);
        }
      }
    }

    if (this.muzzleLight && this.muzzleLightTimer > 0) {
      this.muzzleLightTimer -= delta;
      if (this.muzzleLightTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    for (let i = 0; i < this.casingPool.length; i++) {
      const c = this.casingPool[i];
      if (c.life > 0) {
        c.life -= delta;
        if (c.life <= 0) {
          c.mesh.visible = false;
        } else {
          c.vy -= 14 * delta;
          c.mesh.position.x += c.vx * delta;
          c.mesh.position.y += c.vy * delta;
          c.mesh.position.z += c.vz * delta;
          c.mesh.rotation.x += delta * 18;
          c.mesh.rotation.z += delta * 14;
          if (c.mesh.position.y <= c.groundY) {
            c.mesh.position.y = c.groundY;
            c.vy = Math.abs(c.vy) * 0.35;
            c.vx *= 0.6;
            c.vz *= 0.6;
          }
        }
      }
    }

    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (s.life > 0) {
        s.life -= delta;
        if (s.life <= 0) {
          s.mesh.visible = false;
        } else {
          s.vy -= 12 * delta;
          s.mesh.position.x += s.vx * delta;
          s.mesh.position.y += s.vy * delta;
          s.mesh.position.z += s.vz * delta;
          s.mesh.scale.setScalar(Math.max(0.1, s.life / s.maxLife));
        }
      }
    }

    if (this.hitRingMesh && this.hitRingTimer > 0) {
      this.hitRingTimer -= delta;
      if (this.hitRingTimer <= 0) {
        this.hitRingMesh.visible = false;
      } else {
        const s = 0.6 + (1 - this.hitRingTimer / 0.22) * 1.4;
        this.hitRingMesh.scale.setScalar(s);
      }
    }

    const activePos = this.isDriving && vehicle ? vehicle.position : this.player.position;
    const activeRot = this.isDriving && vehicle ? vehicle.rotationY : this.player.rotationY;

    // B0. CHUNK LOD CULLING & INTERIORES ISOLADOS
    const insidePocket = isInInteriorPocket(activePos.x, activePos.z);
    if (!insidePocket) {
      this.activeHouseInteriorId = null;
    }
    const baseInteriorId = resolveCurrentInteriorId(activePos.x, activePos.z);
    this.currentInteriorId =
      insidePocket && this.activeHouseInteriorId && baseInteriorId?.startsWith('casa_')
        ? `house:${this.activeHouseInteriorId}`
        : baseInteriorId;
    if (this.cityData.interiorsGroup) {
      this.cityData.interiorsGroup.visible = insidePocket;
    }
    const renderDist = Math.max(220, this.settings.renderDistance || 400);
    const camPos = this.cameraSystem.camera.position;
    for (let i = 0; i < this.cityData.cityChunks.length; i++) {
      const chunk = this.cityData.cityChunks[i];
      if (insidePocket) {
        chunk.group.visible = false;
        continue;
      }
      const dx = camPos.x - chunk.centerX;
      const dz = camPos.z - chunk.centerZ;
      const maxR = renderDist + chunk.radius;
      chunk.group.visible = dx * dx + dz * dz <= maxR * maxR;
    }

    const nowMs = Date.now();
    const isJailed = this.currentStats.jailUntil > nowMs;
    const wantedStars = this.currentStats.wantedStars || 0;

    // Deteção de cidadãos próximos e ameaça armada por mira (ADS)
    this.nearCivCheckTimer += delta;
    if (this.nearCivCheckTimer >= 0.16) {
      const stepDt = this.nearCivCheckTimer;
      this.nearCivCheckTimer = 0;
      if (this.isDriving || isJailed || this.currentStats.isUnconscious) {
        this.aimThreatNpcId = null;
        this.aimThreatDuration = 0;
        if (this.lastNearCivKey !== '') {
          this.lastNearCivKey = '';
          this.onNearCivilianChange?.(null);
        }
      } else {
        this.cameraSystem.camera.getWorldDirection(_camDir);
        const nearCiv = this.npcSystem.findNearestCivilian(activePos.x, activePos.z, 4.4);
        const aimedCiv =
          this.player.isAiming && this.player.getEquippedWeapon() !== 'none'
            ? this.npcSystem.findAimedCivilian(camPos, _camDir, 11)
            : null;
        const targetCiv = aimedCiv || nearCiv;

        const key = targetCiv
          ? `${targetCiv.id}:${targetCiv.handsUpUntil > nowMs ? '1' : '0'}`
          : '';
        if (key !== this.lastNearCivKey) {
          this.lastNearCivKey = key;
          this.onNearCivilianChange?.(
            targetCiv
              ? { name: targetCiv.label, isThreatened: targetCiv.handsUpUntil > nowMs }
              : null
          );
        }

        if (
          aimedCiv &&
          this.currentStats.factionId !== 'policia' &&
          this.currentStats.factionId !== 'faa' &&
          nowMs >= aimedCiv.robbedCooldownUntil
        ) {
          if (this.aimThreatNpcId === aimedCiv.id) {
            this.aimThreatDuration += stepDt;
          } else {
            this.aimThreatNpcId = aimedCiv.id;
            this.aimThreatDuration = stepDt;
          }
          if (this.aimThreatDuration >= 0.65 && nowMs - this.lastThreatReportAt > 6000) {
            this.lastThreatReportAt = nowMs;
            this.aimThreatDuration = 0;
            this.npcSystem.markNpcThreatened(aimedCiv, false);
            this.onCrimeTrigger?.('threat', aimedCiv.label);
          }
        } else {
          this.aimThreatNpcId = null;
          this.aimThreatDuration = 0;
        }
      }
    }

    const faaHeistActive = nowMs < this.faaHeistActiveUntil;

    // Spawn de perseguição ativa PNA/FAA quando jogador está procurado ou em assalto FAA
    if ((wantedStars > 0 || faaHeistActive) && !isJailed) {
      this.policeSpawnTimer += delta;
      if (this.policeSpawnTimer >= 3.2) {
        this.policeSpawnTimer = 0;
        const spawned = this.npcSystem.spawnPolicePursuit(
          activePos.x,
          activePos.z,
          Math.max(wantedStars, faaHeistActive ? 5 : 0),
          faaHeistActive
        );
        if (spawned > 0) soundFx.playSiren();
      }
    } else {
      this.policeSpawnTimer = 2.0;
    }

    const playerSpeed =
      this.ridingBus ? this.ridingBus.currentSpeed : this.isDriving && vehicle ? Math.abs(vehicle.velocity) : this.player.currentSpeed;

    this.npcSystem.update(delta, activePos.x, activePos.z, {
      wantedStars,
      playerSpeed,
      playerUnconscious: !!this.currentStats.isUnconscious,
      isJailed,
      playerFactionId: this.currentStats.factionId,
      faaHeistActive,
      colliders: this.cityData.colliders,
      onPoliceShot: (from, to, rawDmg) => {
        this.spawnBulletTracer(from, to);
        soundFx.playGunshot('pistola_9mm');
        if (this.currentStats.isUnconscious || this.currentStats.jailUntil > Date.now()) return;
        const updated = { ...this.currentStats };
        let remainingDmg = rawDmg;
        if (updated.armor > 0) {
          const absorbed = Math.min(updated.armor, Math.ceil(rawDmg * 0.55));
          updated.armor = Math.max(0, updated.armor - absorbed);
          remainingDmg = Math.max(1, rawDmg - absorbed);
        }
        updated.health = Math.max(0, updated.health - remainingDmg);
        if (updated.health <= 0) {
          updated.health = 0;
          updated.isUnconscious = true;
        }
        this.currentStats = updated;
        this.onStatsTick?.(updated);
        this.onPlayerDamaged?.(updated.health, remainingDmg);
      },
      onPoliceArrest: (reason) => {
        const nowCheck = Date.now();
        if (nowCheck - this.lastArrestAt < 4000) return;
        this.lastArrestAt = nowCheck;
        this.npcSystem.clearPolicePursuit();
        if (this.isDriving) {
          this.exitVehicle();
        }
        const cell = getAssignedCellData(this.currentStats.assignedCell || 1);
        this.teleport(cell.x, cell.z, Math.PI);
        soundFx.playSiren();
        this.onPoliceArrest?.(reason);
      },
    });

    if (this.activeTracers.length > 0) {
      const nowPerf = performance.now();
      for (let i = this.activeTracers.length - 1; i >= 0; i--) {
        if (nowPerf >= this.activeTracers[i].expiresAt) {
          const tr = this.activeTracers[i];
          this.scene.remove(tr.obj);
          const line = tr.obj as THREE.Line;
          line.geometry?.dispose();
          (line.material as THREE.Material)?.dispose();
          this.activeTracers.splice(i, 1);
        }
      }
    }

    // B. BALIZAS 3D GPS & CHECKPOINT DE EMPREGO + COLUNAS DJ
    if (this.cityData.checkpointBeacon.visible) {
      this.cityData.checkpointBeacon.rotation.y += delta * 1.5;
      const arrow = this.cityData.checkpointBeacon.getObjectByName('BeaconArrow');
      if (arrow) {
        arrow.position.y = 4.2 + Math.sin(time * 4.5) * 0.55;
      }
      if (this.activeCheckpoint && !this.checkpointCompletedFlag) {
        const dx = activePos.x - this.activeCheckpoint.pos[0];
        const dz = activePos.z - this.activeCheckpoint.pos[2];
        if (Math.sqrt(dx * dx + dz * dz) <= this.activeCheckpoint.radius) {
          this.checkpointCompletedFlag = true;
          soundFx.playCashRegister();
          if (this.onCheckpointReached) this.onCheckpointReached();
        }
      }
    }
    if (this.cityData.gpsBeacon.visible && this.gpsWaypoint) {
      this.cityData.gpsBeacon.rotation.y -= delta * 1.2;
      const arrow = this.cityData.gpsBeacon.getObjectByName('BeaconArrow');
      if (arrow) {
        arrow.position.y = 4.2 + Math.sin(time * 4.5) * 0.55;
      }
      const dx = activePos.x - this.gpsWaypoint.x;
      const dz = activePos.z - this.gpsWaypoint.z;
      if (Math.sqrt(dx * dx + dz * dz) <= 5) {
        this.setGpsWaypoint(null);
      }
    }
    if (this.cityData.djSpeakerMeshes.length > 0) {
      const pulse = this.djVisualActive ? 1 + Math.abs(Math.sin(time * 9.5)) * 0.14 : 1;
      for (let i = 0; i < this.cityData.djSpeakerMeshes.length; i++) {
        this.cityData.djSpeakerMeshes[i].scale.setScalar(pulse);
      }
    }

    // C. MULTIPLAYER (Posição + Interior + Assentos + Veículo Partilhado)
    const activeVeh = this.currentVehicle || this.passengerVehicle;
    this.multiplayer.sendMovement(
      delta,
      activePos,
      activeRot,
      this.player.animState,
      this.isDriving,
      activeVeh?.name,
      {
        interiorId: this.currentInteriorId,
        vehicleId: activeVeh?.id,
        seatIndex: this.isDriving ? 0 : this.passengerVehicle ? this.passengerSeatIndex : undefined,
      }
    );
    if (this.isDriving && vehicle) {
      this.multiplayer.sendVehicleSync(delta, {
        vehicleId: vehicle.id,
        modelId: vehicle.modelId,
        name: vehicle.name,
        type: vehicle.type,
        plate: vehicle.plate,
        color: vehicle.color,
        accentColor: vehicle.accentColor,
        skinId: vehicle.skinId,
        position: { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z },
        rotationY: vehicle.rotationY,
        speedKmh: Math.round(vehicle.velocity * 3.6),
        steeringAngle: vehicle.steering,
        headlightsOn: vehicle.headlightsOn,
        engineOn: vehicle.engineOn,
        blinkerMode: vehicle.blinkerMode,
        isLocked: vehicle.isLocked,
        health: vehicle.health,
        fuel: vehicle.fuel,
        mileageKm: Number((vehicle.mileageKm || 0).toFixed(2)),
      });
    }
    this.multiplayer.update(delta, this.cameraSystem.camera.position, this.currentInteriorId);

    // D. SEMÁFOROS NS vs EW & TRÁFEGO COM OBEDIÊNCIA E ATROPELAMENTO
    this.trafficLightTimer += delta;
    if (this.trafficLightPhase === 'ns_green' && this.trafficLightTimer > 9.0) {
      this.trafficLightPhase = 'ns_yellow';
      this.trafficLightTimer = 0;
      this.updateTrafficLights('ns_yellow');
    } else if (this.trafficLightPhase === 'ns_yellow' && this.trafficLightTimer > 2.5) {
      this.trafficLightPhase = 'ew_green';
      this.trafficLightTimer = 0;
      this.updateTrafficLights('ew_green');
    } else if (this.trafficLightPhase === 'ew_green' && this.trafficLightTimer > 9.0) {
      this.trafficLightPhase = 'ew_yellow';
      this.trafficLightTimer = 0;
      this.updateTrafficLights('ew_yellow');
    } else if (this.trafficLightPhase === 'ew_yellow' && this.trafficLightTimer > 2.5) {
      this.trafficLightPhase = 'ns_green';
      this.trafficLightTimer = 0;
      this.updateTrafficLights('ns_green');
    }

    if (this.cityData.beaconMesh) {
      const bm = this.cityData.beaconMesh.material as THREE.MeshStandardMaterial;
      bm.emissiveIntensity = Math.sin(time * 3.5) > 0 ? 1.8 : 0.2;
    }

    const trafficPhaseObj: TrafficPhase = {
      nsGreen: this.trafficLightPhase === 'ns_green' || this.trafficLightPhase === 'ns_yellow',
      ewGreen: this.trafficLightPhase === 'ew_green' || this.trafficLightPhase === 'ew_yellow',
      isYellow: this.trafficLightPhase === 'ns_yellow' || this.trafficLightPhase === 'ew_yellow',
    };

    const canTrafficHitPlayer =
      !this.isDriving &&
      !this.ridingBus &&
      !this.currentStats.isUnconscious &&
      !isJailed &&
      !isInInteriorPocket(activePos.x, activePos.z);

    updateTrafficVehicles(
      this.cityData.trafficVehicles,
      delta,
      trafficPhaseObj,
      activePos,
      canTrafficHitPlayer,
      (rawDmg, knockX, knockZ) => {
        if (this.trafficHitCooldown > 0 || this.currentStats.isUnconscious) return;
        this.trafficHitCooldown = 1.6;
        soundFx.playCrash();
        const clamped = clampToValidWorldBounds(this.player.position.x + knockX * 0.28, this.player.position.z + knockZ * 0.28);
        this.player.position.x = clamped.x;
        this.player.position.z = clamped.z;
        const updated = { ...this.currentStats };
        updated.health = Math.max(0, updated.health - rawDmg);
        if (updated.health <= 0) {
          updated.health = 0;
          updated.isUnconscious = true;
        }
        this.currentStats = updated;
        this.onStatsTick?.(updated);
        this.onPlayerDamaged?.(updated.health, rawDmg);
      }
    );

    // Animação suave das Bandeiras de Angola
    if (this.cityData.flagMesh) {
      this.cityData.flagMesh.rotation.y = Math.sin(time * 2.4) * 0.14;
    }
    if (this.cityData.extraFlags) {
      for (let i = 0; i < this.cityData.extraFlags.length; i++) {
        this.cityData.extraFlags[i].rotation.y = Math.sin(time * 2.4 + i * 0.9) * 0.14;
      }
    }

    // Status de paragem e autocarro ANGO REAL (4 Hz)
    this.busStatusThrottle += delta;
    if (this.busStatusThrottle >= 0.25) {
      this.busStatusThrottle = 0;
      this.emitBusStatus(false);
    }

    // Desliga blackout se o jogador saiu do interior da casa
    if (this.houseBlackoutActive && !isInInteriorPocket(activePos.x, activePos.z)) {
      this.setHouseBlackout(false);
    }

    // E1. CUTSCENE DE VOO TAAG + PORTÕES AUTOMÁTICOS + FONTE + FOGÃO + AVIÕES + VÓLEI + FAZENDA
    if (this.airportFlightCutscene) {
      const fc = this.airportFlightCutscene;
      const elapsedMs = performance.now() - fc.startedAt;
      const t = Math.min(1, elapsedMs / Math.max(1000, fc.durationMs));
      const arcY = 26 + Math.sin(t * Math.PI) * 38;
      const camX = THREE.MathUtils.lerp(fc.startX, fc.endX, t);
      const camZ = THREE.MathUtils.lerp(fc.startZ, fc.endZ, t);
      this.cameraSystem.camera.position.set(camX - 16, arcY + 12, camZ + 22);
      _flightCamLook.set(camX, arcY * 0.35, camZ);
      this.cameraSystem.camera.lookAt(_flightCamLook);
      if (t >= 1) {
        const done = fc.onComplete;
        this.airportFlightCutscene = null;
        this.teleport(fc.endX, fc.endZ, 0);
        done();
      }
    }

    if (this.cityData.condominioGate && this.cityData.condominioGateCollider) {
      const dxGate = activePos.x - 141;
      const dzGate = activePos.z - -193;
      const shouldOpen = dxGate * dxGate + dzGate * dzGate < 14 * 14 ? 1 : 0;
      this.condGateOpen = THREE.MathUtils.damp(this.condGateOpen, shouldOpen, 5.5, delta);
      this.cityData.condominioGate.position.x = 141 + this.condGateOpen * 10.2;
      _gateCenter.set(this.cityData.condominioGate.position.x, 1.5, -193);
      this.cityData.condominioGateCollider.setFromCenterAndSize(_gateCenter, _gateSizeCond);
    }

    if (this.cityData.pnaGate && this.cityData.pnaGateCollider) {
      const dxPna = activePos.x - 226;
      const dzPna = activePos.z - 102;
      const nearPna = dxPna * dxPna + dzPna * dzPna < 14 * 14;
      const allowedPna =
        this.currentStats.factionId === 'policia' ||
        this.currentStats.factionId === 'faa' ||
        this.currentStats.factionId === 'inema' ||
        this.selfRole !== 'player';
      const shouldOpenPna = nearPna && (allowedPna || this.isDriving) ? 1 : 0;
      this.pnaGateOpen = THREE.MathUtils.damp(this.pnaGateOpen, shouldOpenPna, 5.5, delta);
      this.cityData.pnaGate.position.x = 226 + this.pnaGateOpen * 12.2;
      _gateCenter.set(this.cityData.pnaGate.position.x, 1.6, 102);
      this.cityData.pnaGateCollider.setFromCenterAndSize(_gateCenter, _gateSizePna);
    }

    if (this.cityData.fountainWaterJets && this.cityData.fountainWaterJets.length > 0 && !insidePocket) {
      for (let i = 0; i < this.cityData.fountainWaterJets.length; i++) {
        const jet = this.cityData.fountainWaterJets[i];
        jet.scale.y = 0.85 + Math.sin(time * 5.2 + i * 1.4) * 0.22;
      }
    }

    if (this.cityData.stoveEffectGroups && this.cityData.stoveEffectGroups.length > 0) {
      const showCooking = nowMs < this.cookingEffectUntil && insidePocket;
      for (let i = 0; i < this.cityData.stoveEffectGroups.length; i++) {
        const grp = this.cityData.stoveEffectGroups[i];
        grp.visible = showCooking;
        if (showCooking) {
          for (let c = 0; c < grp.children.length; c++) {
            const child = grp.children[c];
            if (typeof child.userData?.baseY === 'number') {
              const phase = (time * 1.6 + c * 0.35) % 1;
              child.position.y = child.userData.baseY + phase * 0.75;
              child.scale.setScalar(0.8 + phase * 0.65);
            } else {
              child.scale.y = 0.85 + Math.sin(time * 18 + c) * 0.25;
            }
          }
        }
      }
    }

    if (this.cityData.airplanes && this.cityData.airplanes.length > 0 && !insidePocket) {
      for (let i = 0; i < this.cityData.airplanes.length; i++) {
        const ap = this.cityData.airplanes[i];
        ap.angle += ap.speed * delta;
        const nx = ap.centerX + Math.cos(ap.angle) * ap.radius;
        const nz = ap.centerZ + Math.sin(ap.angle) * ap.radius;
        ap.group.position.set(nx, ap.altitude + Math.sin(time * 0.9 + i) * 1.5, nz);
        ap.group.rotation.y = -ap.angle;
        ap.group.rotation.z = 0.16;
      }
    }

    if (this.cityData.volleyballMesh && !insidePocket) {
      const vb = this.volleyballState;
      this.cityData.volleyballMesh.position.set(
        vb.x,
        Math.max(0.35, vb.y + Math.abs(Math.sin(time * 2.2)) * (Math.hypot(vb.vx, vb.vz) > 0.2 ? 0.12 : 0)),
        vb.z
      );
      this.cityData.volleyballMesh.rotation.x += vb.vz * delta * 0.8;
      this.cityData.volleyballMesh.rotation.z -= vb.vx * delta * 0.8;
    }

    if (!insidePocket && activePos.x > 165 && activePos.z < -40) {
      this.farmDisplayTimer += delta;
      if (this.farmDisplayTimer >= 1.0) {
        this.farmDisplayTimer = 0;
        this.updateFarmPlantDisplays();
      }
    }

    // F. COQUEIROS, CHUVA, CALOR EXTREMO & CLIMA
    const isRainy = this.currentWeather === 'chuva' || this.weatherTelemetry.precipMm >= 0.4;
    const isHot = this.currentWeather === 'calor_extremo';
    const windFactor = Math.max(0.6, Math.min(1.8, (this.weatherTelemetry.windKmh || 15) / 16));
    const swayAmp = (isRainy ? 0.072 : this.currentWeather === 'nublado' ? 0.048 : 0.032) * windFactor;
    const swayFreq = isRainy ? 2.6 : 1.6;
    for (let i = 0; i < this.cityData.swayingTrees.length; i++) {
      const tree = this.cityData.swayingTrees[i];
      const tdx = tree.position.x - activePos.x;
      const tdz = tree.position.z - activePos.z;
      if (tdx * tdx + tdz * tdz > 160 * 160) continue;
      tree.rotation.z = Math.sin(time * swayFreq + i * 0.45) * swayAmp;
      tree.rotation.x = Math.cos(time * (swayFreq * 0.8) + i * 0.3) * (swayAmp * 0.7);
    }

    if (isRainy && this.rainMesh) {
      this.rainMesh.visible = true;
      const positions = this.rainMesh.geometry.attributes.position.array as Float32Array;
      const activeDropCount =
        this.weatherTelemetry.precipMm >= 2.5
          ? this.rainCount
          : Math.max(120, Math.round(this.rainCount * (this.currentWeather === 'chuva' ? 0.85 : 0.45)));
      this.rainMesh.geometry.setDrawRange(0, activeDropCount);
      for (let i = 0; i < activeDropCount; i++) {
        positions[i * 3 + 1] -= 23 * delta;
        positions[i * 3] += 1.6 * windFactor * delta;
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 26 + Math.random() * 8;
          positions[i * 3] = activePos.x + (Math.random() - 0.5) * 60;
          positions[i * 3 + 2] = activePos.z + (Math.random() - 0.5) * 60;
        }
      }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    } else if (this.rainMesh && this.rainMesh.visible) {
      this.rainMesh.visible = false;
    }

    if (isHot && this.heatDustMesh) {
      this.heatDustMesh.visible = true;
      const dPos = this.heatDustMesh.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < this.heatDustCount; i++) {
        dPos[i * 3 + 1] += 1.15 * delta;
        dPos[i * 3] += Math.sin(time * 2.1 + i) * 0.45 * delta;
        if (dPos[i * 3 + 1] > 9.5) {
          dPos[i * 3 + 1] = 0.2;
          dPos[i * 3] = activePos.x + (Math.random() - 0.5) * 56;
          dPos[i * 3 + 2] = activePos.z + (Math.random() - 0.5) * 56;
        }
      }
      this.heatDustMesh.geometry.attributes.position.needsUpdate = true;
    } else if (this.heatDustMesh && this.heatDustMesh.visible) {
      this.heatDustMesh.visible = false;
    }

    if (isRainy) {
      this.lightningCooldown -= delta;
      if (this.lightningCooldown <= 0) {
        this.lightningFlash = 0.95;
        this.lightningCooldown = 7 + Math.random() * 11;
      }
    }
    this.lightningFlash = Math.max(0, this.lightningFlash - delta * 4.2);

    // Atualiza Oceano Dinâmico, Barcos na Baía de Luanda e Som Costeiro
    const waveAmp = isRainy ? 1.55 : this.currentWeather === 'nublado' ? 1.18 : 1.0;
    const rainPower = isRainy ? (this.currentWeather === 'chuva' ? 1.0 : 0.55) : 0.0;
    this.updateDayNightAndWeather(delta, activePos, time, waveAmp, rainPower);

    if (!insidePocket && activePos.x < 170) {
      for (let i = 0; i < this.cityData.boats.length; i++) {
        const boat = this.cityData.boats[i];
        const wy = getWaveHeightAt(boat.position.x, boat.position.z, time, waveAmp);
        boat.position.y = wy - 0.04;
        boat.rotation.z = Math.sin(time * 1.4 + i) * 0.045 * waveAmp;
        boat.rotation.x = Math.cos(time * 1.1 + i * 0.7) * 0.03 * waveAmp;
      }
    }

    // Proximidade sonora do Atlântico (ativa surf costeiro perto da Marginal/Praia)
    const shoreDist = Math.max(0, activePos.x - (-49));
    const oceanProx = activePos.x < -30 ? Math.max(0, Math.min(1, 1 - shoreDist / 85)) : 0;
    soundFx.setOceanProximity(oceanProx);

    // G. INTERATIVOS PRÓXIMOS
    let nearestInteractable: InteractableObject | null = null;
    let minDistance = Infinity;
    for (const obj of this.cityData.interactables) {
      const [ox, , oz] = obj.position;
      const dx = activePos.x - ox;
      const dz = activePos.z - oz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= obj.radius && dist < minDistance) {
        minDistance = dist;
        nearestInteractable = obj;
      }
    }

    const currentInteractableId = nearestInteractable ? nearestInteractable.id : null;
    if (currentInteractableId !== this.lastInteractableId) {
      this.lastInteractableId = currentInteractableId;
      if (this.onNearInteractable) this.onNearInteractable(nearestInteractable);
    }

    // H. DISTRITO ATUAL
    let nearestDistrictName = 'Centro & Baixa';
    let nearestDistDist = Infinity;
    for (const district of this.cityData.districts) {
      const [cx, cz] = district.center;
      const dx = activePos.x - cx;
      const dz = activePos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDistDist) {
        nearestDistDist = dist;
        nearestDistrictName = district.name;
      }
    }
    if (nearestDistrictName !== this.currentDistrict) {
      this.currentDistrict = nearestDistrictName;
      if (this.onDistrictChange) this.onDistrictChange(nearestDistrictName);
    }

    // I. METABOLISMO / ENERGIA / HEMORRAGIA (1 Hz)
    this.statsTimer += delta;
    if (this.statsTimer >= 1.0) {
      this.statsTimer = 0;
      const updatedStats = { ...this.currentStats };
      const isActivelyMoving =
        input.forward ||
        input.backward ||
        input.left ||
        input.right ||
        Math.hypot(input.analogX || 0, input.analogY || 0) > 0.1;
      if (!this.isDriving && input.sprint && isActivelyMoving) {
        updatedStats.energy = Math.max(0, updatedStats.energy - 3.0);
      } else {
        updatedStats.energy = Math.min(100, updatedStats.energy + 4.0);
      }
      const heatThirstMult = this.currentWeather === 'calor_extremo' ? 1.35 : 1.0;
      updatedStats.thirst = Math.max(0, updatedStats.thirst - 0.14 * heatThirstMult);
      updatedStats.hunger = Math.max(0, updatedStats.hunger - 0.1);
      updatedStats.sleep = Math.max(0, (updatedStats.sleep ?? 100) - 0.045);

      if (updatedStats.bleeding && !updatedStats.isUnconscious) {
        updatedStats.health = Math.max(0, updatedStats.health - 1.5);
      }
      if ((updatedStats.hunger <= 0 || updatedStats.thirst <= 0) && !updatedStats.isUnconscious) {
        updatedStats.health = Math.max(0, updatedStats.health - 0.6);
      }
      if (updatedStats.health <= 0 && !updatedStats.isUnconscious) {
        updatedStats.health = 0;
        updatedStats.isUnconscious = true;
      }

      this.currentStats = updatedStats;
      if (this.onStatsTick) this.onStatsTick(updatedStats);
    }

    // J. RELÓGIO
    this.clockThrottleTimer += delta;
    if (this.clockThrottleTimer >= 0.5) {
      this.clockThrottleTimer = 0;
      const hours = Math.floor(this.timeOfDay);
      const minutes = Math.floor((this.timeOfDay - hours) * 60);
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      if (timeStr !== this.lastTimeString) {
        this.lastTimeString = timeStr;
        if (this.onTimeUpdate) this.onTimeUpdate(timeStr, this.timeOfDay);
      }
    }
  }

  private updateTrafficLights(phase: 'ns_green' | 'ns_yellow' | 'ew_green' | 'ew_yellow') {
    for (const tl of this.cityData.trafficLights) {
      const axis = tl.axis || 'ns';
      if (axis === 'ns') {
        tl.redMat.emissiveIntensity = phase === 'ew_green' || phase === 'ew_yellow' ? 1.1 : 0.1;
        tl.yellowMat.emissiveIntensity = phase === 'ns_yellow' ? 1.1 : 0.1;
        tl.greenMat.emissiveIntensity = phase === 'ns_green' ? 1.1 : 0.1;
      } else {
        tl.redMat.emissiveIntensity = phase === 'ns_green' || phase === 'ns_yellow' ? 1.1 : 0.1;
        tl.yellowMat.emissiveIntensity = phase === 'ew_yellow' ? 1.1 : 0.1;
        tl.greenMat.emissiveIntensity = phase === 'ew_green' ? 1.1 : 0.1;
      }
    }
  }

  private updateDayNightAndWeather(
    delta: number,
    activePos: THREE.Vector3,
    elapsedTime: number,
    waveAmp: number,
    rainPower: number
  ) {
    if (this.settings.timeSpeed > 0) {
      this.timeOfDay = (this.timeOfDay + delta * 0.018 * this.settings.timeSpeed) % 24;
    }
    const t = this.timeOfDay;
    const isNightHour = t >= 19.3 || t < 5.5;
    const isSunsetHour = t >= 17.0 && t < 19.3;
    const isDawnHour = t >= 5.5 && t < 7.2;

    const sunAngle = ((t - 6) / 24) * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle);
    this.sunLight.position.set(Math.cos(sunAngle) * 120, Math.max(-20, sunHeight * 120), 40);
    _sunDirVec.copy(this.sunLight.position).normalize();

    const cloudCover = Math.max(
      0,
      Math.min(
        100,
        this.currentWeather === 'nublado'
          ? Math.max(70, this.weatherTelemetry.cloudCover)
          : this.currentWeather === 'chuva'
            ? 92
            : this.currentWeather === 'calor_extremo'
              ? Math.min(20, this.weatherTelemetry.cloudCover)
              : this.weatherTelemetry.cloudCover
      )
    );

    let sunIntensity = 1.65;
    let streetLampIntensity = 0;
    let fogDensity = 0.0028;

    // 1. Base pela hora do dia (Zero alocações por frame!)
    if (this.currentWeather === 'noite' || (isNightHour && this.currentWeather !== 'pordosol')) {
      _skyColor.setHex(0x090d16);
      _skyZenith.setHex(0x020617);
      _skyHorizon.setHex(0x0f172a);
      this.sunLight.color.setHex(0x93c5fd);
      this.hemiLight.color.setHex(0x1e293b);
      this.hemiLight.groundColor.setHex(0x020617);
      sunIntensity = 0.28;
      fogDensity = 0.0052;
      streetLampIntensity = 1.0;
    } else if (this.currentWeather === 'pordosol' || isSunsetHour) {
      const p = isSunsetHour ? (t - 17) / 2.3 : 0.65;
      _skyColor.lerpColors(_cTmpA.setHex(0xf97316), _cTmpB.setHex(0x701a75), p);
      _skyZenith.lerpColors(_cTmpA.setHex(0x7c3aed), _cTmpB.setHex(0x1e1b4b), p);
      _skyHorizon.lerpColors(_cTmpA.setHex(0xfb923c), _cTmpB.setHex(0xc026d3), p);
      this.sunLight.color.setHex(0xfb923c);
      this.hemiLight.color.setHex(0xfdba74);
      this.hemiLight.groundColor.setHex(0x451a03);
      sunIntensity = 1.05;
      fogDensity = 0.0042;
      streetLampIntensity = 0.55;
    } else if (isDawnHour) {
      const d = (t - 5.5) / 1.7;
      _skyColor.lerpColors(_cTmpA.setHex(0x312e81), _cTmpB.setHex(0x7dd3fc), d);
      _skyZenith.lerpColors(_cTmpA.setHex(0x1e1b4b), _cTmpB.setHex(0x0284c7), d);
      _skyHorizon.lerpColors(_cTmpA.setHex(0xfdba74), _cTmpB.setHex(0xbae6fd), d);
      this.sunLight.color.setHex(0xfed7aa);
      this.hemiLight.color.setHex(0xfde68a);
      this.hemiLight.groundColor.setHex(0x78350f);
      sunIntensity = 0.75 + d * 0.75;
      fogDensity = 0.0034;
      streetLampIntensity = Math.max(0, 0.5 - d * 0.5);
    } else {
      _skyColor.setHex(0x7dd3fc);
      _skyZenith.setHex(0x0284c7);
      _skyHorizon.setHex(0xbae6fd);
      this.sunLight.color.setHex(0xffedd5);
      this.hemiLight.color.setHex(0xbae6fd);
      this.hemiLight.groundColor.setHex(0x854d0e);
      sunIntensity = 1.75;
      fogDensity = 0.0022;
      streetLampIntensity = 0;
    }

    // 2. Modificadores dinâmicos de clima + API (Zero alocações)
    if (this.currentWeather === 'cacimbo') {
      _skyColor.lerp(_cTmpA.setHex(isNightHour ? 0x1e293b : 0x94a3b8), 0.72);
      _skyZenith.lerp(_cTmpA.setHex(isNightHour ? 0x0f172a : 0x64748b), 0.75);
      _skyHorizon.lerp(_cTmpA.setHex(isNightHour ? 0x334155 : 0xcbd5e1), 0.82);
      sunIntensity *= 0.54;
      fogDensity = 0.014;
      streetLampIntensity = Math.max(streetLampIntensity, 0.35);
    } else if (this.currentWeather === 'chuva') {
      _skyColor.lerp(_cTmpA.setHex(isNightHour ? 0x090f1d : 0x334155), 0.82);
      _skyZenith.lerp(_cTmpA.setHex(isNightHour ? 0x020617 : 0x1e293b), 0.85);
      _skyHorizon.lerp(_cTmpA.setHex(isNightHour ? 0x1e293b : 0x475569), 0.85);
      this.sunLight.color.setHex(this.lightningFlash > 0.1 ? 0xe0f2fe : isNightHour ? 0x475569 : 0x64748b);
      sunIntensity = sunIntensity * 0.36 + this.lightningFlash * 1.4;
      fogDensity = 0.0105;
      streetLampIntensity = Math.max(streetLampIntensity, 0.75);
    } else if (this.currentWeather === 'nublado' || cloudCover >= 50) {
      const cloudRatio = Math.min(0.85, cloudCover / 110);
      _skyColor.lerp(_cTmpA.setHex(isNightHour ? 0x0f172a : 0x7c8ea3), cloudRatio);
      _skyZenith.lerp(_cTmpA.setHex(isNightHour ? 0x0f172a : 0x475569), cloudRatio * 0.9);
      _skyHorizon.lerp(_cTmpA.setHex(isNightHour ? 0x1e293b : 0xb0becf), cloudRatio * 0.85);
      sunIntensity *= 1 - cloudRatio * 0.58;
      fogDensity = Math.max(fogDensity, 0.0038 + cloudRatio * 0.0028);
      if (cloudRatio > 0.6) streetLampIntensity = Math.max(streetLampIntensity, 0.25);
    } else if (this.currentWeather === 'calor_extremo') {
      if (!isNightHour) {
        _skyColor.lerp(_cTmpA.setHex(0xfdba74), 0.32);
        _skyZenith.lerp(_cTmpA.setHex(0x0369a1), 0.35);
        _skyHorizon.lerp(_cTmpA.setHex(0xfde68a), 0.52);
        this.sunLight.color.setHex(0xfcd34d);
        this.hemiLight.color.setHex(0xfef3c7);
        this.hemiLight.groundColor.setHex(0xb45309);
        sunIntensity = Math.max(sunIntensity, 2.05);
        fogDensity = 0.0038;
      }
    }

    const bgColor = this.scene.background as THREE.Color;
    if (isInInteriorPocket(activePos.x, activePos.z) && this.houseBlackoutActive) {
      bgColor.setHex(0x020306);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x020306);
        (this.scene.fog as THREE.FogExp2).density = 0.036;
      }
      this.sunLight.intensity = 0.02;
      this.hemiLight.intensity = 0.04;
    } else {
      this.hemiLight.intensity = 0.85;
      bgColor.copy(_skyColor);
      if (this.scene.fog) {
        this.scene.fog.color.copy(_skyHorizon);
        (this.scene.fog as THREE.FogExp2).density = fogDensity;
      }
      this.sunLight.intensity = Math.max(0.14, sunIntensity);
    }
    if (this.cityData.lampHeadMat) {
      this.cityData.lampHeadMat.emissiveIntensity = 0.25 + streetLampIntensity * 1.15;
    }
    setDistrictBlackouts(this.cityData, this.dynamicWorldState?.blackoutDistricts || {}, streetLampIntensity);

    this.skyEnv.update(
      delta,
      activePos,
      this.timeOfDay,
      this.currentWeather,
      _skyZenith,
      _skyHorizon,
      this.showClouds,
      { cloudCover, lightningFlash: this.lightningFlash }
    );

    if (this.cityData.oceanWater) {
      this.cityData.oceanWater.update(
        elapsedTime,
        waveAmp,
        rainPower,
        _skyHorizon,
        this.sunLight.color,
        _sunDirVec
      );
    }
  }

  public teleport(x: number, z: number, rotationY?: number) {
    const clamped = isInInteriorPocket(x, z) ? { x, z } : clampToValidWorldBounds(x, z);
    const surfY = getSurfaceHeightAt(clamped.x, clamped.z, 2);
    if (this.isDriving && this.currentVehicle) {
      this.currentVehicle.position.set(clamped.x, surfY, clamped.z);
      this.currentVehicle.mesh.position.copy(this.currentVehicle.position);
      this.currentVehicle.velocity = 0;
    }
    this.player.position.set(clamped.x, surfY, clamped.z);
    if (typeof rotationY === 'number') {
      this.player.rotationY = rotationY;
      this.player.mesh.rotation.y = rotationY;
    }
    this.player.mesh.position.copy(this.player.position);
    this.cameraSystem.resetBehind(this.player.rotationY);
  }

  public teleportToJobSite(stepPos: [number, number, number], stepRadius: number): { x: number; z: number } {
    if (this.ridingBus) {
      this.exitBus();
    }
    if (this.isDriving) {
      this.exitVehicle();
    }
    const targetX = stepPos[0];
    const targetZ = stepPos[2];
    const offsetDist = Math.max(stepRadius + 2.4, 5.5);
    let chosenX = targetX;
    let chosenZ = targetZ + offsetDist;

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const cx = targetX + Math.sin(ang) * offsetDist;
      const cz = targetZ + Math.cos(ang) * offsetDist;
      if (!isInsideValidWorldBounds(cx, cz)) continue;
      let blocked = false;
      for (let c = 0; c < this.cityData.colliders.length; c++) {
        const b = this.cityData.colliders[c];
        if (cx >= b.min.x - 0.7 && cx <= b.max.x + 0.7 && cz >= b.min.z - 0.7 && cz <= b.max.z + 0.7) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        chosenX = cx;
        chosenZ = cz;
        break;
      }
    }

    const faceAngle = Math.atan2(targetX - chosenX, targetZ - chosenZ);
    this.teleport(chosenX, chosenZ, faceAngle);
    return { x: chosenX, z: chosenZ };
  }

  public getDrivingModelId(): string | null {
    return this.isDriving && this.currentVehicle ? this.currentVehicle.modelId : null;
  }

  public getVehicleMileageKm(vehId: string): number | undefined {
    const v = this.cityData.drivableVehicles.find((item) => item.id === vehId);
    return v ? Number((v.mileageKm || 0).toFixed(2)) : undefined;
  }

  public toggleVehicleSiren(): boolean {
    if (!this.isDriving || !this.currentVehicle) {
      this.vehicleSirenOn = false;
      soundFx.stopSirenLoop();
      return false;
    }
    this.vehicleSirenOn = !this.vehicleSirenOn;
    if (this.vehicleSirenOn) {
      const mode: 'pna' | 'inema' = this.currentVehicle.type === 'ambulance' ? 'inema' : 'pna';
      soundFx.startSirenLoop(mode);
    } else {
      soundFx.stopSirenLoop();
    }
    this.lastTelemetry = {
      ...this.lastTelemetry,
      sirenOn: this.vehicleSirenOn,
    };
    this.onVehicleTelemetry?.(this.lastTelemetry);
    return this.vehicleSirenOn;
  }

  public hitVolleyball() {
    const vb = this.volleyballState;
    let dx = vb.x - this.player.position.x;
    let dz = vb.z - this.player.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) {
      dx = Math.sin(this.player.rotationY);
      dz = Math.cos(this.player.rotationY);
    } else {
      dx /= len;
      dz /= len;
    }
    this.multiplayer.sendVolleyballHit(dx, dz);
    soundFx.playInteract();
  }

  public triggerCookingEffect(durationMs = 4500) {
    this.cookingEffectUntil = Date.now() + durationMs;
  }

  public startAirportFlight(flight: AirportFlightDef, onComplete: () => void) {
    if (this.ridingBus) this.exitBus();
    if (this.isDriving) this.exitVehicle();
    this.airportFlightCutscene = {
      startX: -95,
      startZ: -70,
      endX: flight.destPos[0],
      endZ: flight.destPos[2],
      startedAt: performance.now(),
      durationMs: Math.max(4000, (flight.durationSec || 8) * 1000),
      onComplete,
    };
    soundFx.playInteract();
  }

  private updateFarmPlantDisplays() {
    const displays = this.cityData.farmPlantDisplays;
    if (!displays) return;
    const farmPlants = this.dynamicWorldState?.farmPlants || {};
    const now = Date.now();
    for (const node of FARM_PLANT_NODES) {
      const ref = displays[node.id];
      if (!ref) continue;
      const st = farmPlants[node.id];
      const remSec = st && st.availableAt > now ? Math.ceil((st.availableAt - now) / 1000) : 0;
      let statusText = 'Pronta para colheita';
      let isGrowing = false;
      if (remSec > 0) {
        const min = Math.floor(remSec / 60);
        const sec = remSec % 60;
        statusText = `Em processo (${min}:${String(sec).padStart(2, '0')})`;
        isGrowing = true;
      }
      if (ref.lastText === statusText) continue;
      ref.lastText = statusText;
      const ctx = ref.ctx;
      ctx.fillStyle = isGrowing ? 'rgba(69, 26, 3, 0.9)' : 'rgba(5, 46, 22, 0.88)';
      ctx.fillRect(0, 0, 340, 96);
      ctx.strokeStyle = isGrowing ? '#f59e0b' : '#4ade80';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, 334, 90);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.cropName.toUpperCase(), 170, 34);
      ctx.fillStyle = isGrowing ? '#fed7aa' : '#86efac';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(statusText, 170, 70);
      ref.texture.needsUpdate = true;
    }
  }

  public destroy() {
    this.isRunning = false;
    soundFx.stopSirenLoop();
    soundFx.stopContinuousVehicleAudio();
    soundFx.stopRain();
    soundFx.stopOceanAmbience();
    soundFx.stopGlobalDjTrack();
    soundFx.dispose();
    this.multiplayer.destroy();
    this.player.dispose();
    this.skyEnv.dispose();
    this.rainMesh?.geometry.dispose();
    (this.rainMesh?.material as THREE.Material | undefined)?.dispose();
    this.heatDustMesh?.geometry.dispose();
    (this.heatDustMesh?.material as THREE.Material | undefined)?.dispose();
    this.smokeGeo?.dispose();
    this.smokeMat?.dispose();
    this.casingGeo?.dispose();
    this.casingMat?.dispose();
    this.sparkGeo?.dispose();
    this.sparkMat?.dispose();
    this.hitRingMesh?.geometry.dispose();
    (this.hitRingMesh?.material as THREE.Material | undefined)?.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const disposeM = (mat: THREE.Material) => {
          const anyMat = mat as THREE.MeshStandardMaterial;
          anyMat.map?.dispose();
          anyMat.emissiveMap?.dispose();
          mat.dispose();
        };
        if (Array.isArray(m.material)) m.material.forEach(disposeM);
        else if (m.material) disposeM(m.material);
      }
    });
    disposeCachedEnvironmentTextures();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.dispose();
  }
}
