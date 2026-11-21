/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { OwnedVehicleRecord, VehicleCategory, VehicleLiveryPattern, VehiclePhysicsProfile } from '../types';
import { ANGO_REAL_STOPS, VEHICLE_CATALOG, VEHICLE_SKIN_PRESETS, getVehiclePhysicsProfile } from '../data/catalog';
import { getSurfaceHeightAt } from './terrainPhysics';

export interface TrafficPhase {
  nsGreen: boolean;
  ewGreen: boolean;
  isYellow: boolean;
}

export interface TrafficCar {
  mesh: THREE.Group;
  wheels: THREE.Mesh[];
  axis: 'x' | 'z';
  minCoord: number;
  maxCoord: number;
  fixedCoord: number;
  direction: 1 | -1;
  speed: number;
  currentSpeed: number;
  headlights: THREE.Mesh[];
  taillights?: THREE.Mesh[];
  isStopped?: boolean;
}

export interface DrivableVehicle {
  id: string;
  modelId: string;
  name: string;
  type: VehicleCategory;
  plate: string;
  color: string;
  accentColor?: string;
  skinId?: string;
  ownerId: string | null;
  isLocked: boolean;
  engineOn: boolean;
  headlightsOn: boolean;
  fuel: number; // 0 - 100
  health: number; // 0 - 100
  mileageKm: number;
  engineLevel: number;
  suspensionLevel: number;
  wheelStyle: 'padrao' | 'desportiva' | 'offroad';
  mesh: THREE.Group;
  bodyPivot: THREE.Group;
  wheels: THREE.Mesh[];
  bodyMaterials: THREE.MeshStandardMaterial[];
  rimMaterials?: THREE.MeshStandardMaterial[];
  liveryMaterials?: THREE.MeshStandardMaterial[];
  sirenMeshes?: THREE.Mesh[];
  steeringWheelMesh?: THREE.Mesh;
  seatOffsets: [number, number, number][];
  physics: VehiclePhysicsProfile;
  rpm: number;
  currentGear: number;
  position: THREE.Vector3;
  velocity: number;
  steering: number;
  rotationY: number;
  maxSpeed: number;
  acceleration: number;
  headlights: THREE.Mesh[];
  taillights: THREE.Mesh[];
  leftBlinkers: THREE.Mesh[];
  rightBlinkers: THREE.Mesh[];
  blinkerMode: 'off' | 'left' | 'right' | 'hazard';
}

function createLicensePlateMesh(plateText: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 250, 58);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateText.slice(0, 12), 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.17),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
}

function createVehicleLiveryTexture(
  baseColor: string,
  accentColor: string,
  pattern: VehicleLiveryPattern,
  badgeText?: string,
  isTopHood = false
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 256);

  if (pattern === 'tribal_slash') {
    // Faixas diagonais agressivas estilo BMW M4/M5, C63, Audi RS7, Charger
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(40, 256);
    ctx.lineTo(290, 60);
    ctx.lineTo(355, 60);
    ctx.lineTo(155, 256);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(210, 256);
    ctx.lineTo(420, 20);
    ctx.lineTo(485, 20);
    ctx.lineTo(295, 256);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(150, 256);
    ctx.lineTo(370, 50);
    ctx.lineTo(395, 50);
    ctx.lineTo(190, 256);
    ctx.closePath();
    ctx.fill();
  } else if (pattern === 'racing_stripes') {
    if (isTopHood) {
      // Listras duplas centrais no capô e teto (Camaro, Porsche 911, Aventador, GTR Red)
      ctx.fillStyle = accentColor;
      ctx.fillRect(195, 0, 48, 256);
      ctx.fillRect(269, 0, 48, 256);
    } else {
      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 178, 512, 42);
      ctx.fillRect(0, 152, 512, 12);
    }
  } else if (pattern === 'kanji_drift') {
    if (isTopHood) {
      ctx.fillStyle = accentColor;
      ctx.fillRect(185, 0, 55, 256);
      ctx.fillRect(272, 0, 55, 256);
    } else {
      // Decalque Drift Kanji (Toyota Supra Ciano)
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(60, 256);
      ctx.lineTo(240, 40);
      ctx.lineTo(310, 40);
      ctx.lineTo(140, 256);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#09090b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.font = 'bold 124px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(badgeText || '侍', 295, 130);
      ctx.fillText(badgeText || '侍', 295, 130);
    }
  } else if (pattern === 'two_tone') {
    if (isTopHood) {
      ctx.fillStyle = accentColor;
      ctx.fillRect(96, 0, 320, 256);
    } else {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(310, 256);
      ctx.lineTo(470, 18);
      ctx.lineTo(512, 18);
      ctx.lineTo(512, 256);
      ctx.closePath();
      ctx.fill();

      // Escudo amarelo estilo Ferrari / McLaren badge
      ctx.fillStyle = '#facc15';
      ctx.fillRect(130, 86, 44, 54);
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 4;
      ctx.strokeRect(130, 86, 44, 54);
    }
  }

  if (!isTopHood && badgeText && pattern !== 'kanji_drift') {
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(badgeText, 256, 128);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(badgeText, 256, 128);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSculptedProfileGeometry(
  points: [number, number][],
  width: number,
  bevelThickness = 0.06,
  bevelSize = 0.05
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const innerW = Math.max(0.2, width - bevelThickness * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize,
    bevelThickness,
  });
  // Centra em Z antes de rodar -90° em Y: local X (comprimento) -> +Z frente, local Z (largura) -> X centrado
  geo.translate(0, 0, -innerW / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

let _sharedWheelDarkRimMat: THREE.MeshStandardMaterial | null = null;
let _sharedWheelDiscMat: THREE.MeshStandardMaterial | null = null;
const _wheelGeoCache = new Map<
  string,
  {
    tireGeo: THREE.BufferGeometry;
    barrelGeo: THREE.BufferGeometry;
    lipGeo: THREE.BufferGeometry;
    spokeGeo: THREE.BufferGeometry;
    capGeo: THREE.BufferGeometry;
    discGeo: THREE.BufferGeometry;
  }
>();

function buildDetailedWheel(
  radius: number,
  width: number,
  tireMat: THREE.Material,
  rimMat: THREE.Material,
  isLeftSide: boolean
): THREE.Mesh {
  if (!_sharedWheelDarkRimMat) {
    _sharedWheelDarkRimMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.7 });
  }
  if (!_sharedWheelDiscMat) {
    _sharedWheelDiscMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.25 });
  }
  const key = `${radius.toFixed(3)}x${width.toFixed(3)}`;
  let geos = _wheelGeoCache.get(key);
  if (!geos) {
    const rimRadius = radius * 0.66;
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width + 0.015, 14);
    barrelGeo.rotateZ(Math.PI / 2);
    const lipGeo = new THREE.TorusGeometry(rimRadius * 0.92, radius * 0.055, 5, 14);
    const spokeGeo = new THREE.BoxGeometry(0.035, rimRadius * 1.75, radius * 0.12);
    const capGeo = new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.05, 8);
    capGeo.rotateZ(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(radius * 0.44, radius * 0.44, width * 0.4, 10);
    discGeo.rotateZ(Math.PI / 2);
    geos = { tireGeo, barrelGeo, lipGeo, spokeGeo, capGeo, discGeo };
    _wheelGeoCache.set(key, geos);
  }

  const tire = new THREE.Mesh(geos.tireGeo, tireMat);
  tire.add(new THREE.Mesh(geos.barrelGeo, _sharedWheelDarkRimMat));

  const outerX = isLeftSide ? width * 0.51 : -width * 0.51;
  const lipRing = new THREE.Mesh(geos.lipGeo, rimMat);
  lipRing.rotation.y = Math.PI / 2;
  lipRing.position.x = outerX;
  tire.add(lipRing);

  for (let s = 0; s < 3; s++) {
    const spoke = new THREE.Mesh(geos.spokeGeo, rimMat);
    spoke.rotation.x = (s / 3) * Math.PI;
    spoke.position.x = outerX;
    tire.add(spoke);
  }

  const cap = new THREE.Mesh(geos.capGeo, rimMat);
  cap.position.x = outerX;
  tire.add(cap);

  const disc = new THREE.Mesh(geos.discGeo, _sharedWheelDiscMat);
  tire.add(disc);

  return tire;
}

function buildWheelArchFlares(
  car: THREE.Group,
  positions: [number, number, number][],
  archRadius: number,
  flareMat: THREE.Material
) {
  const archGeo = new THREE.TorusGeometry(archRadius, 0.065, 6, 12, Math.PI);
  for (const [wx, wy, wz] of positions) {
    const arch = new THREE.Mesh(archGeo, flareMat);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(wx > 0 ? wx - 0.06 : wx + 0.06, wy + 0.03, wz);
    car.add(arch);
  }
}

function buildCabinInterior(
  car: THREE.Group,
  cabinCenterZ: number,
  seatBaseY: number,
  scaleW = 1,
  includeRearBench = true
): THREE.Mesh {
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.4 });

  // Bancos dianteiros com encosto e apoio de cabeça (driver à esquerda +X em Angola)
  for (const sx of [-0.36 * scaleW, 0.36 * scaleW]) {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scaleW, 0.12, 0.46), seatMat);
    cushion.position.set(sx, seatBaseY, cabinCenterZ + 0.14);
    car.add(cushion);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scaleW, 0.46, 0.12), seatMat);
    backrest.position.set(sx, seatBaseY + 0.24, cabinCenterZ - 0.08);
    backrest.rotation.x = -0.16;
    car.add(backrest);

    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scaleW, 0.15, 0.09), trimMat);
    headrest.position.set(sx, seatBaseY + 0.54, cabinCenterZ - 0.13);
    car.add(headrest);
  }

  if (includeRearBench) {
    const rearSeat = new THREE.Mesh(new THREE.BoxGeometry(1.18 * scaleW, 0.14, 0.44), seatMat);
    rearSeat.position.set(0, seatBaseY, cabinCenterZ - 0.58);
    car.add(rearSeat);
    const rearBack = new THREE.Mesh(new THREE.BoxGeometry(1.18 * scaleW, 0.42, 0.14), seatMat);
    rearBack.position.set(0, seatBaseY + 0.22, cabinCenterZ - 0.76);
    rearBack.rotation.x = -0.14;
    car.add(rearBack);
  }

  // Tablier / Painel + ecrã central + volante com raio rotativo
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.26 * scaleW, 0.22, 0.32), dashMat);
  dash.position.set(0, seatBaseY + 0.24, cabinCenterZ + 0.62);
  car.add(dash);

  const steeringRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 14), trimMat);
  steeringRim.position.set(0.36 * scaleW, seatBaseY + 0.34, cabinCenterZ + 0.44);
  steeringRim.rotation.x = -0.45;
  const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.028, 0.022), trimMat);
  steeringRim.add(spokeH);
  const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.12, 0.022), trimMat);
  spokeV.position.y = -0.06;
  steeringRim.add(spokeV);
  car.add(steeringRim);
  return steeringRim;
}

