/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DistrictId } from '../types.ts';

export interface MorroDefinition {
  id: string;
  factionId: string;
  title: string;
  district: DistrictId;
  x: number;
  z: number;
  topRadius: number;
  outerRadius: number;
  topY: number;
  accentHex: string;
  accentNum: number;
  rampSide: 'west' | 'south' | 'north';
}

export const MORRO_DEFINITIONS: MorroDefinition[] = [
  {
    id: 'morro-ftx',
    factionId: 'ftx_caop2',
    title: 'MORRO FTX - CAOP 2',
    district: 'cazenga',
    x: 275,
    z: -235,
    topRadius: 23,
    outerRadius: 36,
    topY: 2.8,
    accentHex: '#ef4444',
    accentNum: 0xef4444,
    rampSide: 'west',
  },
  {
    id: 'morro-bmr',
    factionId: 'bmr_matanga',
    title: 'MORRO BMR - MATANGA',
    district: 'talatona',
    x: 275,
    z: 235,
    topRadius: 23,
    outerRadius: 36,
    topY: 2.8,
    accentHex: '#2563eb',
    accentNum: 0x2563eb,
    rampSide: 'west',
  },
  {
    id: 'morro-cv',
    factionId: 'cv_vianalandia',
    title: 'MORRO CV - VIANALÂNDIA',
    district: 'viana',
    x: 305,
    z: -25,
    topRadius: 23,
    outerRadius: 36,
    topY: 2.8,
    accentHex: '#dc2626',
    accentNum: 0xdc2626,
    rampSide: 'west',
  },
];

// Coordenadas Oficiais dos Complexos Principais
export const DEFAULT_SPAWN_POS = { x: -29, y: 0, z: 58 }; // Praia da Ilha ao lado do DJ
export const MOTO_RENTAL_POS: [number, number, number] = [-24, 0.5, 57];
export const SPAWN_PLAZA_POS: [number, number, number] = [-29, 0, 58];

// Base Militar FAA & Cofre do Tesouro
export const FAA_BASE_BOUNDS = {
  minX: -172,
  maxX: -100,
  minZ: 94,
  maxZ: 166,
};
export const FAA_VAULT_POS: [number, number, number] = [-148, 0.5, 127];

// Complexo Policial & Prisão PNA (Zona Institucional Sul-Leste, isolado da Praça do Spawn)
export const ESQUADRA_PNA_POS: [number, number, number] = [226, 0, 128];
export const ESQUADRA_ENTRANCE_POS: [number, number, number] = [226, 0, 112];
export const PRISON_YARD_POS: [number, number, number] = [226, 0, 178];
export const PRISON_RELEASE_POS: [number, number, number] = [204, 0, 114];

// Interiores Navegáveis Isolados (x: 590..1650, z: 580..1250)
export const INTERIOR_BOUNDS = {
  minX: 590,
  maxX: 1650,
  minZ: 580,
  maxZ: 1250,
};

export const ESQUADRA_INTERIOR_ORIGIN: [number, number] = [820, 640];
export const PRISON_INTERIOR_ORIGIN: [number, number] = [900, 640];
export const PALACIO_INTERIOR_ORIGIN: [number, number] = [980, 640];

export const INTERIOR_ORIGINS = {
  esquadra_pna: [820, 640] as [number, number],
  prisao_central: [900, 640] as [number, number],
  palacio_presidencial: [980, 640] as [number, number],
  hospital_inema: [1060, 640] as [number, number],
  advogados_escritorio: [1140, 640] as [number, number],
  tribunal: [1220, 640] as [number, number],
  base_cv: [1300, 640] as [number, number],
  base_ftx: [1380, 640] as [number, number],
  base_bmr: [1460, 640] as [number, number],
  garagem_central: [1060, 740] as [number, number],
  oficina_auto: [1140, 740] as [number, number],
  mercado_lojas: [1220, 740] as [number, number],
  job_hq_yango: [1300, 740] as [number, number],
  job_hq_ende: [1380, 740] as [number, number],
  job_hq_pescador: [1460, 740] as [number, number],
  job_hq_elisal: [1540, 740] as [number, number],
  cicomex_interior: [1060, 840] as [number, number],
  restaurante_interior: [1140, 840] as [number, number],
  boutique_interior: [1220, 840] as [number, number],
} as const;

