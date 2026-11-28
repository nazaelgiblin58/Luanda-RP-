/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type {
  AdminRole,
  ClassifiedAd,
  FactionData,
  FactionRankDef,
  FarmPlantState,
  GangCraftSession,
  GangDesmancheSession,
  GangGrowBatch,
  GlobalDjState,
  InventoryItem,
  JobWorkLogEntry,
  MissionProgress,
  OwnedVehicleRecord,
  PlayerCustomization,
  PlayerStats,
  PoliticsState,
  PrefeituraAnnouncement,
  PropertyRecord,
  SharedWorldVehicle,
  SmsMessage,
  TransactionRecord,
  WeatherMode,
  WeatherType,
  WorldDynamicState,
} from '../src/game/types.ts';
import {
  ENDE_FAULT_POINTS,
  FACTION_CITY_STATIONS,
  FARM_PLANT_NODES,
  JOBS_CATALOG,
  VOLLEYBALL_COURT_CENTER,
  YANGO_PICKUP_NODES,
} from '../src/game/data/catalog.ts';

export interface AccountRecord {
  id: string;
  email: string;
  supabaseUid?: string;
  accountStatus?: 'pending' | 'active' | 'suspended' | 'banned';
  passwordHash: string;
  recoveryCode: string;
  role: AdminRole;
  bannedUntil: number;
  banReason: string;
  suspendedUntil: number;
  createdAt: string;
}

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

export interface LuandaDatabase {
  accounts: Record<string, AccountRecord>;
  characters: Record<string, CharacterRecord>;
  vehicles: Record<string, OwnedVehicleRecord>;
  sharedVehicles: Record<string, SharedWorldVehicle>;
  factions: FactionData[];
  properties: PropertyRecord[];
  politics: PoliticsState;
  prefeituraAnnouncements: PrefeituraAnnouncement[];
  djState: GlobalDjState;
  jobWorkLogs: JobWorkLogEntry[];
  transactions: TransactionRecord[];
  warrants: WarrantRecord[];
  criminalRecords: CriminalRecord[];
  medicalHistory: MedicalRecord[];
  smsMessages: SmsMessage[];
  classifiedAds: ClassifiedAd[];
  reports: ReportRecord[];
  adminLogs: AdminLogRecord[];
  robberyCooldowns: Record<string, number>;
  droppedItems: DroppedItemRecord[];
  desmancheSessions: Record<string, GangDesmancheSession>;
  craftSessions: Record<string, GangCraftSession>;
  growBatches: Record<string, GangGrowBatch>;
  worldState: WorldDynamicState;
  metaAuthSecret?: string;
  worldConfig: {
    weather: WeatherType;
    weatherMode: WeatherMode;
    timeSpeed: number;
    timeOfDay: number;
    taxRate: number;
    economyMultiplier: number;
  };
}

function getDbFilePath(): string {
  if (process.env.LUANDA_DB_PATH) {
    return path.resolve(process.env.LUANDA_DB_PATH);
  }
  return path.resolve(process.cwd(), 'data', 'luandarp_db.json');
}

const NO_PERM = {
  canPromote: false,
  canDemote: false,
  canKick: false,
  canAppointSubleader: false,
  canWithdrawTreasury: false,
  canEditAnnouncement: false,
};

const SUBLEADER_PERM = {
  canPromote: true,
  canDemote: true,
  canKick: true,
  canAppointSubleader: false,
  canWithdrawTreasury: true,
  canEditAnnouncement: true,
};

const LEADER_PERM = {
  canPromote: true,
  canDemote: true,
  canKick: true,
  canAppointSubleader: true,
  canWithdrawTreasury: true,
  canEditAnnouncement: true,
};

function makeCriminalRanks(): FactionRankDef[] {
  return [
    { id: 'recruta', name: 'Recruta', salaryKz: 2600, level: 1, permissions: { ...NO_PERM } },
    { id: 'escorpiao', name: 'Escorpião', salaryKz: 3500, level: 2, permissions: { ...NO_PERM } },
    { id: 'bandido', name: 'Bandido', salaryKz: 4600, level: 3, permissions: { ...NO_PERM } },
    { id: 'sargento', name: 'Sargento', salaryKz: 5800, level: 4, permissions: { ...NO_PERM } },
    { id: 'tenente', name: 'Tenente', salaryKz: 7200, level: 5, permissions: { ...NO_PERM, canPromote: true } },
    { id: 'coronel', name: 'Coronel', salaryKz: 8800, level: 6, permissions: { ...NO_PERM, canPromote: true, canDemote: true, canEditAnnouncement: true } },
    { id: 'sublider', name: 'Sublíder', salaryKz: 10500, level: 7, permissions: { ...SUBLEADER_PERM } },
    { id: 'lider', name: 'Líder', salaryKz: 13500, level: 8, permissions: { ...LEADER_PERM } },
  ];
}