export function createSedanCar(
  colorHex: number,
  _plateText: string
): {
  mesh: THREE.Group;
  wheels: THREE.Mesh[];
  headlights: THREE.Mesh[];
  taillights: THREE.Mesh[];
  bodyMat: THREE.MeshStandardMaterial;
  steeringWheelMesh: THREE.Mesh;
} {
  const car = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  const taillights: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.2,
    metalness: 0.52,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.35,
    transparent: true,
    opacity: 0.52,
  });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.82 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.45 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.88, roughness: 0.18 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.12 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.8 });
  const redLightMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.65 });

  // Silhueta esculpida estilo Brookhaven Sedan (capô inclinado + tejadilho curvo + porta-bagagens)
  const lowerGeo = createSculptedProfileGeometry(
    [
      [-1.92, 0.28],
      [1.92, 0.28],
      [1.96, 0.52],
      [1.86, 0.82],
      [0.88, 0.94],
      [-1.12, 0.96],
      [-1.88, 0.92],
      [-1.95, 0.54],
    ],
    1.84,
    0.07,
    0.05
  );
  const chassis = new THREE.Mesh(lowerGeo, bodyMat);
  chassis.castShadow = true;
  car.add(chassis);

  // Colunas & Tejadilho da Cabine (deixa janelas laterais e pára-brisas vazados com vidro transparente!)
  const roofGeo = createSculptedProfileGeometry(
    [
      [-1.24, 1.02],
      [-0.78, 1.48],
      [0.32, 1.48],
      [0.92, 0.94],
      [0.74, 0.94],
      [0.24, 1.38],
      [-0.72, 1.38],
      [-1.1, 1.0],
    ],
    1.54,
    0.05,
    0.03
  );
  const cabinRoof = new THREE.Mesh(roofGeo, bodyMat);
  cabinRoof.castShadow = true;
  car.add(cabinRoof);

  // Interior visível (bancos, tablier, volante)
  const steeringWheelMesh = buildCabinInterior(car, -0.15, 0.66, 0.95, true);

  // Pára-brisas frontal & traseiro inclinados + vidros laterais
  const winF = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.66), glassMat);
  winF.position.set(0, 1.22, 0.64);
  winF.rotation.x = -0.78;
  car.add(winF);

  const winR = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.62), glassMat);
  winR.position.set(0, 1.24, -1.0);
  winR.rotation.y = Math.PI;
  winR.rotation.x = -0.82;
  car.add(winR);

  for (const sx of [-0.76, 0.76]) {
    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.42), glassMat);
    sideGlass.position.set(sx, 1.18, -0.2);
    sideGlass.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.add(sideGlass);
    const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.1), trimMat);
    bPillar.position.set(sx * 0.99, 1.18, -0.22);
    car.add(bPillar);
  }

  // Para-choques frontal & traseiro + Grelha dianteira + Escapes duplos
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.24, 0.16), trimMat);
  bumperF.position.set(0, 0.4, 1.98);
  car.add(bumperF);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.22, 0.08), blackMat);
  grille.position.set(0, 0.65, 1.96);
  car.add(grille);

  const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.09), chromeMat);
  grilleBar.position.set(0, 0.66, 1.97);
  car.add(grilleBar);

  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.24, 0.16), trimMat);
  bumperR.position.set(0, 0.4, -1.98);
  car.add(bumperR);

  for (const ex of [-0.52, 0.52]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 8), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(ex, 0.3, -2.02);
    car.add(pipe);
  }

  const wheelPositions: [number, number, number][] = [
    [-0.92, 0.36, 1.18],
    [0.92, 0.36, 1.18],
    [-0.92, 0.36, -1.18],
    [0.92, 0.36, -1.18],
  ];
  buildWheelArchFlares(car, wheelPositions, 0.42, trimMat);
  wheelPositions.forEach(([wx, wy, wz]) => {
    const tire = buildDetailedWheel(0.36, 0.25, blackMat, rimMat, wx > 0);
    tire.position.set(wx, wy, wz);
    car.add(tire);
    wheels.push(tire);
  });

  // Faróis LED e lanternas traseiras estilizadas
  const hlGeo = new THREE.BoxGeometry(0.36, 0.14, 0.08);
  [-0.64, 0.64].forEach((lx) => {
    const hl = new THREE.Mesh(hlGeo, lightMat);
    hl.position.set(lx, 0.72, 1.96);
    car.add(hl);
    headlights.push(hl);

    const tl = new THREE.Mesh(hlGeo, redLightMat);
    tl.position.set(lx, 0.76, -1.96);
    car.add(tl);
    taillights.push(tl);
  });

  return { mesh: car, wheels, headlights, taillights, bodyMat, steeringWheelMesh };
}

function getDefaultSeatOffsets(type: VehicleCategory): [number, number, number][] {
  if (type === 'moto') {
    return [
      [0, 0.88, -0.15],
      [0, 0.92, -0.48],
    ];
  }
  if (type === 'pickup') {
    return [
      [0.36, 0.92, 0.25],
      [-0.36, 0.92, 0.25],
    ];
  }
  if (type === 'bus') {
    return [
      [0.5, 1.35, 2.7],
      [-0.5, 1.35, 2.7],
      [0.55, 1.35, 1.2],
      [-0.55, 1.35, 1.2],
    ];
  }
  if (type === 'suv' || type === 'candongueiro' || type === 'ambulance' || type === 'military') {
    return [
      [0.38, 0.9, 0.15],
      [-0.38, 0.9, 0.15],
      [0.38, 0.9, -0.65],
      [-0.38, 0.9, -0.65],
    ];
  }
  return [
    [0.36, 0.7, 0.1],
    [-0.36, 0.7, 0.1],
    [0.36, 0.7, -0.65],
    [-0.36, 0.7, -0.65],
  ];
}

export function getVehicleSeatWorldPosition(
  veh: Pick<DrivableVehicle, 'position' | 'rotationY' | 'seatOffsets'>,
  seatIndex: number,
  out = new THREE.Vector3()
): THREE.Vector3 {
  const offsets = veh.seatOffsets && veh.seatOffsets.length > 0 ? veh.seatOffsets : getDefaultSeatOffsets('taxi');
  const clampedIdx = Math.max(0, Math.min(offsets.length - 1, seatIndex));
  const [lx, ly, lz] = offsets[clampedIdx];
  const sinY = Math.sin(veh.rotationY);
  const cosY = Math.cos(veh.rotationY);
  out.set(
    veh.position.x + lx * cosY + lz * sinY,
    veh.position.y + ly,
    veh.position.z - lx * sinY + lz * cosY
  );
  return out;
}

function makeBaseVehicle(
  id: string,
  modelId: string,
  name: string,
  type: VehicleCategory,
  x: number,
  z: number,
  rotY: number,
  plate: string,
  color: string,
  maxSpeed: number,
  acceleration: number,
  mesh: THREE.Group,
  wheels: THREE.Mesh[],
  headlights: THREE.Mesh[],
  bodyMaterials: THREE.MeshStandardMaterial[],
  sirenMeshes?: THREE.Mesh[],
  taillights: THREE.Mesh[] = [],
  rimMaterials?: THREE.MeshStandardMaterial[],
  liveryMaterials?: THREE.MeshStandardMaterial[],
  skinId?: string,
  accentColor?: string,
  steeringWheelMesh?: THREE.Mesh
): DrivableVehicle {
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rotY;

  // Isola a carroçaria num subgrupo bodyPivot para simular inclinação de suspensão nas travagens e curvas
  const bodyPivot = new THREE.Group();
  const wheelSet = new Set<THREE.Object3D>(wheels);
  const bodyChildren = mesh.children.filter((ch) => !wheelSet.has(ch));
  for (const ch of bodyChildren) {
    mesh.remove(ch);
    bodyPivot.add(ch);
  }
  mesh.add(bodyPivot);

  // Calcula extensão da carroçaria para montar piscas dianteiros/traseiros e espelhos retrovisores
  const bounds = new THREE.Box3().setFromObject(bodyPivot);
  const halfW = Math.max(0.45, (bounds.max.x - bounds.min.x) * 0.5);
  const halfL = Math.max(1.0, (bounds.max.z - bounds.min.z) * 0.5);

  const leftBlinkers: THREE.Mesh[] = [];
  const rightBlinkers: THREE.Mesh[] = [];
  const blinkerGeo = new THREE.BoxGeometry(0.14, 0.12, 0.08);
  const leftBlinkerMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.12,
  });
  const rightBlinkerMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.12,
  });

  const bOffsetX = type === 'moto' ? 0.28 : Math.max(0.6, halfW - 0.14);
  const bY = type === 'moto' ? 0.72 : 0.72;
  const blFront = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
  blFront.position.set(bOffsetX, bY, halfL + 0.01);
  bodyPivot.add(blFront);
  leftBlinkers.push(blFront);

  const blRear = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
  blRear.position.set(bOffsetX, bY, -halfL - 0.01);
  bodyPivot.add(blRear);
  leftBlinkers.push(blRear);

  const brFront = new THREE.Mesh(blinkerGeo, rightBlinkerMat);
  brFront.position.set(-bOffsetX, bY, halfL + 0.01);
  bodyPivot.add(brFront);
  rightBlinkers.push(brFront);

  const brRear = new THREE.Mesh(blinkerGeo, rightBlinkerMat);
  brRear.position.set(-bOffsetX, bY, -halfL - 0.01);
  bodyPivot.add(brRear);
  rightBlinkers.push(brRear);

  if (type !== 'moto') {
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.35, metalness: 0.5 });
    const mirrorGeo = new THREE.BoxGeometry(0.22, 0.12, 0.14);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(mirrorGeo, mirrorMat);
      m.position.set(side * (halfW + 0.08), 1.15, halfL * 0.28);
      bodyPivot.add(m);
    }
  }

  return {
    id,
    modelId,
    name,
    type,
    plate,
    color,
    accentColor,
    skinId,
    ownerId: null,
    isLocked: false,
    engineOn: true,
    headlightsOn: true,
    fuel: 100,
    health: 100,
    mileageKm: 0,
    engineLevel: 1,
    suspensionLevel: 1,
    wheelStyle: 'padrao',
    mesh,
    bodyPivot,
    wheels,
    bodyMaterials,
    rimMaterials,
    liveryMaterials,
    sirenMeshes,
    steeringWheelMesh,
    seatOffsets: getDefaultSeatOffsets(type),
    physics: getVehiclePhysicsProfile(type, maxSpeed, acceleration),
    rpm: 850,
    currentGear: 1,
    position: new THREE.Vector3(x, 0, z),
    velocity: 0,
    steering: 0,
    rotationY: rotY,
    maxSpeed,
    acceleration,
    headlights,
    taillights,
    leftBlinkers,
    rightBlinkers,
    blinkerMode: 'off',
  };
}

