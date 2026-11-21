/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GenderType = 'masculino' | 'feminino';

export type AdminRole = 'player' | 'moderador' | 'administrador' | 'gestor' | 'admin_god';

export interface PlayerStats {
  name: string;
  surname: string;
  age: number;
  nationality: string;
  gender: GenderType;
  phone: string;
  history: string;
  idNumber: string; // Ex: 007294812LA042
  cashKz: number;
  bankKz: number;
  loanBalanceKz: number;
  health: number; // 0 - 100
  armor: number; // 0 - 100
  energy: number; // 0 - 100
  hunger: number; // 0 - 100
  thirst: number; // 0 - 100
  sleep: number; // 0 - 100 (descanso/sono)
  bleeding: boolean;
  isUnconscious: boolean;
  handcuffed?: boolean;
  escortedByCharId?: string | null;
  wantedStars: number; // 0 - 5
  jailUntil: number; // timestamp ms (0 = free)
  jailReason: string;
  assignedCell?: number;
  homePropertyId?: string | null;
  interiorId?: string | null;
  xp: number;
  level: number;
  jobId: string | null;
  jobLevel: number;
  jobXp: number;
  factionId: string | null;
  factionRank: string;
  isFrozen?: boolean;
  weaponLicenseUntil?: number;
  unpaidFinesKz?: number;
  farmCrates?: number;
  farmVanVehicleId?: string | null;
  activeWorkVehicleId?: string | null;
}

export type OutfitStyle =
  | 'jersey'
  | 'tactical_vest'
  | 'puffer'
  | 'crop_top'
  | 'hoodie'
  | 'tank_top'
  | 'military'
  | 'yango_uniform'
  | 'ende_uniform'
  | 'pescador_uniform'
  | 'elisal_uniform'
  | 'pna_uniform'
  | 'inema_uniform'
  | 'advogado_suit'
  | 'agricultor_uniform'
  | 'restaurante_uniform'
  | 'boutique_uniform';

export type WeaponId =
  | 'none'
  | 'bastao_tatico'
  | 'pistola_9mm'
  | 'espingarda_12'
  | 'ak47_tatica';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  damage: number;
  range: number;
  fireRateMs: number;
  magSize: number;
  reloadMs: number;
  spread: number;
  pellets?: number;
  isMelee?: boolean;
  priceKz: number;
  legalOnly?: boolean;
}

export interface PlayerCustomization {
  gender?: GenderType;
  skinTone: string;
  shirtColor: string;
  pantsColor: string;
  shoesColor: string;
  hairStyle: 'curto' | 'afro' | 'trancas' | 'bone';
  hairColor: string;
  heightScale: number;
  skinPresetId?: string;
  outfitStyle?: OutfitStyle;
  vestText?: string;
  hasMask?: boolean;
  maskColor?: string;
  hasCap?: boolean;
  capColor?: string;
  capText?: string;
  hasSunglasses?: boolean;
  hasTattoos?: boolean;
  hasChain?: boolean;
  hasBag?: boolean;
  equippedWeapon?: WeaponId;
}

export interface SkinPreset {
  id: string;
  label: string;
  category: 'poster_faccao' | 'faa' | 'poster_civil';
  factionId?: string;
  badgeColor: string;
  description: string;
  customization: PlayerCustomization;
}

export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'get_up'
  | 'crouch'
  | 'swim'
  | 'drive'
  | 'passenger'
  | 'punch'
  | 'sleep'
  | 'waking_up'
  | 'unconscious'
  | 'emote_wave'
  | 'emote_greet'
  | 'emote_clap'
  | 'emote_dance'
  | 'emote_laugh'
  | 'emote_cry'
  | 'emote_point'
  | 'emote_phone'
  | 'emote_smoke'
  | 'emote_sit'
  | 'emote_lie'
  | 'emote_surrender'
  | 'emote_docs'
  | 'emote_carry_box'
  | 'emote_work'
  | 'emote_fish'
  | 'emote_repair_car'
  | 'emote_repair_elec'
  | 'emote_trash'
  | 'emote_handcuff'
  | 'emote_frisk'
  | 'emote_carry_injured';