function seedFactions(): FactionData[] {
  return [
    // === 3 ORGANIZAÇÕES LEGAIS OFICIAIS ===
    {
      id: 'policia',
      name: 'Polícia Nacional de Angola (PNA)',
      type: 'policia',
      leaderId: null,
      leaderName: 'Aguardando Admin God',
      suspended: false,
      treasuryKz: 250000,
      baseDistrict: 'complexo_pna',
      basePos: [226, 0, 112],
      interiorId: 'esquadra_pna',
      stash: [],
      ranks: [
        { id: 'agente', name: 'Agente de 3ª Classe', salaryKz: 3500, level: 1, permissions: { ...NO_PERM } },
        { id: 'subchefe', name: 'Subchefe Operacional', salaryKz: 5200, level: 2, permissions: { ...NO_PERM } },
        { id: 'inspector', name: 'Inspector PNA', salaryKz: 7500, level: 3, permissions: { ...SUBLEADER_PERM } },
        { id: 'comandante', name: 'Líder / Comandante PNA', salaryKz: 11000, level: 4, permissions: { ...LEADER_PERM } },
      ],
      members: [],
      announcement: 'Complexo PNA & Prisão Central ativos. Nomeação de Comandante exclusiva ao Admin God.',
      auditLogs: [],
    },
    {
      id: 'hospital',
      name: 'INEMA — Hospital Josina Machel',
      type: 'hospital',
      leaderId: null,
      leaderName: 'Aguardando Admin God',
      suspended: false,
      treasuryKz: 220000,
      baseDistrict: 'maianga',
      basePos: [48, 0, 54],
      interiorId: 'hospital_inema',
      stash: [],
      ranks: [
        { id: 'socorrista', name: 'Socorrista', salaryKz: 3400, level: 1, permissions: { ...NO_PERM } },
        { id: 'enfermeiro', name: 'Enfermeiro Chefe', salaryKz: 5000, level: 2, permissions: { ...NO_PERM } },
        { id: 'cirurgiao', name: 'Subdiretor / Cirurgião', salaryKz: 7800, level: 3, permissions: { ...SUBLEADER_PERM } },
        { id: 'diretor', name: 'Líder / Diretor Hospitalar', salaryKz: 10500, level: 4, permissions: { ...LEADER_PERM } },
      ],
      members: [],
      announcement: 'Urgências 24h abertas. Ambulâncias de prontidão na Maianga.',
      auditLogs: [],
    },
    {
      id: 'advogados',
      name: 'Ordem dos Advogados de Luanda (OAA)',
      type: 'advogados',
      leaderId: null,
      leaderName: 'Aguardando Admin God',
      suspended: false,
      treasuryKz: 185000,
      baseDistrict: 'centro',
      basePos: [62, 0, -28],
      interiorId: 'advogados_escritorio',
      stash: [],
      ranks: [
        { id: 'estagiario', name: 'Advogado Estagiário', salaryKz: 3200, level: 1, permissions: { ...NO_PERM } },
        { id: 'associado', name: 'Advogado Associado', salaryKz: 5200, level: 2, permissions: { ...NO_PERM } },
        { id: 'defensor', name: 'Sublíder / Defensor Público', salaryKz: 8000, level: 3, permissions: { ...SUBLEADER_PERM } },
        { id: 'bastonario', name: 'Líder / Bastonário OAA', salaryKz: 11500, level: 4, permissions: { ...LEADER_PERM } },
      ],
      members: [],
      announcement: 'Escritório de Advogados e Tribunal abertos para defesa de detidos, fianças e audiências.',
      auditLogs: [],
    },

    // === 3 GANGUES / FACÇÕES CRIMINOSAS ATIVAS ===
    {
      id: 'cv_vianalandia',
      name: 'CV - VIANALANDIA',
      type: 'gangue',
      leaderId: null,
      leaderName: 'Aguardando Admin God',
      suspended: false,
      treasuryKz: 170000,
      baseDistrict: 'viana',
      basePos: [305, 2.8, -25],
      interiorId: 'base_cv',
      stash: [],
      ranks: makeCriminalRanks(),
      members: [],
      announcement: 'Desmanche clandestino e controlo da rota leste de Viana.',
      auditLogs: [],
    },
    {
      id: 'ftx_caop2',
      name: 'FTX - CAOP 2',
      type: 'gangue',
      leaderId: null,
      leaderName: 'Aguardando Admin God',
      suspended: false,
      treasuryKz: 165000,
      baseDistrict: 'cazenga',
      basePos: [275, 2.8, -235],
      interiorId: 'base_ftx',
      stash: [],
      ranks: makeCriminalRanks(),
      members: [],
      announcement: 'Bancada tática de fabrico RP no Morro FTX - CAOP 2 sob domínio total.',
      auditLogs: [],
    },
    {
      id: 'bmr_matanga',
      name: 'BMR - MATANGA',
      type: 'gangue',
      leaderId: null,
      leaderName: 'Aguardando Admin God',
      suspended: false,
      treasuryKz: 160000,
      baseDistrict: 'talatona',
      basePos: [275, 2.8, 235],
      interiorId: 'base_bmr',
      stash: [],
      ranks: makeCriminalRanks(),
      members: [],
      announcement: 'Estufa botânica e lavagem de capital no Morro BMR - Matanga.',
      auditLogs: [],
    },
  ];
}

