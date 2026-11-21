/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AccountInfo,
  AdminRole,
  CharacterSummary,
  ClassifiedAd,
  DistrictId,
  DjTrackCatalogItem,
  EndeFaultCall,
  FactionData,
  FactionRankDef,
  FishSpeciesDef,
  AirportFlightDef,
  FarmPlantState,
  GangCraftSession,
  GangDesmancheSession,
  GangGrowBatch,
  GenderType,
  GlobalDjState,
  InemaEmergencyCall,
  InventoryItem,
  JobCatalog,
  JobWorkLogEntry,
  LawyerCaseRecord,
  MissionProgress,
  OwnedVehicleRecord,
  PlayerCustomization,
  PlayerStats,
  PoliticsState,
  PrefeituraAnnouncement,
  PropertyRecord,
  ServerTelemetrySnapshot,
  SharedWorldVehicle,
  SmsMessage,
  TransactionRecord,
  WeatherForecastData,
  WeatherMode,
  WeatherType,
  WorldDynamicState,
  YangoTripCall,
} from '../game/types';

export interface CharacterRecord {
  id: string;
  accountId: string;
  stats: PlayerStats;
  customization: PlayerCustomization;
  inventory: InventoryItem[];
  jobStepIndex: number;
  activeJobStartedAt: number;
  completedJobsCount: number;
  counters: {
    jobsCompleted: number;
    purchasesCount: number;
    robberiesCount: number;
    healsCount: number;
  };
  missions: MissionProgress[];
  achievements: string[];
  position: { x: number; y: number; z: number };
  rotationY: number;
  updatedAt: string;
}

export interface DroppedItemRecord {
  id: string;
  catalogId: string;
  name: string;
  description: string;
  category: InventoryItem['category'];
  quantity: number;
  weight: number;
  usable: boolean;
  sellPriceKz: number;
  x: number;
  z: number;
  droppedBy: string;
}

export interface WorldConfigState {
  weather: WeatherType;
  weatherMode?: WeatherMode;
  timeSpeed: number;
  timeOfDay: number;
  taxRate: number;
  economyMultiplier: number;
}

export interface WarrantRecord {
  id: string;
  targetCharId: string;
  targetName: string;
  reason: string;
  issuedBy: string;
  createdAt: string;
  active: boolean;
}

export interface CriminalRecord {
  id: string;
  characterId: string;
  characterName: string;
  type: 'fine' | 'arrest' | 'warrant';
  reason: string;
  amountKz: number;
  officerName: string;
  timestamp: string;
}

export interface MedicalRecord {
  id: string;
  characterId: string;
  characterName: string;
  treatment: string;
  doctorName: string;
  costKz: number;
  timestamp: string;
}

export interface ReportRecord {
  id: string;
  reporterCharId: string;
  reporterName: string;
  targetName: string;
  reason: string;
  status: 'open' | 'resolved';
  timestamp: string;
}

export interface AdminLogRecord {
  id: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: string;
  details: string;
  timestamp: string;
}

const TOKEN_KEY = 'luandarp_token';
const CHAR_KEY = 'luandarp_char_id';
export const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredCharId(): string {
  return localStorage.getItem(CHAR_KEY) || '';
}