export type DistrictId =
  | 'centro'
  | 'ilha'
  | 'maianga'
  | 'viana'
  | 'talatona'
  | 'kilamba'
  | 'cacuaco'
  | 'aeroporto'
  | 'ingombota'
  | 'cazenga'
  | 'sambizanga'
  | 'benfica'
  | 'faa_base'
  | 'condominio'
  | 'complexo_pna'
  | 'fazenda';

export interface District {
  id: DistrictId;
  name: string;
  fullName: string;
  description: string;
  center: [number, number]; // [x, z]
  color: string;
}

export type InteractableType =
  | 'candongueiro'
  | 'vehicle'
  | 'atm'
  | 'food'
  | 'police'
  | 'hospital'
  | 'lawyer_office'
  | 'tribunal'
  | 'station'
  | 'monument'
  | 'market'
  | 'dealership'
  | 'garage'
  | 'workshop'
  | 'property'
  | 'interior_door'
  | 'job_hub'
  | 'yango_hub'
  | 'ende_hub'
  | 'pescador_hub'
  | 'elisal_hub'
  | 'ende_box'
  | 'elisal_bin'
  | 'fishing_spot'
  | 'fish_market'
  | 'blackmarket'
  | 'clothing'
  | 'pharmacy'
  | 'court'
  | 'airport'
  | 'port'
  | 'faction_base'
  | 'gang_workbench'
  | 'armory'
  | 'leisure'
  | 'dj_booth'
  | 'politics'
  | 'bed'
  | 'kitchen'
  | 'bathroom'
  | 'prison_door'
  | 'prefeitura'
  | 'farm_crop'
  | 'farm_npc'
  | 'farm_unload'
  | 'dining_table'
  | 'moto_rental'
  | 'faction_station'
  | 'faa_vault'
  | 'bus_stop'
  | 'house_panel'
  | 'volleyball'
  | 'airport_checkin'
  | 'business_station';

export interface TrafficLightItem {
  redMat: any;
  yellowMat: any;
  greenMat: any;
  axis?: 'ns' | 'ew';
}

export interface InteractableObject {
  id: string;
  type: InteractableType;
  title: string;
  subtitle: string;
  prompt: string;
  position: [number, number, number]; // [x, y, z]
  radius: number;
  district: DistrictId;
  data?: Record<string, unknown>;
}

export type WeatherType =
  | 'ensolarado'
  | 'nublado'
  | 'cacimbo'
  | 'chuva'
  | 'calor_extremo'
  | 'pordosol'
  | 'noite';

export type WeatherMode = 'auto' | 'manual';

export interface WeatherTelemetry {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  cloudCover: number; // 0 - 100 %
  precipMm: number;
  windKmh: number;
  weatherCode: number;
  conditionLabel: string;
  mappedWeather: WeatherType;
  source: 'open-meteo' | 'fallback';
  fetchedAt: number;
}

export interface HourlyForecastSlot {
  hour: number;
  timeLabel: string;
  tempC: number;
  cloudCover: number;
  precipMm: number;
  weatherCode: number;
  mappedWeather: WeatherType;
  conditionLabel: string;
}

export interface WeatherForecastData {
  locationName: string;
  latitude: number;
  longitude: number;
  mode: WeatherMode;
  activeWeather: WeatherType;
  current: WeatherTelemetry;
  hourly: HourlyForecastSlot[];
}

export type GraphicsQuality = 'low' | 'medium' | 'high';

export function normalizeGraphicsQuality(quality?: string | null): GraphicsQuality {
  if (quality === 'low') return 'low';
  if (quality === 'high' || quality === 'ultra') return 'high';
  return 'medium';
}

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  cameraSensitivity: number;
  invertY: boolean;
  cameraDistance: number;
  renderDistance: number; // 220 - 800
  resolutionScale: number; // 0.65 - 1.5
  targetFps?: 30 | 45 | 60 | 120;
  autoScaleResolution?: boolean;
  soundVolume: number;
  musicVolume: number;
  muted: boolean;
  shadows: boolean;
  timeSpeed: number; // 1 = normal, 0 = freeze
  weather: WeatherType;
}