function attachStationMeta(factions: FactionData[]): FactionData[] {
  return factions.map((f) => {
    const st = FACTION_CITY_STATIONS.find((s) => s.factionId === f.id);
    if (!st) return f;
    return {
      ...f,
      stationRole: st.roleId,
      stationName: st.stationName,
      stationPos: st.pos,
      stationDesc: st.subtitle,
    };
  });
}

function makeDefaultHouseBills() {
  return { endeKz: 1800, epalKz: 1100, sonagolKz: 1400 };
}

function makeHouse(
  id: string,
  name: string,
  category: 'T1' | 'T2' | 'T3' | 'T4',
  district: PropertyRecord['district'],
  priceKz: number,
  rentKz: number,
  position: [number, number, number],
  inCondominio = false
): PropertyRecord {
  const interiorType = category.toLowerCase() as 't1' | 't2' | 't3' | 't4';
  const furnitureByCat: Record<'T1' | 'T2' | 'T3' | 'T4', string[]> = {
    T1: ['Cama Individual', 'Sofá Compacto', 'Mesa de Jantar', 'Bancada de Cozinha', 'Casa de Banho'],
    T2: ['Suite Casal', 'Sofá L', 'Mesa de Jantar', 'Cozinha Equipada', 'TV 4K', 'Casa de Banho'],
    T3: ['2 Quartos + Suite', 'Sala Ampla', 'Mesa de Jantar 6 Lugares', 'Cozinha Completa', 'Cofre Pessoal', '2 WCs'],
    T4: ['Master Suite Luxo', '3 Quartos', 'Sala de Estar VIP', 'Mesa de Jantar Imperial', 'Cozinha Gourmet', 'Cofre Blindado'],
  };
  const bills = makeDefaultHouseBills();
  return {
    id,
    name,
    type: category === 'T1' ? 'apartment' : 'house',
    category,
    inCondominio,
    interiorType,
    district,
    priceKz,
    rentKz,
    position,
    ownerId: null,
    ownerName: null,
    renterId: null,
    renterName: null,
    sharedKeys: [],
    safeKz: 0,
    unpaidBillsKz: bills.endeKz + bills.epalKz + bills.sonagolKz,
    bills,
    furniture: furnitureByCat[category],
    stash: [],
    employees: [],
    revenueKz: 0,
  };
}