export function createCandongueiroVehicle(
  x: number,
  z: number,
  rotY: number,
  id = 'candongueiro-main',
  colorHex = '#1d4ed8',
  plate = 'LD-14-82-RP'
): DrivableVehicle {
  const van = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];

  const blueMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.26, metalness: 0.38 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.26, metalness: 0.25 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.82 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.85, roughness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.4,
    transparent: true,
    opacity: 0.56,
  });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.78 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.65 });

  // Carroçaria HiAce esculpida com frente inclinada
  const lowerGeo = createSculptedProfileGeometry(
    [
      [-2.2, 0.32],
      [2.18, 0.32],
      [2.24, 0.7],
      [2.1, 1.38],
      [-2.2, 1.38],
      [-2.24, 0.68],
    ],
    2.02,
    0.07,
    0.04
  );
  const lower = new THREE.Mesh(lowerGeo, blueMat);
  lower.castShadow = true;
  van.add(lower);

  const upperGeo = createSculptedProfileGeometry(
    [
      [-2.18, 1.34],
      [2.08, 1.34],
      [1.72, 2.38],
      [-2.1, 2.42],
    ],
    1.94,
    0.06,
    0.04
  );
  const upper = new THREE.Mesh(upperGeo, whiteMat);
  upper.castShadow = true;
  van.add(upper);

  // Bagageira no teto do Candongueiro
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 2.8), trimMat);
  rack.position.set(0, 2.52, -0.35);
  van.add(rack);

  // Interior com bancos e volante
  const steeringWheelMesh = buildCabinInterior(van, 0.8, 0.88, 1.05, true);

  const frontWindshield = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 0.88), glassMat);
  frontWindshield.position.set(0, 1.88, 1.94);
  frontWindshield.rotation.x = -0.34;
  van.add(frontWindshield);

  const rearWindshield = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.78), glassMat);
  rearWindshield.position.set(0, 1.88, -2.18);
  rearWindshield.rotation.y = Math.PI;
  van.add(rearWindshield);

  const sideWinGeo = new THREE.PlaneGeometry(3.25, 0.66);
  for (const sx of [-1.01, 1.01]) {
    const sw = new THREE.Mesh(sideWinGeo, glassMat);
    sw.position.set(sx, 1.86, -0.2);
    sw.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    van.add(sw);
    for (const pz of [-1.0, 0.1, 1.1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.12), trimMat);
      pillar.position.set(sx * 0.99, 1.86, pz);
      van.add(pillar);
    }
  }

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.26, 0.18), trimMat);
  bumperF.position.set(0, 0.44, 2.24);
  van.add(bumperF);

  const wheelPositions: [number, number, number][] = [
    [-1.02, 0.42, 1.32],
    [1.02, 0.42, 1.32],
    [-1.02, 0.42, -1.32],
    [1.02, 0.42, -1.32],
  ];
  buildWheelArchFlares(van, wheelPositions, 0.48, trimMat);
  wheelPositions.forEach(([wx, wy, wz]) => {
    const tire = buildDetailedWheel(0.42, 0.32, blackMat, rimMat, wx > 0);
    tire.position.set(wx, wy, wz);
    van.add(tire);
    wheels.push(tire);
  });

  const headGeo = new THREE.BoxGeometry(0.36, 0.2, 0.1);
  const hlL = new THREE.Mesh(headGeo, lightMat);
  hlL.position.set(-0.7, 0.95, 2.26);
  van.add(hlL);
  headlights.push(hlL);

  const hlR = new THREE.Mesh(headGeo, lightMat);
  hlR.position.set(0.7, 0.95, 2.26);
  van.add(hlR);
  headlights.push(hlR);

  const tlL = new THREE.Mesh(headGeo, redMat);
  tlL.position.set(-0.75, 1.0, -2.26);
  van.add(tlL);

  const tlR = new THREE.Mesh(headGeo, redMat);
  tlR.position.set(0.75, 1.0, -2.26);
  van.add(tlR);

  const taillights = [tlL, tlR];

  const grill = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.3, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.14 })
  );
  grill.position.set(0, 0.85, 2.26);
  van.add(grill);

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 48;
  const sctx = signCanvas.getContext('2d')!;
  sctx.fillStyle = '#1d4ed8';
  sctx.fillRect(0, 0, 256, 48);
  sctx.strokeStyle = '#ffffff';
  sctx.lineWidth = 4;
  sctx.strokeRect(2, 2, 252, 44);
  sctx.fillStyle = '#ffffff';
  sctx.font = 'bold 16px sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText('MUTAMBA • VIANA', 128, 24);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.3 }));
  signMesh.position.set(1.06, 1.28, 0);
  signMesh.rotateY(Math.PI / 2);
  van.add(signMesh);

  return makeBaseVehicle(
    id,
    'candongueiro_hiace',
    'Candongueiro HiAce 🇦🇴',
    'candongueiro',
    x,
    z,
    rotY,
    plate,
    colorHex,
    25,
    16,
    van,
    wheels,
    headlights,
    [blueMat],
    undefined,
    taillights,
    undefined,
    undefined,
    undefined,
    undefined,
    steeringWheelMesh
  );
}

export function createTaxiVehicle(
  x: number,
  z: number,
  rotY: number,
  id = 'taxi-yellow',
  colorHex = '#facc15',
  plate = 'LD-44-12-TX'
): DrivableVehicle {
  const { mesh, wheels, headlights, taillights, bodyMat, steeringWheelMesh } = createSedanCar(new THREE.Color(colorHex).getHex(), plate);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.22, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 0.45 })
  );
  sign.position.set(0, 1.63, -0.2);
  mesh.add(sign);

  return makeBaseVehicle(
    id,
    'taxi_i10',
    'Táxi Amarelo de Luanda 🚕',
    'taxi',
    x,
    z,
    rotY,
    plate,
    colorHex,
    28,
    18,
    mesh,
    wheels,
    headlights,
    [bodyMat],
    undefined,
    taillights,
    undefined,
    undefined,
    undefined,
    undefined,
    steeringWheelMesh
  );
}