export function setStoredCharId(charId: string) {
  if (charId) localStorage.setItem(CHAR_KEY, charId);
  else localStorage.removeItem(CHAR_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token && !token.startsWith('static.')) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const targetUrl = API_BASE && path.startsWith('/') ? `${API_BASE}${path}` : path;
  let res: Response;
  try {
    res = await fetch(targetUrl, { ...options, headers });
  } catch {
    throw new Error('Sem ligação ao servidor multiplayer Luanda RP. Verifica a internet e tenta novamente.');
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if ((res.status === 404 || !contentType.includes('application/json')) && path.startsWith('/api/')) {
    throw new Error('Serviço de servidor Luanda RP indisponível neste momento (API não respondeu em JSON).');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  getStatus: () =>
    request<{
      status: string;
      activeCitizens: number;
      totalCharacters: number;
      worldConfig: WorldConfigState;
      worldState?: WorldDynamicState;
      serverTelemetry?: ServerTelemetrySnapshot;
    }>('/api/status'),

  // Auth
  register: (email: string, password: string) =>
    request<{ token: string; recoveryCode: string; account: AccountInfo }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; account: AccountInfo }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  firebaseLogin: (idToken: string) =>
    request<{ token: string; account: AccountInfo }>('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  recoverPassword: (email: string, recoveryCode: string, newPassword: string) =>
    request<{ ok: boolean; newRecoveryCode: string }>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ email, recoveryCode, newPassword }),
    }),

  getMe: () => request<{ account: AccountInfo }>('/api/auth/me'),

  logout: () => {
    setStoredToken('');
    setStoredCharId('');
  },

  // Characters
  listCharacters: () => request<{ characters: CharacterSummary[] }>('/api/characters'),

  createCharacter: (payload: {
    name: string;
    surname: string;
    age: number;
    nationality: string;
    gender: GenderType;
    history: string;
    customization: PlayerCustomization;
  }) =>
    request<{ character: CharacterRecord }>('/api/characters', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCharacter: (id: string) =>
    request<{
      character: CharacterRecord;
      vehicles: OwnedVehicleRecord[];
      transactions: TransactionRecord[];
      jobWorkLogs?: JobWorkLogEntry[];
      worldConfig: WorldConfigState;
    }>(`/api/characters/${encodeURIComponent(id)}`),

  updateAppearance: (
    id: string,
    payload: {
      name?: string;
      surname?: string;
      age?: number;
      nationality?: string;
      history?: string;
      gender?: GenderType;
      customization?: PlayerCustomization;
    }
  ) =>
    request<{ character: CharacterRecord }>(`/api/characters/${encodeURIComponent(id)}/appearance`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  autosaveCharacter: (
    id: string,
    payload: {
      position?: { x: number; y: number; z: number };
      rotationY?: number;
      hunger?: number;
      thirst?: number;
      energy?: number;
      sleep?: number;
      health?: number;
      interiorId?: string | null;
    }
  ) =>
    request<{ ok: boolean; stats: PlayerStats }>(`/api/characters/${encodeURIComponent(id)}/autosave`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Bank
  bankAction: (
    characterId: string,
    action: 'deposit' | 'withdraw' | 'transfer' | 'pay_cash' | 'loan' | 'repay_loan',
    amount: number,
    targetPhoneOrBi?: string
  ) =>
    request<{ character: CharacterRecord; transactions: TransactionRecord[] }>('/api/bank/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, amount, targetPhoneOrBi }),
    }),

  // Shop & Inventory
  buyShopItem: (
    characterId: string,
    catalogId: string,
    quantity = 1,
    payWith: 'cash' | 'bank' = 'cash'
  ) =>
    request<{ character: CharacterRecord }>('/api/shop/buy', {
      method: 'POST',
      body: JSON.stringify({ characterId, catalogId, quantity, payWith }),
    }),

  inventoryAction: (
    characterId: string,
    itemId: string,
    action: 'use' | 'equip' | 'sell' | 'drop' | 'give',
    opts?: { targetQuery?: string; x?: number; z?: number }
  ) =>
    request<{ character: CharacterRecord; droppedItems: DroppedItemRecord[] }>('/api/inventory/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, itemId, action, ...opts }),
    }),

  getDroppedItems: () => request<{ droppedItems: DroppedItemRecord[] }>('/api/world/drops'),

  pickupDroppedItem: (characterId: string, dropId: string) =>
    request<{ character: CharacterRecord; droppedItems: DroppedItemRecord[] }>('/api/world/pickup', {
      method: 'POST',
      body: JSON.stringify({ characterId, dropId }),
    }),

  // Vehicles
  getSharedVehicles: () => request<{ vehicles: SharedWorldVehicle[] }>('/api/vehicles/shared'),

  buyVehicle: (characterId: string, modelId: string, color?: string, skinId?: string, accentColor?: string) =>
    request<{
      character: CharacterRecord;
      vehicle: OwnedVehicleRecord;
      vehicles: OwnedVehicleRecord[];
    }>('/api/vehicles/buy', {
      method: 'POST',
      body: JSON.stringify({ characterId, modelId, color, skinId, accentColor }),
    }),

  rentMoto: (characterId: string, payWith: 'cash' | 'bank' = 'cash') =>
    request<{
      character: CharacterRecord;
      vehicle: OwnedVehicleRecord;
      vehicles: OwnedVehicleRecord[];
    }>('/api/vehicles/rent-moto', {
      method: 'POST',
      body: JSON.stringify({ characterId, payWith }),
    }),

  vehicleTestDrive: (characterId: string, modelId: string, color?: string) =>
    request<{ vehicle: SharedWorldVehicle; expiresAt: number }>('/api/vehicles/test-drive', {
      method: 'POST',
      body: JSON.stringify({ characterId, modelId, color }),
    }),

  vehicleAction: (
    vehId: string,
    characterId: string,
    action:
      | 'store'
      | 'spawn'
      | 'lock'
      | 'refuel'
      | 'repair'
      | 'paint'
      | 'upgrade_engine'
      | 'pay_fine'
      | 'sell',
    opts?: {
      color?: string;
      accentColor?: string;
      skinId?: string;
      wheelStyle?: OwnedVehicleRecord['wheelStyle'];
      position?: { x: number; y: number; z: number };
      rotationY?: number;
      fuel?: number;
      health?: number;
      mileageKm?: number;
    }
  ) =>
    request<{
      character: CharacterRecord;
      vehicle?: OwnedVehicleRecord;
      vehicles: OwnedVehicleRecord[];
      soldId?: string;
    }>(`/api/vehicles/${encodeURIComponent(vehId)}/action`, {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  // Jobs (FASE 4: Yango, ENDE, Pescador, ELISAL + Fazenda)
  startJob: (characterId: string, jobId: string) =>
    request<{ character: CharacterRecord; job: JobCatalog; workVehicle?: SharedWorldVehicle }>('/api/jobs/start', {
      method: 'POST',
      body: JSON.stringify({ characterId, jobId }),
    }),

  completeJobStep: (
    characterId: string,
    position?: { x: number; z: number },
    opts?: { drivingModelId?: string | null; enforceVehicle?: boolean }
  ) =>
    request<{
      character: CharacterRecord;
      completedTurn: boolean;
      payout: number;
      nextStepIndex: number;
      jobWorkLogs?: JobWorkLogEntry[];
    }>('/api/jobs/step-complete', {
      method: 'POST',
      body: JSON.stringify({ characterId, position, ...opts }),
    }),

  yangoGetCalls: () =>
    request<{
      calls: YangoTripCall[];
      pickupNodes: { label: string; district: DistrictId; pos: [number, number, number] }[];
      logs: JobWorkLogEntry[];
    }>('/api/jobs/yango/calls'),

  yangoAction: (
    characterId: string,
    action: 'request_ride' | 'generate_call' | 'accept' | 'pickup' | 'complete' | 'cancel',
    opts?: {
      callId?: string;
      destLabel?: string;
      destPos?: [number, number, number];
      pickupLabel?: string;
      pickupPos?: [number, number, number];
      rating?: number;
      drivingModelId?: string | null;
      enforceVehicle?: boolean;
    }
  ) =>
    request<{
      call?: YangoTripCall;
      calls: YangoTripCall[];
      character: CharacterRecord;
      logs?: JobWorkLogEntry[];
    }>('/api/jobs/yango/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  endeGetFaults: () =>
    request<{
      faults: EndeFaultCall[];
      blackoutDistricts: WorldDynamicState['blackoutDistricts'];
      faultPoints: { id: string; title: string; district: DistrictId; repairType: 'poste' | 'caixa' | 'edificio'; pos: [number, number, number]; rewardKz: number }[];
      logs: JobWorkLogEntry[];
    }>('/api/jobs/ende/faults'),

  endeAction: (
    characterId: string,
    action: 'generate_fault' | 'accept_fault' | 'complete_repair',
    opts?: { faultId?: string; pointId?: string; causesBlackout?: boolean; drivingModelId?: string | null; enforceVehicle?: boolean }
  ) =>
    request<{
      fault: EndeFaultCall;
      faults: EndeFaultCall[];
      blackoutDistricts: WorldDynamicState['blackoutDistricts'];
      character: CharacterRecord;
      logs?: JobWorkLogEntry[];
    }>('/api/jobs/ende/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  pescadorGetState: () =>
    request<{
      zones: { id: string; name: string; pos: [number, number, number]; radius: number; allowed: boolean; reason?: string }[];
      species: FishSpeciesDef[];
      marketMultiplier: number;
      logs: JobWorkLogEntry[];
    }>('/api/jobs/pescador/state'),

  pescadorAction: (
    characterId: string,
    action: 'cast_catch' | 'sell_fish',
    opts?: { position?: { x: number; y: number; z: number }; bonusRoll?: boolean }
  ) =>
    request<{
      character: CharacterRecord;
      caught?: FishSpeciesDef;
      zone?: string;
      payout?: number;
      soldCount?: number;
      logs?: JobWorkLogEntry[];
    }>('/api/jobs/pescador/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  elisalGetState: () =>
    request<{
      dumpsters: { id: string; label: string; district: DistrictId; pos: [number, number, number] }[];
      cleanlinessByDistrict: Record<string, number>;
      logs: JobWorkLogEntry[];
    }>('/api/jobs/elisal/state'),

  elisalAction: (
    characterId: string,
    action: 'collect_bin' | 'finish_route',
    opts?: { binId?: string; drivingModelId?: string | null; enforceVehicle?: boolean }
  ) =>
    request<{
      character: CharacterRecord;
      payout: number;
      cleanlinessByDistrict: Record<string, number>;
      logs?: JobWorkLogEntry[];
    }>('/api/jobs/elisal/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  farmGetState: () =>
    request<{
      plants: (FarmPlantState & { cropName: string; pos: [number, number, number] })[];
      vanRentKz: number;
      maxCrates: number;
      crateMinKz: number;
      crateMaxKz: number;
      serverNow: number;
    }>('/api/farm/state'),

  farmAction: (
    characterId: string,
    action: 'start_job' | 'rent_van' | 'harvest_plant' | 'deliver_crates',
    opts?: { plantId?: string; payWith?: 'cash' | 'bank'; drivingModelId?: string | null; enforceVehicle?: boolean }
  ) =>
    request<{
      character: CharacterRecord;
      plants: (FarmPlantState & { cropName: string; pos: [number, number, number] })[];
      van?: SharedWorldVehicle;
      payout?: number;
      cratePriceKz?: number;
      cratesDelivered?: number;
      plant?: FarmPlantState;
      message?: string;
    }>('/api/farm/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  airportCheckin: (characterId: string, flightId: string, payWith: 'cash' | 'bank' = 'bank') =>
    request<{ character: CharacterRecord; flight: AirportFlightDef }>('/api/airport/checkin', {
      method: 'POST',
      body: JSON.stringify({ characterId, flightId, payWith }),
    }),

  // Factions & Hierarchy Management
  getFactions: () => request<{ factions: FactionData[]; onlineCharacterIds?: string[] }>('/api/factions'),

  factionAction: (
    characterId: string,
    factionId: string,
    action: 'join' | 'leave' | 'promote' | 'kick' | 'deposit_treasury',
    opts?: { targetCharId?: string; amountKz?: number }
  ) =>
    request<{ character: CharacterRecord; factions: FactionData[] }>('/api/factions/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, factionId, action, ...opts }),
    }),

  factionManage: (
    characterId: string,
    factionId: string,
    action: 'promote' | 'demote' | 'set_rank' | 'appoint_subleader' | 'kick' | 'edit_announcement' | 'withdraw_treasury',
    opts?: { targetCharId?: string; rankLevel?: number; announcement?: string; amountKz?: number }
  ) =>
    request<{ character: CharacterRecord; faction: FactionData; factions: FactionData[] }>('/api/factions/manage', {
      method: 'POST',
      body: JSON.stringify({ characterId, factionId, action, ...opts }),
    }),

  factionStationAction: (characterId: string, stationId?: string) =>
    request<{
      character: CharacterRecord;
      factions: FactionData[];
      payout: number;
      treasuryCut: number;
      bonusItemName?: string;
      cooldownUntil: number;
      message: string;
    }>('/api/factions/station', {
      method: 'POST',
      body: JSON.stringify({ characterId, stationId }),
    }),

  // FASE 5: Sistemas dedicados das 3 Gangues (CV, FTX, BMR, Baú Partilhado, Território)
  gangGetState: (characterId: string) =>
    request<{
      faction?: FactionData;
      recipes: { id: string; outputCatalogId: string; outputName: string; craftTimeSec: number; requiredMaterials: { catalogId: string; name: string; qty: number }[]; baseSellKz: number }[];
      desmancheSessions: GangDesmancheSession[];
      craftSessions: GangCraftSession[];
      growBatches: GangGrowBatch[];
      activeTerritoryDispute: WorldDynamicState['activeTerritoryDispute'];
      sharedVehicles: SharedWorldVehicle[];
    }>(`/api/gangs/state/${encodeURIComponent(characterId)}`),

  gangCvDesmanche: (characterId: string, action: 'start' | 'advance' | 'complete', opts?: { sessionId?: string; vehicleId?: string }) =>
    request<{ session: GangDesmancheSession; payout?: number; character: CharacterRecord }>('/api/gangs/cv/desmanche', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  gangFtxCraft: (characterId: string, action: 'start' | 'claim', opts?: { recipeId?: string; craftId?: string }) =>
    request<{ craft: GangCraftSession; character: CharacterRecord }>('/api/gangs/ftx/craft', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  gangBmrGrow: (characterId: string, action: 'plant' | 'harvest' | 'sell_network' | 'launder_capped', opts?: { batchId?: string; amountKz?: number }) =>
    request<{ batch?: GangGrowBatch; gain?: number; soldQty?: number; laundered?: number; tax?: number; character: CharacterRecord }>('/api/gangs/bmr/grow', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  gangStash: (characterId: string, action: 'store' | 'take', itemId: string) =>
    request<{ character: CharacterRecord; faction: FactionData; factions: FactionData[] }>('/api/gangs/stash', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, itemId }),
    }),

  gangTerritory: (characterId: string, action: 'start_dispute' | 'capture', district?: DistrictId) =>
    request<{ dispute: WorldDynamicState['activeTerritoryDispute']; character?: CharacterRecord; faction?: FactionData }>('/api/gangs/territory', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, district }),
    }),

  adminOrganizationsGet: () =>
    request<{
      factions: FactionData[];
      eligibleCharacters: {
        id: string;
        name: string;
        bi: string;
        phone: string;
        level: number;
        factionId: string | null;
        factionRank: string;
        online: boolean;
      }[];
    }>('/api/admin/organizations'),

  adminOrganizationAction: (payload: {
    action: 'appoint_leader' | 'replace_leader' | 'remove_leader' | 'suspend_org' | 'reactivate_org' | 'update_ranks';
    factionId: string;
    targetCharId?: string;
    ranks?: FactionRankDef[];
  }) =>
    request<{ ok: boolean; faction: FactionData; factions: FactionData[] }>('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Justice (PNA), Advogados (OAA) & Hospital (INEMA)
  getJusticeCad: (q = '') =>
    request<{
      citizens: {
        id: string;
        name: string;
        idNumber: string;
        phone: string;
        factionId?: string | null;
        wantedStars: number;
        jailUntil: number;
        health: number;
        isUnconscious: boolean;
        handcuffed?: boolean;
        escortedByCharId?: string | null;
      }[];
      vehicles: OwnedVehicleRecord[];
      warrants: WarrantRecord[];
      criminalRecords: CriminalRecord[];
      medicalHistory: MedicalRecord[];
      inemaCalls?: InemaEmergencyCall[];
      lawyerCases?: LawyerCaseRecord[];
      policeStash?: InventoryItem[];
    }>(`/api/justice/cad?q=${encodeURIComponent(q)}`),

  justiceAction: (
    characterId: string,
    action:
      | 'pay_bail'
      | 'pay_fines'
      | 'buy_weapon_license'
      | 'renew_weapon_license'
      | 'fine'
      | 'arrest'
      | 'warrant'
      | 'impound'
      | 'handcuff'
      | 'unhandcuff'
      | 'escort'
      | 'unescort'
      | 'check_id'
      | 'seize_items',
    opts?: {
      targetCharId?: string;
      vehiclePlate?: string;
      amountKz?: number;
      reason?: string;
      minutes?: number;
      payWith?: 'cash' | 'bank';
    }
  ) =>
    request<{
      character: CharacterRecord;
      warrants?: WarrantRecord[];
      criminalRecords?: CriminalRecord[];
      paidTotalKz?: number;
      inspectedProfile?: {
        id: string;
        name: string;
        idNumber: string;
        phone: string;
        nationality: string;
        wantedStars: number;
        factionId: string | null;
        inventory: { name: string; category: string; quantity: number }[];
      };
      seizedCount?: number;
    }>('/api/justice/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  hospitalGetCalls: () =>
    request<{ calls: InemaEmergencyCall[]; medicalHistory: MedicalRecord[] }>('/api/hospital/calls'),

  hospitalAction: (
    characterId: string,
    action:
      | 'self_treat'
      | 'respawn_inema'
      | 'revive_player'
      | 'inema_field_revive'
      | 'request_112'
      | 'accept_call'
      | 'transport_hospital'
      | 'discharge',
    targetCharId?: string,
    opts?: { callId?: string; reason?: string }
  ) =>
    request<{ character: CharacterRecord; call?: InemaEmergencyCall; calls?: InemaEmergencyCall[]; medicalHistory: MedicalRecord[] }>('/api/hospital/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, targetCharId, ...opts }),
    }),

  lawyersGetCases: () =>
    request<{
      cases: LawyerCaseRecord[];
      lawyers: FactionData['members'];
      criminalRecords: CriminalRecord[];
    }>('/api/lawyers/cases'),

  lawyersAction: (
    characterId: string,
    action: 'open_case' | 'hire_lawyer' | 'hire_accept' | 'request_bail' | 'court_hearing' | 'conclude_case',
    opts?: {
      caseId?: string;
      clientCharId?: string;
      chargeSummary?: string;
      feeKz?: number;
      bailKz?: number;
      ruling?: 'acquitted' | 'reduced';
      note?: string;
    }
  ) =>
    request<{ record: LawyerCaseRecord; cases: LawyerCaseRecord[]; character: CharacterRecord }>('/api/lawyers/action', {
      method: 'POST',
      body: JSON.stringify({ characterId, action, ...opts }),
    }),

  // Crime
  crimeAction: (
    characterId: string,
    action: 'rob_store' | 'rob_bank' | 'smuggle' | 'launder' | 'rob_npc' | 'police_capture',
    opts?: { targetId?: string; amountKz?: number; mode?: 'rob' | 'threat' | 'assault'; npcLabel?: string; reason?: string }
  ) =>
    request<{ character: CharacterRecord; reward?: number; laundered?: number; jailSeconds?: number; fine?: number }>(
      '/api/crime/action',
      {
        method: 'POST',
        body: JSON.stringify({ characterId, action, ...opts }),
      }
    ),

  faaVaultHeist: (characterId: string) =>
    request<{ character: CharacterRecord; reward: number; cooldownUntil: number }>('/api/crime/faa-heist', {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    }),

  // Properties
  getProperties: () => request<{ properties: PropertyRecord[] }>('/api/properties'),

  propertyAction: (
    propId: string,
    characterId: string,
    action:
      | 'buy'
      | 'rent'
      | 'sell'
      | 'set_home'
      | 'add_key'
      | 'remove_key'
      | 'safe_deposit'
      | 'safe_withdraw'
      | 'collect_revenue'
      | 'pay_bills'
      | 'pay_ende'
      | 'pay_epal'
      | 'pay_sonagol'
      | 'hire'
      | 'hire_self'
      | 'fire'
      | 'start_business_job'
      | 'rest_cook'
      | 'rest_collect_plate'
      | 'rest_wash_plate'
      | 'boutique_craft'
      | 'boutique_sell'
      | 'rest'
      | 'cook_eat'
      | 'hygiene'
      | 'stash_store'
      | 'stash_take',
    opts?: { amountKz?: number; targetCharId?: string; itemId?: string }
  ) =>
    request<{
      character: CharacterRecord;
      properties: PropertyRecord[];
      dishName?: string;
      workerPayKz?: number;
      ownerProfitKz?: number;
      message?: string;
    }>(
      `/api/properties/${encodeURIComponent(propId)}/action`,
      {
        method: 'POST',
        body: JSON.stringify({ characterId, action, ...opts }),
      }
    ),

  // Música Paga Pesquisável & DJ Global (1.500 Kz pessoal / 200.000 Kz global)
  searchMusic: (q = '', genre = '') => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (genre && genre !== 'Todos') qs.set('genre', genre);
    return request<{
      tracks: DjTrackCatalogItem[];
      personalCostKz: number;
      globalCostKz: number;
    }>(`/api/music/search${qs.toString() ? `?${qs.toString()}` : ''}`);
  },

  playMusic: (
    characterId: string,
    trackId: string,
    mode: 'personal' | 'global',
    payWith: 'cash' | 'bank' = 'bank'
  ) =>
    request<{
      character: CharacterRecord;
      track: DjTrackCatalogItem;
      costKz: number;
      mode: 'personal' | 'global';
      djState?: GlobalDjState;
      serverNow: number;
    }>('/api/music/play', {
      method: 'POST',
      body: JSON.stringify({ characterId, trackId, mode, payWith }),
    }),

  djGet: () =>
    request<{
      djState: GlobalDjState;
      catalog: DjTrackCatalogItem[];
      personalCostKz?: number;
      costKz: number;
      serverNow: number;
    }>('/api/dj'),

  djPlay: (
    characterId: string,
    payload:
      | string
      | {
          trackId?: string;
          payWith?: 'cash' | 'bank';
        },
    payWithArg: 'cash' | 'bank' = 'bank'
  ) => {
    const body =
      typeof payload === 'string'
        ? { characterId, trackId: payload, payWith: payWithArg }
        : { characterId, payWith: payWithArg, ...payload };
    return request<{ character: CharacterRecord; djState: GlobalDjState; serverNow: number }>('/api/dj/play', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Prefeitura de Luanda (Anúncios & Editais)
  getPrefeituraAnnouncements: () =>
    request<{ announcements: PrefeituraAnnouncement[] }>('/api/prefeitura/announcements'),

  postPrefeituraAnnouncement: (
    characterId: string,
    payload: { title: string; content: string; category: PrefeituraAnnouncement['category'] }
  ) =>
    request<{ announcements: PrefeituraAnnouncement[] }>('/api/prefeitura/announcements', {
      method: 'POST',
      body: JSON.stringify({ characterId, ...payload }),
    }),

  // Previsão Meteorológica Dinâmica (API Luanda + Hora do Dia)
  getWeatherForecast: (opts?: { refresh?: boolean; timeOfDay?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.refresh) qs.set('refresh', '1');
    if (typeof opts?.timeOfDay === 'number') qs.set('timeOfDay', String(opts.timeOfDay));
    const q = qs.toString();
    return request<{ forecast: WeatherForecastData; worldConfig: WorldConfigState }>(
      `/api/weather/forecast${q ? `?${q}` : ''}`
    );
  },

  setWeatherMode: (mode: WeatherMode, opts?: { weather?: WeatherType; timeOfDay?: number }) =>
    request<{ ok: boolean; forecast: WeatherForecastData; worldConfig: WorldConfigState }>('/api/weather/mode', {
      method: 'POST',
      body: JSON.stringify({ mode, ...opts }),
    }),

  // Política, Partidos, Eleições & Presidente Único
  politicsGet: () =>
    request<{ politics: PoliticsState; serverNow: number }>('/api/politics'),

  politicsAdmin: (payload: {
    action:
      | 'create_party'
      | 'toggle_party_status'
      | 'open_election'
      | 'add_candidate'
      | 'close_election'
      | 'annul_election'
      | 'remove_president';
    partyId?: string;
    name?: string;
    acronym?: string;
    color?: string;
    ideology?: string;
    title?: string;
    targetCharId?: string;
    bio?: string;
    proposals?: string[];
  }) =>
    request<{ politics: PoliticsState }>('/api/politics/admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  politicsVote: (characterId: string, candidateId: string) =>
    request<{ politics: PoliticsState; votedCandidateId: string }>('/api/politics/vote', {
      method: 'POST',
      body: JSON.stringify({ characterId, candidateId }),
    }),

  politicsDecision: (characterId: string, title: string, decree: string) =>
    request<{ politics: PoliticsState }>('/api/politics/decision', {
      method: 'POST',
      body: JSON.stringify({ characterId, title, decree }),
    }),

  // Combat PvP
  combatHit: (characterId: string, targetCharId: string, damage: number, weaponId: string) =>
    request<{ ok: boolean; attackerStats: PlayerStats; targetHealth: number }>('/api/combat/hit', {
      method: 'POST',
      body: JSON.stringify({ characterId, targetCharId, damage, weaponId }),
    }),

  // Phone
  getPhoneData: (charId: string) =>
    request<{
      sms: SmsMessage[];
      ads: ClassifiedAd[];
      contacts: { name: string; phone: string }[];
    }>(`/api/phone/${encodeURIComponent(charId)}`),

  sendSms: (characterId: string, toPhone: string, text: string) =>
    request<{ ok: boolean }>('/api/phone/sms', {
      method: 'POST',
      body: JSON.stringify({ characterId, toPhone, text }),
    }),

  postAd: (characterId: string, title: string, description: string, priceKz: number) =>
    request<{ ads: ClassifiedAd[] }>('/api/phone/ads', {
      method: 'POST',
      body: JSON.stringify({ characterId, title, description, priceKz }),
    }),

  callEmergency: (
    characterId: string,
    service: 'policia' | 'medico',
    message: string,
    x: number,
    z: number
  ) =>
    request<{ ok: boolean }>('/api/phone/emergency', {
      method: 'POST',
      body: JSON.stringify({ characterId, service, message, x, z }),
    }),

  // Missions, Leaderboard & Reports
  claimMission: (characterId: string, missionId: string) =>
    request<{ character: CharacterRecord }>('/api/missions/claim', {
      method: 'POST',
      body: JSON.stringify({ characterId, missionId }),
    }),

  getLeaderboard: () =>
    request<{
      leaderboard: {
        id: string;
        name: string;
        level: number;
        netWorthKz: number;
        jobsCompleted: number;
        factionId: string | null;
      }[];
    }>('/api/leaderboard'),

  sendReport: (characterId: string, targetName: string, reason: string) =>
    request<{ ok: boolean }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ characterId, targetName, reason }),
    }),

  // Admin God
  getAdminOverview: () =>
    request<{
      myRole: AdminRole;
      online: {
        id: string;
        sessionId?: string;
        characterId?: string;
        name: string;
        badge: string;
        role: AdminRole;
        interiorId?: string | null;
        position: { x: number; y: number; z: number };
      }[];
      accounts: AccountInfo[];
      characters: {
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
        homePropertyId?: string | null;
        isFrozen: boolean;
        isUnconscious: boolean;
        factionId: string | null;
        position: { x: number; y: number; z: number };
      }[];
      worldConfig: WorldConfigState;
      worldState?: WorldDynamicState;
      factions?: FactionData[];
      transactions?: TransactionRecord[];
      serverTelemetry?: ServerTelemetrySnapshot;
      reports: ReportRecord[];
      logs: AdminLogRecord[];
    }>('/api/admin/overview'),

  adminAction: (payload: {
    action: string;
    targetCharId?: string;
    targetAccountId?: string;
    amountKz?: number;
    x?: number;
    z?: number;
    weather?: WeatherType;
    weatherMode?: WeatherMode;
    timeSpeed?: number;
    timeOfDay?: number;
    taxRate?: number;
    economyMultiplier?: number;
    reason?: string;
    hours?: number;
    role?: AdminRole;
    announcement?: string;
    vehicleModelId?: string;
    reportId?: string;
    district?: string;
    value?: number;
  }) =>
    request<{
      ok: boolean;
      worldConfig: WorldConfigState;
      worldState?: WorldDynamicState;
      serverTelemetry?: ServerTelemetrySnapshot;
      logs: AdminLogRecord[];
      targetCharacter?: CharacterRecord;
      targetVehicles?: OwnedVehicleRecord[];
    }>('/api/admin/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