// EXATAMENTE 18 CASAS COMPRÁVEIS — TODAS NO CONDOMÍNIO VILA ATLÂNTICA + 2 NEGÓCIOS INTERATIVOS (Restaurante & Boutique)
function seedProperties(): PropertyRecord[] {
  return [
    // Fila 1 (Norte, z=-305)
    makeHouse('casa-cond-01', 'Vila Atlântica Casa 01 — T1 Jardim', 'T1', 'condominio', 700000, 12000, [111, 0, -305], true),
    makeHouse('casa-cond-02', 'Vila Atlântica Casa 02 — T1 Nascente', 'T1', 'condominio', 740000, 13000, [126, 0, -305], true),
    makeHouse('casa-cond-03', 'Vila Atlântica Casa 03 — T2 Palmeira', 'T2', 'condominio', 1050000, 18000, [141, 0, -305], true),
    makeHouse('casa-cond-04', 'Vila Atlântica Casa 04 — T2 Horizonte', 'T2', 'condominio', 1120000, 19000, [156, 0, -305], true),
    makeHouse('casa-cond-05', 'Vila Atlântica Casa 05 — T2 Brisa', 'T2', 'condominio', 1200000, 20000, [171, 0, -305], true),
    // Fila 2 (z=-280)
    makeHouse('casa-cond-06', 'Vila Atlântica Casa 06 — T3 Esmeralda', 'T3', 'condominio', 1850000, 28000, [111, 0, -280], true),
    makeHouse('casa-cond-07', 'Vila Atlântica Casa 07 — T3 Imperial', 'T3', 'condominio', 1980000, 30000, [126, 0, -280], true),
    makeHouse('casa-cond-08', 'Vila Atlântica Casa 08 — T3 Mirante', 'T3', 'condominio', 2150000, 32000, [156, 0, -280], true),
    makeHouse('casa-cond-09', 'Vila Atlântica Casa 09 — T4 Mansão Norte', 'T4', 'condominio', 3400000, 48000, [171, 0, -280], true),
    // Praça Este (z=-255)
    makeHouse('casa-cond-10', 'Vila Atlântica Casa 10 — T4 Presidencial', 'T4', 'condominio', 4200000, 58000, [171, 0, -255], true),
    // Fila 3 (z=-230)
    makeHouse('casa-cond-11', 'Vila Atlântica Casa 11 — T1 Flamingo', 'T1', 'condominio', 720000, 12500, [111, 0, -230], true),
    makeHouse('casa-cond-12', 'Vila Atlântica Casa 12 — T2 Baía', 'T2', 'condominio', 980000, 16500, [126, 0, -230], true),
    makeHouse('casa-cond-13', 'Vila Atlântica Casa 13 — T3 Colonial', 'T3', 'condominio', 1650000, 25000, [156, 0, -230], true),
    makeHouse('casa-cond-14', 'Vila Atlântica Casa 14 — T2 Acácia', 'T2', 'condominio', 1150000, 19000, [171, 0, -230], true),
    // Fila 4 (Sul, z=-207)
    makeHouse('casa-cond-15', 'Vila Atlântica Casa 15 — T4 Real', 'T4', 'condominio', 3600000, 50000, [111, 0, -207], true),
    makeHouse('casa-cond-16', 'Vila Atlântica Casa 16 — T3 Marítima', 'T3', 'condominio', 2450000, 35000, [125, 0, -207], true),
    makeHouse('casa-cond-17', 'Vila Atlântica Casa 17 — T2 Atlântico', 'T2', 'condominio', 1280000, 21000, [157, 0, -207], true),
    makeHouse('casa-cond-18', 'Vila Atlântica Casa 18 — T4 Penthouse VIP', 'T4', 'condominio', 3950000, 54000, [171, 0, -207], true),

    // ESTRITAMENTE 2 EMPRESAS INTERATIVAS (Restaurante & Boutique)
    {
      id: 'biz-restaurante-ilha',
      name: 'Restaurante Sabores da Ilha 🍽️',
      type: 'business',
      category: 'business',
      businessCategory: 'restaurant',
      interiorType: 'business',
      district: 'ilha',
      priceKz: 240000,
      rentKz: 9000,
      position: [-25, 0, -24],
      ownerId: null,
      ownerName: null,
      renterId: null,
      renterName: null,
      sharedKeys: [],
      safeKz: 0,
      unpaidBillsKz: 0,
      furniture: ['Fogão Industrial', 'Mesas de Jantar', 'Lava-Louça & Torneira'],
      stash: [],
      employees: [],
      revenueKz: 5500,
      dirtyPlates: 2,
      cookedDishesReady: 1,
    },
    {
      id: 'biz-boutique-talatona',
      name: 'Boutique Moda Luanda 👗',
      type: 'business',
      category: 'business',
      businessCategory: 'boutique',
      interiorType: 'business',
      district: 'talatona',
      priceKz: 260000,
      rentKz: 9500,
      position: [114, 0, 26],
      ownerId: null,
      ownerName: null,
      renterId: null,
      renterName: null,
      sharedKeys: [],
      safeKz: 0,
      unpaidBillsKz: 0,
      furniture: ['Bancada de Costura', 'Manequins VIP', 'Balcão de Vendas'],
      stash: [],
      employees: [],
      revenueKz: 6000,
      craftedClothesStock: 3,
    },
  ];
}

function seedPolitics(): PoliticsState {
  return {
    parties: [
      {
        id: 'party-ppl',
        name: 'Partido Progresso de Luanda',
        acronym: 'PPL',
        color: '#dc2626',
        ideology: 'Infraestrutura urbana, emprego público e modernização portuária',
        approved: true,
        suspended: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'party-mca',
        name: 'Movimento Cívico Atlântico',
        acronym: 'MCA',
        color: '#2563eb',
        ideology: 'Livre mercado, incentivos ao comércio local e segurança nos bairros',
        approved: true,
        suspended: false,
        createdAt: new Date().toISOString(),
      },
    ],
    activeElection: null,
    president: null,
    electionHistory: [],
    decisions: [],
  };
}

function seedDjState(): GlobalDjState {
  return {
    currentTrack: null,
    startedAt: 0,
    endsAt: 0,
    paidByCharId: null,
    paidByName: null,
    costKz: 200000,
    history: [],
  };
}

export function createDefaultMissions(): MissionProgress[] {
  return [
    {
      id: 'daily_job_2',
      title: 'Trabalhador Dedicado',
      description: 'Completa 2 turnos de qualquer emprego legal em Luanda.',
      type: 'daily',
      target: 2,
      progress: 0,
      rewardKz: 6000,
      rewardXp: 80,
      claimed: false,
    },
    {
      id: 'daily_shop_3',
      title: 'Economia Local',
      description: 'Faz 3 compras em mercados, restaurantes ou farmácias.',
      type: 'daily',
      target: 3,
      progress: 0,
      rewardKz: 3500,
      rewardXp: 50,
      claimed: false,
    },
    {
      id: 'weekly_jobs_8',
      title: 'Pilar de Luanda (Semanal)',
      description: 'Completa 8 trabalhos oficiais durante a semana.',
      type: 'weekly',
      target: 8,
      progress: 0,
      rewardKz: 22000,
      rewardXp: 300,
      claimed: false,
    },
  ];
}