export function createSuvVehicle(
  x: number,
  z: number,
  rotY: number,
  id = 'suv-prado',
  colorHex = '#0f172a',
  plate = 'LD-99-01-TL',
  skinId?: string
): DrivableVehicle {
  const suv = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, metalness: 0.58 });
  const liverySideMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.48 });
  const liveryHoodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.48 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.88, roughness: 0.18 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.82 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.4 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    roughness: 0.08,
    metalness: 0.45,
    transparent: true,
    opacity: 0.54,
  });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0xe0f2fe, emissiveIntensity: 0.85 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.65 });

  // Silhueta SUV muscular (estilo Range Rover Sport / Lamborghini Urus)
  const lowerGeo = createSculptedProfileGeometry(
    [
      [-2.2, 0.36],
      [2.2, 0.36],
      [2.24, 0.68],
      [2.12, 1.15],
      [1.0, 1.26],
      [-2.15, 1.26],
      [-2.22, 0.64],
    ],
    2.1,
    0.07,
    0.05
  );
  const chassis = new THREE.Mesh(lowerGeo, bodyMat);
  chassis.castShadow = true;
  suv.add(chassis);

  // Tejadilho SUV & colunas
  const roofGeo = createSculptedProfileGeometry(
    [
      [-2.05, 1.24],
      [-1.72, 1.98],
      [0.42, 1.98],
      [1.04, 1.24],
      [0.84, 1.24],
      [0.34, 1.88],
      [-1.62, 1.88],
      [-1.9, 1.24],
    ],
    1.86,
    0.05,
    0.04
  );
  const cabinRoof = new THREE.Mesh(roofGeo, bodyMat);
  cabinRoof.castShadow = true;
  suv.add(cabinRoof);

  // Barras longitudinais no tejadilho
  for (const rx of [-0.74, 0.74]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.0), trimMat);
    rail.position.set(rx, 2.06, -0.65);
    suv.add(rail);
  }

  const steeringWheelMesh = buildCabinInterior(suv, -0.25, 0.9, 1.1, true);

  // Painéis de livery laterais + capô (Urus & Range Rover Sport)
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.74), liverySideMat);
  sideL.position.set(-1.11, 0.82, 0);
  sideL.rotation.y = -Math.PI / 2;
  suv.add(sideL);

  const sideR = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.74), liverySideMat);
  sideR.position.set(1.11, 0.82, 0);
  sideR.rotation.y = Math.PI / 2;
  suv.add(sideR);

  const hoodDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 1.15), liveryHoodMat);
  hoodDecal.position.set(0, 1.28, 1.52);
  hoodDecal.rotation.x = -Math.PI / 2;
  suv.add(hoodDecal);

  const winF = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.78), glassMat);
  winF.position.set(0, 1.62, 0.76);
  winF.rotation.x = -0.68;
  suv.add(winF);

  const winR = new THREE.Mesh(new THREE.PlaneGeometry(1.64, 0.72), glassMat);
  winR.position.set(0, 1.64, -1.88);
  winR.rotation.y = Math.PI;
  winR.rotation.x = -0.35;
  suv.add(winR);

  for (const sx of [-0.94, 0.94]) {
    const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.56), glassMat);
    sideWin.position.set(sx, 1.6, -0.56);
    sideWin.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    suv.add(sideWin);
  }

  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.34, 0.1), blackMat);
  grille.position.set(0, 0.85, 2.24);
  suv.add(grille);

  for (const ex of [-0.65, 0.65]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(ex, 0.38, -2.26);
    suv.add(pipe);
  }

  const wheelPositions: [number, number, number][] = [
    [-1.08, 0.48, 1.32],
    [1.08, 0.48, 1.32],
    [-1.08, 0.48, -1.32],
    [1.08, 0.48, -1.32],
  ];
  buildWheelArchFlares(suv, wheelPositions, 0.55, trimMat);
  wheelPositions.forEach(([wx, wy, wz]) => {
    const tire = buildDetailedWheel(0.48, 0.35, blackMat, rimMat, wx > 0);
    tire.position.set(wx, wy, wz);
    suv.add(tire);
    wheels.push(tire);
  });

  const hlGeo = new THREE.BoxGeometry(0.44, 0.16, 0.1);
  const hlL = new THREE.Mesh(hlGeo, lightMat);
  hlL.position.set(-0.76, 0.9, 2.24);
  suv.add(hlL);
  headlights.push(hlL);
  const hlR = new THREE.Mesh(hlGeo, lightMat);
  hlR.position.set(0.76, 0.9, 2.24);
  suv.add(hlR);
  headlights.push(hlR);

  const tlL = new THREE.Mesh(hlGeo, redMat);
  tlL.position.set(-0.76, 0.96, -2.24);
  suv.add(tlL);
  const tlR = new THREE.Mesh(hlGeo, redMat);
  tlR.position.set(0.76, 0.96, -2.24);
  suv.add(tlR);

  const plateF = createLicensePlateMesh(plate);
  plateF.position.set(0, 0.54, 2.27);
  suv.add(plateF);
  const plateR = createLicensePlateMesh(plate);
  plateR.position.set(0, 0.62, -2.27);
  plateR.rotation.y = Math.PI;
  suv.add(plateR);

  const v = makeBaseVehicle(
    id,
    'suv_prado',
    'Toyota Prado Executivo (SUV) 🚘',
    'suv',
    x,
    z,
    rotY,
    plate,
    colorHex,
    33,
    21,
    suv,
    wheels,
    headlights,
    [bodyMat],
    undefined,
    [tlL, tlR],
    [rimMat],
    [liverySideMat, liveryHoodMat],
    skinId,
    undefined,
    steeringWheelMesh
  );
  applyVehicleUpgrades(v);
  return v;
}

export function createPoliceVehicle(x: number, z: number, rotY: number, id = 'policia-pna-1', plate = 'PNA-01-LD'): DrivableVehicle {
  const { mesh, wheels, headlights, taillights, bodyMat, steeringWheelMesh } = createSedanCar(0x1e3a8a, plate);
  const whiteStripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.36, 1.58),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
  );
  whiteStripe.position.set(0, 0.66, 0);
  mesh.add(whiteStripe);

  const sirenMeshes: THREE.Mesh[] = [];
  const blueLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.16, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.5 })
  );
  blueLamp.position.set(-0.3, 1.58, -0.22);
  mesh.add(blueLamp);
  sirenMeshes.push(blueLamp);

  const redLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.16, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.5 })
  );
  redLamp.position.set(0.3, 1.58, -0.22);
  mesh.add(redLamp);
  sirenMeshes.push(redLamp);

  return makeBaseVehicle(
    id,
    'viatura_policia',
    'Viatura Polícia Nacional (PNA) 🚓',
    'police',
    x,
    z,
    rotY,
    plate,
    '#1e3a8a',
    35,
    24,
    mesh,
    wheels,
    headlights,
    [bodyMat],
    sirenMeshes,
    taillights,
    undefined,
    undefined,
    undefined,
    undefined,
    steeringWheelMesh
  );
}

export function createAmbulanceVehicle(x: number, z: number, rotY: number, id = 'inema-amb-1', plate = 'INEMA-04'): DrivableVehicle {
  const amb = createCandongueiroVehicle(x, z, rotY, id, '#f8fafc', plate);
  amb.modelId = 'ambulancia_inema';
  amb.name = 'Ambulância INEMA 🚑';
  amb.type = 'ambulance';
  amb.maxSpeed = 32;
  amb.acceleration = 21;

  const crossMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.35 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.65, 0.2), crossMat);
  c1.position.set(1.06, 1.45, 0);
  amb.mesh.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.65), crossMat);
  c2.position.set(1.06, 1.45, 0);
  amb.mesh.add(c2);

  const strobeL = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.16, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.4 })
  );
  strobeL.position.set(-0.34, 2.55, 1.15);
  amb.mesh.add(strobeL);

  const strobeR = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.16, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.4 })
  );
  strobeR.position.set(0.34, 2.55, 1.15);
  amb.mesh.add(strobeR);
  amb.sirenMeshes = [strobeL, strobeR];

  return amb;
}

export function createMotoVehicle(
  x: number,
  z: number,
  rotY: number,
  id = 'kupapata-1',
  colorHex = '#dc2626',
  plate = 'LD-77-KP'
): DrivableVehicle {
  const moto = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.24, metalness: 0.5 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.18 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.85 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.65 });

  // Quadro e motor esculpido
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.52), chromeMat);
  engineBlock.position.set(0, 0.48, 0.05);
  moto.add(engineBlock);

  const tankGeo = createSculptedProfileGeometry(
    [
      [-0.78, 0.72],
      [0.48, 0.7],
      [0.62, 0.92],
      [0.18, 1.04],
      [-0.12, 0.86],
      [-0.78, 0.9],
    ],
    0.34,
    0.04,
    0.03
  );
  const frame = new THREE.Mesh(tankGeo, bodyMat);
  frame.castShadow = true;
  moto.add(frame);

  // Escape cromado lateral
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.95, 8), chromeMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.2, 0.42, -0.35);
  moto.add(exhaust);

  // Garfo dianteiro inclinado & guarda-lamas
  for (const fx of [-0.11, 0.11]) {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.82, 8), chromeMat);
    fork.position.set(fx, 0.72, 0.56);
    fork.rotation.x = 0.35;
    moto.add(fork);
  }
  const frontFender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.36), bodyMat);
  frontFender.position.set(0, 0.66, 0.68);
  frontFender.rotation.x = 0.25;
  moto.add(frontFender);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.74), blackMat);
  seat.position.set(0, 0.88, -0.24);
  moto.add(seat);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 8), chromeMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 1.08, 0.46);
  moto.add(handle);

  const frontW = buildDetailedWheel(0.33, 0.16, blackMat, chromeMat, true);
  frontW.position.set(0, 0.33, 0.7);
  moto.add(frontW);
  wheels.push(frontW);

  const rearW = buildDetailedWheel(0.33, 0.18, blackMat, chromeMat, true);
  rearW.position.set(0, 0.33, -0.68);
  moto.add(rearW);
  wheels.push(rearW);

  const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 10), lightMat);
  hl.rotation.x = Math.PI / 2;
  hl.position.set(0, 0.94, 0.66);
  moto.add(hl);
  headlights.push(hl);

  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.08), redMat);
  tl.position.set(0, 0.86, -0.82);
  moto.add(tl);

  return makeBaseVehicle(
    id,
    'moto_kupapata',
    'Kupapata 150cc 🏍️',
    'moto',
    x,
    z,
    rotY,
    plate,
    colorHex,
    29,
    22,
    moto,
    wheels,
    headlights,
    [bodyMat],
    undefined,
    [tl],
    undefined,
    undefined,
    undefined,
    undefined,
    handle
  );
}