export interface HudPreferences {
  hudScale: number; // 0.85 - 1.25
  showMinimap: boolean;
  showChatPreview: boolean;
  showQuickHints: boolean;
}

export type ItemCategory =
  | 'food'
  | 'drink'
  | 'medicine'
  | 'weapon'
  | 'tool'
  | 'document'
  | 'key'
  | 'phone'
  | 'material'
  | 'fish'
  | 'mission'
  | 'armor';

export interface InventoryItem {
  id: string;
  catalogId: string;
  name: string;
  description: string;
  category: ItemCategory;
  quantity: number;
  weight: number;
  equipped: boolean;
  usable: boolean;
  sellPriceKz: number;
}

export interface ShopItemCatalog {
  catalogId: string;
  name: string;
  description: string;
  category: ItemCategory;
  priceKz: number;
  weight: number;
  usable: boolean;
  shopTypes: ('food' | 'market' | 'pharmacy' | 'workshop' | 'blackmarket' | 'clothing' | 'armory')[];
  weaponId?: WeaponId;
  effects?: {
    health?: number;
    armor?: number;
    hunger?: number;
    thirst?: number;
    energy?: number;
    stopBleeding?: boolean;
  };
}

export type VehicleCategory =
  | 'candongueiro'
  | 'taxi'
  | 'suv'
  | 'pickup'
  | 'police'
  | 'ambulance'
  | 'bus'
  | 'truck'
  | 'moto'
  | 'boat'
  | 'military'
  | 'sport'
  | 'supercar'
  | 'muscle';

export interface VehiclePhysicsProfile {
  massKg: number;
  maxTorqueNm: number;
  horsePower: number;
  drivetrain: 'fwd' | 'rwd' | 'awd';
  gears: number;
  maxSpeedKmh: number;
  acceleration: number; // 0-100 scale
  brakingForce: number;
  grip: number;
  driftFactor: number;
  suspensionStiffness: number;
  suspensionTravel: number;
  bodyRollFactor: number;
  dragCoeff: number;
}

export type VehicleLiveryPattern =
  | 'tribal_slash'
  | 'racing_stripes'
  | 'kanji_drift'
  | 'two_tone'
  | 'clean_gloss';

export interface VehicleSkinPreset {
  id: string;
  name: string;
  modelLabel: string;
  edition: string;
  baseColor: string;
  accentColor: string;
  rimColor: string;
  pattern: VehicleLiveryPattern;
  badgeText?: string;
  targetCategory: VehicleCategory;
  posterTag: 'cartaz1' | 'cartaz2';
}

export interface OwnedVehicleRecord {
  id: string;
  ownerId: string;
  modelId: string;
  name: string;
  type: VehicleCategory;
  plate: string;
  color: string;
  accentColor?: string;
  skinId?: string;
  engineLevel: number; // 1 - 3
  suspensionLevel: number; // 1 - 3
  wheelStyle: 'padrao' | 'desportiva' | 'offroad';
  fuel: number; // 0 - 100
  health: number; // 0 - 100
  isLocked: boolean;
  isStoredInGarage: boolean;
  isImpounded: boolean;
  finesKz: number;
  position: { x: number; y: number; z: number };
  rotationY: number;
  isRental?: boolean;
  rentedUntil?: number;
  stolenByCharId?: string | null;
  mileageKm?: number;
}

export interface VehiclePassengerSeat {
  characterId: string;
  name: string;
  seatIndex: number; // 0 = driver, 1..3 = passengers
}

export interface SharedWorldVehicle {
  id: string;
  ownerId: string;
  modelId: string;
  name: string;
  type: VehicleCategory;
  plate: string;
  color: string;
  accentColor?: string;
  skinId?: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  speedKmh: number;
  steeringAngle: number;
  driverId: string | null;
  driverName?: string;
  passengers: VehiclePassengerSeat[];
  headlightsOn: boolean;
  sirenOn: boolean;
  engineOn: boolean;
  blinkerMode: 'off' | 'left' | 'right' | 'hazard';
  isLocked: boolean;
  health: number;
  fuel: number;
  mileageKm?: number;
  isTestDrive?: boolean;
  testDriveExpiresAt?: number;
  doorsOpen?: boolean;
  hoodOpen?: boolean;
  trunkOpen?: boolean;
  lastUpdatedAt: number;
}