function seedWorldState(): WorldDynamicState {
  const now = Date.now();
  const origin = YANGO_PICKUP_NODES[0];
  const dest = YANGO_PICKUP_NODES[3];
  const firstFault = ENDE_FAULT_POINTS[0];
  const farmPlants: Record<string, FarmPlantState> = {};
  FARM_PLANT_NODES.forEach((p) => {
    farmPlants[p.id] = { id: p.id, cropName: p.cropName, pos: p.pos, availableAt: 0 };
  });

  return {
    blackoutDistricts: {},
    cleanlinessByDistrict: {
      centro: 84,
      ilha: 88,
      maianga: 80,
      ingombota: 86,
      talatona: 90,
      kilamba: 85,
      viana: 72,
      benfica: 78,
    },
    yangoCalls: [
      {
        id: 'yango-seed-1',
        passengerName: 'Dona Esperança (Passageiro)',
        isPlayer: false,
        pickupLabel: origin.label,
        pickupPos: origin.pos,
        destLabel: dest.label,
        destPos: dest.pos,
        distanceM: Math.round(Math.hypot(dest.pos[0] - origin.pos[0], dest.pos[2] - origin.pos[2])),
        fareKz: 4800,
        status: 'pending',
        createdAt: now,
      },
    ],
    endeCalls: [
      {
        id: 'ende-seed-1',
        faultPointId: firstFault.id,
        district: firstFault.district,
        title: firstFault.title,
        repairType: firstFault.repairType,
        pos: firstFault.pos,
        causesBlackout: false,
        rewardKz: firstFault.rewardKz,
        status: 'open',
        createdAt: now,
      },
    ],
    inemaCalls: [],
    lawyerCases: [],
    farmPlants,
    volleyball: {
      x: VOLLEYBALL_COURT_CENTER[0],
      y: 0.45,
      z: VOLLEYBALL_COURT_CENTER[1],
      vx: 0,
      vy: 0,
      vz: 0,
      scoreLeft: 0,
      scoreRight: 0,
      updatedAt: now,
    },
    lastPaydayAt: now,
    activeTerritoryDispute: null,
  };
}

function createEmptyDb(): LuandaDatabase {
  return {
    accounts: {},
    characters: {},
    vehicles: {},
    sharedVehicles: {},
    factions: attachStationMeta(seedFactions()),
    properties: seedProperties(),
    politics: seedPolitics(),
    prefeituraAnnouncements: [
      {
        id: 'pref-seed-1',
        title: 'Concursos Oficiais: YANGO, ENDE, PESCADOR & ELISAL',
        content: 'Todos os cidadãos podem iniciar carreira nos 4 empregos oficiais com uniforme, GPS, progressão de nível e salário em Kz.',
        category: 'emprego',
        authorName: 'Prefeitura de Luanda',
        authorRole: 'Governo Municipal',
        isOfficial: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pref-seed-2',
        title: 'Recrutamento Aberto — PNA, INEMA & Ordem dos Advogados',
        content: 'Inscreve-te nas 3 instituições legais de Luanda. Lideranças atribuídas exclusivamente pelo Admin God.',
        category: 'edital',
        authorName: 'Prefeitura de Luanda',
        authorRole: 'Direção Cívica',
        isOfficial: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pref-seed-3',
        title: 'Sistema Eleitoral & Multicaixa Express 24h',
        content: 'Vota no teu candidato nas urnas da Prefeitura e usa o Multicaixa Express no telemóvel para transferências imediatas.',
        category: 'aviso',
        authorName: 'Comissão Municipal',
        authorRole: 'Administração',
        isOfficial: true,
        createdAt: new Date().toISOString(),
      },
    ],
    djState: seedDjState(),
    jobWorkLogs: [],
    transactions: [],
    warrants: [],
    criminalRecords: [],
    medicalHistory: [],
    smsMessages: [],
    classifiedAds: [
      {
        id: 'ad-seed-1',
        authorName: 'Concessionária CICOMEX',
        authorPhone: '923000100',
        title: 'Promoção Candongueiro HiAce!',
        description: 'Entrega imediata na Baixa. Aceitamos transferência Multicaixa.',
        priceKz: 95000,
        timestamp: new Date().toISOString(),
      },
    ],
    reports: [],
    adminLogs: [],
    robberyCooldowns: {},
    droppedItems: [],
    desmancheSessions: {},
    craftSessions: {},
    growBatches: {},
    worldState: seedWorldState(),
    worldConfig: {
      weather: 'ensolarado',
      weatherMode: 'auto',
      timeSpeed: 1,
      timeOfDay: 15.5,
      taxRate: 0.05,
      economyMultiplier: 1.0,
    },
  };
}

let cachedDb: LuandaDatabase | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let sqlHydrated = false;
let sqlHydrationPromise: Promise<void> | null = null;
let lastSqlHydrationFailAt = 0;
let sqlSyncPendingSnapshot: LuandaDatabase | null = null;
let sqlSyncPromise: Promise<void> | null = null;
let supabaseSyncPendingSnapshot: LuandaDatabase | null = null;
let supabaseSyncPromise: Promise<void> | null = null;