export function createPickupOrTruckVehicle(
  type: 'pickup' | 'truck' | 'bus',
  x: number,
  z: number,
  rotY: number,
  id: string,
  colorHex: string,
  plate: string
): DrivableVehicle {
  const grp = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  let steeringWheelMesh: THREE.Mesh | undefined;
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.28, metalness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.85, roughness: 0.22 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.4,
    transparent: true,
    opacity: 0.56,
  });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.8 });

  if (type === 'bus') {
    const busWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.24, metalness: 0.2 });
    const busBlueMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.26, metalness: 0.35 });
    const busGoldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.4 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7 });

    // Carroceria principal esculpida ANGO REAL (saia azul + topo branco)
    const lowerGeo = createSculptedProfileGeometry(
      [
        [-3.45, 0.34],
        [3.45, 0.34],
        [3.52, 0.72],
        [3.48, 1.48],
        [-3.48, 1.48],
        [-3.50, 0.72],
      ],
      2.42,
      0.07,
      0.04
    );
    const lowerBody = new THREE.Mesh(lowerGeo, busBlueMat);
    lowerBody.castShadow = true;
    grp.add(lowerBody);

    const upperGeo = createSculptedProfileGeometry(
      [
        [-3.46, 1.48],
        [3.46, 1.48],
        [3.38, 2.74],
        [-3.40, 2.78],
      ],
      2.38,
      0.07,
      0.04
    );
    const upperBody = new THREE.Mesh(upperGeo, busWhiteMat);
    upperBody.castShadow = true;
    grp.add(upperBody);

    // Faixa dourada + laterais ANGO REAL
    for (const sx of [-1.23, 1.23]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 6.7), busGoldMat);
      stripe.position.set(sx, 1.44, 0);
      grp.add(stripe);

      const sideW = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.88), glassMat);
      sideW.position.set(sx, 2.04, 0.05);
      sideW.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      grp.add(sideW);

      // Pilares das janelas para realismo
      for (let wz = -2.3; wz <= 2.3; wz += 1.15) {
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.92, 0.1), darkMat);
        mullion.position.set(sx * 0.99, 2.04, wz);
        grp.add(mullion);
      }

      // Espelhos retrovisores longos
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.16), darkMat);
      mirror.position.set(sx * 1.12, 1.98, 3.35);
      grp.add(mirror);
    }

    // Bancos visíveis dentro do autocarro
    for (let sz = -2.2; sz <= 2.0; sz += 1.05) {
      for (const sbx of [-0.62, 0.62]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.65, 0.55), seatMat);
        seat.position.set(sbx, 1.45, sz);
        grp.add(seat);
      }
    }

    // Portas duplas de embarque lado direito (-X ou +X consoante passeio)
    for (const dz of [-1.5, 2.25]) {
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.78, 0.96), darkMat);
      doorFrame.position.set(-1.21, 1.38, dz);
      grp.add(doorFrame);
    }

    // Pára-brisas panorâmico + letreiro luminoso "ANGO REAL • LUANDA"
    const winF = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 1.02), glassMat);
    winF.position.set(0, 1.92, 3.46);
    grp.add(winF);

    const signC = document.createElement('canvas');
    signC.width = 512;
    signC.height = 96;
    const sctx = signC.getContext('2d')!;
    sctx.fillStyle = '#09090b';
    sctx.fillRect(0, 0, 512, 96);
    sctx.fillStyle = '#facc15';
    sctx.font = 'bold 34px monospace';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('ANGO REAL • LUANDA', 256, 48);
    const ledTex = new THREE.CanvasTexture(signC);
    ledTex.colorSpace = THREE.SRGBColorSpace;
    const ledSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.88, 0.34),
      new THREE.MeshBasicMaterial({ map: ledTex })
    );
    ledSign.position.set(0, 2.55, 3.44);
    grp.add(ledSign);

    // Letreiro lateral
    const sideBannerC = document.createElement('canvas');
    sideBannerC.width = 512;
    sideBannerC.height = 96;
    const sbctx = sideBannerC.getContext('2d')!;
    sbctx.fillStyle = '#1e3a8a';
    sbctx.fillRect(0, 0, 512, 96);
    sbctx.fillStyle = '#facc15';
    sbctx.font = 'bold 42px sans-serif';
    sbctx.textAlign = 'center';
    sbctx.textBaseline = 'middle';
    sbctx.fillText('ANGO REAL EXPRESSO', 256, 48);
    const sideBannerTex = new THREE.CanvasTexture(sideBannerC);
    sideBannerTex.colorSpace = THREE.SRGBColorSpace;
    for (const sx of [-1.24, 1.24]) {
      const sb = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 0.45),
        new THREE.MeshBasicMaterial({ map: sideBannerTex })
      );
      sb.position.set(sx, 0.98, 0);
      sb.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      grp.add(sb);
    }

    // AC de teto & Pára-choques + Grelha + Farolins
    for (const acZ of [-1.3, 1.1]) {
      const acUnit = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.22, 1.15), busWhiteMat);
      acUnit.position.set(0, 2.86, acZ);
      grp.add(acUnit);
    }
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.28, 0.18), darkMat);
    bumperF.position.set(0, 0.48, 3.52);
    grp.add(bumperF);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.32, 0.08), darkMat);
    grille.position.set(0, 0.92, 3.5);
    grp.add(grille);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.78 });
    for (const tx of [-0.95, 0.95]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.08), redMat);
      tl.position.set(tx, 0.92, -3.48);
      grp.add(tl);
    }
  } else if (type === 'truck') {
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.18 });
    const cabGeo = createSculptedProfileGeometry(
      [
        [0.4, 0.38],
        [2.75, 0.38],
        [2.82, 0.85],
        [2.68, 2.48],
        [0.52, 2.58],
      ],
      2.28,
      0.07,
      0.05
    );
    const cab = new THREE.Mesh(cabGeo, bodyMat);
    cab.castShadow = true;
    grp.add(cab);
    const cabWin = new THREE.Mesh(new THREE.PlaneGeometry(1.98, 0.82), glassMat);
    cabWin.position.set(0, 1.95, 2.76);
    cabWin.rotation.x = -0.14;
    grp.add(cabWin);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.56, 0.1), chromeMat);
    grille.position.set(0, 0.95, 2.82);
    grp.add(grille);
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.28, 0.2), chromeMat);
    bumperF.position.set(0, 0.46, 2.86);
    grp.add(bumperF);
    // Escapes verticais cromados atrás da cabine
    for (const ex of [-1.05, 1.05]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), chromeMat);
      stack.position.set(ex, 1.85, 0.46);
      grp.add(stack);
    }
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(2.38, 2.25, 4.35),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.58 })
    );
    cargo.position.set(0, 1.72, -1.78);
    cargo.castShadow = true;
    grp.add(cargo);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.72 });
    for (const tx of [-0.95, 0.95]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), redMat);
      tl.position.set(tx, 0.68, -3.96);
      grp.add(tl);
    }
  } else {
    // Pickup 4x4 esculpida com caixa aberta, santantónio e interior visível
    const pickupGeo = createSculptedProfileGeometry(
      [
        [-2.2, 0.36],
        [2.16, 0.36],
        [2.22, 0.72],
        [2.12, 1.18],
        [1.18, 1.24],
        [-2.18, 1.24],
        [-2.22, 0.65],
      ],
      1.98,
      0.06,
      0.05
    );
    const chassis = new THREE.Mesh(pickupGeo, bodyMat);
    chassis.castShadow = true;
    grp.add(chassis);

    const cabRoofGeo = createSculptedProfileGeometry(
      [
        [-0.35, 1.22],
        [0.82, 1.22],
        [0.36, 1.88],
        [-0.32, 1.88],
      ],
      1.78,
      0.05,
      0.03
    );
    const cab = new THREE.Mesh(cabRoofGeo, bodyMat);
    cab.castShadow = true;
    grp.add(cab);

    steeringWheelMesh = buildCabinInterior(grp, 0.15, 0.88, 1.0, false);

    // Caçamba aberta + Roll-bar metálico (Santantónio)
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.16, 1.65), darkMat);
    bedFloor.position.set(0, 1.22, -1.25);
    grp.add(bedFloor);
    for (const rx of [-0.82, 0.82]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.58, 8), rimMat);
      bar.position.set(rx, 1.52, -0.48);
      grp.add(bar);
    }
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.68, 8), rimMat);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.set(0, 1.8, -0.48);
    grp.add(topBar);

    const winF = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.66), glassMat);
    winF.position.set(0, 1.56, 0.62);
    winF.rotation.x = -0.58;
    grp.add(winF);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.24, 0.18), darkMat);
    bumperF.position.set(0, 0.45, 2.24);
    grp.add(bumperF);
  }

  const zOff = type === 'bus' ? 2.1 : type === 'truck' ? 2.0 : 1.38;
  const xOff = type === 'pickup' ? 1.02 : 1.18;
  const wheelPts: [number, number, number][] = [
    [-xOff, 0.45, zOff],
    [xOff, 0.45, zOff],
    [-xOff, 0.45, -zOff],
    [xOff, 0.45, -zOff],
  ];
  buildWheelArchFlares(grp, wheelPts, 0.52, darkMat);
  wheelPts.forEach(([wx, wy, wz]) => {
    const tire = buildDetailedWheel(0.45, 0.34, darkMat, rimMat, wx > 0);
    tire.position.set(wx, wy, wz);
    grp.add(tire);
    wheels.push(tire);
  });

  const hlZ = type === 'bus' ? 3.46 : type === 'truck' ? 2.84 : 2.24;
  [-0.72, 0.72].forEach((hx) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.1), lightMat);
    hl.position.set(hx, 0.88, hlZ);
    grp.add(hl);
    headlights.push(hl);
  });

  const cat = VEHICLE_CATALOG.find((v) => v.type === type);
  return makeBaseVehicle(
    id,
    cat?.modelId || type,
    cat?.name || type,
    type,
    x,
    z,
    rotY,
    plate,
    colorHex,
    cat?.maxSpeed || 24,
    cat?.acceleration || 14,
    grp,
    wheels,
    headlights,
    [bodyMat],
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
    steeringWheelMesh
  );
}

export function createMilitaryJeepVehicle(
  x: number,
  z: number,
  rotY: number,
  id = 'jipe-faa-1',
  colorHex = '#3f4f2f',
  plate = 'FAA-01-AO'
): DrivableVehicle {
  const jeep = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  const taillights: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.68, metalness: 0.25 });
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x29321e, roughness: 0.62, metalness: 0.35 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.7, roughness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, transparent: true, opacity: 0.58 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.78 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.58 });

  const chassisGeo = createSculptedProfileGeometry(
    [
      [-2.15, 0.38],
      [2.16, 0.38],
      [2.2, 0.92],
      [1.98, 1.32],
      [0.85, 1.35],
      [-2.1, 1.35],
    ],
    2.12,
    0.06,
    0.04
  );
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  chassis.castShadow = true;
  jeep.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.78, 2.25), armorMat);
  cabin.position.set(0, 1.66, -0.45);
  cabin.castShadow = true;
  jeep.add(cabin);

  const winF = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.56), glassMat);
  winF.position.set(0, 1.65, 0.7);
  winF.rotation.x = -0.2;
  jeep.add(winF);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.32, 0.28), blackMat);
  bumper.position.set(0, 0.62, 2.26);
  jeep.add(bumper);

  // Roda sobressalente traseira
  const spare = buildDetailedWheel(0.42, 0.28, blackMat, rimMat, true);
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0, 1.05, -2.26);
  jeep.add(spare);

  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.35), blackMat);
  rack.position.set(0, 2.12, 0.1);
  jeep.add(rack);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), blackMat);
  antenna.position.set(-0.82, 2.0, -1.8);
  jeep.add(antenna);

  // Insignia FAA na porta lateral
  const signC = document.createElement('canvas');
  signC.width = 192;
  signC.height = 64;
  const sctx = signC.getContext('2d')!;
  sctx.fillStyle = '#29321e';
  sctx.fillRect(0, 0, 192, 64);
  sctx.fillStyle = '#dc2626';
  sctx.fillRect(0, 0, 192, 12);
  sctx.fillStyle = '#facc15';
  sctx.font = 'bold 28px sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText('FAA 🇦🇴', 96, 38);
  const signTex = new THREE.CanvasTexture(signC);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sideMat = new THREE.MeshBasicMaterial({ map: signTex });
  for (const sx of [-1.1, 1.1]) {
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.36), sideMat);
    badge.position.set(sx, 0.94, 0.1);
    badge.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    jeep.add(badge);
  }

  const jeepWheels: [number, number, number][] = [
    [-1.12, 0.48, 1.32],
    [1.12, 0.48, 1.32],
    [-1.12, 0.48, -1.32],
    [1.12, 0.48, -1.32],
  ];
  buildWheelArchFlares(jeep, jeepWheels, 0.56, blackMat);
  jeepWheels.forEach(([wx, wy, wz]) => {
    const tire = buildDetailedWheel(0.48, 0.38, blackMat, rimMat, wx > 0);
    tire.position.set(wx, wy, wz);
    jeep.add(tire);
    wheels.push(tire);
  });

  [-0.72, 0.72].forEach((lx) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.1), lightMat);
    hl.position.set(lx, 0.9, 2.24);
    jeep.add(hl);
    headlights.push(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.1), redMat);
    tl.position.set(lx, 0.9, -2.22);
    jeep.add(tl);
    taillights.push(tl);
  });

  return makeBaseVehicle(
    id,
    'jipe_faa',
    'Jipe Blindado FAA 🇦🇴',
    'military',
    x,
    z,
    rotY,
    plate,
    colorHex,
    34,
    23,
    jeep,
    wheels,
    headlights,
    [bodyMat],
    undefined,
    taillights
  );
}