export const PRISON_CELL_SPAWNS: {
  cell: number;
  cellNumber: number;
  x: number;
  y: number;
  z: number;
  spawn: [number, number, number];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}[] = [
  { cell: 1, cellNumber: 1, x: 891, y: 0, z: 626, spawn: [891, 0, 626], minX: 887.5, maxX: 894.5, minZ: 622.5, maxZ: 630.5 },
  { cell: 2, cellNumber: 2, x: 900, y: 0, z: 626, spawn: [900, 0, 626], minX: 896.5, maxX: 903.5, minZ: 622.5, maxZ: 630.5 },
  { cell: 3, cellNumber: 3, x: 909, y: 0, z: 626, spawn: [909, 0, 626], minX: 905.5, maxX: 912.5, minZ: 622.5, maxZ: 630.5 },
  { cell: 4, cellNumber: 4, x: 891, y: 0, z: 654, spawn: [891, 0, 654], minX: 887.5, maxX: 894.5, minZ: 649.5, maxZ: 657.5 },
];

export const CONDOMINIO_CENTER: [number, number] = [141, -255];
export const PALACIO_PRESIDENCIAL_POS: [number, number, number] = [68, 0, -68];
export const DJ_BOOTH_POS: [number, number, number] = [-34, 0.5, 62];

export const WORLD_MIN_BOUND = -450;
export const WORLD_MAX_BOUND = 450;

export function isInInteriorPocket(x: number, z: number): boolean {
  return (
    x >= INTERIOR_BOUNDS.minX &&
    x <= INTERIOR_BOUNDS.maxX &&
    z >= INTERIOR_BOUNDS.minZ &&
    z <= INTERIOR_BOUNDS.maxZ
  );
}

export function isInsideValidWorldBounds(x: number, z: number): boolean {
  if (isInInteriorPocket(x, z)) return true;
  return x >= WORLD_MIN_BOUND && x <= WORLD_MAX_BOUND && z >= WORLD_MIN_BOUND && z <= WORLD_MAX_BOUND;
}

export function clampToValidWorldBounds(x: number, z: number): { x: number; z: number } {
  if (isInInteriorPocket(x, z)) {
    return {
      x: Math.max(INTERIOR_BOUNDS.minX, Math.min(INTERIOR_BOUNDS.maxX, x)),
      z: Math.max(INTERIOR_BOUNDS.minZ, Math.min(INTERIOR_BOUNDS.maxZ, z)),
    };
  }
  return {
    x: Math.max(WORLD_MIN_BOUND, Math.min(WORLD_MAX_BOUND, x)),
    z: Math.max(WORLD_MIN_BOUND, Math.min(WORLD_MAX_BOUND, z)),
  };
}

export function getAssignedCellData(cellNum = 1) {
  const idx = ((Math.max(1, Math.floor(cellNum)) - 1) % PRISON_CELL_SPAWNS.length);
  return PRISON_CELL_SPAWNS[idx];
}

/**
 * Calcula a altura exata e contínua da superfície em (x, z) para personagens e veículos.
 * Garante subidas e descidas suaves em todos os 3 Morros (CV, FTX, BMR), rampas, ponte FAA, praia e pontão.
 */