function mergeParsedIntoBase(parsed: Partial<LuandaDatabase>): LuandaDatabase {
  const base = createEmptyDb();

  const existingFactions = parsed.factions || [];
  const allowedFactionIds = new Set(base.factions.map((sf) => sf.id));
  const allowedJobIds = new Set(JOBS_CATALOG.map((j) => j.id));
  const mergedFactions: FactionData[] = base.factions.map((sf) => {
    const found = existingFactions.find((f) => f.id === sf.id);
    if (!found) return sf;
    return {
      ...sf,
      ...found,
      baseDistrict: sf.baseDistrict,
      basePos: sf.basePos,
      interiorId: sf.interiorId,
      stash: found.stash ?? [],
      stationRole: sf.stationRole,
      stationName: sf.stationName,
      stationPos: sf.stationPos,
      stationDesc: sf.stationDesc,
      suspended: found.suspended ?? false,
      auditLogs: found.auditLogs ?? [],
      ranks: found.ranks && found.ranks.length >= sf.ranks.length ? found.ranks : sf.ranks,
    };
  });

  const existingProps = (parsed.properties || []).map((p) => ({
    ...p,
    stash: p.stash ?? [],
    sharedKeys: p.sharedKeys ?? [],
  }));
  const mergedProps: PropertyRecord[] = base.properties.map((sp) => {
    const match = existingProps.find((p) => p.id === sp.id);
    if (!match) return sp;
    const bills =
      sp.type !== 'business'
        ? match.bills || (match.unpaidBillsKz === 0 && match.ownerId ? { endeKz: 0, epalKz: 0, sonagolKz: 0 } : makeDefaultHouseBills())
        : undefined;
    const unpaidBillsKz = bills
      ? bills.endeKz + bills.epalKz + bills.sonagolKz
      : match.unpaidBillsKz || 0;
    return {
      ...sp,
      ownerId: match.ownerId,
      ownerName: match.ownerName,
      renterId: match.renterId,
      renterName: match.renterName,
      sharedKeys: match.sharedKeys || [],
      safeKz: match.safeKz || 0,
      bills,
      unpaidBillsKz,
      stash: match.stash || [],
      employees: match.employees || [],
      revenueKz: match.revenueKz ?? sp.revenueKz,
      dirtyPlates: match.dirtyPlates ?? sp.dirtyPlates,
      cookedDishesReady: match.cookedDishesReady ?? sp.cookedDishesReady,
      craftedClothesStock: match.craftedClothesStock ?? sp.craftedClothesStock,
    };
  });

  const mergedWorldState: WorldDynamicState = {
    ...base.worldState,
    ...(parsed.worldState || {}),
    blackoutDistricts: parsed.worldState?.blackoutDistricts || {},
    cleanlinessByDistrict: {
      ...base.worldState.cleanlinessByDistrict,
      ...(parsed.worldState?.cleanlinessByDistrict || {}),
    },
    yangoCalls: parsed.worldState?.yangoCalls?.length ? parsed.worldState.yangoCalls : base.worldState.yangoCalls,
    endeCalls: parsed.worldState?.endeCalls?.length ? parsed.worldState.endeCalls : base.worldState.endeCalls,
    inemaCalls: parsed.worldState?.inemaCalls || [],
    lawyerCases: parsed.worldState?.lawyerCases || [],
    farmPlants: {
      ...(base.worldState.farmPlants || {}),
      ...(parsed.worldState?.farmPlants || {}),
    },
    volleyball: parsed.worldState?.volleyball || base.worldState.volleyball,
    lastPaydayAt: parsed.worldState?.lastPaydayAt || base.worldState.lastPaydayAt,
  };

  const merged: LuandaDatabase = {
    ...base,
    ...parsed,
    sharedVehicles: parsed.sharedVehicles || {},
    factions: mergedFactions,
    properties: mergedProps,
    politics: {
      ...base.politics,
      ...(parsed.politics || {}),
      parties: parsed.politics?.parties?.length ? parsed.politics.parties : base.politics.parties,
      electionHistory: parsed.politics?.electionHistory ?? [],
      decisions: parsed.politics?.decisions ?? [],
    },
    prefeituraAnnouncements: parsed.prefeituraAnnouncements?.length
      ? parsed.prefeituraAnnouncements
      : base.prefeituraAnnouncements,
    djState: { ...base.djState, ...(parsed.djState || {}), history: parsed.djState?.history ?? [] },
    jobWorkLogs: parsed.jobWorkLogs ?? [],
    desmancheSessions: parsed.desmancheSessions || {},
    craftSessions: parsed.craftSessions || {},
    growBatches: parsed.growBatches || {},
    worldState: mergedWorldState,
    worldConfig: { ...base.worldConfig, ...(parsed.worldConfig || {}) },
  };
  delete (merged as unknown as { hotelRooms?: unknown }).hotelRooms;

  const allowedExtras = new Set(['agricultor_fazenda']);
  Object.values(merged.characters).forEach((ch) => {
    if (typeof ch.stats.sleep !== 'number') ch.stats.sleep = 100;
    if (ch.stats.homePropertyId === undefined) ch.stats.homePropertyId = null;
    if (ch.stats.interiorId === undefined) ch.stats.interiorId = null;
    if (ch.stats.factionId && !allowedFactionIds.has(ch.stats.factionId)) {
      ch.stats.factionId = null;
      ch.stats.factionRank = 'Civil';
    }
    if (
      ch.stats.jobId &&
      !allowedJobIds.has(ch.stats.jobId as 'yango' | 'ende' | 'pescador' | 'elisal') &&
      !allowedExtras.has(ch.stats.jobId)
    ) {
      ch.stats.jobId = null;
      ch.jobStepIndex = 0;
    }
  });

  return merged;
}