export function createSportCarVehicle(
  category: 'sport' | 'supercar' | 'muscle',
  x: number,
  z: number,
  rotY: number,
  id: string,
  modelId: string,
  name: string,
  colorHex: string,
  plate: string,
  skinId?: string,
  accentColor?: string
): DrivableVehicle {
  const car = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  const taillights: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.14,
    metalness: 0.65,
  });
  const liverySideMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0.52,
  });
  const liveryHoodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0.52,
  });
  const rimMat = new THREE.MeshStandardMaterial({ color: accentColor || '#9333ea', metalness: 0.88, roughness: 0.16 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.45, metalness: 0.45 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.14 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    roughness: 0.06,
    metalness: 0.45,
    transparent: true,
    opacity: 0.52,
  });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x38bdf8, emissiveIntensity: 0.98 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.88 });

  const width = category === 'supercar' ? 2.04 : 1.96;
  const length = category === 'muscle' ? 4.38 : 4.24;
  const halfL = length / 2;

  // Silhueta desportiva baixa esculpida (Supercar wedge / Muscle / Sport Coupé)
  const noseH = category === 'supercar' ? 0.52 : 0.64;
  const deckH = category === 'supercar' ? 0.78 : 0.86;
  const bodyGeo = createSculptedProfileGeometry(
    [
      [-halfL, 0.24],
      [halfL, 0.24],
      [halfL + 0.06, noseH],
      [halfL - 0.35, deckH * 0.92],
      [0.85, deckH],
      [-halfL + 0.12, deckH + 0.04],
      [-halfL - 0.04, 0.52],
    ],
    width,
    0.07,
    0.05
  );
  const chassis = new THREE.Mesh(bodyGeo, bodyMat);
  chassis.castShadow = true;
  car.add(chassis);

  // Teto fastback desportivo com arcos e pilares esguios
  const roofH = category === 'supercar' ? 1.24 : 1.32;
  const cabinLen = category === 'supercar' ? 1.85 : 2.1;
  const roofGeo = createSculptedProfileGeometry(
    [
      [-1.36, deckH],
      [-0.78, roofH],
      [0.24, roofH],
      [0.86, deckH - 0.02],
      [0.68, deckH - 0.02],
      [0.16, roofH - 0.09],
      [-0.72, roofH - 0.09],
      [-1.2, deckH],
    ],
    width - 0.36,
    0.05,
    0.03
  );
  const cabin = new THREE.Mesh(roofGeo, bodyMat);
  cabin.castShadow = true;
  car.add(cabin);

  // Interior desportivo com bancos concha e volante
  const steeringWheelMesh = buildCabinInterior(car, -0.18, 0.54, 0.95, category !== 'supercar');

  // Splitter frontal em carbono + saias laterais + difusor traseiro + 4 ponteiras de escape
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.1, 0.36), carbonMat);
  splitter.position.set(0, 0.24, halfL + 0.07);
  car.add(splitter);

  for (const sx of [-width / 2 - 0.02, width / 2 + 0.02]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, length * 0.56), carbonMat);
    skirt.position.set(sx, 0.24, 0);
    car.add(skirt);
  }

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.16, 0.26), carbonMat);
  diffuser.position.set(0, 0.26, -halfL - 0.05);
  car.add(diffuser);

  for (const ex of [-0.62, -0.46, 0.46, 0.62]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), chromeMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(ex, 0.28, -halfL - 0.09);
    car.add(tip);
  }

  // Pára-brisas inclinado e vidro traseiro + vidros laterais
  const winF = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.44, 0.68), glassMat);
  winF.position.set(0, (deckH + roofH) * 0.5 - 0.02, 0.56);
  winF.rotation.x = -0.92;
  car.add(winF);

  const winR = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.46, 0.62), glassMat);
  winR.position.set(0, (deckH + roofH) * 0.5, -1.06);
  winR.rotation.y = Math.PI;
  winR.rotation.x = -0.95;
  car.add(winR);

  for (const sx of [-(width - 0.36) / 2, (width - 0.36) / 2]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.34), glassMat);
    sw.position.set(sx, (deckH + roofH) * 0.5 - 0.02, -0.26);
    sw.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.add(sw);
  }

  // Grelha frontal + entradas de ar laterais
  const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(width * 0.58, 0.2, 0.08), carbonMat);
  frontGrille.position.set(0, 0.42, halfL + 0.06);
  car.add(frontGrille);

  // Painéis laterais e capô para skins/liveries do Cartaz
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(length - 0.42, 0.48), liverySideMat);
  sideL.position.set(-width / 2 - 0.015, 0.54, 0);
  sideL.rotation.y = -Math.PI / 2;
  car.add(sideL);

  const sideR = new THREE.Mesh(new THREE.PlaneGeometry(length - 0.42, 0.48), liverySideMat);
  sideR.position.set(width / 2 + 0.015, 0.54, 0);
  sideR.rotation.y = Math.PI / 2;
  car.add(sideR);

  const hoodDecal = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.26, 1.18), liveryHoodMat);
  hoodDecal.position.set(0, deckH - 0.04, 1.32);
  hoodDecal.rotation.x = -Math.PI / 2 + 0.12;
  car.add(hoodDecal);

  const roofDecal = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.44, cabinLen - 0.72), liveryHoodMat);
  roofDecal.position.set(0, roofH + 0.015, -0.26);
  roofDecal.rotation.x = -Math.PI / 2;
  car.add(roofDecal);

  // Aerofólio GT (Supercars & Coupés)
  if (category === 'supercar' || modelId === 'toyota_supra' || modelId === 'bmw_m4') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.06, 0.34), carbonMat);
    wing.position.set(0, 1.18, -halfL + 0.24);
    car.add(wing);
    for (const sx of [-0.56, 0.56]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.14), carbonMat);
      strut.position.set(sx, 0.98, -halfL + 0.26);
      car.add(strut);
    }
  }

  // Rodas largas 5 raios com jantes pintadas e cavas das rodas
  const wheelPos: [number, number, number][] = [
    [-width / 2 - 0.03, 0.37, 1.3],
    [width / 2 + 0.03, 0.37, 1.3],
    [-width / 2 - 0.03, 0.37, -1.3],
    [width / 2 + 0.03, 0.37, -1.3],
  ];
  buildWheelArchFlares(car, wheelPos, 0.44, carbonMat);
  wheelPos.forEach(([wx, wy, wz]) => {
    const tire = buildDetailedWheel(0.37, 0.29, carbonMat, rimMat, wx > 0);
    tire.position.set(wx, wy, wz);
    car.add(tire);
    wheels.push(tire);
  });

  // Faróis LED e Lanternas Traseiras
  const hlGeo = new THREE.BoxGeometry(0.4, 0.11, 0.08);
  [-0.68, 0.68].forEach((lx) => {
    const hl = new THREE.Mesh(hlGeo, lightMat);
    hl.position.set(lx, 0.58, halfL + 0.05);
    car.add(hl);
    headlights.push(hl);

    const tl = new THREE.Mesh(hlGeo, redMat);
    tl.position.set(lx, 0.64, -halfL - 0.04);
    car.add(tl);
    taillights.push(tl);
  });

  const plateF = createLicensePlateMesh(plate);
  plateF.position.set(0, 0.36, halfL + 0.1);
  car.add(plateF);
  const plateR = createLicensePlateMesh(plate);
  plateR.position.set(0, 0.46, -halfL - 0.06);
  plateR.rotation.y = Math.PI;
  car.add(plateR);

  const cat = VEHICLE_CATALOG.find((c) => c.modelId === modelId);
  const v = makeBaseVehicle(
    id,
    modelId,
    name,
    category,
    x,
    z,
    rotY,
    plate,
    colorHex,
    cat?.maxSpeed ?? 42,
    cat?.acceleration ?? 29,
    car,
    wheels,
    headlights,
    [bodyMat],
    undefined,
    taillights,
    [rimMat],
    [liverySideMat, liveryHoodMat],
    skinId,
    accentColor,
    steeringWheelMesh
  );
  applyVehicleUpgrades(v);
  return v;
}