export function getSurfaceHeightAt(x: number, z: number, currentY = 0): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;

  // Interiores são planos ao nível y = 0
  if (isInInteriorPocket(x, z)) {
    return 0;
  }

  let h = 0;

  // 1. Pontão & Rampa de Acesso na Ilha (x=-44..-102, z=11..21)
  if (z >= 11.5 && z <= 20.5) {
    if (x <= -43 && x >= -51) {
      const rampT = (-43 - x) / 8; // 0..1
      if (currentY >= -0.35) {
        h = Math.max(h, Math.max(0, Math.min(1, rampT)) * 0.88);
      }
    } else if (x < -51 && x >= -102 && currentY >= 0.3) {
      h = Math.max(h, 0.88);
    }
  }

  // 2. Ponte & Plataforma Aeroporto 4 de Fevereiro (x=-136..-13, z=-130..-60)
  if (x >= -56 && x <= -13 && z >= -102 && z <= -88 && currentY >= -0.4) {
    h = Math.max(h, 0.26);
  }
  if (x >= -136 && x <= -52 && z >= -130 && z <= -60 && currentY >= -0.4) {
    h = Math.max(h, 0.22);
  }

  // 3. Ponte Base FAA (x=-120..-14, z=122..138)
  if (x >= -124 && x <= -12 && z >= 121 && z <= 139 && currentY >= -0.4) {
    h = Math.max(h, 0.28);
  }

  // 4. Base Militar FAA (planície em torno de x=-172..-100, z=94..166)
  if (x <= -100 && x >= -172 && z >= 94 && z <= 166) {
    h = Math.max(h, 0.25);
  }

  // 5. Palco DJ Ilha Sunset (-45..-35, z=56..68)
  if (x >= -44.5 && x <= -35.5 && z >= 56.5 && z <= 67.5 && currentY >= 0.25) {
    h = Math.max(h, 0.9);
  }

  // 6. Praia & Fundo Marinho (Oeste x < -34) — apenas onde não está em ponte/pontão/deck acima
  if (x < -34 && h === 0) {
    if (x >= -49) {
      const t = (-34 - x) / 15;
      return 0.04 - t * 0.24;
    } else if (x >= -72) {
      const t = (-49 - x) / 23;
      return -0.2 - t * 2.2;
    }
    return -2.4;
  }

  // 6. Todos os 3 Morros das Facções (topo plano + encosta suave + rampa larga asfaltada)
  for (const m of MORRO_DEFINITIONS) {
    const dx = x - m.x;
    const dz = z - m.z;
    const dist = Math.hypot(dx, dz);

    // Topo plano do morro
    if (dist <= m.topRadius) {
      h = Math.max(h, m.topY);
      continue;
    }

    // Rampa de acesso asfaltada dedicada (largura 12m, comprimento 20m ligando estrada -> topo)
    let onRamp = false;
    let rampT = 0;
    if (m.rampSide === 'west') {
      // de x = m.x - 41 (y=0) até x = m.x - 21 (y=2.8)
      if (Math.abs(dz) <= 6.2 && x >= m.x - 41 && x <= m.x - 21) {
        onRamp = true;
        rampT = (x - (m.x - 41)) / 20;
      }
    } else if (m.rampSide === 'south') {
      // de z = m.z + 41 (y=0) até z = m.z + 21 (y=2.8)
      if (Math.abs(dx) <= 6.2 && z <= m.z + 41 && z >= m.z + 21) {
        onRamp = true;
        rampT = (m.z + 41 - z) / 20;
      }
    } else if (m.rampSide === 'north') {
      // de z = m.z - 41 (y=0) até z = m.z - 21 (y=2.8)
      if (Math.abs(dx) <= 6.2 && z >= m.z - 41 && z <= m.z - 21) {
        onRamp = true;
        rampT = (z - (m.z - 41)) / 20;
      }
    }

    if (onRamp) {
      const clampedT = Math.max(0, Math.min(1, rampT));
      // Smoothstep suave para evitar saltos bruscos no pé e no topo da rampa
      const smooth = clampedT * clampedT * (3 - 2 * clampedT);
      h = Math.max(h, smooth * m.topY);
    }

    // Encosta cónica contínua em toda a volta (sem degrau invisível!)
    if (dist <= m.outerRadius) {
      const slopeT = 1 - (dist - m.topRadius) / (m.outerRadius - m.topRadius);
      const clamped = Math.max(0, Math.min(1, slopeT));
      const smoothSlope = clamped * clamped * (3 - 2 * clamped);
      h = Math.max(h, smoothSlope * m.topY);
    }
  }

  return h;
}

/**
 * Calcula pitch e roll suaves do veículo segundo a inclinação do terreno nos 4 cantos.
 */
export function getVehicleSlopeAngles(
  x: number,
  z: number,
  yaw: number,
  halfLength = 1.9,
  halfWidth = 0.95
): { pitch: number; roll: number; centerHeight: number } {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  const fx = x + sinY * halfLength;
  const fz = z + cosY * halfLength;
  const bx = x - sinY * halfLength;
  const bz = z - cosY * halfLength;

  const rx = x + cosY * halfWidth;
  const rz = z - sinY * halfWidth;
  const lx = x - cosY * halfWidth;
  const lz = z + sinY * halfWidth;

  const hCenter = getSurfaceHeightAt(x, z, 2);
  const hFront = getSurfaceHeightAt(fx, fz, hCenter);
  const hBack = getSurfaceHeightAt(bx, bz, hCenter);
  const hRight = getSurfaceHeightAt(rx, rz, hCenter);
  const hLeft = getSurfaceHeightAt(lx, lz, hCenter);

  const avgY = (hFront + hBack + hRight + hLeft + hCenter) / 5;
  const pitch = Math.atan2(hBack - hFront, halfLength * 2);
  const roll = Math.atan2(hRight - hLeft, halfWidth * 2);

  return {
    pitch: Math.max(-0.45, Math.min(0.45, pitch)),
    roll: Math.max(-0.35, Math.min(0.35, roll)),
    centerHeight: Math.max(-0.35, avgY),
  };
}