export async function hydrateDbFromSqlIfNeeded(): Promise<void> {
  if (sqlHydrated || process.env.LUANDA_TEST_MODE) return;
  if (sqlHydrationPromise) return sqlHydrationPromise;
  if (lastSqlHydrationFailAt > 0 && Date.now() - lastSqlHydrationFailAt < 5000) return;

  sqlHydrationPromise = (async () => {
    try {
      const { isSqlConfigured } = await import('../src/db/index.ts');
      if (isSqlConfigured()) {
        const { loadWorldSnapshotFromSql, syncWorldSnapshotToSql } = await import('../src/db/repository.ts');
        const sqlState = await loadWorldSnapshotFromSql();
        if (sqlState && (sqlState.accounts || sqlState.characters)) {
          cachedDb = mergeParsedIntoBase(sqlState);
          persistDbSync();
        } else {
          const current = getDb();
          await syncWorldSnapshotToSql(current);
        }
      }

      const { isSupabaseDbSyncConfigured } = await import('./supabaseAdmin.ts');
      if (isSupabaseDbSyncConfigured()) {
        const current = getDb();
        const hasLocalData =
          Object.keys(current.accounts).length > 0 || Object.keys(current.characters).length > 0;
        const { loadSnapshotFromSupabase, syncSnapshotToSupabase } = await import('./supabaseSync.ts');
        if (!hasLocalData) {
          const sbState = await loadSnapshotFromSupabase(current);
          if (sbState && (Object.keys(sbState.accounts || {}).length > 0 || Object.keys(sbState.characters || {}).length > 0)) {
            cachedDb = mergeParsedIntoBase(sbState);
            persistDbSync();
          } else {
            await syncSnapshotToSupabase(current);
          }
        } else {
          await syncSnapshotToSupabase(current);
        }
      }

      sqlHydrated = true;
      lastSqlHydrationFailAt = 0;
    } catch (err) {
      lastSqlHydrationFailAt = Date.now();
      console.error('[DB] Aviso na hidratação inicial (tentará novamente em breve):', err);
    } finally {
      sqlHydrationPromise = null;
    }
  })();

  return sqlHydrationPromise;
}

export function getDb(): LuandaDatabase {
  if (cachedDb) return cachedDb;
  const dbPath = getDbFilePath();
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LuandaDatabase>;
      cachedDb = mergeParsedIntoBase(parsed);
      return cachedDb;
    }
  } catch (err) {
    console.error('[DB] Erro ao carregar base de dados, recriando padrão:', err);
  }
  cachedDb = createEmptyDb();
  persistDbSync();
  return cachedDb;
}

export function resetDbForTests(): void {
  cachedDb = null;
  sqlHydrated = false;
  sqlHydrationPromise = null;
  lastSqlHydrationFailAt = 0;
  sqlSyncPendingSnapshot = null;
  supabaseSyncPendingSnapshot = null;
}

function persistDbSync() {
  if (!cachedDb) return;
  try {
    const dbPath = getDbFilePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(cachedDb, null, 2), 'utf-8');
    fs.renameSync(tmpPath, dbPath);
  } catch {}
}

function triggerCoalescedSqlSync(snapshotObj: LuandaDatabase) {
  if (process.env.LUANDA_TEST_MODE) return;
  sqlSyncPendingSnapshot = snapshotObj;
  if (sqlSyncPromise) return;

  sqlSyncPromise = (async () => {
    try {
      const { isSqlConfigured } = await import('../src/db/index.ts');
      if (!isSqlConfigured()) {
        sqlSyncPendingSnapshot = null;
        return;
      }
      const { syncWorldSnapshotToSql } = await import('../src/db/repository.ts');
      while (sqlSyncPendingSnapshot) {
        const nextSnap = sqlSyncPendingSnapshot;
        sqlSyncPendingSnapshot = null;
        await syncWorldSnapshotToSql(nextSnap);
      }
    } catch (sqlErr) {
      console.error('[Cloud SQL] Erro ao persistir estado no PostgreSQL:', sqlErr);
    } finally {
      sqlSyncPromise = null;
    }
  })();
}