export interface VehicleModelCatalog {
  modelId: string;
  name: string;
  type: VehicleCategory;
  priceKz: number;
  maxSpeed: number;
  acceleration: number;
  defaultColor: string;
  defaultSkinId?: string;
  description: string;
  factionOnly?: string;
  physics?: VehiclePhysicsProfile;
}

export interface JobCatalog {
  id: 'yango' | 'ende' | 'pescador' | 'elisal';
  title: string;
  shortTitle: string;
  description: string;
  district: DistrictId;
  startPos: [number, number, number];
  interiorId?: string;
  basePayKz: number;
  xpReward: number;
  minLevel: number;
  uniformShirt: string;
  uniformPants: string;
  uniformStyle: OutfitStyle;
  vehicleModelId?: string;
  steps: { label: string; pos: [number, number, number]; radius: number }[];
}

export interface FactionRankPermissions {
  canPromote: boolean;
  canDemote: boolean;
  canKick: boolean;
  canAppointSubleader: boolean;
  canWithdrawTreasury: boolean;
  canEditAnnouncement: boolean;
}

export interface FactionRankDef {
  id?: string;
  name: string;
  salaryKz: number;
  level: number;
  permissions?: FactionRankPermissions;
}

export interface FactionAuditEntry {
  id: string;
  actorName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface FactionData {
  id: string;
  name: string;
  type: 'policia' | 'hospital' | 'advogados' | 'gangue' | 'crime' | 'empresa' | 'civil';
  leaderId: string | null;
  leaderName: string;
  suspended?: boolean;
  treasuryKz: number;
  baseDistrict: DistrictId;
  basePos: [number, number, number];
  interiorId?: string;
  stationRole?: string;
  stationName?: string;
  stationPos?: [number, number, number];
  stationDesc?: string;
  stash?: InventoryItem[];
  ranks: FactionRankDef[];
  members: { characterId: string; name: string; rank: string; level: number; bi?: string; phone?: string; joinedAt?: string }[];
  announcement: string;
  auditLogs?: FactionAuditEntry[];
}

export interface YangoTripCall {
  id: string;
  passengerName: string;
  isPlayer: boolean;
  passengerId?: string;
  pickupLabel: string;
  pickupPos: [number, number, number];
  destLabel: string;
  destPos: [number, number, number];
  distanceM: number;
  fareKz: number;
  status: 'pending' | 'accepted' | 'picked_up' | 'completed' | 'cancelled';
  driverId?: string;
  driverName?: string;
  rating?: number;
  createdAt: number;
  completedAt?: number;
}

export interface EndeFaultCall {
  id: string;
  faultPointId: string;
  district: DistrictId;
  title: string;
  repairType: 'poste' | 'caixa' | 'edificio';
  pos: [number, number, number];
  causesBlackout: boolean;
  rewardKz: number;
  status: 'open' | 'in_progress' | 'fixed';
  assignedCharId?: string;
  assignedName?: string;
  createdAt: number;
  fixedAt?: number;
}

export interface InemaEmergencyCall {
  id: string;
  patientCharId: string;
  patientName: string;
  reason: string;
  pos: { x: number; y: number; z: number };
  status: 'waiting' | 'en_route' | 'treating' | 'resolved';
  medicCharId?: string;
  medicName?: string;
  ambulancePlate?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface LawyerCaseRecord {
  id: string;
  clientCharId: string;
  clientName: string;
  lawyerCharId?: string;
  lawyerName?: string;
  chargeSummary: string;
  fineKz: number;
  bailRequestedKz?: number;
  feeKz: number;
  status: 'open' | 'hired' | 'hearing' | 'acquitted' | 'reduced' | 'closed';
  rulingNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FishSpeciesDef {
  id: string;
  name: string;
  rarity: 'comum' | 'medio' | 'raro' | 'lendario';
  weightKg: number;
  basePriceKz: number;
  color: string;
}

export interface GangDesmancheSession {
  id: string;
  characterId: string;
  vehicleId: string;
  vehicleName: string;
  plate: string;
  originalOwnerId: string;
  stage: number; // 0 = iniciado, 1 = motor/rodas, 2 = chassis, 3 = concluído
  partsYielded: number;
  startedAt: number;
  stageReadyAt?: number;
}

export interface GangCraftSession {
  id: string;
  characterId: string;
  recipeId: string;
  outputCatalogId: string;
  outputName: string;
  readyAt: number;
  claimed: boolean;
}

export interface GangGrowBatch {
  id: string;
  characterId: string;
  plantedAt: number;
  readyAt: number;
  stage: 'growing' | 'ready' | 'harvested';
  yieldQty: number;
}

export interface FarmPlantState {
  id: string;
  cropName: string;
  pos: [number, number, number];
  availableAt: number;
  lastHarvestedBy?: string;
}

export interface VolleyballState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lastHitBy?: string;
  scoreLeft: number;
  scoreRight: number;
  updatedAt: number;
}

export interface WorldDynamicState {
  blackoutDistricts: Record<string, { faultId: string; title: string; since: number }>;
  cleanlinessByDistrict: Record<string, number>;
  yangoCalls: YangoTripCall[];
  endeCalls: EndeFaultCall[];
  inemaCalls: InemaEmergencyCall[];
  lawyerCases: LawyerCaseRecord[];
  farmPlants?: Record<string, FarmPlantState>;
  volleyball?: VolleyballState;
  lastPaydayAt?: number;
  activeTerritoryDispute?: {
    id: string;
    district: DistrictId;
    attackerFactionId: string;
    defenderFactionId?: string;
    startedAt: number;
    endsAt: number;
  } | null;
}

export type HouseCategory = 'T1' | 'T2' | 'T3' | 'T4' | 'business';

export interface HouseUtilityBills {
  endeKz: number; // Energia ENDE
  epalKz: number; // Água EPAL
  sonagolKz: number; // Gás SONAGOL
}

export interface PropertyRecord {
  id: string;
  name: string;
  type: 'house' | 'apartment' | 'business';
  category?: HouseCategory;
  businessCategory?: 'restaurant' | 'boutique';
  inCondominio?: boolean;
  interiorType?: 't1' | 't2' | 't3' | 't4' | 'business';
  district: DistrictId;
  priceKz: number;
  rentKz: number;
  position: [number, number, number];
  ownerId: string | null;
  ownerName: string | null;
  renterId: string | null;
  renterName: string | null;
  sharedKeys?: string[]; // characterIds com chave de acesso
  safeKz: number;
  unpaidBillsKz: number;
  bills?: HouseUtilityBills;
  furniture: string[];
  stash?: InventoryItem[];
  employees: { characterId: string; name: string; salaryKz: number }[];
  revenueKz: number;
  dirtyPlates?: number;
  cookedDishesReady?: number;
  craftedClothesStock?: number;
}

export interface AirportFlightDef {
  id: string;
  label: string;
  district: DistrictId;
  destPos: [number, number, number];
  priceKz: number;
  durationSec: number;
}

export interface DjTrackCatalogItem {
  id: string;
  title: string;
  artist: string;
  genre: 'Kuduro' | 'Semba' | 'Afrohouse' | 'Kizomba' | 'Amapiano' | 'Hip-Hop Luanda';
  bpm: number;
  durationSec: number;
  coverAccent: string;
  bassPattern: number[];
  leadPattern: number[];
}

export interface ActiveDjTrack {
  trackId: string;
  title: string;
  artist: string;
  genre?: string;
  bpm: number;
  durationSec: number;
  startedAt: number;
  endsAt: number;
  paidByCharId: string;
  paidByName: string;
  costKz: number;
}

export interface DjPlaybackHistoryEntry {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  paidByName: string;
  costKz: number;
  playedAt: string;
}

export interface GlobalDjState {
  currentTrack: ActiveDjTrack | null;
  startedAt: number;
  endsAt: number;
  paidByCharId: string | null;
  paidByName: string | null;
  costKz: number;
  history: DjPlaybackHistoryEntry[];
}

export interface PrefeituraAnnouncement {
  id: string;
  title: string;
  content: string;
  category: 'edital' | 'emprego' | 'aviso' | 'evento';
  authorName: string;
  authorRole: string;
  isOfficial: boolean;
  createdAt: string;
}

export interface PoliticalParty {
  id: string;
  name: string;
  acronym: string;
  color: string;
  ideology: string;
  approved: boolean;
  suspended: boolean;
  createdAt: string;
}

export interface PoliticalCandidate {
  id: string;
  characterId: string;
  name: string;
  partyId: string;
  partyAcronym: string;
  partyColor: string;
  bio: string;
  proposals: string[];
  votes: number;
}

export interface ElectionRecord {
  id: string;
  title: string;
  status: 'open' | 'closed' | 'annulled';
  openedAt: number;
  closedAt?: number;
  candidates: PoliticalCandidate[];
  voters: Record<string, string>; // characterId -> candidateId (1 voto imutável)
  winnerCharId?: string | null;
  winnerName?: string | null;
}

export interface PresidentDecisionRecord {
  id: string;
  presidentCharId: string;
  presidentName: string;
  title: string;
  decree: string;
  timestamp: string;
}

export interface PresidentRecord {
  characterId: string;
  name: string;
  partyId: string;
  partyName: string;
  partyAcronym: string;
  electedAt: number;
  electionId: string;
  votesReceived: number;
}

export interface PoliticsState {
  parties: PoliticalParty[];
  activeElection: ElectionRecord | null;
  president: PresidentRecord | null;
  electionHistory: ElectionRecord[];
  decisions: PresidentDecisionRecord[];
}

export interface JobWorkLogEntry {
  id: string;
  characterId: string;
  jobId: string;
  jobTitle: string;
  payoutKz: number;
  xpEarned: number;
  details?: string;
  completedAt: string;
}

export interface TransactionRecord {
  id: string;
  characterId: string;
  type: 'deposit' | 'withdraw' | 'transfer' | 'purchase' | 'sale' | 'salary' | 'tax' | 'fine' | 'loan' | 'crime' | 'property' | 'hotel' | 'dj' | 'music' | 'legal' | 'medical';
  amountKz: number;
  description: string;
  timestamp: string;
}

export interface SmsMessage {
  id: string;
  fromPhone: string;
  fromName: string;
  toPhone: string;
  text: string;
  timestamp: string;
}

export interface ClassifiedAd {
  id: string;
  authorName: string;
  authorPhone: string;
  title: string;
  description: string;
  priceKz: number;
  timestamp: string;
}

export interface MissionProgress {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly';
  target: number;
  progress: number;
  rewardKz: number;
  rewardXp: number;
  claimed: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole?: AdminRole;
  text: string;
  channel: 'geral' | 'proximidade' | 'radio' | 'faccao' | 'policia' | 'medico' | 'admin' | 'pm' | 'rp';
  timestamp: string;
  position?: { x: number; z: number };
}

export interface CharacterSummary {
  id: string;
  name: string;
  surname: string;
  age: number;
  nationality: string;
  gender: GenderType;
  idNumber: string;
  phone: string;
  cashKz: number;
  bankKz: number;
  level: number;
  jobId: string | null;
  factionId: string | null;
  customization: PlayerCustomization;
}

export interface AccountInfo {
  id: string;
  email: string;
  role: AdminRole;
  bannedUntil: number;
  banReason: string;
  suspendedUntil: number;
}

export interface GpsWaypoint {
  label: string;
  x: number;
  z: number;
  color?: string;
}

export interface ServerTelemetrySnapshot {
  connectedPlayers: number;
  maxPlayers: number;
  activeVehicles: number;
  memoryRssMb: number;
  uptimeSec: number;
  tickMs: number;
  activeBlackouts: number;
}