export function createVehicleFromRecord(rec: OwnedVehicleRecord): DrivableVehicle {
  const x = rec.position?.x ?? 10;
  const z = rec.position?.z ?? -10;
  const rotY = rec.rotationY ?? 0;
  let veh: DrivableVehicle;

  if (rec.type === 'candongueiro') veh = createCandongueiroVehicle(x, z, rotY, rec.id, rec.color, rec.plate);
  else if (rec.type === 'taxi') veh = createTaxiVehicle(x, z, rotY, rec.id, rec.color, rec.plate);
  else if (rec.type === 'suv') veh = createSuvVehicle(x, z, rotY, rec.id, rec.color, rec.plate, rec.skinId);
  else if (rec.type === 'sport' || rec.type === 'supercar' || rec.type === 'muscle') {
    veh = createSportCarVehicle(
      rec.type,
      x,
      z,
      rotY,
      rec.id,
      rec.modelId,
      rec.name,
      rec.color,
      rec.plate,
      rec.skinId,
      rec.accentColor
    );
  }
  else if (rec.type === 'police') veh = createPoliceVehicle(x, z, rotY, rec.id, rec.plate);
  else if (rec.type === 'ambulance') veh = createAmbulanceVehicle(x, z, rotY, rec.id, rec.plate);
  else if (rec.type === 'military') veh = createMilitaryJeepVehicle(x, z, rotY, rec.id, rec.color, rec.plate);
  else if (rec.type === 'moto') veh = createMotoVehicle(x, z, rotY, rec.id, rec.color, rec.plate);
  else if (rec.type === 'bus' || rec.type === 'truck' || rec.type === 'pickup') {
    veh = createPickupOrTruckVehicle(rec.type, x, z, rotY, rec.id, rec.color, rec.plate);
  } else {
    veh = createTaxiVehicle(x, z, rotY, rec.id, rec.color, rec.plate);
  }

  veh.name = rec.name;
  veh.modelId = rec.modelId;
  veh.ownerId = rec.ownerId;
  veh.skinId = rec.skinId;
  veh.accentColor = rec.accentColor;
  veh.fuel = rec.fuel ?? 100;
  veh.health = rec.health ?? 100;
  veh.mileageKm = rec.mileageKm ?? 0;
  veh.isLocked = rec.isLocked ?? false;
  veh.engineLevel = rec.engineLevel ?? 1;
  veh.suspensionLevel = rec.suspensionLevel ?? 1;
  veh.wheelStyle = rec.wheelStyle ?? 'padrao';
  applyVehicleUpgrades(veh);
  return veh;
}

export function applyVehicleUpgrades(v: DrivableVehicle) {
  const skin = v.skinId ? VEHICLE_SKIN_PRESETS.find((s) => s.id === v.skinId) : undefined;
  const baseCol = v.color || skin?.baseColor || '#1d4ed8';
  const accentCol = v.accentColor || skin?.accentColor || '#dc2626';
  const rimCol = skin?.rimColor || (v.wheelStyle === 'desportiva' ? accentCol : '#334155');
  const pattern: VehicleLiveryPattern = skin?.pattern || 'clean_gloss';

  for (const mat of v.bodyMaterials) {
    mat.color.set(baseCol);
  }
  if (v.rimMaterials) {
    for (const rMat of v.rimMaterials) {
      rMat.color.set(rimCol);
    }
  }
  if (v.liveryMaterials && v.liveryMaterials.length >= 2) {
    const sideMat = v.liveryMaterials[0];
    const hoodMat = v.liveryMaterials[1];
    sideMat.map?.dispose();
    hoodMat.map?.dispose();
    sideMat.map = createVehicleLiveryTexture(baseCol, accentCol, pattern, skin?.badgeText, false);
    hoodMat.map = createVehicleLiveryTexture(baseCol, accentCol, pattern, skin?.badgeText, true);
    sideMat.needsUpdate = true;
    hoodMat.needsUpdate = true;
  }

  const cat = VEHICLE_CATALOG.find((c) => c.modelId === v.modelId);
  const baseMax = cat?.maxSpeed ?? 26;
  const baseAcc = cat?.acceleration ?? 16;
  v.maxSpeed = baseMax + (v.engineLevel - 1) * 4;
  v.acceleration = baseAcc + (v.engineLevel - 1) * 3;
  const prof = getVehiclePhysicsProfile(v.type, v.maxSpeed, v.acceleration);
  const engineBoost = 1 + (v.engineLevel - 1) * 0.18;
  const suspBoost = 1 + (v.suspensionLevel - 1) * 0.14;
  v.physics = {
    ...prof,
    maxTorqueNm: Math.round(prof.maxTorqueNm * engineBoost),
    horsePower: Math.round(prof.horsePower * engineBoost),
    suspensionStiffness: Math.round(prof.suspensionStiffness * suspBoost),
  };
}

export function setupLuandaTraffic(rootGroup: THREE.Group): TrafficCar[] {
  const traffic: TrafficCar[] = [];

  const spawnLaneCar = (
    veh: Pick<DrivableVehicle, 'mesh' | 'wheels' | 'headlights' | 'taillights'>,
    axis: 'x' | 'z',
    fixedCoord: number,
    startCoord: number,
    minCoord: number,
    maxCoord: number,
    direction: 1 | -1,
    speed: number
  ) => {
    if (axis === 'z') {
      veh.mesh.position.set(fixedCoord, getSurfaceHeightAt(fixedCoord, startCoord), startCoord);
      veh.mesh.rotation.y = direction === 1 ? 0 : Math.PI;
    } else {
      veh.mesh.position.set(startCoord, getSurfaceHeightAt(startCoord, fixedCoord), fixedCoord);
      veh.mesh.rotation.y = direction === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    rootGroup.add(veh.mesh);
    traffic.push({
      mesh: veh.mesh,
      wheels: veh.wheels,
      axis,
      minCoord,
      maxCoord,
      fixedCoord,
      direction,
      speed,
      currentSpeed: speed,
      headlights: veh.headlights,
      taillights: veh.taillights,
    });
  };

  // Marginal Norte-Sul (faixas certas: -11.5 vai +Z, -2.5 vai -Z)
  spawnLaneCar(createCandongueiroVehicle(0, 0, 0, 'tr-1', '#1d4ed8', 'LD-88-21-RP'), 'z', -11.5, -135, -220, 220, 1, 13.0);
  spawnLaneCar(createTaxiVehicle(0, 0, 0, 'tr-2', '#facc15', 'LD-44-12-TX'), 'z', -2.5, 130, -220, 220, -1, 12.2);
  spawnLaneCar(createSedanCar(0x334155, 'LD-14-50-AO'), 'z', -11.5, 65, -220, 220, 1, 13.6);

  // Avenida Central Leste-Oeste (faixas: z=+4.5 vai +X, z=-4.5 vai -X)
  spawnLaneCar(createSedanCar(0x1e293b, 'LD-99-01-GOV'), 'x', 4.5, 24, -4, 245, 1, 14.2);
  spawnLaneCar(createSuvVehicle(0, 0, 0, 'tr-5', '#dc2626', 'LD-33-88-RP'), 'x', -4.5, 210, -4, 245, -1, 12.6);

  // Anel Talatona / Kilamba (x=86 vai +Z, x=94 vai -Z)
  spawnLaneCar(createTaxiVehicle(0, 0, 0, 'tr-6', '#10b981', 'LD-55-77-TL'), 'z', 86, -135, -200, 200, 1, 13.5);
  spawnLaneCar(createPickupOrTruckVehicle('pickup', 0, 0, 0, 'tr-7', '#334155', 'LD-64-10-KL'), 'z', 94, 140, -200, 200, -1, 12.8);

  // Anel Viana Leste (x=186 vai +Z, x=194 vai -Z)
  spawnLaneCar(createPickupOrTruckVehicle('truck', 0, 0, 0, 'tr-8', '#d97706', 'LD-77-99-VN'), 'z', 194, 135, -200, 200, -1, 11.4);

  return traffic;
}

const NS_INTERSECTIONS = [-165, 0, 165];
const EW_INTERSECTIONS = [-7, 90, 190];

export function updateTrafficVehicles(
  traffic: TrafficCar[],
  delta: number,
  phase: TrafficPhase,
  playerPos?: THREE.Vector3,
  playerOnFoot = false,
  onHitPlayer?: (damage: number, knockX: number, knockZ: number) => void
) {
  for (let i = 0; i < traffic.length; i++) {
    const car = traffic[i];
    const posCoord = car.axis === 'z' ? car.mesh.position.z : car.mesh.position.x;

    // 1. Verificar Semáforo antes da faixa de paragem
    let mustStopForLight = false;
    const intersections = car.axis === 'z' ? NS_INTERSECTIONS : EW_INTERSECTIONS;
    const myGreen = car.axis === 'z' ? phase.nsGreen && !phase.isYellow : phase.ewGreen && !phase.isYellow;

    if (!myGreen) {
      for (let k = 0; k < intersections.length; k++) {
        const crossCoord = intersections[k];
        const stopLine = crossCoord - car.direction * 11.5;
        const distToStop = (stopLine - posCoord) * car.direction;
        if (distToStop >= 0.4 && distToStop <= 14.0) {
          mustStopForLight = true;
          break;
        }
      }
    }

    // 2. Verificar distância de segurança para o carro da frente na mesma faixa
    let mustStopForAhead = false;
    for (let j = 0; j < traffic.length; j++) {
      if (i === j) continue;
      const other = traffic[j];
      if (other.axis !== car.axis || other.direction !== car.direction) continue;
      if (Math.abs(other.fixedCoord - car.fixedCoord) > 2.2) continue;
      const otherPos = other.axis === 'z' ? other.mesh.position.z : other.mesh.position.x;
      const gap = (otherPos - posCoord) * car.direction;
      if (gap > 0 && gap < 10.5) {
        mustStopForAhead = true;
        break;
      }
    }

    const targetSpeed = mustStopForLight || mustStopForAhead ? 0 : car.speed;
    const accelRate = targetSpeed === 0 ? 18.0 : 8.5;
    if (car.currentSpeed < targetSpeed) {
      car.currentSpeed = Math.min(targetSpeed, car.currentSpeed + accelRate * delta);
    } else if (car.currentSpeed > targetSpeed) {
      car.currentSpeed = Math.max(targetSpeed, car.currentSpeed - accelRate * delta);
    }
    car.isStopped = car.currentSpeed < 0.3;

    const move = car.currentSpeed * car.direction * delta;
    if (car.axis === 'z') {
      car.mesh.position.z += move;
      if (car.mesh.position.z > car.maxCoord) car.mesh.position.z = car.minCoord;
      if (car.mesh.position.z < car.minCoord) car.mesh.position.z = car.maxCoord;
      car.mesh.position.y = getSurfaceHeightAt(car.mesh.position.x, car.mesh.position.z);
    } else {
      car.mesh.position.x += move;
      if (car.mesh.position.x > car.maxCoord) car.mesh.position.x = car.minCoord;
      if (car.mesh.position.x < car.minCoord) car.mesh.position.x = car.maxCoord;
      car.mesh.position.y = getSurfaceHeightAt(car.mesh.position.x, car.mesh.position.z);
    }

    for (let w = 0; w < car.wheels.length; w++) {
      car.wheels[w].rotation.x += (car.currentSpeed / 0.4) * delta;
    }

    // Luz de travão traseira quando parado
    if (car.taillights) {
      for (const tl of car.taillights) {
        const mat = tl.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = car.isStopped ? 1.8 : 0.7;
      }
    }

    // 3. Atropelamento real se player estiver na estrada a pé
    if (playerOnFoot && playerPos && onHitPlayer && car.currentSpeed > 3.2) {
      const dx = playerPos.x - car.mesh.position.x;
      const dz = playerPos.z - car.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < 4.6 && Math.abs(playerPos.y - car.mesh.position.y) < 2.2) {
        const dmg = Math.round(Math.min(100, 32 + car.currentSpeed * 3.8));
        const len = Math.max(0.1, Math.sqrt(distSq));
        onHitPlayer(dmg, (dx / len) * 9, (dz / len) * 9);
      }
    }
  }
}