function triggerCoalescedSupabaseSync(snapshotObj: LuandaDatabase) {
  if (process.env.LUANDA_TEST_MODE) return;
  supabaseSyncPendingSnapshot = snapshotObj;
  if (supabaseSyncPromise) return;

  supabaseSyncPromise = (async () => {
    try {
      const { isSupabaseDbSyncConfigured } = await import('./supabaseAdmin.ts');
      if (!isSupabaseDbSyncConfigured()) {
        supabaseSyncPendingSnapshot = null;
        return;
      }
      const { syncSnapshotToSupabase } = await import('./supabaseSync.ts');
      while (supabaseSyncPendingSnapshot) {
        const nextSnap = supabaseSyncPendingSnapshot;
        supabaseSyncPendingSnapshot = null;
        await syncSnapshotToSupabase(nextSnap);
      }
    } catch (sbErr) {
      console.error('[Supabase] Erro ao sincronizar estado no PostgreSQL Supabase:', sbErr);
    } finally {
      supabaseSyncPromise = null;
    }
  })();
}

export async function flushSqlSync(): Promise<void> {
  await writeQueue;
  if (sqlSyncPromise) {
    await sqlSyncPromise;
  }
  if (supabaseSyncPromise) {
    await supabaseSyncPromise;
  }
}

export function saveDb(): Promise<void> {
  if (!cachedDb) return Promise.resolve();
  const snapshotObj = JSON.parse(JSON.stringify(cachedDb)) as LuandaDatabase;
  const snapshot = JSON.stringify(snapshotObj, null, 2);
  const dbPath = getDbFilePath();
  writeQueue = writeQueue
    .then(async () => {
      try {
        await fsp.mkdir(path.dirname(dbPath), { recursive: true });
        const tmpPath = `${dbPath}.tmp.${Date.now()}`;
        await fsp.writeFile(tmpPath, snapshot, 'utf-8');
        await fsp.rename(tmpPath, dbPath);
      } catch (fsErr) {
        console.error('[DB] Erro na gravação local:', fsErr);
      }
      triggerCoalescedSqlSync(snapshotObj);
      triggerCoalescedSupabaseSync(snapshotObj);
    })
    .catch((err) => {
      console.error('[DB] Erro na fila de gravação:', err);
    });
  return writeQueue;
}

export function addTransaction(
  characterId: string,
  type: TransactionRecord['type'],
  amountKz: number,
  description: string
) {
  const db = getDb();
  db.transactions.unshift({
    id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    characterId,
    type,
    amountKz: Math.round(amountKz),
    description,
    timestamp: new Date().toISOString(),
  });
  if (db.transactions.length > 2500) {
    db.transactions.length = 2500;
  }
}

export function addAdminLog(actorEmail: string, actorRole: AdminRole, action: string, details: string) {
  const db = getDb();
  db.adminLogs.unshift({
    id: 'alog-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    actorEmail,
    actorRole,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
  if (db.adminLogs.length > 500) {
    db.adminLogs.length = 500;
  }
}

export function generateBI(): string {
  const num = String(Math.floor(100000000 + Math.random() * 899999999));
  const suffix = String(Math.floor(10 + Math.random() * 89));
  return `${num}LA0${suffix}`;
}

export function generateAngolanPhone(db: LuandaDatabase): string {
  const existing = new Set(Object.values(db.characters).map((c) => c.stats.phone));
  for (let i = 0; i < 40; i++) {
    const prefix = ['923', '924', '931', '942', '912'][Math.floor(Math.random() * 5)];
    const rest = String(Math.floor(100000 + Math.random() * 899999));
    const phone = `${prefix}${rest}`;
    if (!existing.has(phone)) return phone;
  }
  return `923${String(Date.now()).slice(-6)}`;
}

export function generatePlate(db: LuandaDatabase): string {
  const existing = new Set(Object.values(db.vehicles).map((v) => v.plate));
  const letters = 'ABCDEFGHJKLMNPQRSTUVXZ';
  for (let i = 0; i < 40; i++) {
    const d1 = String(Math.floor(10 + Math.random() * 89));
    const d2 = String(Math.floor(10 + Math.random() * 89));
    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    const plate = `LD-${d1}-${d2}-${l1}${l2}`;
    if (!existing.has(plate)) return plate;
  }
  return `LD-${String(Date.now()).slice(-4)}-RP`;
}

// Bloqueio por personagem para prevenir duplicação de transações, dinheiro ou inventário
const charActionLocks = new Map<string, Promise<unknown>>();
export async function withCharacterLock<T>(charId: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = charActionLocks.get(charId) || Promise.resolve();
  const next = prev.then(
    () => fn(),
    () => fn()
  );
  charActionLocks.set(charId, next);
  try {
    return await next;
  } finally {
    if (charActionLocks.get(charId) === next) {
      charActionLocks.delete(charId);
    }
  }
}