interface BusRouteNode {
  x: number;
  z: number;
  stopId?: string;
  stopName?: string;
}

const ANGO_REAL_ROUTE: BusRouteNode[] = [
  { x: -13, z: -80, stopId: ANGO_REAL_STOPS[2].id, stopName: ANGO_REAL_STOPS[2].name },
  { x: -13, z: 10, stopId: ANGO_REAL_STOPS[1].id, stopName: ANGO_REAL_STOPS[1].name },
  { x: -13, z: 48, stopId: ANGO_REAL_STOPS[0].id, stopName: ANGO_REAL_STOPS[0].name },
  { x: -13, z: 165 },
  { x: 86, z: 165 },
  { x: 86, z: 128, stopId: ANGO_REAL_STOPS[5].id, stopName: ANGO_REAL_STOPS[5].name },
  { x: 86, z: 32, stopId: ANGO_REAL_STOPS[4].id, stopName: ANGO_REAL_STOPS[4].name },
  { x: 86, z: 4 },
  { x: 132, z: 4 },
  { x: 132, z: -4 },
  { x: 118, z: -4, stopId: ANGO_REAL_STOPS[6].id, stopName: ANGO_REAL_STOPS[6].name },
  { x: 42, z: -4 },
  { x: 42, z: 4, stopId: ANGO_REAL_STOPS[3].id, stopName: ANGO_REAL_STOPS[3].name },
  { x: -3, z: 4 },
  { x: -3, z: -165 },
  { x: -13, z: -165 },
];

export interface AngoRealBusUnit {
  id: string;
  label: string;
  vehicle: DrivableVehicle;
  nodeIdx: number;
  pauseTimer: number;
  currentSpeed: number;
  isStopped: boolean;
  currentStopName: string | null;
  nextStopName: string;
}

export class AngoRealBusController {
  public buses: AngoRealBusUnit[] = [];

  constructor(rootGroup: THREE.Group) {
    const configs = [
      { id: 'ango-real-101', label: 'Autocarro 101 • Linha Marginal/Talatona/Viana', plate: 'AO-101-BUS', startIdx: 2 },
      { id: 'ango-real-102', label: 'Autocarro 102 • Linha Kilamba/Baixa/Praia', plate: 'AO-102-BUS', startIdx: 10 },
    ];
    configs.forEach((cfg) => {
      const node = ANGO_REAL_ROUTE[cfg.startIdx];
      const busVeh = createPickupOrTruckVehicle('bus', node.x, node.z, 0, cfg.id, '#1e3a8a', cfg.plate);
      busVeh.name = cfg.label;
      busVeh.mesh.position.set(node.x, getSurfaceHeightAt(node.x, node.z), node.z);
      rootGroup.add(busVeh.mesh);
      this.buses.push({
        id: cfg.id,
        label: cfg.label,
        vehicle: busVeh,
        nodeIdx: (cfg.startIdx + 1) % ANGO_REAL_ROUTE.length,
        pauseTimer: 2.5,
        currentSpeed: 0,
        isStopped: true,
        currentStopName: node.stopName || null,
        nextStopName: this.findNextStopName(cfg.startIdx + 1),
      });
    });
  }

  private findNextStopName(fromIdx: number): string {
    for (let step = 0; step < ANGO_REAL_ROUTE.length; step++) {
      const n = ANGO_REAL_ROUTE[(fromIdx + step) % ANGO_REAL_ROUTE.length];
      if (n.stopName) return n.stopName;
    }
    return 'Marginal';
  }

  public update(delta: number) {
    for (const bus of this.buses) {
      if (bus.pauseTimer > 0) {
        bus.pauseTimer -= delta;
        bus.currentSpeed = 0;
        bus.isStopped = true;
        if (bus.pauseTimer <= 0) {
          bus.currentStopName = null;
          bus.isStopped = false;
        }
        continue;
      }

      const target = ANGO_REAL_ROUTE[bus.nodeIdx];
      const pos = bus.vehicle.mesh.position;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 1.4) {
        if (target.stopName) {
          bus.pauseTimer = 6.0;
          bus.currentStopName = target.stopName;
          bus.isStopped = true;
        }
        bus.nodeIdx = (bus.nodeIdx + 1) % ANGO_REAL_ROUTE.length;
        bus.nextStopName = this.findNextStopName(bus.nodeIdx);
        continue;
      }

      const desiredSpeed = dist < 10 && target.stopName ? Math.max(4.5, dist * 1.15) : 13.0;
      bus.currentSpeed += (desiredSpeed - bus.currentSpeed) * Math.min(1, delta * 3.5);
      const step = Math.min(dist, bus.currentSpeed * delta);
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      pos.y = getSurfaceHeightAt(pos.x, pos.z);

      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - bus.vehicle.rotationY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bus.vehicle.rotationY += diff * Math.min(1, delta * 5.0);
      bus.vehicle.mesh.rotation.y = bus.vehicle.rotationY;
      bus.vehicle.position.copy(pos);

      for (const w of bus.vehicle.wheels) {
        w.rotation.x += (bus.currentSpeed / 0.45) * delta;
      }
    }
  }

  public getBoardableBus(px: number, pz: number, maxRadius = 8.5): AngoRealBusUnit | null {
    let best: AngoRealBusUnit | null = null;
    let bestDist = maxRadius * maxRadius;
    for (const bus of this.buses) {
      const dx = px - bus.vehicle.mesh.position.x;
      const dz = pz - bus.vehicle.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestDist) {
        bestDist = d2;
        best = bus;
      }
    }
    return best;
  }

  public getNearestBusInfo(px: number, pz: number): { bus: AngoRealBusUnit; dist: number } | null {
    let best: AngoRealBusUnit | null = null;
    let bestD2 = Infinity;
    for (const bus of this.buses) {
      const dx = px - bus.vehicle.mesh.position.x;
      const dz = pz - bus.vehicle.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = bus;
      }
    }
    return best ? { bus: best, dist: Math.sqrt(bestD2) } : null;
  }
}

export type InemaDispatchState = 'idle' | 'en_route' | 'treating' | 'returning';

export class InemaAmbulanceController {
  public vehicle: DrivableVehicle;
  public state: InemaDispatchState = 'idle';
  private basePos = new THREE.Vector3(38, 0, 54);
  private targetPos = new THREE.Vector3(38, 0, 54);
  private treatTimer = 0;
  private strobeTimer = 0;
  private onArrivedCb?: () => void;

  constructor(rootGroup: THREE.Group) {
    this.vehicle = createAmbulanceVehicle(this.basePos.x, this.basePos.z, -Math.PI / 2, 'inema-rescue-112', 'INEMA-112');
    this.vehicle.mesh.position.set(this.basePos.x, getSurfaceHeightAt(this.basePos.x, this.basePos.z), this.basePos.z);
    rootGroup.add(this.vehicle.mesh);
  }

  public dispatchTo(x: number, z: number, onArrived: () => void) {
    this.targetPos.set(x, getSurfaceHeightAt(x, z), z);
    this.onArrivedCb = onArrived;
    this.state = 'en_route';
    this.treatTimer = 0;
  }

  public update(delta: number) {
    if (this.state === 'idle') return;

    this.strobeTimer += delta * 12;
    if (this.vehicle.sirenMeshes && this.vehicle.sirenMeshes.length >= 2) {
      const flash = Math.sin(this.strobeTimer) > 0;
      (this.vehicle.sirenMeshes[0].material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 2.4 : 0.25;
      (this.vehicle.sirenMeshes[1].material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 0.25 : 2.4;
    }

    if (this.state === 'treating') {
      this.treatTimer -= delta;
      if (this.treatTimer <= 0) {
        this.state = 'returning';
      }
      return;
    }

    const goal = this.state === 'en_route' ? this.targetPos : this.basePos;
    const pos = this.vehicle.mesh.position;
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const stopDist = this.state === 'en_route' ? 4.4 : 1.5;
    if (dist <= stopDist) {
      if (this.state === 'en_route') {
        this.state = 'treating';
        this.treatTimer = 2.2;
        const cb = this.onArrivedCb;
        this.onArrivedCb = undefined;
        cb?.();
      } else {
        this.state = 'idle';
        this.vehicle.rotationY = -Math.PI / 2;
        this.vehicle.mesh.rotation.y = this.vehicle.rotationY;
        if (this.vehicle.sirenMeshes) {
          for (const sm of this.vehicle.sirenMeshes) {
            (sm.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
          }
        }
      }
      return;
    }

    const speed = this.state === 'en_route' ? 24.0 : 16.5;
    const step = Math.min(dist, speed * delta);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    pos.y = getSurfaceHeightAt(pos.x, pos.z);

    const yaw = Math.atan2(dx, dz);
    let diff = yaw - this.vehicle.rotationY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.vehicle.rotationY += diff * Math.min(1, delta * 7.5);
    this.vehicle.mesh.rotation.y = this.vehicle.rotationY;
    this.vehicle.position.copy(pos);

    for (const w of this.vehicle.wheels) {
      w.rotation.x += (speed / 0.38) * delta;
    }
  }
}
