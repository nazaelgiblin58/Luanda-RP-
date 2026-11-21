/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { District, DistrictId, InteractableObject, TrafficLightItem } from '../types';
import {
  ANGO_REAL_STOPS,
  ELISAL_DUMPSTER_POINTS,
  ENDE_FAULT_POINTS,
  FACTION_CITY_STATIONS,
  FARM_PLANT_NODES,
  FISHING_ZONES,
  JOBS_CATALOG,
  LUANDA_DISTRICTS,
  VOLLEYBALL_COURT_CENTER,
} from '../data/catalog';
import { buildDetailedHumanRig } from '../player/humanRig';
import {
  TrafficCar,
  DrivableVehicle,
  setupLuandaTraffic,
  createPoliceVehicle,
  createAmbulanceVehicle,
  createMotoVehicle,
  createMilitaryJeepVehicle,
  createPickupOrTruckVehicle,
  createSportCarVehicle,
} from './trafficSystem';
import {
  createOceanWaterSystem,
  getCachedBuildingFacadeTexture,
  getCachedCobbleTexture,
  getCachedContactShadowTexture,
  getCachedFarmGrassTexture,
  getCachedGroundTexture,
  getCachedRoadTexture,
  getCachedSandTexture,
  getCachedSidewalkTexture,
  OceanWaterSystem,
} from './worldEnvironment';

import {
  CONDOMINIO_CENTER,
  DJ_BOOTH_POS,
  ESQUADRA_ENTRANCE_POS,
  ESQUADRA_INTERIOR_ORIGIN,
  ESQUADRA_PNA_POS,
  FAA_VAULT_POS,
  INTERIOR_ORIGINS,
  MORRO_DEFINITIONS,
  MOTO_RENTAL_POS,
  PALACIO_INTERIOR_ORIGIN,
  PALACIO_PRESIDENCIAL_POS,
  PRISON_CELL_SPAWNS,
  PRISON_INTERIOR_ORIGIN,
  PRISON_RELEASE_POS,
  PRISON_YARD_POS,
} from './terrainPhysics';

export interface CityChunk {
  centerX: number;
  centerZ: number;
  radius: number;
  group: THREE.Group;
}

export interface StreetLampRef {
  light?: THREE.PointLight;
  bulbMesh?: THREE.Mesh;
  bulbMat?: THREE.MeshStandardMaterial;
}

export interface FarmPlantDisplayRef {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  lastText: string;
}

export interface AirplaneOrbitRef {
  group: THREE.Group;
  centerX: number;
  centerZ: number;
  radius: number;
  altitude: number;
  speed: number;
  angle: number;
}

export interface CityData {
  rootGroup: THREE.Group;
  colliders: THREE.Box3[];
  interactables: InteractableObject[];
  districts: District[];
  streetLamps: THREE.PointLight[];
  streetLampsByDistrict: Record<string, StreetLampRef[]>;
  oceanMesh?: THREE.Mesh;
  oceanWater?: OceanWaterSystem;
  boats: THREE.Group[];
  flagMesh?: THREE.Mesh;
  extraFlags?: THREE.Mesh[];
  swayingTrees: THREE.Group[];
  trafficVehicles: TrafficCar[];
  drivableVehicles: DrivableVehicle[];
  drivableVan?: DrivableVehicle;
  trafficLights: TrafficLightItem[];
  beaconLight?: THREE.PointLight;
  beaconMesh?: THREE.Mesh;
  lampHeadMat?: THREE.MeshStandardMaterial;
  checkpointBeacon: THREE.Group;
  gpsBeacon: THREE.Group;
  droppedItemsGroup: THREE.Group;
  interiorsGroup: THREE.Group;
  cityChunks: CityChunk[];
  djSpeakerMeshes: THREE.Mesh[];
  houseInteriorLights: THREE.PointLight[];
  houseInteriorGlowMeshes: THREE.Mesh[];
  housePickObjects: THREE.Object3D[];
  condominioGate?: THREE.Group;
  condominioGateCollider?: THREE.Box3;
  pnaGate?: THREE.Group;
  pnaGateCollider?: THREE.Box3;
  fountainWaterJets?: THREE.Mesh[];
  stoveEffectGroups?: THREE.Group[];
  airplanes?: AirplaneOrbitRef[];
  farmPlantDisplays?: Record<string, FarmPlantDisplayRef>;
  volleyballMesh?: THREE.Mesh;
}

function resolveNearestDistrictId(x: number, z: number): DistrictId {
  let bestId: DistrictId = 'centro';
  let bestD2 = Infinity;
  for (let i = 0; i < LUANDA_DISTRICTS.length; i++) {
    const d = LUANDA_DISTRICTS[i];
    const dx = x - d.center[0];
    const dz = z - d.center[1];
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = d.id;
    }
  }
  return bestId;
}

export function setDistrictBlackouts(
  cityData: CityData,
  blackoutDistricts: Record<string, unknown>,
  nightLampIntensity = 1.0
) {
  const byDistrict = cityData.streetLampsByDistrict || {};
  const normalEmissive = 0.25 + nightLampIntensity * 1.15;
  for (const distId of Object.keys(byDistrict)) {
    const isOff = Boolean(blackoutDistricts && blackoutDistricts[distId]);
    const refs = byDistrict[distId];
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      if (ref.light) {
        ref.light.intensity = isOff ? 0 : nightLampIntensity * 1.2;
      }
      if (ref.bulbMat) {
        ref.bulbMat.emissiveIntensity = isOff ? 0 : normalEmissive;
        ref.bulbMat.color.setHex(isOff ? 0x1e293b : 0xfef08a);
      }
    }
  }
}

// Textura zebrada para lancis salientes (lancis de passeio amarelo e preto / branco e preto)
function createCurbTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(64, 0, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(32, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createAngolaFlagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 300, 100);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 100, 300, 100);

  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 8;

  ctx.beginPath();
  ctx.arc(150, 100, 36, Math.PI * 0.4, Math.PI * 1.5, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(130, 130);
  ctx.lineTo(170, 70);
  ctx.lineWidth = 10;
  ctx.stroke();

  const cx = 155;
  const cy = 95;
  const spikes = 5;
  const outerR = 12;
  const innerR = 6;
  ctx.beginPath();
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    let x = cx + Math.cos(rot) * outerR;
    let y = cy + Math.sin(rot) * outerR;
    ctx.lineTo(x, y);
    rot += step;
    x = cx + Math.cos(rot) * innerR;
    y = cy + Math.sin(rot) * innerR;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildLuandaCity(isSoftwareGl = false): CityData {
  const root = new THREE.Group();
  root.name = 'LuandaCity';
  const colliders: THREE.Box3[] = [];
  const interactables: InteractableObject[] = [];
  const streetLamps: THREE.PointLight[] = [];
  const streetLampsByDistrict: Record<string, StreetLampRef[]> = {};
  const swayingTrees: THREE.Group[] = [];
  const drivableVehicles: DrivableVehicle[] = [];
  const trafficLights: TrafficLightItem[] = [];
  const cityChunks: CityChunk[] = [];
  const boats: THREE.Group[] = [];
  const djSpeakerMeshes: THREE.Mesh[] = [];
  const houseInteriorLights: THREE.PointLight[] = [];
  const houseInteriorGlowMeshes: THREE.Mesh[] = [];
  const housePickObjects: THREE.Object3D[] = [];
  const extraFlags: THREE.Mesh[] = [];
  const fountainWaterJets: THREE.Mesh[] = [];
  const stoveEffectGroups: THREE.Group[] = [];
  const airplanes: AirplaneOrbitRef[] = [];
  const farmPlantDisplays: Record<string, FarmPlantDisplayRef> = {};

  const isOnRoad = (x: number, z: number, pad = 2.0): boolean => {
    if (x < -33.5) return true; // Praia / oceano
    if (Math.abs(x - -7) <= 9 + pad && Math.abs(z) <= 252 + pad) return true; // Marginal
    if (Math.abs(z) <= 9 + pad && x >= -16 - pad && x <= 296 + pad) return true; // Av Central Leste-Oeste
    if (Math.abs(x - 90) <= 9 + pad && Math.abs(z) <= 222 + pad) return true; // Mid Ring Road
    if (Math.abs(x - 190) <= 8 + pad && Math.abs(z) <= 242 + pad) return true; // Outer Ring Road
    if (Math.abs(z - -165) <= 7.5 + pad && x >= -10 - pad && x <= 200 + pad) return true; // Transversal Norte
    if (Math.abs(z - 165) <= 7.5 + pad && x >= -10 - pad && x <= 200 + pad) return true; // Transversal Sul
    if (Math.abs(z - 130) <= 7 + pad && x >= -131 - pad && x <= -13 + pad) return true; // Ponte FAA
    if (Math.abs(z - -95) <= 7 + pad && x >= -55 - pad && x <= -13 + pad) return true; // Ponte Aeroporto
    if (Math.abs(z - -125) <= 6 + pad && x >= 189 - pad && x <= 267 + pad) return true; // Estrada Fazenda
    return false;
  };

  const roadTex = getCachedRoadTexture(24);
  const eastRoadTex = getCachedRoadTexture(18);
  const calcadaTex = getCachedSidewalkTexture(16, 16);
  const groundTex = getCachedGroundTexture(48, 64);
  const sandTex = getCachedSandTexture(12, 72);
  const contactAoTex = getCachedContactShadowTexture();

  const curbTex = createCurbTexture();
  const flagTex = createAngolaFlagTexture();

  // 1. SEPARAÇÃO REAL ENTRE TERRENO CONTINENTAL, PRAIA INCLINADA E OCEANO ATLÂNTICO
  // O solo continental começa em x = -34 e vai até x = +786 (NUNCA cobre o oceano a Oeste!)
  const groundGeo = new THREE.PlaneGeometry(820, 1480, 12, 12);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.92,
    metalness: 0.03,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.set(376, 0, 0);
  groundMesh.receiveShadow = true;
  root.add(groundMesh);

  // Praia da Ilha de Luanda + Fundo Marinho inclinado (x = -774 .. -34)
  // De x=-34 (calçadão, y=+0.15) desce suavemente pela areia seca -> areia molhada (x=-49, y=-0.22) -> fundo marinho (y=-2.4)
  const coastalGeo = new THREE.PlaneGeometry(740, 1480, 64, 12);
  coastalGeo.rotateX(-Math.PI / 2);
  const coastalPos = coastalGeo.attributes.position;
  for (let i = 0; i < coastalPos.count; i++) {
    const localX = coastalPos.getX(i);
    const worldX = localX - 404; // -774 .. -34
    let y = -2.4;
    if (worldX >= -34) {
      y = 0.08;
    } else if (worldX >= -49) {
      // Praia seca até linha de água
      const t = (-34 - worldX) / 15; // 0..1
      y = 0.08 - t * 0.28; // +0.08 .. -0.20
    } else if (worldX >= -72) {
      // Zona rasa com declive suave até fundo marinho
      const t = (-49 - worldX) / 23; // 0..1
      y = -0.20 - t * 2.2; // -0.20 .. -2.40
    }
    coastalPos.setY(i, y);
  }
  coastalGeo.computeVertexNormals();
  const beachMat = new THREE.MeshStandardMaterial({
    map: sandTex,
    roughness: 0.93,
    metalness: 0.02,
  });
  const beachMesh = new THREE.Mesh(coastalGeo, beachMat);
  beachMesh.position.set(-404, 0, 0);
  beachMesh.receiveShadow = true;
  root.add(beachMesh);

  // Oceano Atlântico Animado com Shader de Ondas, Espuma na Margem, Profundidade e Reflexo
  const oceanWater = createOceanWaterSystem(isSoftwareGl);
  const oceanMesh = oceanWater.mesh;
  root.add(oceanMesh);

  // Calçadão da Marginal 4 de Fevereiro (x = -34 .. -16)
  const calçadaGeo = new THREE.PlaneGeometry(18, 520);
  calçadaGeo.rotateX(-Math.PI / 2);
  const calçadaMat = new THREE.MeshStandardMaterial({
    map: calcadaTex,
    roughness: 0.65,
  });
  const calçadaMesh = new THREE.Mesh(calçadaGeo, calçadaMat);
  calçadaMesh.position.set(-25, 0.03, 0);
  calçadaMesh.receiveShadow = true;
  root.add(calçadaMesh);

  // Calçadas do lado Leste da Marginal
  const eastCalçadaGeo = new THREE.PlaneGeometry(12, 520);
  eastCalçadaGeo.rotateX(-Math.PI / 2);
  const eastCalçada = new THREE.Mesh(eastCalçadaGeo, calçadaMat);
  eastCalçada.position.set(8, 0.03, 0);
  eastCalçada.receiveShadow = true;
  root.add(eastCalçada);

  // 2. REDE DE ESTRADAS & AVENIDAS EXPANDIDA (Sem tocar nos Morros isolados!)
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // Avenida Principal Norte-Sul (Avenida 4 de Fevereiro: z = -250 .. +250)
  const mainRoadGeo = new THREE.PlaneGeometry(18, 500);
  mainRoadGeo.rotateX(-Math.PI / 2);
  const mainRoad = new THREE.Mesh(mainRoadGeo, roadMat);
  mainRoad.position.set(-7, 0.05, 0);
  mainRoad.receiveShadow = true;
  root.add(mainRoad);

  // Avenida Leste-Oeste Central (Baixa <-> Viana <-> Corredor CV)
  const eastRoadGeo = new THREE.PlaneGeometry(310, 18);
  eastRoadGeo.rotateX(-Math.PI / 2);
  const eastRoadMat = new THREE.MeshStandardMaterial({
    map: eastRoadTex,
    roughness: 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const eastRoad = new THREE.Mesh(eastRoadGeo, eastRoadMat);
  eastRoad.position.set(140, 0.05, 0);
  eastRoad.receiveShadow = true;
  root.add(eastRoad);

  // Avenida Talatona / Kilamba (Sul) & Cacuaco / Porto (Norte)
  const midRingRoadGeo = new THREE.PlaneGeometry(18, 440);
  midRingRoadGeo.rotateX(-Math.PI / 2);
  const midRingRoad = new THREE.Mesh(midRingRoadGeo, roadMat);
  midRingRoad.position.set(90, 0.05, 0);
  midRingRoad.receiveShadow = true;
  root.add(midRingRoad);

  // Anel Viário Leste (Viana <-> Cazenga <-> Talatona/Kilamba)
  const outerRingRoad = new THREE.Mesh(new THREE.PlaneGeometry(16, 480), roadMat);
  outerRingRoad.rotation.x = -Math.PI / 2;
  outerRingRoad.position.set(190, 0.05, 0);
  outerRingRoad.receiveShadow = true;
  root.add(outerRingRoad);

  // Transversal Norte (Porto Cacuaco / Ingombota) & Transversal Sul (Kilamba)
  const northCrosstown = new THREE.Mesh(new THREE.PlaneGeometry(210, 15), eastRoadMat);
  northCrosstown.rotation.x = -Math.PI / 2;
  northCrosstown.position.set(95, 0.05, -165);
  root.add(northCrosstown);

  const southCrosstown = new THREE.Mesh(new THREE.PlaneGeometry(210, 15), eastRoadMat);
  southCrosstown.rotation.x = -Math.PI / 2;
  southCrosstown.position.set(95, 0.05, 165);
  root.add(southCrosstown);

  // Rodovia Base Militar FAA (Sul-Oeste) & Ponte de Acesso
  const faaBridge = new THREE.Mesh(new THREE.BoxGeometry(118, 0.45, 14), roadMat);
  faaBridge.position.set(-72, 0.04, 130);
  root.add(faaBridge);

  // Estradas de Acesso Exclusivas aos 3 Morros Periféricos (CV, FTX, BMR)
  const ftxRoad = new THREE.Mesh(new THREE.PlaneGeometry(70, 12), eastRoadMat);
  ftxRoad.rotation.x = -Math.PI / 2;
  ftxRoad.position.set(220, 0.05, -235);
  root.add(ftxRoad);

  const bmrRoad = new THREE.Mesh(new THREE.PlaneGeometry(70, 12), eastRoadMat);
  bmrRoad.rotation.x = -Math.PI / 2;
  bmrRoad.position.set(220, 0.05, 235);
  root.add(bmrRoad);

  const cvRoad = new THREE.Mesh(new THREE.PlaneGeometry(65, 12), eastRoadMat);
  cvRoad.rotation.x = -Math.PI / 2;
  cvRoad.position.set(252, 0.05, -25);
  root.add(cvRoad);

  // 3. LANCIS 3D SALIENTES (Curbs com listras zebradas amarelo/preto)
  const curbMat = new THREE.MeshStandardMaterial({
    map: curbTex,
    roughness: 0.5,
  });

  const buildCurb = (x: number, z: number, length: number, rotY = 0) => {
    const curbGeo = new THREE.BoxGeometry(0.35, 0.22, length);
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.set(x, 0.11, z);
    curb.rotation.y = rotY;
    curb.receiveShadow = true;
    root.add(curb);
  };

  // Lancis ao longo da Marginal
  buildCurb(-16.1, 0, 310, 0);
  buildCurb(2.1, -80, 140, 0);
  buildCurb(2.1, 80, 140, 0);

  // Lancis das Avenidas transversais
  buildCurb(80, -9.1, 140, Math.PI / 2);
  buildCurb(80, 9.1, 140, Math.PI / 2);

  // 4. PASSADEIRAS ZEBRADAS (Textura única em 1 malha por passadeira = -90% draw calls!)
  const cwCanvas = document.createElement('canvas');
  cwCanvas.width = 512;
  cwCanvas.height = 192;
  const cwCtx = cwCanvas.getContext('2d')!;
  cwCtx.clearRect(0, 0, 512, 192);
  cwCtx.fillStyle = '#f8fafc';
  for (let s = 0; s < 9; s++) {
    cwCtx.fillRect(14 + s * 55, 6, 30, 134);
  }
  cwCtx.fillRect(8, 162, 496, 18);
  const cwTex = new THREE.CanvasTexture(cwCanvas);
  cwTex.colorSpace = THREE.SRGBColorSpace;
  const crosswalkPlaneGeo = new THREE.PlaneGeometry(16, 6.2);
  crosswalkPlaneGeo.rotateX(-Math.PI / 2);
  const crosswalkMat = new THREE.MeshStandardMaterial({
    map: cwTex,
    transparent: true,
    alphaTest: 0.25,
    roughness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const buildCrosswalk = (x: number, z: number, rotY = 0) => {
    const cwMesh = new THREE.Mesh(crosswalkPlaneGeo, crosswalkMat);
    cwMesh.position.set(x, 0.068, z);
    cwMesh.rotation.y = rotY;
    root.add(cwMesh);
  };

  buildCrosswalk(-7, -14, 0);
  buildCrosswalk(-7, 14, Math.PI);
  buildCrosswalk(6, 0, Math.PI / 2);
  buildCrosswalk(68, 0, -Math.PI / 2);
  buildCrosswalk(104, 0, Math.PI / 2);
  buildCrosswalk(90, -14, 0);
  buildCrosswalk(90, 14, Math.PI);
  buildCrosswalk(176, 0, -Math.PI / 2);
  buildCrosswalk(204, 0, Math.PI / 2);
  buildCrosswalk(-7, -152, 0);
  buildCrosswalk(-7, 152, Math.PI);

  // 5. SEMÁFOROS FUNCIONAIS 3D (Traffic Lights com fases NS e EW sincronizadas!)
  const tlPoleGeo = new THREE.CylinderGeometry(0.13, 0.17, 6.2, 8);
  const tlPoleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.25 });
  const tlArmGeo = new THREE.BoxGeometry(2.8, 0.16, 0.16);
  const tlBoxGeo = new THREE.BoxGeometry(0.5, 1.4, 0.38);
  const tlBoxMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.5 });
  const tlLensGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.12, 12);
  tlLensGeo.rotateX(Math.PI / 2);

  const buildTrafficLight = (x: number, z: number, rotY: number, axis: 'ns' | 'ew') => {
    const tlGroup = new THREE.Group();

    const pole = new THREE.Mesh(tlPoleGeo, tlPoleMat);
    pole.position.y = 3.1;
    tlGroup.add(pole);

    const arm = new THREE.Mesh(tlArmGeo, tlPoleMat);
    arm.position.set(1.3, 6.0, 0);
    tlGroup.add(arm);

    const box = new THREE.Mesh(tlBoxGeo, tlBoxMat);
    box.position.set(2.35, 5.55, 0);
    tlGroup.add(box);

    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.8 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0x713f12, emissive: 0x713f12, emissiveIntensity: 0.1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x14532d, emissiveIntensity: 0.1 });

    const redLens = new THREE.Mesh(tlLensGeo, redMat);
    redLens.position.set(2.35, 6.0, 0.18);
    tlGroup.add(redLens);

    const yellowLens = new THREE.Mesh(tlLensGeo, yellowMat);
    yellowLens.position.set(2.35, 5.55, 0.18);
    tlGroup.add(yellowLens);

    const greenLens = new THREE.Mesh(tlLensGeo, greenMat);
    greenLens.position.set(2.35, 5.1, 0.18);
    tlGroup.add(greenLens);

    // Lentes também na face oposta
    const redLensB = new THREE.Mesh(tlLensGeo, redMat);
    redLensB.position.set(2.35, 6.0, -0.18);
    tlGroup.add(redLensB);
    const yellowLensB = new THREE.Mesh(tlLensGeo, yellowMat);
    yellowLensB.position.set(2.35, 5.55, -0.18);
    tlGroup.add(yellowLensB);
    const greenLensB = new THREE.Mesh(tlLensGeo, greenMat);
    greenLensB.position.set(2.35, 5.1, -0.18);
    tlGroup.add(greenLensB);

    tlGroup.position.set(x, 0, z);
    tlGroup.rotation.y = rotY;
    root.add(tlGroup);

    trafficLights.push({ redMat, yellowMat, greenMat, axis });

    colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, 2.5, z),
      new THREE.Vector3(0.5, 5, 0.5)
    ));
  };

  buildTrafficLight(2, -17, 0, 'ns');
  buildTrafficLight(-16, 17, Math.PI, 'ns');
  buildTrafficLight(65, 10, -Math.PI / 2, 'ew');
  buildTrafficLight(95, -10, Math.PI / 2, 'ew');
  buildTrafficLight(99, 17, Math.PI, 'ns');
  buildTrafficLight(181, 10, -Math.PI / 2, 'ew');
  buildTrafficLight(199, -17, 0, 'ns');
  buildTrafficLight(2, 150, 0, 'ns');
  buildTrafficLight(2, -150, 0, 'ns');

  // 6. PARAGENS OFICIAIS ANGO REAL (7 Paragens com cobertura, banco e horário)
  const buildBusShelter = (x: number, z: number, rotY: number, title: string, routeLabel: string, stopId: string, district: District['id']) => {
    const shelter = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.5, roughness: 0.35 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.42, roughness: 0.1 });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });

    for (const px of [-2.4, 2.4]) {
      const pGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8);
      const p = new THREE.Mesh(pGeo, frameMat);
      p.position.set(px, 1.6, -1.2);
      shelter.add(p);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 2.8), frameMat);
    roof.position.set(0, 3.2, 0);
    roof.rotation.x = 0.06;
    shelter.add(roof);

    const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(5.24, 0.08, 0.1), trimMat);
    goldTrim.position.set(0, 3.16, 1.4);
    shelter.add(goldTrim);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.4), glassMat);
    wall.position.set(0, 1.6, -1.2);
    shelter.add(wall);

    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.6), benchMat);
    bench.position.set(0, 0.55, -0.7);
    shelter.add(bench);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 768;
    signCanvas.height = 192;
    const sctx = signCanvas.getContext('2d')!;
    sctx.fillStyle = '#0f172a';
    sctx.fillRect(0, 0, 768, 192);
    sctx.fillStyle = '#1e3a8a';
    sctx.fillRect(8, 8, 752, 86);
    sctx.strokeStyle = '#facc15';
    sctx.lineWidth = 8;
    sctx.strokeRect(6, 6, 756, 180);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 40px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.lineWidth = 6;
    sctx.strokeStyle = '#000000';
    sctx.strokeText('PARAGEM ANGO REAL 🚌', 384, 52);
    sctx.fillText('PARAGEM ANGO REAL 🚌', 384, 52);
    sctx.font = 'bold 32px sans-serif';
    sctx.fillStyle = '#fde047';
    sctx.strokeText(title.toUpperCase(), 384, 140);
    sctx.fillText(title.toUpperCase(), 384, 140);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.9),
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.45,
        roughness: 0.25,
      })
    );
    sign.position.set(0, 3.05, 1.42);
    shelter.add(sign);

    shelter.position.set(x, 0, z);
    shelter.rotation.y = rotY;
    root.add(shelter);

    colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, 1.6, z),
      new THREE.Vector3(5.2, 3.2, 2.8)
    ));

    interactables.push({
      id: stopId,
      type: 'bus_stop',
      title: `${title} 🚌`,
      subtitle: `${routeLabel} • Autocarro ANGO REAL para aqui em tempo real`,
      prompt: '[E] Aguardar / Embarcar no Autocarro ANGO REAL',
      position: [x, 0.5, z],
      radius: 5.5,
      district,
      data: { stopId, stopName: title, routeLabel },
    });
  };

  ANGO_REAL_STOPS.forEach((st) => {
    const rotY = st.id.includes('viana') ? Math.PI / 2 : st.id.includes('talatona') || st.id.includes('kilamba') ? -Math.PI / 2 : st.id.includes('hospital') ? Math.PI : Math.PI / 2;
    const dist: District['id'] = st.id.includes('viana') ? 'viana' : st.id.includes('talatona') ? 'talatona' : st.id.includes('kilamba') ? 'kilamba' : st.id.includes('hospital') ? 'maianga' : 'centro';
    buildBusShelter(st.pos[0], st.pos[2], rotY, st.name, st.routeLabel, st.id, dist);
  });

  // Rotunda & Monumento da Independência deslocados para (68, 28) — sem sobrepor a Av. Central nem a Mid Ring Road!
  const rotundaRadius = 10.5;
  const rotundaGeo = new THREE.CylinderGeometry(rotundaRadius, rotundaRadius, 0.35, 32);
  const rotundaMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.8,
  });
  const rotundaMesh = new THREE.Mesh(rotundaGeo, rotundaMat);
  rotundaMesh.position.set(68, 0.17, 28);
  root.add(rotundaMesh);

  // Obelisco Central & Monumento da Independência com Bandeira Nacional de Angola ampliada 🇦🇴
  const obeliscoBaseGeo = new THREE.BoxGeometry(3.8, 1.2, 3.8);
  const obeliscoBaseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
  const obeliscoBase = new THREE.Mesh(obeliscoBaseGeo, obeliscoBaseMat);
  obeliscoBase.position.set(68, 0.9, 28);
  root.add(obeliscoBase);

  const obeliscoTowerGeo = new THREE.CylinderGeometry(0.8, 1.8, 14, 8);
  const obeliscoTowerMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.2,
    roughness: 0.3,
  });
  const obeliscoTower = new THREE.Mesh(obeliscoTowerGeo, obeliscoTowerMat);
  obeliscoTower.position.set(68, 8, 28);
  root.add(obeliscoTower);

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 12, 12);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
  const flagPole = new THREE.Mesh(poleGeo, poleMat);
  flagPole.position.set(68, 17, 28);
  root.add(flagPole);

  const flagGeo = new THREE.PlaneGeometry(6.8, 4.4, 12, 8);
  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTex,
    side: THREE.DoubleSide,
    roughness: 0.45,
  });
  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.position.set(71.4, 21.0, 28);
  root.add(flagMesh);

  // Bandeiras de Angola adicionais no Palácio Presidencial e na Base Militar FAA
  for (const [fx, fy, fz] of [[68, 22, -78], [-148, 12, 116]] as [number, number, number][]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 8), poleMat);
    p.position.set(fx, fy - 4, fz);
    root.add(p);
    const fl = new THREE.Mesh(flagGeo, flagMat);
    fl.scale.set(0.8, 0.8, 0.8);
    fl.position.set(fx + 2.7, fy - 0.8, fz);
    root.add(fl);
    extraFlags.push(fl);
  }

  interactables.push({
    id: 'monumento-independencia',
    type: 'monument',
    title: 'Monumento da Independência 🇦🇴',
    subtitle: 'Largo Central da República de Angola',
    prompt: '[E] Reverenciar História Nacional',
    position: [68, 0.5, 31],
    radius: 4,
    district: 'centro',
    data: { quote: 'A paz e o progresso do povo angolano!' },
  });

  // 7. EDIFÍCIOS HISTÓRICOS & MODERNOS DE LUANDA (Arquitetura Detalhada + Varandas + AO)
  const aoContactMat = new THREE.MeshBasicMaterial({
    map: contactAoTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.7,
  });

  const buildComplex = (
    name: string,
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    themeColor: string,
    roofColor: number,
    label?: string,
    accentColor: number = 0x1e293b
  ) => {
    const group = new THREE.Group();
    group.name = name;

    // Sombra de contacto AO no solo
    const aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(w + 5, d + 5), aoContactMat);
    aoPlane.rotation.x = -Math.PI / 2;
    aoPlane.position.y = 0.04;
    group.add(aoPlane);

    // Pódio / Rés-do-chão comercial contrastado
    const plinthH = Math.min(3.8, h * 0.28);
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, plinthH, d + 0.4), plinthMat);
    plinth.position.y = plinthH / 2;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const rows = Math.max(2, Math.round((h - plinthH) / 4));
    const cols = Math.max(2, Math.round(w / 5));
    const winTex = getCachedBuildingFacadeTexture(themeColor, themeColor, '#334155', '#1d4ed8', rows, cols);

    const bodyGeo = new THREE.BoxGeometry(w, h - plinthH, d);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: winTex,
      roughness: 0.42,
      metalness: 0.14,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = plinthH + (h - plinthH) / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Varandas salientes na fachada frontal em edifícios médios/altos
    if (h >= 16) {
      const balcMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.3 });
      const railMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.35, metalness: 0.6 });
      const floors = Math.min(4, Math.floor((h - 6) / 6));
      for (let fl = 1; fl <= floors; fl++) {
        const by = plinthH + fl * ((h - plinthH - 2) / (floors + 1));
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 0.28, 1.3), balcMat);
        slab.position.set(0, by, d / 2 + 0.62);
        group.add(slab);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 0.72, 0.1), railMat);
        rail.position.set(0, by + 0.45, d / 2 + 1.22);
        group.add(rail);
      }
    }

    // Platibanda e telhado com detalhe técnico (AC / caixa de elevador)
    const roofParapet = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.9, 1.1, d + 0.9),
      new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.65 })
    );
    roofParapet.position.y = h + 0.55;
    group.add(roofParapet);

    const roofTech = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.35, 1.8, d * 0.35),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
    );
    roofTech.position.set(w * 0.15, h + 1.9, -d * 0.12);
    group.add(roofTech);

    // Portada de vidro dupla + Marquise
    const entranceMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.12,
      metalness: 0.8,
    });
    const entranceMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 1.1), entranceMat);
    entranceMesh.position.set(0, 1.6, d / 2 + 0.52);
    group.add(entranceMesh);

    const canopyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 0.32, 3.2),
      new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.3, metalness: 0.25 })
    );
    canopyMesh.position.set(0, 3.35, d / 2 + 1.45);
    group.add(canopyMesh);

    if (label) {
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 768;
      labelCanvas.height = 192;
      const lctx = labelCanvas.getContext('2d')!;
      lctx.fillStyle = '#090d16';
      lctx.fillRect(0, 0, 768, 192);
      lctx.strokeStyle = '#facc15';
      lctx.lineWidth = 10;
      lctx.strokeRect(6, 6, 756, 180);

      lctx.font = 'bold 46px sans-serif';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.lineWidth = 8;
      lctx.strokeStyle = '#000000';
      lctx.strokeText(label, 384, 96);
      lctx.fillStyle = '#ffffff';
      lctx.fillText(label, 384, 96);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      const labelGeo = new THREE.PlaneGeometry(6.8, 1.65);
      const labelMat = new THREE.MeshStandardMaterial({
        map: labelTex,
        emissiveMap: labelTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.45,
        roughness: 0.2,
      });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.set(0, 4.75, d / 2 + 0.72);
      group.add(labelMesh);
    }

    group.position.set(x, 0, z);
    root.add(group);

    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, h / 2, z),
      new THREE.Vector3(w + 0.6, h + 1, d + 0.6)
    );
    colliders.push(box);

    return group;
  };

  // BANCO BFA & MULTICAIXA (Centro / Baixa)
  buildComplex('BancoBFA', 26, -30, 22, 26, 18, '#1e3a8a', 0xd97706, 'BANCO BFA — MULTICAIXA', 0xd97706);
  interactables.push({
    id: 'atm-bfa-centro',
    type: 'atm',
    title: 'Multicaixa BFA / BAI 💳',
    subtitle: 'Terminal Bancário Automático de Luanda',
    prompt: '[E] Acessar Multicaixa (Saldo / Levantamento)',
    position: [26, 0.5, -20],
    radius: 3.5,
    district: 'centro',
    data: { bankName: 'Banco de Fomento Angola (BFA)' },
  });

  // EDIFÍCIO COMERCIAL KIAMBA (No lugar da antiga Esquadra — longe do Spawn Plaza!)
  buildComplex('TorreKiamba', 26, 30, 22, 20, 18, '#334155', 0x0ea5e9, 'CENTRO EMPRESARIAL KIAMBA 🏢', 0x0ea5e9);

  // NOVO COMPLEXO POLICIAL PNA & PRISÃO CENTRAL DE LUANDA (x=200..252, z=102..194, fora da via x=190)
  const pnaComplex = new THREE.Group();
  const pnaLotFloor = new THREE.Mesh(
    new THREE.BoxGeometry(54, 0.22, 92),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.88 })
  );
  pnaLotFloor.position.set(ESQUADRA_PNA_POS[0], 0.1, 148);
  pnaLotFloor.receiveShadow = true;
  pnaComplex.add(pnaLotFloor);

  buildComplex(
    'EsquadraPNAComplexo',
    ESQUADRA_PNA_POS[0],
    ESQUADRA_PNA_POS[2],
    26,
    18,
    20,
    '#0f172a',
    0x1d4ed8,
    'ESQUADRA CENTRAL PNA 🚓',
    0x2563eb
  );
  interactables.push({
    id: 'esquadra-policia',
    type: 'police',
    title: 'Esquadra Central PNA 🚓',
    subtitle: 'Comando Provincial de Luanda — Complexo PNA',
    prompt: '[E] Falar com o Oficial de Dia / CAD',
    position: ESQUADRA_ENTRANCE_POS,
    radius: 4.2,
    district: 'complexo_pna',
    data: { officer: 'Comandante Silva' },
  });

  // Garagem Policial PNA (a Este da Esquadra, livre da estrada x=190)
  const pnaGarage = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5.2, 14),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 })
  );
  pnaGarage.position.set(245, 2.6, 128);
  pnaComplex.add(pnaGarage);
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(245, 2.6, 128), new THREE.Vector3(12.4, 5.4, 14.4)));

  // Muralha Perimetral do Complexo PNA (Norte com portão automático + Laterais) & Prisão Central (z=160..194)
  const prisonFenceMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
  const prisonWalls: [number, number, number, number][] = [
    [226, 194, 48, 1.4],   // Sul Prisão
    [202, 148, 1.4, 92],   // Oeste Complexo
    [250, 148, 1.4, 92],   // Este Complexo
    [211, 160, 18, 1.4],   // Norte Prisão esq (portão centro x=220..232)
    [241, 160, 18, 1.4],   // Norte Prisão dir
    [211, 102, 18, 1.4],   // Norte Complexo esq (portão automático x=220..232)
    [241, 102, 18, 1.4],   // Norte Complexo dir
  ];
  prisonWalls.forEach(([wx, wz, ww, wd]) => {
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(ww, 4.6, wd), prisonFenceMat);
    wMesh.position.set(wx, 2.3, wz);
    pnaComplex.add(wMesh);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, 2.3, wz), new THREE.Vector3(ww + 0.3, 4.8, wd + 0.3)));
  });

  // Portão Automático Deslizante do Complexo PNA (z=102)
  const pnaGate = new THREE.Group();
  const pnaGateFrame = new THREE.Mesh(
    new THREE.BoxGeometry(11.6, 3.2, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.7, roughness: 0.3 })
  );
  pnaGateFrame.position.y = 1.6;
  pnaGate.add(pnaGateFrame);
  pnaGate.position.set(226, 0, 102);
  pnaComplex.add(pnaGate);
  const pnaGateCollider = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(226, 1.6, 102),
    new THREE.Vector3(11.8, 3.4, 0.8)
  );
  colliders.push(pnaGateCollider);

  // Portão & Placa da Prisão
  const prisonSignC = document.createElement('canvas');
  prisonSignC.width = 640;
  prisonSignC.height = 140;
  const pctx = prisonSignC.getContext('2d')!;
  pctx.fillStyle = '#090d16';
  pctx.fillRect(0, 0, 640, 140);
  pctx.strokeStyle = '#3b82f6';
  pctx.lineWidth = 8;
  pctx.strokeRect(5, 5, 630, 130);
  pctx.fillStyle = '#ffffff';
  pctx.font = 'bold 40px sans-serif';
  pctx.textAlign = 'center';
  pctx.textBaseline = 'middle';
  pctx.fillText('PRISÃO CENTRAL DE LUANDA 🔒', 320, 70);
  const pSignTex = new THREE.CanvasTexture(prisonSignC);
  pSignTex.colorSpace = THREE.SRGBColorSpace;
  const pSign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.1), new THREE.MeshBasicMaterial({ map: pSignTex, side: THREE.DoubleSide }));
  pSign.position.set(226, 5.4, 160);
  pnaComplex.add(pSign);

  // Portão de Libertação Oficial (fora da Prisão)
  const releaseArch = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 0.7, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.3 })
  );
  releaseArch.position.set(PRISON_RELEASE_POS[0], 3.8, PRISON_RELEASE_POS[2]);
  pnaComplex.add(releaseArch);

  root.add(pnaComplex);
  cityChunks.push({ centerX: 226, centerZ: 148, radius: 135, group: pnaComplex });

  // Interação de Entrada nos Interiores da Esquadra e da Prisão Central
  interactables.push({
    id: 'interior-esquadra-pna-enter',
    type: 'interior_door',
    title: 'Entrar na Esquadra PNA 🏛️',
    subtitle: 'Receção, Operações, Interrogações, Identificação & Celas',
    prompt: '[E] Entrar na Esquadra PNA',
    position: [215, 0.5, 114],
    radius: 3.5,
    district: 'complexo_pna',
    data: { targetX: ESQUADRA_INTERIOR_ORIGIN[0], targetZ: ESQUADRA_INTERIOR_ORIGIN[1] + 7.5, targetRot: 0, label: 'Interior Esquadra PNA' },
  });
  interactables.push({
    id: 'interior-prisao-pna-enter',
    type: 'interior_door',
    title: 'Entrar na Prisão Central 🔒',
    subtitle: 'Bloco de Celas Individuais, Guardas & Visitas',
    prompt: '[E] Entrar no Bloco Prisional',
    position: [PRISON_YARD_POS[0], 0.5, PRISON_YARD_POS[2] - 8],
    radius: 4.2,
    district: 'complexo_pna',
    data: { targetX: PRISON_INTERIOR_ORIGIN[0], targetZ: PRISON_INTERIOR_ORIGIN[1] + 15, targetRot: 0, label: 'Prisão Central de Luanda' },
  });

  // HOSPITAL MUNICIPAL JOSINA MACHEL (Maianga)
  buildComplex('HospitalGeral', 48, 65, 30, 22, 22, '#f8fafc', 0xef4444, 'HOSPITAL JOSINA MACHEL 🏥', 0xdc2626);
  interactables.push({
    id: 'hospital-maianga',
    type: 'hospital',
    title: 'Hospital Josina Machel 🏥',
    subtitle: 'Urgências e Cuidados Médicos',
    prompt: '[E] Fazer Consulta e Curar Saúde',
    position: [48, 0.5, 54],
    radius: 3.5,
    district: 'maianga',
  });

  // TORRE SONANGOL (Com Heliponto 'H' e Antena com Beacon de Aviação)
  const sonangol = buildComplex('TorreSonangol', 50, -32, 24, 48, 24, '#0f172a', 0xf59e0b, 'TORRE SONANGOL ⚡', 0xf59e0b);

  // Heliponto no topo da Torre Sonangol
  const heliCanvas = document.createElement('canvas');
  heliCanvas.width = 256;
  heliCanvas.height = 256;
  const hctx = heliCanvas.getContext('2d')!;
  hctx.fillStyle = '#334155';
  hctx.fillRect(0, 0, 256, 256);
  hctx.strokeStyle = '#facc15';
  hctx.lineWidth = 12;
  hctx.beginPath();
  hctx.arc(128, 128, 96, 0, Math.PI * 2);
  hctx.stroke();
  hctx.fillStyle = '#ffffff';
  hctx.font = 'bold 96px sans-serif';
  hctx.textAlign = 'center';
  hctx.textBaseline = 'middle';
  hctx.fillText('H', 128, 128);

  const heliTex = new THREE.CanvasTexture(heliCanvas);
  heliTex.colorSpace = THREE.SRGBColorSpace;
  const heliGeo = new THREE.PlaneGeometry(16, 16);
  heliGeo.rotateX(-Math.PI / 2);
  const heliMat = new THREE.MeshStandardMaterial({ map: heliTex });
  const heliMesh = new THREE.Mesh(heliGeo, heliMat);
  heliMesh.position.set(0, 48.7, 0);
  sonangol.add(heliMesh);

  // Antena e Beacon de Aviação vermelho piscante
  const antennaGeo = new THREE.CylinderGeometry(0.1, 0.3, 14, 8);
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9 });
  const antenna = new THREE.Mesh(antennaGeo, antennaMat);
  antenna.position.set(0, 55, 0);
  sonangol.add(antenna);

  const beaconMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.6 })
  );
  beaconMesh.position.set(0, 62, 0);
  sonangol.add(beaconMesh);

  // Todas as 18 moradias estão agora consolidadas no Condomínio Vila Atlântica (sem casas soltas na cidade).
  // POSTO DE COMBUSTÍVEL SONANGOL (Talatona Leste — x=138, z=45 para não colidir com Boutique em (114, 26))
  const buildGasStation = (x: number, z: number) => {
    const stationGroup = new THREE.Group();
    const canopyGeo = new THREE.BoxGeometry(22, 1.2, 16);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 6.5, 0);
    canopy.castShadow = true;
    stationGroup.add(canopy);

    for (const px of [-7, 7]) {
      for (const pz of [-5, 5]) {
        const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, 6.5, 16);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(px, 3.25, pz);
        stationGroup.add(pillar);
      }
    }

    for (const bz of [-2.5, 2.5]) {
      const pumpGeo = new THREE.BoxGeometry(1.6, 2.2, 1.2);
      const pumpMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3 });
      const pump = new THREE.Mesh(pumpGeo, pumpMat);
      pump.position.set(0, 1.1, bz);
      stationGroup.add(pump);
    }

    const shopGeo = new THREE.BoxGeometry(14, 4.5, 10);
    const shopMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
    const shop = new THREE.Mesh(shopGeo, shopMat);
    shop.position.set(0, 2.25, -16);
    shop.castShadow = true;
    stationGroup.add(shop);

    stationGroup.position.set(x, 0, z);
    root.add(stationGroup);

    colliders.push(new THREE.Box3().setFromObject(shop));
  };
  buildGasStation(138, 45);
  interactables.push({
    id: 'posto-sonangol',
    type: 'station',
    title: 'Posto Sonangol Talatona ⛽',
    subtitle: 'Gasolina e Conveniência',
    prompt: '[E] Abastecer e Comprar Mantimentos',
    position: [138, 0.5, 45],
    radius: 4.2,
    district: 'talatona',
  });

  // QUIOSQUES GASTRONÓMICOS DA ILHA DE LUANDA
  const buildBeachKiosk = (x: number, z: number, name: string, foodName: string) => {
    const kioskGroup = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(6, 3.2, 5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 1.6;
    kioskGroup.add(base);

    const counterGeo = new THREE.BoxGeometry(5.2, 1.1, 1.4);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 });
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.set(0, 1.1, 2.6);
    kioskGroup.add(counter);

    const roofGeo = new THREE.ConeGeometry(5.2, 2.2, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 4.2;
    kioskGroup.add(roof);

    for (const offset of [-4.5, 4.5]) {
      const tableGeo = new THREE.CylinderGeometry(1.2, 1.2, 1, 16);
      const tableMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const table = new THREE.Mesh(tableGeo, tableMat);
      table.position.set(offset, 0.5, 3);
      kioskGroup.add(table);

      const umbrellaGeo = new THREE.ConeGeometry(2, 0.8, 8);
      const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
      const umbrella = new THREE.Mesh(umbrellaGeo, umbrellaMat);
      umbrella.position.set(offset, 2.5, 3);
      kioskGroup.add(umbrella);
    }

    kioskGroup.position.set(x, 0, z);
    root.add(kioskGroup);

    colliders.push(new THREE.Box3().setFromObject(base));

    interactables.push({
      id: `kiosk-${name.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'food',
      title: `${name} 🐟🍲`,
      subtitle: `Especialidade: ${foodName} & Cuca Gelada`,
      prompt: '[E] Comer Gastronomia Angolana',
      position: [x, 0.5, z + 2],
      radius: 3.5,
      district: 'ilha',
      data: { food: foodName },
    });
  };

  buildBeachKiosk(-30, -64, 'Kioske Ilha Dourada', 'Mufete de Peixe com Feijão de Óleo de Palma');
  buildBeachKiosk(-28, 40, 'Esplanada Mar e Sol', 'Calulu de Peixe Seco & Funge');

  // PRAÇA CENTRAL & MERCADO POPULAR DE VIANA (Calçada, Fonte, Bancas Detalhadas, Bancos, Árvores & Descarga da Fazenda)
  const buildPracaAndMarket = (centerX: number, centerZ: number) => {
    const marketGroup = new THREE.Group();
    const cobbleTex = getCachedCobbleTexture(8, 7);
    const plazaFloor = new THREE.Mesh(
      new THREE.BoxGeometry(44, 0.16, 36),
      new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.78 })
    );
    plazaFloor.position.set(0, 0.08, 0);
    plazaFloor.receiveShadow = true;
    marketGroup.add(plazaFloor);

    // Fonte Central da Praça
    const fountainMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });
    const basinOuter = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.9, 0.85, 20), fountainMat);
    basinOuter.position.set(0, 0.45, 0);
    marketGroup.add(basinOuter);
    const basinWater = new THREE.Mesh(
      new THREE.CylinderGeometry(3.15, 3.15, 0.72, 20),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.12, metalness: 0.35 })
    );
    basinWater.position.set(0, 0.56, 0);
    marketGroup.add(basinWater);
    const midTier = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.0, 2.1, 12), fountainMat);
    midTier.position.set(0, 1.5, 0);
    marketGroup.add(midTier);
    const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.7, 0.45, 16), fountainMat);
    topBowl.position.set(0, 2.35, 0);
    marketGroup.add(topBowl);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(centerX, 1.2, centerZ),
        new THREE.Vector3(6.8, 2.6, 6.8)
      )
    );

    // Bancas do Mercado com toldos listrados, caixotes e sacos de mantimentos
    const colors = [0xdc2626, 0x2563eb, 0xfacc15, 0x16a34a, 0x9333ea, 0xea580c];
    const stallCoords: [number, number][] = [
      [-12, -11], [-4, -11], [4, -11], [12, -11],
      [-12, 11], [-4, 11], [4, 11], [12, 11],
    ];
    stallCoords.forEach(([sx, sz], i) => {
      const stall = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 });
      const bench = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 2.2), woodMat);
      bench.position.y = 0.52;
      stall.add(bench);

      // Caixotes de frutas e legumes (laranja, verde, vermelho, sacos creme)
      const crateOffsets = [-1.25, 0, 1.25];
      crateOffsets.forEach((cxOff, cIdx) => {
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 0.42, 1.4),
          new THREE.MeshStandardMaterial({ color: colors[(i + cIdx) % colors.length], roughness: 0.65 })
        );
        crate.position.set(cxOff, 1.22, 0);
        stall.add(crate);
      });

      const tarp = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.18, 3.0),
        new THREE.MeshStandardMaterial({ color: colors[(i + 1) % colors.length], roughness: 0.55 })
      );
      tarp.position.set(0, 2.55, 0);
      tarp.rotation.x = sz < 0 ? 0.1 : -0.1;
      stall.add(tarp);

      for (const cx of [-2.05, 2.05]) {
        for (const cz of [-1.25, 1.25]) {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 2.55, 8),
            new THREE.MeshStandardMaterial({ color: 0x334155 })
          );
          pole.position.set(cx, 1.28, cz);
          stall.add(pole);
        }
      }

      stall.position.set(sx, 0, sz);
      marketGroup.add(stall);
      colliders.push(
        new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(centerX + sx, 1.3, centerZ + sz),
          new THREE.Vector3(4.5, 2.6, 2.6)
        )
      );
    });

    // Bancos de Jardim e Candeeiros Ornamentais na Praça
    for (const [bx, bz, rot] of [[-7.5, 0, Math.PI / 2], [7.5, 0, -Math.PI / 2], [0, -6.5, 0], [0, 6.5, Math.PI]] as [number, number, number][]) {
      const bGroup = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.75), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.75 }));
      seat.position.y = 0.52;
      bGroup.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.14), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.75 }));
      back.position.set(0, 0.85, -0.32);
      bGroup.add(back);
      bGroup.position.set(bx, 0, bz);
      bGroup.rotation.y = rot;
      marketGroup.add(bGroup);
    }

    // Árvores ornamentais nos 4 cantos da Praça
    for (const [tx, tz] of [[-18, -14], [18, -14], [-18, 14], [18, 14]]) {
      const tGroup = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 3.8, 8), new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }));
      trunk.position.y = 1.9;
      tGroup.add(trunk);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 }));
      crown.position.y = 4.6;
      tGroup.add(crown);
      tGroup.position.set(tx, 0, tz);
      marketGroup.add(tGroup);
      swayingTrees.push(tGroup);
    }

    // Placa da Praça & Ponto de Descarga Agrícola
    const dockSignC = document.createElement('canvas');
    dockSignC.width = 512;
    dockSignC.height = 128;
    const dctx = dockSignC.getContext('2d')!;
    dctx.fillStyle = '#052e16';
    dctx.fillRect(0, 0, 512, 128);
    dctx.strokeStyle = '#4ade80';
    dctx.lineWidth = 8;
    dctx.strokeRect(4, 4, 504, 120);
    dctx.fillStyle = '#fde047';
    dctx.font = 'bold 34px sans-serif';
    dctx.textAlign = 'center';
    dctx.textBaseline = 'middle';
    dctx.fillText('PRAÇA & DESCARGA AGRÍCOLA 🥬', 256, 64);
    const dockTex = new THREE.CanvasTexture(dockSignC);
    dockTex.colorSpace = THREE.SRGBColorSpace;
    const dockBoard = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8), new THREE.MeshBasicMaterial({ map: dockTex, side: THREE.DoubleSide }));
    dockBoard.position.set(-16, 2.8, 4);
    dockBoard.rotation.y = Math.PI / 2;
    marketGroup.add(dockBoard);

    marketGroup.position.set(centerX, 0, centerZ);
    root.add(marketGroup);

    interactables.push({
      id: 'mercado-viana',
      type: 'market',
      title: 'Praça Central & Mercado de Viana 🛒',
      subtitle: 'Comércio Popular de Luanda — Frutas, Legumes, Panos e Artesanato',
      prompt: '[E] Comprar Produtos Frescos',
      position: [centerX, 0.5, centerZ - 6],
      radius: 6,
      district: 'viana',
    });

    interactables.push({
      id: 'praca-descarga',
      type: 'farm_unload',
      title: 'Descarga Agrícola da Praça 🥬🚚',
      subtitle: 'Entregar caixas cultivadas na Fazenda e receber +7.500 Kz',
      prompt: '[E] Descarregar Mercadoria da Fazenda',
      position: [centerX - 16, 0.5, centerZ + 4],
      radius: 5.5,
      district: 'viana',
    });
  };
  buildPracaAndMarket(132, -40);

  // 8. ALUGUER DE MOTO KUPAPATA NA PRAIA (AO LADO DO SPAWN E DJ) — Sem carros grátis espalhados pela rua!
  {
    const kiosk = new THREE.Group();
    const kBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 }));
    kBase.position.y = 0.55;
    kiosk.add(kBase);
    const kRoof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 2.8), new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }));
    kRoof.position.y = 2.8;
    kiosk.add(kRoof);
    for (const px of [-1.45, 1.45]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 }));
      p.position.set(px, 1.4, -0.9);
      kiosk.add(p);
    }
    const rCanvas = document.createElement('canvas');
    rCanvas.width = 512;
    rCanvas.height = 128;
    const rctx = rCanvas.getContext('2d')!;
    rctx.fillStyle = '#0f172a';
    rctx.fillRect(0, 0, 512, 128);
    rctx.strokeStyle = '#f97316';
    rctx.lineWidth = 8;
    rctx.strokeRect(4, 4, 504, 120);
    rctx.fillStyle = '#facc15';
    rctx.font = 'bold 34px sans-serif';
    rctx.textAlign = 'center';
    rctx.textBaseline = 'middle';
    rctx.fillText('ALUGUER KUPAPATA 🏍️', 256, 46);
    rctx.fillStyle = '#ffffff';
    rctx.font = 'bold 26px sans-serif';
    rctx.fillText('2.500 Kz • 20 MINUTOS (PRAIA)', 256, 92);
    const rTex = new THREE.CanvasTexture(rCanvas);
    rTex.colorSpace = THREE.SRGBColorSpace;
    const rBoard = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.85), new THREE.MeshBasicMaterial({ map: rTex, side: THREE.DoubleSide }));
    rBoard.position.set(0, 2.35, 1.35);
    kiosk.add(rBoard);
    kiosk.position.set(MOTO_RENTAL_POS[0], 0, MOTO_RENTAL_POS[2]);
    kiosk.rotation.y = Math.PI / 2;
    root.add(kiosk);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(MOTO_RENTAL_POS[0], 1.4, MOTO_RENTAL_POS[2]), new THREE.Vector3(2.4, 2.8, 3.4)));

    // Moto Kupapata em exposição decorativa ao lado do quiosque (não conduzível grátis!)
    const displayMoto = createMotoVehicle(MOTO_RENTAL_POS[0] + 1.8, MOTO_RENTAL_POS[2] + 2.4, -Math.PI / 4, 'display-moto-praia', '#f97316', 'ALUGUER');
    root.add(displayMoto.mesh);

    interactables.push({
      id: 'praia-moto-rental',
      type: 'moto_rental',
      title: 'Aluguer de Motorizada Kupapata 🏍️',
      subtitle: 'Aluga uma Kupapata 150cc por 2.500 Kz (20 min) ao lado do DJ da Praia',
      prompt: '[E] Alugar Motorizada Kupapata (2.500 Kz)',
      position: MOTO_RENTAL_POS,
      radius: 4.8,
      district: 'ilha',
    });
  }

  // 9. VEGETAÇÃO INSTANCIADA (COQUEIROS + ÁRVORES FRONDOSAS + IMBONDEIROS DE ANGOLA — Sem árvores em estradas!)
  const palmPositions: { x: number; z: number; s: number }[] = [];
  for (let z = -168; z <= 168; z += 22) {
    if (!isOnRoad(-32.8, z, 1.0)) palmPositions.push({ x: -32.8, z, s: 1.0 + ((Math.abs(z) % 5) * 0.06) });
    if (!isOnRoad(-18.2, z + 11, 1.0)) palmPositions.push({ x: -18.2, z: z + 11, s: 0.92 + ((Math.abs(z) % 3) * 0.05) });
  }
  for (let z = 20; z <= 148; z += 26) {
    if (!isOnRoad(76, z, 1.5)) palmPositions.push({ x: 76, z, s: 1.1 });
    if (!isOnRoad(103, z, 1.5)) palmPositions.push({ x: 103, z, s: 1.1 });
  }
  for (let x = 20; x <= 180; x += 32) {
    if (!isOnRoad(x, -13.5, 1.0)) palmPositions.push({ x, z: -13.5, s: 0.95 });
    if (!isOnRoad(x, 13.5, 1.0)) palmPositions.push({ x, z: 13.5, s: 0.95 });
  }

  const trunkBaseGeo = new THREE.CylinderGeometry(0.24, 0.44, 7, 8);
  trunkBaseGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x785a3a, roughness: 0.9 });
  const palmTrunksInst = new THREE.InstancedMesh(trunkBaseGeo, trunkMat, Math.max(1, palmPositions.length));
  palmTrunksInst.castShadow = false;

  const frondBaseGeo = new THREE.ConeGeometry(2.3, 0.85, 5);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.62 });
  const palmFrondsInst = new THREE.InstancedMesh(frondBaseGeo, frondMat, Math.max(1, palmPositions.length * 7));
  palmFrondsInst.castShadow = false;

  const dummyObj = new THREE.Object3D();
  const frondDummy = new THREE.Object3D();
  let frondIdx = 0;

  palmPositions.forEach((p, idx) => {
    dummyObj.position.set(p.x, 0, p.z);
    dummyObj.rotation.set(0, idx * 0.55, ((idx % 3) - 1) * 0.04);
    dummyObj.scale.set(p.s, p.s, p.s);
    dummyObj.updateMatrix();
    palmTrunksInst.setMatrixAt(idx, dummyObj.matrix);

    for (let f = 0; f < 7; f++) {
      const angle = (f / 7) * Math.PI * 2 + idx * 0.3;
      frondDummy.position.set(
        p.x + Math.cos(angle) * 1.35 * p.s,
        6.75 * p.s,
        p.z + Math.sin(angle) * 1.35 * p.s
      );
      frondDummy.rotation.set(-Math.sin(angle) * 0.68, 0, Math.cos(angle) * 0.68);
      frondDummy.scale.set(p.s, p.s, p.s);
      frondDummy.updateMatrix();
      palmFrondsInst.setMatrixAt(frondIdx++, frondDummy.matrix);
    }

    colliders.push(
      new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.x, 2, p.z), new THREE.Vector3(0.95, 4, 0.95))
    );
  });

  palmTrunksInst.instanceMatrix.needsUpdate = true;
  palmFrondsInst.instanceMatrix.needsUpdate = true;
  palmTrunksInst.computeBoundingSphere();
  palmFrondsInst.computeBoundingSphere();
  root.add(palmTrunksInst);
  root.add(palmFrondsInst);

  // Árvores Frondosas Urbanas (Acácias & Mulembas)
  const rawCanopyTreeCoords: [number, number][] = [
    [36, 16], [56, 16], [56, -16], [36, -16],
    [104, 18], [104, -18], [136, -18], [160, -18],
    [72, 92], [104, 92], [72, 132], [104, 132],
    [118, -58], [148, -58], [22, 68], [58, 68],
  ];
  const canopyTreeCoords = rawCanopyTreeCoords.filter(([tx, tz]) => !isOnRoad(tx, tz, 2.2));
  const uTrunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 3.8, 7);
  uTrunkGeo.translate(0, 1.9, 0);
  const uCrownGeo = new THREE.DodecahedronGeometry(2.4, 1);
  const uCrownMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.78 });
  const uTrunksInst = new THREE.InstancedMesh(uTrunkGeo, trunkMat, Math.max(1, canopyTreeCoords.length));
  const uCrownsInst = new THREE.InstancedMesh(uCrownGeo, uCrownMat, Math.max(1, canopyTreeCoords.length * 2));
  let uCrownIdx = 0;
  canopyTreeCoords.forEach(([tx, tz], idx) => {
    const s = 0.95 + (idx % 3) * 0.14;
    dummyObj.position.set(tx, 0, tz);
    dummyObj.rotation.set(0, idx * 0.8, 0);
    dummyObj.scale.set(s, s, s);
    dummyObj.updateMatrix();
    uTrunksInst.setMatrixAt(idx, dummyObj.matrix);

    dummyObj.position.set(tx, 4.7 * s, tz);
    dummyObj.scale.set(s * 1.1, s * 0.85, s * 1.1);
    dummyObj.updateMatrix();
    uCrownsInst.setMatrixAt(uCrownIdx++, dummyObj.matrix);

    dummyObj.position.set(tx + 0.8 * s, 5.5 * s, tz - 0.5 * s);
    dummyObj.scale.set(s * 0.72, s * 0.68, s * 0.72);
    dummyObj.updateMatrix();
    uCrownsInst.setMatrixAt(uCrownIdx++, dummyObj.matrix);

    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(tx, 2, tz), new THREE.Vector3(0.95, 4, 0.95)));
  });
  uTrunksInst.instanceMatrix.needsUpdate = true;
  uCrownsInst.instanceMatrix.needsUpdate = true;
  uTrunksInst.computeBoundingSphere();
  uCrownsInst.computeBoundingSphere();
  root.add(uTrunksInst);
  root.add(uCrownsInst);

  // Imbondeiros (Embondeiros / Baobás típicos de Angola — instanciados para alta performance!)
  const rawBaobabCoords: [number, number][] = [
    [168, 72], [166, -135], [220, 48], [218, -68], [260, 72], [148, 128], [40, 126], [36, -126],
  ];
  const baobabCoords = rawBaobabCoords.filter(([bx, bz]) => !isOnRoad(bx, bz, 4.5));
  if (baobabCoords.length > 0) {
    const bTrunkGeo = new THREE.CylinderGeometry(1.15, 2.05, 6.2, 9);
    bTrunkGeo.translate(0, 3.1, 0);
    const bTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5b4b, roughness: 0.94 });
    const bTrunksInst = new THREE.InstancedMesh(bTrunkGeo, bTrunkMat, baobabCoords.length);
    const bCrownGeo = new THREE.SphereGeometry(3.4, 8, 6);
    bCrownGeo.scale(1.35, 0.52, 1.35);
    const bCrownMat = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.85 });
    const bCrownsInst = new THREE.InstancedMesh(bCrownGeo, bCrownMat, baobabCoords.length * 2);
    let bCIdx = 0;
    baobabCoords.forEach(([bx, bz], idx) => {
      const s = 0.95 + (idx % 3) * 0.12;
      dummyObj.position.set(bx, 0, bz);
      dummyObj.rotation.set(0, idx * 1.1, 0);
      dummyObj.scale.set(s, s, s);
      dummyObj.updateMatrix();
      bTrunksInst.setMatrixAt(idx, dummyObj.matrix);

      dummyObj.position.set(bx, 6.6 * s, bz);
      dummyObj.scale.set(s, s, s);
      dummyObj.updateMatrix();
      bCrownsInst.setMatrixAt(bCIdx++, dummyObj.matrix);

      dummyObj.position.set(bx + 1.4 * s, 7.2 * s, bz - 1.0 * s);
      dummyObj.scale.set(s * 0.78, s * 0.72, s * 0.78);
      dummyObj.updateMatrix();
      bCrownsInst.setMatrixAt(bCIdx++, dummyObj.matrix);

      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(bx, 3.0, bz), new THREE.Vector3(3.1, 6.0, 3.1)));
    });
    bTrunksInst.instanceMatrix.needsUpdate = true;
    bCrownsInst.instanceMatrix.needsUpdate = true;
    bTrunksInst.computeBoundingSphere();
    bCrownsInst.computeBoundingSphere();
    root.add(bTrunksInst);
    root.add(bCrownsInst);
  }

  // 10. POSTES DE ILUMINAÇÃO PÚBLICA ORGANIZADOS (Ambos os lados das vias com braço para o asfalto!)
  const lampEntries: { x: number; z: number; rotY: number }[] = [];
  for (let z = -190; z <= 190; z += 32) {
    lampEntries.push({ x: -16.8, z, rotY: 0 }); // Marginal Oeste
    lampEntries.push({ x: 3.0, z, rotY: Math.PI }); // Marginal Este
    lampEntries.push({ x: 80.2, z, rotY: 0 }); // Talatona/Kilamba Oeste
    lampEntries.push({ x: 99.8, z, rotY: Math.PI }); // Talatona/Kilamba Este
  }
  for (let x = 18; x <= 210; x += 34) {
    lampEntries.push({ x, z: -10.2, rotY: -Math.PI / 2 });
    lampEntries.push({ x, z: 10.2, rotY: Math.PI / 2 });
  }

  const lampPoleGeo = new THREE.CylinderGeometry(0.11, 0.18, 7.2, 8);
  lampPoleGeo.translate(0, 3.6, 0);
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.28 });
  const lampPolesInst = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampEntries.length);

  const lampArmGeo = new THREE.BoxGeometry(1.4, 0.12, 0.12);
  const lampArmsInst = new THREE.InstancedMesh(lampArmGeo, lampPoleMat, lampEntries.length);

  const lampHeadGeo = new THREE.BoxGeometry(0.95, 0.18, 0.45);
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfef08a,
    emissiveIntensity: 1.0,
  });

  const entriesByDistrict: Record<string, { x: number; z: number; rotY: number }[]> = {};
  lampEntries.forEach(({ x: lx, z: lz, rotY }, idx) => {
    const dirX = Math.cos(rotY);
    const dirZ = -Math.sin(rotY);

    dummyObj.position.set(lx, 0, lz);
    dummyObj.rotation.set(0, rotY, 0);
    dummyObj.scale.set(1, 1, 1);
    dummyObj.updateMatrix();
    lampPolesInst.setMatrixAt(idx, dummyObj.matrix);

    dummyObj.position.set(lx + dirX * 0.68, 7.1, lz + dirZ * 0.68);
    dummyObj.rotation.set(0, rotY, 0);
    dummyObj.updateMatrix();
    lampArmsInst.setMatrixAt(idx, dummyObj.matrix);

    const dId = resolveNearestDistrictId(lx, lz);
    if (!entriesByDistrict[dId]) entriesByDistrict[dId] = [];
    entriesByDistrict[dId].push({ x: lx, z: lz, rotY });

    colliders.push(
      new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(lx, 2, lz), new THREE.Vector3(0.55, 4, 0.55))
    );
  });

  Object.entries(entriesByDistrict).forEach(([distId, list]) => {
    const dMat = lampHeadMat.clone();
    const dHeads = new THREE.InstancedMesh(lampHeadGeo, dMat, list.length);
    list.forEach(({ x: lx, z: lz, rotY }, i) => {
      const dirX = Math.cos(rotY);
      const dirZ = -Math.sin(rotY);
      dummyObj.position.set(lx + dirX * 1.28, 7.0, lz + dirZ * 1.28);
      dummyObj.rotation.set(0, rotY, 0);
      dummyObj.scale.set(1, 1, 1);
      dummyObj.updateMatrix();
      dHeads.setMatrixAt(i, dummyObj.matrix);
    });
    dHeads.instanceMatrix.needsUpdate = true;
    dHeads.computeBoundingSphere();
    root.add(dHeads);

    // 1 PointLight real por bairro para apagar visivelmente a iluminação durante apagões ENDE
    const anchor = list[Math.floor(list.length / 2)] || list[0];
    const distLight = new THREE.PointLight(0xfef08a, 1.2, 46, 1.5);
    distLight.position.set(anchor.x, 6.5, anchor.z);
    root.add(distLight);
    streetLamps.push(distLight);
    streetLampsByDistrict[distId] = [{ light: distLight, bulbMat: dMat }];
  });

  lampPolesInst.instanceMatrix.needsUpdate = true;
  lampArmsInst.instanceMatrix.needsUpdate = true;
  lampPolesInst.computeBoundingSphere();
  lampArmsInst.computeBoundingSphere();
  root.add(lampPolesInst);
  root.add(lampArmsInst);

  // 11. PLACAS DE SINALIZAÇÃO RODOVIÁRIA
  const buildRoadSign = (x: number, z: number, rotY: number, line1: string, line2: string) => {
    const signGroup = new THREE.Group();

    for (const sx of [-1.2, 1.2]) {
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(sx, 2.5, 0);
      signGroup.add(pole);
    }

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 768;
    signCanvas.height = 256;
    const sctx = signCanvas.getContext('2d')!;
    sctx.fillStyle = '#14532d';
    sctx.fillRect(0, 0, 768, 256);
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 10;
    sctx.strokeRect(8, 8, 752, 240);

    sctx.font = 'bold 48px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.lineWidth = 7;
    sctx.strokeStyle = '#000000';
    sctx.strokeText(line1, 384, 88);
    sctx.fillStyle = '#ffffff';
    sctx.fillText(line1, 384, 88);

    sctx.font = 'bold 40px sans-serif';
    sctx.strokeText(line2, 384, 174);
    sctx.fillStyle = '#fde047';
    sctx.fillText(line2, 384, 174);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const boardGeo = new THREE.BoxGeometry(4.6, 1.7, 0.16);
    const boardMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.35,
      roughness: 0.25,
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 4.5, 0);
    signGroup.add(board);

    signGroup.position.set(x, 0, z);
    signGroup.rotation.y = rotY;
    root.add(signGroup);

    colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, 2, z),
      new THREE.Vector3(3.8, 4.5, 0.8)
    ));
  };

  buildRoadSign(68, -15, 0, '← ILHA DE LUANDA', 'VIANA / KILAMBA →');
  buildRoadSign(68, 15, Math.PI, 'TALATONA ↓', 'CENTRO / MAIANGA ↑');

  // Viaturas Exclusivas de Trabalho/Facção (Apenas membros PNA, INEMA podem conduzir!)
  const pna1 = createPoliceVehicle(214, 109, 0, 'policia-pna-1', 'PNA-01-LD');
  root.add(pna1.mesh);
  drivableVehicles.push(pna1);
  interactables.push({
    id: 'policia-pna-1',
    type: 'vehicle',
    title: 'Viatura Polícia Nacional #1 🚓',
    subtitle: 'Uso exclusivo de Agentes da PNA',
    prompt: '[E] Conduzir Viatura Policial (PNA)',
    position: [214, 0.5, 109],
    radius: 4.5,
    district: 'complexo_pna',
    data: { vehicleId: 'policia-pna-1', isDrivable: true, factionOnly: 'policia' },
  });

  const pna2 = createPoliceVehicle(238, 109, Math.PI, 'policia-pna-2', 'PNA-02-LD');
  root.add(pna2.mesh);
  drivableVehicles.push(pna2);
  interactables.push({
    id: 'policia-pna-2',
    type: 'vehicle',
    title: 'Viatura Polícia Nacional #2 🚓',
    subtitle: 'Uso exclusivo de Agentes da PNA',
    prompt: '[E] Conduzir Viatura Policial (PNA)',
    position: [238, 0.5, 109],
    radius: 4.5,
    district: 'complexo_pna',
    data: { vehicleId: 'policia-pna-2', isDrivable: true, factionOnly: 'policia' },
  });

  const amb1 = createAmbulanceVehicle(34, 54, -Math.PI / 2, 'inema-amb-1', 'INEMA-04');
  root.add(amb1.mesh);
  drivableVehicles.push(amb1);
  interactables.push({
    id: 'inema-amb-1',
    type: 'vehicle',
    title: 'Ambulância INEMA 🚑',
    subtitle: 'Uso exclusivo de Médicos INEMA',
    prompt: '[E] Conduzir Ambulância (INEMA)',
    position: [34, 0.5, 54],
    radius: 4.5,
    district: 'maianga',
    data: { vehicleId: 'inema-amb-1', isDrivable: true, factionOnly: 'hospital' },
  });

  // Vitrine Decorativa na Concessionária (Apenas exposição — compras na Concessionária!)
  const posterShowcaseCars: {
    id: string;
    cat: 'sport' | 'supercar' | 'muscle';
    modelId: string;
    title: string;
    x: number;
    z: number;
    rotY: number;
    color: string;
    accent: string;
    skinId: string;
    plate: string;
    district: CityData['districts'][number]['id'];
  }[] = [
    {
      id: 'bmw-m4-stand',
      cat: 'sport',
      modelId: 'bmw_m4',
      title: 'BMW M4 (Exposição CICOMEX Motors)',
      x: 6,
      z: -42,
      rotY: 0,
      color: '#09090b',
      accent: '#9333ea',
      skinId: 'bmw_m4_purple',
      plate: 'CICOMEX-M4',
      district: 'centro',
    },
    {
      id: 'supra-kanji-stand',
      cat: 'sport',
      modelId: 'toyota_supra',
      title: 'Toyota Supra Kanji (Exposição CICOMEX Motors)',
      x: 26,
      z: -42,
      rotY: -0.4,
      color: '#06b6d4',
      accent: '#09090b',
      skinId: 'supra_cyan_kanji',
      plate: 'CICOMEX-GR',
      district: 'centro',
    },
    {
      id: 'gtr-r35-stand',
      cat: 'supercar',
      modelId: 'nissan_gtr_r35',
      title: 'Nissan GTR R35 (Exposição CICOMEX Motors)',
      x: 6,
      z: -32,
      rotY: Math.PI / 4,
      color: '#1d4ed8',
      accent: '#09090b',
      skinId: 'gtr_blue',
      plate: 'CICOMEX-GTR',
      district: 'centro',
    },
  ];

  posterShowcaseCars.forEach((sc) => {
    const car = createSportCarVehicle(
      sc.cat,
      sc.x,
      sc.z,
      sc.rotY,
      sc.id,
      sc.modelId,
      sc.title,
      sc.color,
      sc.plate,
      sc.skinId,
      sc.accent
    );
    root.add(car.mesh);
    interactables.push({
      id: sc.id,
      type: 'dealership',
      title: `${sc.title} 🏎️`,
      subtitle: 'Modelo em exposição • Compra na Concessionária CICOMEX Motors',
      prompt: '[E] Ver Preço & Comprar na CICOMEX Motors',
      position: [sc.x, 0.5, sc.z],
      radius: 4.0,
      district: sc.district,
    });
  });

  // 12. NOVAS ZONAS EXPANDIDAS DE LUANDA RP (Aeroporto, Porto, Oficina, Lojas, Propriedades)

  // A) Aeroporto Internacional 4 de Fevereiro (Península Oeste-Norte + Ponte de Acesso + Aviões TAAG)
  const airportDeck = new THREE.Mesh(
    new THREE.BoxGeometry(84, 0.6, 70),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75 })
  );
  airportDeck.position.set(-94, -0.1, -95);
  airportDeck.receiveShadow = true;
  root.add(airportDeck);

  const bridgeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(42, 0.45, 14),
    roadMat
  );
  bridgeMesh.position.set(-34, 0.04, -95);
  root.add(bridgeMesh);

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(76, 12),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(-94, 0.22, -112);
  root.add(runway);

  const buildAirplaneMesh = (accentHex = 0xdc2626) => {
    const plane = new THREE.Group();
    const fuseMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.25 });
    const tailMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.15, metalness: 0.6 });
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 13, 12), fuseMat);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.position.y = 1.6;
    plane.add(fuselage);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 12), fuseMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(7.7, 1.6, 0);
    plane.add(nose);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.2), glassMat);
    cockpit.position.set(6.1, 2.2, 0);
    plane.add(cockpit);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 14.5), fuseMat);
    wings.position.set(0.5, 1.45, 0);
    plane.add(wings);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 5.2), tailMat);
    tailWing.position.set(-5.6, 1.8, 0);
    plane.add(tailWing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.22), tailMat);
    fin.position.set(-5.6, 2.9, 0);
    plane.add(fin);
    return plane;
  };

  for (const [ax, az, rot] of [[-114, -102, 0.25], [-74, -102, -0.3]] as [number, number, number][]) {
    const parkedPlane = buildAirplaneMesh(0xdc2626);
    parkedPlane.position.set(ax, 0.25, az);
    parkedPlane.rotation.y = rot;
    root.add(parkedPlane);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(ax, 1.8, az), new THREE.Vector3(11, 3.6, 11)));
  }

  for (let a = 0; a < 2; a++) {
    const flyPlane = buildAirplaneMesh(a === 0 ? 0xdc2626 : 0xfacc15);
    flyPlane.scale.set(1.15, 1.15, 1.15);
    root.add(flyPlane);
    airplanes.push({
      group: flyPlane,
      centerX: -65,
      centerZ: -95,
      radius: 135 + a * 35,
      altitude: 66 + a * 18,
      speed: 0.18 - a * 0.04,
      angle: a * Math.PI,
    });
  }

  buildComplex('AeroportoTerminal', -105, -80, 26, 12, 16, '#0ea5e9', 0x0f172a, 'AEROPORTO 4 DE FEV. ✈️', 0x0284c7);
  const ctrlTower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.2, 24, 8),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
  );
  ctrlTower.position.set(-84, 12, -80);
  root.add(ctrlTower);
  interactables.push({
    id: 'aeroporto-luanda',
    type: 'airport',
    title: 'Aeroporto Internacional 4 de Fevereiro ✈️',
    subtitle: 'Terminal Aéreo & Central de Empregos VIP',
    prompt: '[E] Aceder ao Terminal / Trabalhos Aéreos',
    position: [-104, 0.5, -70],
    radius: 4.5,
    district: 'aeroporto',
  });
  interactables.push({
    id: 'aeroporto-checkin-taag',
    type: 'airport_checkin',
    title: 'Balcão Check-in TAAG • Voos de Luanda ✈️🎫',
    subtitle: 'Compra bilhete e viaja em avião pelas 5 rotas de Luanda',
    prompt: '[E] Comprar Bilhete & Voar de Avião',
    position: [-95, 0.5, -70],
    radius: 4.5,
    district: 'aeroporto',
  });

  // B) Porto de Luanda (Cacuaco Norte)
  buildComplex('PortoLuanda', 65, -135, 30, 14, 16, '#1e293b', 0x0284c7, 'PORTO DE LUANDA 🚢', 0xf59e0b);
  const containerColors = [0xdc2626, 0x2563eb, 0x16a34a, 0xd97706];
  for (let i = 0; i < 4; i++) {
    const cont = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3.2, 3),
      new THREE.MeshStandardMaterial({ color: containerColors[i], roughness: 0.6 })
    );
    cont.position.set(46 + i * 8, 1.6, -120);
    root.add(cont);
    colliders.push(new THREE.Box3().setFromObject(cont));
  }
  interactables.push({
    id: 'porto-luanda',
    type: 'port',
    title: 'Porto Marítimo de Luanda 🚢',
    subtitle: 'Terminal de Contentores & Logística Pesada',
    prompt: '[E] Ver Contratos do Porto & Empregos',
    position: [65, 0.5, -124],
    radius: 5.5,
    district: 'cacuaco',
  });

  // C) Zona Industrial Viana & Mercado Ilegal (Beco escondido atrás da fábrica)
  buildComplex('FabricaViana', 142, -82, 24, 14, 18, '#475569', 0x78350f, 'ZONA INDUSTRIAL VIANA 🏭', 0xf59e0b);
  interactables.push({
    id: 'mercado-ilegal',
    type: 'blackmarket',
    title: 'Beco Clandestino (Mercado Negro RP) 🕶️',
    subtitle: 'Ferramentas ilegais, contrabando e lavagem fictícia RP',
    prompt: '[E] Falar com Contacto Clandestino',
    position: [152, 0.5, -58],
    radius: 4.5,
    district: 'viana',
  });

  // D) Concessionária CICOMEX MOTORS & Garagem Pública (Centro)
  buildComplex('Concessionaria', 16, -56, 18, 10, 14, '#0284c7', 0xfacc15, 'CONCESSIONÁRIA CICOMEX MOTORS', 0xfacc15);
  interactables.push({
    id: 'concessionaria-centro',
    type: 'dealership',
    title: 'Concessionária CICOMEX Motors 🚘',
    subtitle: 'Compra de viaturas novas & Test Drive gratuito (90s)',
    prompt: '[E] Comprar ou Test Drive na CICOMEX Motors',
    position: [15, 0.5, -46],
    radius: 4.2,
    district: 'centro',
  });
  interactables.push({
    id: 'enter-cicomex',
    type: 'interior_door',
    title: 'Entrar no Stand CICOMEX Motors 🏢',
    subtitle: 'Salão de exposição e atendimento VIP',
    prompt: '[E] Entrar no Stand CICOMEX',
    position: [20, 0.5, -46],
    radius: 3.2,
    district: 'centro',
    data: {
      interiorId: 'cicomex_interior',
      targetX: INTERIOR_ORIGINS.cicomex_interior[0],
      targetZ: INTERIOR_ORIGINS.cicomex_interior[1] + 6.5,
      targetRot: 0,
      returnX: 20,
      returnZ: -44,
      label: 'CICOMEX Motors',
    },
  });

  interactables.push({
    id: 'garagem-publica',
    type: 'garage',
    title: 'Garagem Pública da Baixa 🅿️',
    subtitle: 'Retirar ou guardar as tuas viaturas pessoais',
    prompt: '[E] Abrir Garagem Pessoal',
    position: [14, 0.5, -14],
    radius: 4.2,
    district: 'centro',
  });

  // E) Oficina Mecânica Auto Luanda (Talatona)
  buildComplex('OficinaTalatona', 108, 66, 18, 9, 14, '#0f766e', 0xf59e0b, 'OFICINA AUTO LUANDA 🔧', 0xf59e0b);
  interactables.push({
    id: 'oficina-talatona',
    type: 'workshop',
    title: 'Oficina Auto Luanda 🔧',
    subtitle: 'Pintura, Motor, Suspensão, Reparação e Multas',
    prompt: '[E] Tunar / Reparar Viatura',
    position: [108, 0.5, 52],
    radius: 5,
    district: 'talatona',
  });

  // F) Tribunal Provincial / Governo de Luanda (Centro)
  buildComplex('TribunalLuanda', 68, -22, 18, 16, 14, '#78350f', 0xfacc15, 'TRIBUNAL & GOVERNO ⚖️', 0xfacc15);
  interactables.push({
    id: 'tribunal-centro',
    type: 'court',
    title: 'Tribunal Provincial & Governo ⚖️',
    subtitle: 'Fianças, Registo Criminal, Facções e Propriedades',
    prompt: '[E] Aceder aos Serviços Cívicos / Justiça',
    position: [68, 0.5, -8],
    radius: 4.5,
    district: 'centro',
  });

  // G) Farmácia Central (Maianga)
  buildComplex('FarmaciaMaianga', 32, 60, 14, 9, 12, '#10b981', 0xffffff, 'FARMÁCIA CENTRAL 💊', 0x10b981);
  interactables.push({
    id: 'farmacia-maianga',
    type: 'pharmacy',
    title: 'Farmácia Central Maianga 💊',
    subtitle: 'Ligaduras, Kits Médicos e Proteção',
    prompt: '[E] Comprar Medicamentos',
    position: [32, 0.5, 48],
    radius: 4,
    district: 'maianga',
  });

  // H) Loja de Roupas & Tecnologia (Centro)
  buildComplex('LojaRoupas', 46, 20, 14, 9, 12, '#ec4899', 0x1e293b, 'MODA & SMARTPHONES 👕', 0xec4899);
  interactables.push({
    id: 'loja-roupas',
    type: 'clothing',
    title: 'Loja Moda Luanda & 5G 👕📱',
    subtitle: 'Roupas, Aparência e Telemóveis Luanda 5G',
    prompt: '[E] Comprar Acessórios / Mudar Roupa',
    position: [46, 0.5, 8],
    radius: 4,
    district: 'centro',
  });

  // I) Supermercado Centralidade do Kilamba (movido para x=64 para não pisar a via x=90)
  buildComplex('SupermercadoKilamba', 64, 140, 22, 11, 16, '#f97316', 0x0f172a, 'SUPERMERCADO KILAMBA 🛒', 0xf97316);
  interactables.push({
    id: 'supermercado-kilamba',
    type: 'market',
    title: 'Supermercado do Kilamba 🛒',
    subtitle: 'Alimentos, bebidas e ferramentas do dia-a-dia',
    prompt: '[E] Comprar Mantimentos',
    position: [64, 0.5, 125],
    radius: 5,
    district: 'kilamba',
  });

  // J) Centro de Empregos Oficial Mutamba (4 Empregos Públicos + 3 Gangues + 3 Orgs Legais)
  interactables.push({
    id: 'centro-empregos-mutamba',
    type: 'job_hub',
    title: 'Centro de Empregos & Organizações 💼',
    subtitle: '4 Empregos Oficiais (Yango, ENDE, Pescador, ELISAL) • OAA • PNA • INEMA',
    prompt: '[E] Escolher Emprego ou Ver Organizações',
    position: [12, 0.5, 14],
    radius: 4,
    district: 'centro',
  });

  // J2) Postos de Emprego, Caixas Elétricas ENDE, Contentores ELISAL, Pesca & Escritório OAA
  JOBS_CATALOG.forEach((job) => {
    const kiosk = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.8, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 })
    );
    pole.position.y = 1.4;
    kiosk.add(pole);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.25, 1.3),
      new THREE.MeshStandardMaterial({ color: job.uniformShirt, roughness: 0.4 })
    );
    roof.position.y = 2.95;
    kiosk.add(roof);
    kiosk.position.set(job.startPos[0], 0, job.startPos[2] - 2.6);
    root.add(kiosk);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(job.startPos[0], 1.4, job.startPos[2] - 2.6),
        new THREE.Vector3(2.6, 3.0, 1.2)
      )
    );

    const hubType: InteractableObject['type'] =
      job.id === 'yango'
        ? 'yango_hub'
        : job.id === 'ende'
          ? 'ende_hub'
          : job.id === 'pescador'
            ? 'pescador_hub'
            : 'elisal_hub';
    interactables.push({
      id: `job-hub-${job.id}`,
      type: hubType,
      title: job.title,
      subtitle: job.description,
      prompt: `[E] Abrir Central ${job.shortTitle}`,
      position: [job.startPos[0], 0.5, job.startPos[2]],
      radius: 4.5,
      district: job.district,
      data: { jobId: job.id },
    });

    if (job.interiorId && INTERIOR_ORIGINS[job.interiorId as keyof typeof INTERIOR_ORIGINS]) {
      const [ix, iz] = INTERIOR_ORIGINS[job.interiorId as keyof typeof INTERIOR_ORIGINS];
      interactables.push({
        id: `enter-${job.interiorId}`,
        type: 'interior_door',
        title: `Entrar na Sede ${job.shortTitle} 🏢`,
        subtitle: `Escritório operacional, uniforme e registos`,
        prompt: `[E] Entrar na Sede ${job.shortTitle}`,
        position: [job.startPos[0] + 2.8, 0.5, job.startPos[2] - 1.5],
        radius: 3.2,
        district: job.district,
        data: {
          interiorId: job.interiorId,
          targetX: ix,
          targetZ: iz + 6.5,
          targetRot: 0,
          returnX: job.startPos[0] + 2.8,
          returnZ: job.startPos[2] + 1.2,
          label: `Sede ${job.shortTitle}`,
        },
      });
    }
  });

  // Caixas Elétricas ENDE espalhadas pela cidade
  ENDE_FAULT_POINTS.forEach((pt) => {
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.9, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.4 })
    );
    boxMesh.position.set(pt.pos[0], 0.95, pt.pos[2]);
    root.add(boxMesh);
    const boltBadge = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 0.45 })
    );
    boltBadge.position.set(pt.pos[0], 1.35, pt.pos[2] + 0.4);
    root.add(boltBadge);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(pt.pos[0], 1.0, pt.pos[2]), new THREE.Vector3(1.2, 2.0, 0.9))
    );
    interactables.push({
      id: pt.id,
      type: 'ende_box',
      title: `${pt.title} ⚡`,
      subtitle: 'Ponto de rede elétrica ENDE — inspeção e reparação de avarias',
      prompt: '[E] Inspecionar / Reparar Quadro ENDE',
      position: [pt.pos[0], 0.5, pt.pos[2] + 1.5],
      radius: 4.5,
      district: pt.district,
      data: { faultPointId: pt.id },
    });
  });

  // Contentores de Recolha ELISAL espalhados pelos bairros
  ELISAL_DUMPSTER_POINTS.forEach((bin) => {
    const dumpster = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.35, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.65 })
    );
    dumpster.position.set(bin.pos[0], 0.68, bin.pos[2]);
    root.add(dumpster);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(bin.pos[0], 0.7, bin.pos[2]), new THREE.Vector3(2.0, 1.5, 1.4))
    );
    interactables.push({
      id: bin.id,
      type: 'elisal_bin',
      title: `${bin.label} 🗑️`,
      subtitle: 'Recolha de resíduos sólidos ELISAL (+Limpeza do Bairro)',
      prompt: '[E] Recolher Contentor ELISAL',
      position: [bin.pos[0], 0.5, bin.pos[2] + 1.8],
      radius: 4.8,
      district: bin.district,
      data: { binId: bin.id },
    });
  });

  // Zonas de Pesca & Mercado de Peixe da Ilha
  FISHING_ZONES.forEach((zone) => {
    interactables.push({
      id: zone.id,
      type: 'fishing_spot',
      title: `${zone.name} 🎣`,
      subtitle: zone.allowed ? 'Zona autorizada para pesca com cana ou rede' : zone.reason || 'Zona de pesca restrita',
      prompt: zone.allowed ? '[E] Pescar neste Local' : '[E] Verificar Restrição de Pesca',
      position: zone.pos,
      radius: Math.min(8, zone.radius * 0.45),
      district: zone.pos[2] < -80 ? 'cacuaco' : 'ilha',
      data: { zoneId: zone.id, allowed: zone.allowed },
    });
  });

  const fishStand = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.4, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.55 })
  );
  fishStand.position.set(-28, 1.2, -45);
  root.add(fishStand);
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(-28, 1.2, -45), new THREE.Vector3(4.4, 2.5, 2.4)));
  interactables.push({
    id: 'mercado-peixe-ilha',
    type: 'fish_market',
    title: 'Mercado do Peixe da Ilha 🐟',
    subtitle: 'Venda direta de Carapau, Garoupa, Pargo e Lagosta',
    prompt: '[E] Vender Peixe no Mercado',
    position: [-28, 0.5, -43],
    radius: 5.0,
    district: 'ilha',
  });

  // Escritório da Ordem dos Advogados (OAA) junto ao Tribunal
  buildComplex('EscritorioOAA', 56, -24, 12, 11, 12, '#1e293b', 0xfacc15, 'ADVOGADOS OAA ⚖️', 0xfacc15);
  interactables.push({
    id: 'escritorio-oaa-ext',
    type: 'lawyer_office',
    title: 'Escritório de Advogados (OAA) ⚖️',
    subtitle: 'Registo criminal, contratação de advogado, fiança e audiências',
    prompt: '[E] Aceder à Ordem dos Advogados',
    position: [56, 0.5, -15],
    radius: 4.2,
    district: 'centro',
  });
  interactables.push({
    id: 'enter-advogados-escritorio',
    type: 'interior_door',
    title: 'Entrar no Escritório OAA ⚖️',
    subtitle: 'Sala de reuniões jurídicas & gabinete de defesa',
    prompt: '[E] Entrar no Escritório OAA',
    position: [59, 0.5, -17],
    radius: 3.0,
    district: 'centro',
    data: {
      interiorId: 'advogados_escritorio',
      targetX: INTERIOR_ORIGINS.advogados_escritorio[0],
      targetZ: INTERIOR_ORIGINS.advogados_escritorio[1] + 6.5,
      targetRot: 0,
      returnX: 59,
      returnZ: -13.5,
      label: 'Escritório OAA',
    },
  });
  interactables.push({
    id: 'enter-tribunal',
    type: 'interior_door',
    title: 'Entrar no Tribunal Provincial 🏛️',
    subtitle: 'Sala de Audiências & Sentenças',
    prompt: '[E] Entrar na Sala de Audiências',
    position: [72, 0.5, -12],
    radius: 3.2,
    district: 'centro',
    data: {
      interiorId: 'tribunal',
      targetX: INTERIOR_ORIGINS.tribunal[0],
      targetZ: INTERIOR_ORIGINS.tribunal[1] + 8,
      targetRot: 0,
      returnX: 72,
      returnZ: -8.5,
      label: 'Tribunal Provincial',
    },
  });

  // Portas de Entrada dos restantes interiores (Hospital, Garagem, Oficina, Moda, Morros CV/FTX/BMR)
  interactables.push({
    id: 'enter-hospital-inema',
    type: 'interior_door',
    title: 'Entrar no Hospital Josina Machel (INEMA) 🏥',
    subtitle: 'Triagem, enfermaria e centro de despacho 112',
    prompt: '[E] Entrar no Hospital INEMA',
    position: [43, 0.5, 53],
    radius: 3.2,
    district: 'maianga',
    data: {
      interiorId: 'hospital_inema',
      targetX: INTERIOR_ORIGINS.hospital_inema[0],
      targetZ: INTERIOR_ORIGINS.hospital_inema[1] + 8,
      targetRot: 0,
      returnX: 43,
      returnZ: 50,
      label: 'Hospital INEMA',
    },
  });
  interactables.push({
    id: 'enter-garagem-central',
    type: 'interior_door',
    title: 'Entrar na Garagem Central 🅿️',
    subtitle: 'Terminal coberto de recolha de viaturas',
    prompt: '[E] Entrar na Garagem Central',
    position: [18, 0.5, -14],
    radius: 3.2,
    district: 'centro',
    data: {
      interiorId: 'garagem_central',
      targetX: INTERIOR_ORIGINS.garagem_central[0],
      targetZ: INTERIOR_ORIGINS.garagem_central[1] + 7,
      targetRot: 0,
      returnX: 18,
      returnZ: -10.5,
      label: 'Garagem Central',
    },
  });
  interactables.push({
    id: 'enter-oficina-auto',
    type: 'interior_door',
    title: 'Entrar na Oficina Auto Luanda 🔧',
    subtitle: 'Elevador mecânico & zona de afinação',
    prompt: '[E] Entrar na Oficina',
    position: [103, 0.5, 57],
    radius: 3.2,
    district: 'talatona',
    data: {
      interiorId: 'oficina_auto',
      targetX: INTERIOR_ORIGINS.oficina_auto[0],
      targetZ: INTERIOR_ORIGINS.oficina_auto[1] + 7,
      targetRot: 0,
      returnX: 103,
      returnZ: 53,
      label: 'Oficina Auto Luanda',
    },
  });
  interactables.push({
    id: 'enter-mercado-lojas',
    type: 'interior_door',
    title: 'Entrar na Loja Moda & 5G 👕',
    subtitle: 'Provadores, vestuário e eletrónica',
    prompt: '[E] Entrar na Loja',
    position: [41, 0.5, 11],
    radius: 3.0,
    district: 'centro',
    data: {
      interiorId: 'mercado_lojas',
      targetX: INTERIOR_ORIGINS.mercado_lojas[0],
      targetZ: INTERIOR_ORIGINS.mercado_lojas[1] + 6.5,
      targetRot: 0,
      returnX: 41,
      returnZ: 7.5,
      label: 'Loja Moda & Mercado',
    },
  });

  // K) Pontos de Imóveis / Propriedades Compráveis e Arrendáveis
  interactables.push({
    id: 'imobiliaria-maianga',
    type: 'property',
    title: 'Imobiliária de Luanda (Casas & Empresas) 🏠',
    subtitle: 'Compra ou arrenda casas no Kilamba, Maianga e Talatona',
    prompt: '[E] Gerir Imóveis, Cofres e Negócios',
    position: [48, 0.5, 34],
    radius: 4,
    district: 'maianga',
  });
  interactables.push({
    id: 'imobiliaria-kilamba',
    type: 'property',
    title: 'Condomínio Residencial Kilamba 🏢',
    subtitle: 'Apartamentos T2/T3 para arrendamento e compra',
    prompt: '[E] Aceder a Apartamentos e Negócios',
    position: [66, 0.5, 118],
    radius: 4.5,
    district: 'kilamba',
  });

  // L) NPCs Estáticos Anatómicos Detalhados ([NPC] ...) nos pontos chave
  const createWorldNpc = (
    x: number,
    z: number,
    rotY: number,
    shirtColor: string,
    tagText: string,
    outfit: 'jersey' | 'tactical_vest' | 'hoodie' | 'military' | 'agricultor_uniform' = 'jersey',
    hasCap = false,
    capColor = '#1e293b'
  ) => {
    const rig = buildDetailedHumanRig({
      gender: 'masculino',
      skinColor: '#7c4b2d',
      shirtColor,
      pantsColor: outfit === 'military' ? '#29321e' : '#0f172a',
      shoesColor: '#111827',
      hairStyle: 'curto',
      hairColor: '#09090b',
      heightScale: 1.0,
      outfitStyle: outfit,
      hasCap,
      capColor,
    });
    const npc = rig.root;

    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 72;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
    ctx.fillRect(0, 0, 384, 72);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 378, 66);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(tagText, 192, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, 192, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 0.42),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    tag.position.set(0, 2.28, 0);
    npc.add(tag);

    npc.position.set(x, 0, z);
    npc.rotation.y = rotY;
    root.add(npc);
  };

  createWorldNpc(12, 14, 0, '#f59e0b', '[NPC] Guia Empregos', 'jersey', false);
  createWorldNpc(ESQUADRA_ENTRANCE_POS[0], ESQUADRA_ENTRANCE_POS[2], Math.PI, '#1e3a8a', '[NPC] Oficial PNA', 'tactical_vest', true, '#1e3a8a');
  createWorldNpc(PRISON_YARD_POS[0] + 4, PRISON_YARD_POS[2] - 12, -Math.PI / 2, '#1d4ed8', '[NPC] Carcereiro PNA', 'tactical_vest', true, '#1e3a8a');
  createWorldNpc(48, 54, Math.PI, '#f8fafc', '[NPC] Médico INEMA', 'jersey', false);
  createWorldNpc(108, 52, Math.PI, '#0f766e', '[NPC] Mecânico Chefe', 'hoodie', true, '#0f766e');
  createWorldNpc(165, -58, -Math.PI / 2, '#7c3aed', '[NPC] Informante RP', 'hoodie', true, '#09090b');
  createWorldNpc(16, -46, 0, '#0284c7', '[NPC] Vendedor Auto', 'jersey', false);
  createWorldNpc(-130, 128, Math.PI / 2, '#3f4f2f', '[NPC] Comandante FAA', 'military', true, '#29321e');
  createWorldNpc(DJ_BOOTH_POS[0] - 2, DJ_BOOTH_POS[2], Math.PI / 2, '#ec4899', '[NPC] DJ Luanda Global', 'hoodie', true, '#9333ea');
  createWorldNpc(PALACIO_PRESIDENCIAL_POS[0], PALACIO_PRESIDENCIAL_POS[2] + 10, 0, '#facc15', '[NPC] Protocolo Presidencial', 'jersey', false);

  // PREFEITURA MUNICIPAL DE LUANDA (Votos, Empregos & Anúncios Cívicos)
  const prefeitura = buildComplex('PrefeituraLuanda', 26, 96, 22, 15, 18, '#fef3c7', 0x1d4ed8, 'PREFEITURA DE LUANDA 🏛️', 0xfacc15);
  for (const colX of [-7.4, -3.4, 3.4, 7.4]) {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.52, 11.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 })
    );
    column.position.set(colX, 5.75, 9.5);
    prefeitura.add(column);
  }
  const prefWalkway = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 8),
    new THREE.MeshStandardMaterial({ map: calcadaTex, roughness: 0.65 })
  );
  prefWalkway.rotation.x = -Math.PI / 2;
  prefWalkway.position.set(19, 0.04, 108);
  root.add(prefWalkway);

  createWorldNpc(23, 108, 0, '#1d4ed8', '[NPC] Protocolo Prefeitura', 'jersey', false);
  interactables.push({
    id: 'prefeitura-luanda',
    type: 'prefeitura',
    title: 'Prefeitura Municipal de Luanda 🏛️',
    subtitle: 'Votos Eleitorais, Empregos Oficiais & Editais da Cidade',
    prompt: '[E] Abrir Prefeitura (Votos, Empregos & Anúncios)',
    position: [26, 0.5, 108],
    radius: 4.5,
    district: 'centro',
  });

  // ZONA FARM — FAZENDA VERDE DE LUANDA [245, 0, -125] + PICKUP DE TRANSPORTE PARA A PRAÇA
  const farmRoad = new THREE.Mesh(new THREE.PlaneGeometry(78, 12), eastRoadMat);
  farmRoad.rotation.x = -Math.PI / 2;
  farmRoad.position.set(228, 0.05, -125);
  root.add(farmRoad);

  const farmGroup = new THREE.Group();
  const farmGrassTex = getCachedFarmGrassTexture(10, 9);
  const farmPasture = new THREE.Mesh(
    new THREE.PlaneGeometry(76, 66),
    new THREE.MeshStandardMaterial({ map: farmGrassTex, roughness: 0.92 })
  );
  farmPasture.rotation.x = -Math.PI / 2;
  farmPasture.position.set(245, 0.04, -125);
  farmPasture.receiveShadow = true;
  farmGroup.add(farmPasture);

  // Cercas de madeira da Fazenda (entrada aberta a Oeste para estrada e Pickup)
  const fenceWoodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const buildFarmFence = (fx: number, fz: number, fw: number, fd: number) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.35, fd), fenceWoodMat);
    f.position.set(fx, 0.68, fz);
    farmGroup.add(f);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(fx, 0.7, fz), new THREE.Vector3(fw + 0.2, 1.6, fd + 0.2)));
  };
  buildFarmFence(245, -157, 74, 0.45);
  buildFarmFence(245, -93, 74, 0.45);
  buildFarmFence(282, -125, 0.45, 64);
  buildFarmFence(208, -146, 0.45, 22);
  buildFarmFence(208, -104, 0.45, 22);

  // Celeiro Vermelho & Silo Metálico da Fazenda
  const barnBody = new THREE.Mesh(
    new THREE.BoxGeometry(16, 7.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.75 })
  );
  barnBody.position.set(260, 3.75, -142);
  farmGroup.add(barnBody);
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(260, 3.8, -142), new THREE.Vector3(16.4, 8, 12.4)));

  const barnRoof = new THREE.Mesh(
    new THREE.ConeGeometry(12.2, 4.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 })
  );
  barnRoof.rotation.y = Math.PI / 4;
  barnRoof.position.set(260, 9.6, -142);
  farmGroup.add(barnRoof);

  const barnSignC = document.createElement('canvas');
  barnSignC.width = 512;
  barnSignC.height = 128;
  const bctx = barnSignC.getContext('2d')!;
  bctx.fillStyle = '#052e16';
  bctx.fillRect(0, 0, 512, 128);
  bctx.strokeStyle = '#facc15';
  bctx.lineWidth = 8;
  bctx.strokeRect(4, 4, 504, 120);
  bctx.fillStyle = '#ffffff';
  bctx.font = 'bold 36px sans-serif';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('FAZENDA VERDE DE LUANDA 🌾', 256, 64);
  const barnSignTex = new THREE.CanvasTexture(barnSignC);
  barnSignTex.colorSpace = THREE.SRGBColorSpace;
  const barnSign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.7), new THREE.MeshBasicMaterial({ map: barnSignTex }));
  barnSign.position.set(260, 6.2, -135.8);
  farmGroup.add(barnSign);

  const silo = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 13, 14),
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.72, roughness: 0.3 })
  );
  silo.position.set(273, 6.5, -142);
  farmGroup.add(silo);
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(273, 6.5, -142), new THREE.Vector3(6.6, 13, 6.6)));

  const soilMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.96 });
  const cropGreenMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 });
  const tomatoMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });

  FARM_PLANT_NODES.forEach((node) => {
    const [nx, , nz] = node.pos;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 3.6), soilMat);
    bed.position.set(nx, 0.15, nz);
    farmGroup.add(bed);
    for (const pxOff of [-1.4, 0, 1.4]) {
      const plant = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 7), cropGreenMat);
      plant.position.set(nx + pxOff, 0.85, nz);
      farmGroup.add(plant);
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), tomatoMat);
      fruit.position.set(nx + pxOff + 0.18, 0.8, nz + 0.22);
      farmGroup.add(fruit);
    }

    const pCanvas = document.createElement('canvas');
    pCanvas.width = 340;
    pCanvas.height = 96;
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.fillStyle = 'rgba(5, 46, 22, 0.88)';
    pCtx.fillRect(0, 0, 340, 96);
    pCtx.strokeStyle = '#4ade80';
    pCtx.lineWidth = 4;
    pCtx.strokeRect(3, 3, 334, 90);
    pCtx.fillStyle = '#fde047';
    pCtx.font = 'bold 22px sans-serif';
    pCtx.textAlign = 'center';
    pCtx.fillText(node.cropName.toUpperCase(), 170, 34);
    pCtx.fillStyle = '#86efac';
    pCtx.font = 'bold 20px sans-serif';
    pCtx.fillText('Pronta para colheita', 170, 70);
    const pTex = new THREE.CanvasTexture(pCanvas);
    pTex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pTex, transparent: true }));
    sprite.scale.set(4.2, 1.2, 1);
    sprite.position.set(nx, 2.75, nz);
    farmGroup.add(sprite);
    farmPlantDisplays[node.id] = {
      sprite,
      canvas: pCanvas,
      ctx: pCtx,
      texture: pTex,
      lastText: 'Pronta para colheita',
    };

    interactables.push({
      id: node.id,
      type: 'farm_crop',
      title: `Planta: ${node.cropName} 🌾`,
      subtitle: 'Colhe a caixa e carrega para a carrinha da Fazenda (máx. 5 caixas)',
      prompt: `[E] Colher ${node.cropName}`,
      position: node.pos,
      radius: 3.4,
      district: 'fazenda',
      data: { plantId: node.id, cropName: node.cropName },
    });
  });

  const orchardCoords: [number, number][] = [
    [220, -148], [234, -148], [218, -104], [236, -102],
    [256, -104], [272, -104], [274, -124], [268, -114],
  ];
  orchardCoords.forEach(([tx, tz], idx) => {
    const fTree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.48, 3.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.92 })
    );
    trunk.position.y = 1.8;
    fTree.add(trunk);
    const crown1 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.5, 1),
      new THREE.MeshStandardMaterial({ color: idx % 2 === 0 ? 0x15803d : 0x166534, roughness: 0.82 })
    );
    crown1.position.y = 4.6;
    fTree.add(crown1);
    const crown2 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.75, 1),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.78 })
    );
    crown2.position.set(0.7, 5.7, 0.3);
    fTree.add(crown2);
    for (let f = 0; f < 3; f++) {
      const fruit = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 6, 6),
        new THREE.MeshStandardMaterial({ color: idx % 2 === 0 ? 0xf59e0b : 0xef4444, roughness: 0.45 })
      );
      fruit.position.set(Math.cos(f * 2.1) * 1.6, 4.1, Math.sin(f * 2.1) * 1.6);
      fTree.add(fruit);
    }
    fTree.position.set(tx, 0, tz);
    farmGroup.add(fTree);
    swayingTrees.push(fTree);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(tx, 2, tz), new THREE.Vector3(1.1, 4, 1.1)));
  });

  root.add(farmGroup);
  cityChunks.push({ centerX: 245, centerZ: -125, radius: 190, group: farmGroup });

  createWorldNpc(240, -122, Math.PI / 2, '#15803d', '[NPC] Agricultor Chefe', 'agricultor_uniform', true, '#15803d');
  interactables.push({
    id: 'fazenda-npc-agricultor',
    type: 'farm_npc',
    title: 'Agricultor Chefe da Fazenda 👨‍🌾🌾',
    subtitle: 'Iniciar trabalho (traje automático) & alugar carrinha agrícola (1.000 Kz)',
    prompt: '[E] Falar com Agricultor (Trabalho / Alugar Carrinha)',
    position: [240, 0.5, -122],
    radius: 4.5,
    district: 'fazenda',
  });

  // Pickup agrícola restrita ao emprego Agricultor
  const farmPickup = createPickupOrTruckVehicle('pickup', 228, -115, -Math.PI / 2, 'fazenda-pickup', '#15803d', 'FAZ-01-AO');
  root.add(farmPickup.mesh);
  drivableVehicles.push(farmPickup);
  interactables.push({
    id: 'fazenda-pickup',
    type: 'vehicle',
    title: 'Pickup Agrícola da Fazenda 🚜🛻',
    subtitle: 'Viatura de serviço agrícola (Emprego: Agricultor)',
    prompt: '[E] Conduzir Pickup da Fazenda',
    position: [228, 0.5, -115],
    radius: 4.5,
    district: 'fazenda',
    data: { vehicleId: 'fazenda-pickup', isDrivable: true, jobOnly: 'agricultor_fazenda' },
  });

  // N) BASE MILITAR DAS FORÇAS ARMADAS ANGOLANAS (FAA) — Península Sul-Oeste [-135, 130]
  const faaChunk = new THREE.Group();
  const faaDeck = new THREE.Mesh(
    new THREE.BoxGeometry(74, 0.8, 70),
    new THREE.MeshStandardMaterial({ color: 0x3f4f2f, roughness: 0.88 })
  );
  faaDeck.position.set(-135, -0.15, 130);
  faaChunk.add(faaDeck);

  // Muralha perimetral fortificada
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.85 });
  const buildWall = (wx: number, wz: number, w: number, d: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), wallMat);
    wall.position.set(wx, 1.6, wz);
    faaChunk.add(wall);
    colliders.push(new THREE.Box3().setFromObject(wall));
  };
  buildWall(-135, 96, 70, 1.4);
  buildWall(-135, 164, 70, 1.4);
  buildWall(-169, 130, 1.4, 68);
  buildWall(-101, 108, 1.4, 24);
  buildWall(-101, 152, 1.4, 24);

  // Quartel / Caserna Principal FAA
  const barracks = new THREE.Mesh(
    new THREE.BoxGeometry(26, 7.5, 16),
    new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.75 })
  );
  barracks.position.set(-148, 3.75, 116);
  faaChunk.add(barracks);
  colliders.push(new THREE.Box3().setFromObject(barracks));

  // Letreiro Quartel FAA
  const faaSignC = document.createElement('canvas');
  faaSignC.width = 512;
  faaSignC.height = 96;
  const fctx = faaSignC.getContext('2d')!;
  fctx.fillStyle = '#1a2e05';
  fctx.fillRect(0, 0, 512, 96);
  fctx.strokeStyle = '#facc15';
  fctx.lineWidth = 6;
  fctx.strokeRect(4, 4, 504, 88);
  fctx.fillStyle = '#facc15';
  fctx.font = 'bold 34px sans-serif';
  fctx.textAlign = 'center';
  fctx.textBaseline = 'middle';
  fctx.fillText('BASE MILITAR FAA 🇦🇴', 256, 48);
  const faaSignTex = new THREE.CanvasTexture(faaSignC);
  faaSignTex.colorSpace = THREE.SRGBColorSpace;
  const faaBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2.6),
    new THREE.MeshBasicMaterial({ map: faaSignTex })
  );
  faaBoard.position.set(-148, 6.2, 124.2);
  faaChunk.add(faaBoard);

  // Heliporto tático (H) + Torre Radar
  const heliPad = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8.4, 0.25, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
  );
  heliPad.position.set(-124, 0.26, 146);
  faaChunk.add(heliPad);

  const heliRing = new THREE.Mesh(
    new THREE.RingGeometry(5.6, 6.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
  );
  heliRing.rotation.x = -Math.PI / 2;
  heliRing.position.set(-124, 0.4, 146);
  faaChunk.add(heliRing);

  const watchTower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2.1, 14, 8),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
  );
  watchTower.position.set(-106, 7, 104);
  faaChunk.add(watchTower);
  colliders.push(new THREE.Box3().setFromObject(watchTower));

  // Cofre do Tesouro Nacional das FAA (Assaltável por Facções Criminosas -> 100.000 Kz, Alerta PNA + FAA!)
  const faaVaultMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.8, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 })
  );
  faaVaultMesh.position.set(FAA_VAULT_POS[0], 1.4, FAA_VAULT_POS[2]);
  faaChunk.add(faaVaultMesh);
  const vaultWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.08, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 })
  );
  vaultWheel.position.set(FAA_VAULT_POS[0], 1.4, FAA_VAULT_POS[2] + 1.15);
  faaChunk.add(vaultWheel);

  root.add(faaChunk);
  cityChunks.push({ centerX: -135, centerZ: 130, radius: 195, group: faaChunk });

  // 2 Jipes Blindados FAA estacionados na Base Militar (Uso exclusivo FAA)
  const faaJeep1 = createMilitaryJeepVehicle(-126, 120, Math.PI / 2, 'jipe-faa-1', '#3f4f2f', 'FAA-01-AO');
  root.add(faaJeep1.mesh);
  drivableVehicles.push(faaJeep1);
  interactables.push({
    id: 'jipe-faa-1',
    type: 'vehicle',
    title: 'Jipe Blindado FAA 🇦🇴',
    subtitle: 'Viatura Tática exclusiva das FAA',
    prompt: '[E] Conduzir Jipe Blindado FAA',
    position: [-126, 0.5, 120],
    radius: 4.5,
    district: 'faa_base',
    data: { vehicleId: 'jipe-faa-1', isDrivable: true, factionOnly: 'faa' },
  });

  const faaJeep2 = createMilitaryJeepVehicle(-126, 136, Math.PI / 2, 'jipe-faa-2', '#29321e', 'FAA-02-AO');
  root.add(faaJeep2.mesh);
  drivableVehicles.push(faaJeep2);
  interactables.push({
    id: 'jipe-faa-2',
    type: 'vehicle',
    title: 'Jipe Tático FAA #2 🇦🇴',
    subtitle: 'Patrulha de Prontidão exclusiva FAA',
    prompt: '[E] Conduzir Jipe FAA',
    position: [-126, 0.5, 136],
    radius: 4.5,
    district: 'faa_base',
    data: { vehicleId: 'jipe-faa-2', isDrivable: true, factionOnly: 'faa' },
  });

  interactables.push({
    id: 'base-faa-hq',
    type: 'faction_base',
    title: 'Comando Base Militar FAA 🪖',
    subtitle: 'Alistamento, fardamento oficial e ordens militares',
    prompt: '[E] Aceder ao Comando FAA',
    position: [-132, 0.5, 126],
    radius: 5,
    district: 'faa_base',
    data: { factionId: 'faa' },
  });

  interactables.push({
    id: 'cofre-tesouro-faa',
    type: 'faa_vault',
    title: 'Cofre do Tesouro Militar das FAA (100.000 Kz) 💰⚠️',
    subtitle: 'Apenas Facções Criminosas • Aciona PNA + Fogo Letal FAA (5 min recarga)',
    prompt: '[E] Assaltar Cofre das FAA (100.000 Kz)',
    position: FAA_VAULT_POS,
    radius: 4.5,
    district: 'faa_base',
  });

  // ESTAÇÕES OPERACIONAIS DAS FACÇÕES NA CIDADE (Desmanche, Fábrica Armas, Maconha/Munições, Lavagem...)
  FACTION_CITY_STATIONS.forEach((st) => {
    const stGroup = new THREE.Group();
    const stCol = new THREE.Color(st.colorHex).getHex();
    const shed = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 3.6, 5.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 })
    );
    shed.position.y = 1.8;
    stGroup.add(shed);
    const roofTrim = new THREE.Mesh(
      new THREE.BoxGeometry(6.9, 0.35, 5.6),
      new THREE.MeshStandardMaterial({ color: stCol, roughness: 0.45 })
    );
    roofTrim.position.y = 3.7;
    stGroup.add(roofTrim);

    // Bancada / Caixas operacionais à frente da estação
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.95, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
    );
    bench.position.set(0, 0.48, 3.4);
    stGroup.add(bench);

    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 128;
    const sctx = sc.getContext('2d')!;
    sctx.fillStyle = '#09090b';
    sctx.fillRect(0, 0, 512, 128);
    sctx.strokeStyle = st.colorHex;
    sctx.lineWidth = 8;
    sctx.strokeRect(4, 4, 504, 120);
    sctx.fillStyle = '#facc15';
    sctx.font = 'bold 28px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(st.stationName.slice(0, 32), 256, 48);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 22px sans-serif';
    sctx.fillText(`OPERAÇÃO: ${st.factionName}`, 256, 92);
    const stTex = new THREE.CanvasTexture(sc);
    stTex.colorSpace = THREE.SRGBColorSpace;
    const stBoard = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.35), new THREE.MeshBasicMaterial({ map: stTex, side: THREE.DoubleSide }));
    stBoard.position.set(0, 4.7, 2.7);
    stGroup.add(stBoard);

    stGroup.position.set(st.pos[0], 0, st.pos[2]);
    root.add(stGroup);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(st.pos[0], 1.8, st.pos[2]), new THREE.Vector3(6.8, 3.8, 5.5)));

    interactables.push({
      id: st.stationId,
      type: 'faction_station',
      title: st.stationName,
      subtitle: st.subtitle,
      prompt: `[E] Operar ${st.stationName}`,
      position: [st.pos[0], 0.5, st.pos[2] + 4.2],
      radius: 5.0,
      district: st.district,
      data: { factionId: st.factionId, roleId: st.roleId, stationName: st.stationName },
    });
  });

  // O) 5 MORROS DAS FACÇÕES (Rampas suaves contínuas ligadas ao terrainPhysics.ts, ZERO colisores fantasma)
  MORRO_DEFINITIONS.forEach((m) => {
    const chunkGroup = new THREE.Group();
    const h = m.topY;
    const pR = m.topRadius;
    const rampLen = 20;
    const rampWidth = 12;

    // Base cónica de encosta e platô superior
    const hillSlope = new THREE.Mesh(
      new THREE.CylinderGeometry(pR, m.outerRadius, h, 20),
      new THREE.MeshStandardMaterial({ color: 0x6b442a, roughness: 0.94 })
    );
    hillSlope.position.set(m.x, h / 2, m.z);
    chunkGroup.add(hillSlope);

    const concreteTop = new THREE.Mesh(
      new THREE.CylinderGeometry(pR - 0.8, pR, 0.2, 20),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 })
    );
    concreteTop.position.set(m.x, h + 0.02, m.z);
    chunkGroup.add(concreteTop);

    // Rampa inclinada EXATAMENTE alinhada com getSurfaceHeightAt (w=12, len=20, elevação 0 -> h)
    const slopeLen = Math.hypot(rampLen, h);
    const slopePitch = Math.atan2(h, rampLen);
    const rampGroup = new THREE.Group();
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(rampWidth, 0.4, slopeLen),
      roadMat
    );
    ramp.rotation.x = slopePitch;
    rampGroup.add(ramp);
    if (m.rampSide === 'west') {
      rampGroup.position.set(m.x - 31, h / 2 - 0.12, m.z);
      rampGroup.rotation.y = -Math.PI / 2;
    } else if (m.rampSide === 'south') {
      rampGroup.position.set(m.x, h / 2 - 0.12, m.z + 31);
      rampGroup.rotation.y = 0;
    } else {
      rampGroup.position.set(m.x, h / 2 - 0.12, m.z - 31);
      rampGroup.rotation.y = Math.PI;
    }
    chunkGroup.add(rampGroup);

    // Quintal Fechado perimetral no topo do Morro com APENAS 1 Portão alinhado à Rampa
    const quintalMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.84 });
    const rWall = pR - 0.6;
    const gateAngle = m.rampSide === 'west' ? Math.PI : m.rampSide === 'south' ? Math.PI / 2 : -Math.PI / 2;
    for (let seg = 0; seg < 16; seg++) {
      const ang = (seg / 16) * Math.PI * 2;
      const diff = Math.atan2(Math.sin(ang - gateAngle), Math.cos(ang - gateAngle));
      if (Math.abs(diff) < 0.28) continue; // Única abertura (Portão Único ~12m) alinhada à rampa
      const wx = m.x + Math.cos(ang) * rWall;
      const wz = m.z + Math.sin(ang) * rWall;
      const wallSeg = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.2, 0.9), quintalMat);
      wallSeg.position.set(wx, h + 1.6, wz);
      wallSeg.rotation.y = -ang + Math.PI / 2;
      wallSeg.updateMatrixWorld(true);
      chunkGroup.add(wallSeg);
      colliders.push(new THREE.Box3().setFromObject(wallSeg));
    }

    // Pilares do Portão Único & Letreiro Superior (altura h + 4.4 para viaturas passarem livremente)
    for (const sideSign of [-1, 1]) {
      const pAng = gateAngle + sideSign * 0.30;
      const px = m.x + Math.cos(pAng) * rWall;
      const pz = m.z + Math.sin(pAng) * rWall;
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 4.8, 1.3),
        new THREE.MeshStandardMaterial({ color: m.accentNum, roughness: 0.6 })
      );
      pillar.position.set(px, h + 2.4, pz);
      chunkGroup.add(pillar);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(px, h + 2.4, pz), new THREE.Vector3(1.4, 4.8, 1.4)));
    }
    const gateArch = new THREE.Mesh(
      new THREE.BoxGeometry(13.2, 0.85, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 })
    );
    gateArch.position.set(m.x + Math.cos(gateAngle) * rWall, h + 4.6, m.z + Math.sin(gateAngle) * rWall);
    gateArch.rotation.y = -gateAngle + Math.PI / 2;
    chunkGroup.add(gateArch);

    // Sede do Morro posicionada fora da linha da rampa (nunca bloqueia entrada!)
    const hq = new THREE.Mesh(
      new THREE.BoxGeometry(10, 4.8, 9),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    );
    hq.position.set(m.x + 11, h + 2.4, m.z - 8);
    chunkGroup.add(hq);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(m.x + 11, h + 2.4, m.z - 8),
        new THREE.Vector3(10.2, 5.2, 9.2)
      )
    );

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 9.2, 3.2),
      new THREE.MeshStandardMaterial({ color: m.accentNum, roughness: 0.55 })
    );
    tower.position.set(m.x - 10, h + 4.6, m.z - 11);
    chunkGroup.add(tower);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(m.x - 10, h + 4.6, m.z - 11),
        new THREE.Vector3(3.4, 9.4, 3.4)
      )
    );

    // Outdoor luminoso da facção no topo da sede
    const signC = document.createElement('canvas');
    signC.width = 768;
    signC.height = 192;
    const sctx = signC.getContext('2d')!;
    sctx.fillStyle = '#09090b';
    sctx.fillRect(0, 0, 768, 192);
    sctx.strokeStyle = m.accentHex;
    sctx.lineWidth = 10;
    sctx.strokeRect(5, 5, 758, 182);
    sctx.fillStyle = m.accentHex;
    sctx.font = 'bold 50px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.lineWidth = 6;
    sctx.strokeStyle = '#000000';
    sctx.strokeText(m.title, 384, 72);
    sctx.fillText(m.title, 384, 72);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 30px sans-serif';
    sctx.fillText('TERRITÓRIO DOMINADO • LUANDA RP', 384, 140);
    const signTex = new THREE.CanvasTexture(signC);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const billboard = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.5),
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
      })
    );
    billboard.position.set(m.x + 11, h + 7.2, m.z - 8);
    chunkGroup.add(billboard);

    // Casinhas populares em redor da base externa do morro
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + 0.5;
      const hx = m.x + Math.cos(ang) * 38;
      const hz = m.z + Math.sin(ang) * 38;
      const house = new THREE.Mesh(
        new THREE.BoxGeometry(8, 4.2, 7),
        new THREE.MeshStandardMaterial({ color: k % 2 === 0 ? 0xb45309 : 0x64748b, roughness: 0.85 })
      );
      house.position.set(hx, 2.1, hz);
      chunkGroup.add(house);
      colliders.push(new THREE.Box3().setFromObject(house));
    }

    root.add(chunkGroup);
    cityChunks.push({ centerX: m.x, centerZ: m.z, radius: 220, group: chunkGroup });

    // Viatura exclusiva da facção do Morro
    const facVeh = createPickupOrTruckVehicle(
      'pickup',
      m.x - 6,
      m.z + 10,
      0,
      `${m.id}-pickup`,
      m.accentHex,
      `${m.factionId.slice(0, 3).toUpperCase()}-RP`
    );
    facVeh.mesh.position.y = 2.8;
    facVeh.position.y = 2.8;
    root.add(facVeh.mesh);
    drivableVehicles.push(facVeh);
    interactables.push({
      id: `${m.id}-pickup`,
      type: 'vehicle',
      title: `Pickup 4x4 ${m.title}`,
      subtitle: 'Viatura todo-o-terreno exclusiva da facção',
      prompt: '[E] Conduzir Viatura da Facção',
      position: [m.x - 6, 3.0, m.z + 10],
      radius: 4.5,
      district: m.district,
      data: { vehicleId: `${m.id}-pickup`, isDrivable: true, factionOnly: m.factionId },
    });

    interactables.push({
      id: `${m.id}-hq`,
      type: 'faction_base',
      title: m.title,
      subtitle: 'Quartel-General do Morro • Recrutamento, Skin & Cofre',
      prompt: '[E] Aceder ao Painel da Facção',
      position: [m.x + 2, 3.0, m.z + 2],
      radius: 5.5,
      district: m.district,
      data: { factionId: m.factionId },
    });

    const baseIntKey =
      m.factionId === 'cv_vianalandia'
        ? 'base_cv'
        : m.factionId === 'ftx_caop2'
          ? 'base_ftx'
          : 'base_bmr';
    const [bix, biz] = INTERIOR_ORIGINS[baseIntKey];
    interactables.push({
      id: `${m.id}-interior-door`,
      type: 'interior_door',
      title: `Entrar no QG Interno — ${m.title} 🚪`,
      subtitle: 'Sala tática, depósito partilhado e operação clandestina',
      prompt: '[E] Entrar na Base Secreta',
      position: [m.x - 5, 3.0, m.z - 4],
      radius: 3.8,
      district: m.district,
      data: {
        interiorId: baseIntKey,
        targetX: bix,
        targetZ: biz + 7.5,
        targetRot: 0,
        returnX: m.x - 5,
        returnZ: m.z,
        label: m.title,
      },
    });
  });

  // Bancada de Fabrico FTX (Exterior CAOP 2)
  interactables.push({
    id: 'ftx-gang-workbench-ext',
    type: 'gang_workbench',
    title: 'Bancada de Fabrico Armamento FTX 🔫',
    subtitle: 'Fabrico RP de armas e munições com materiais (FTX - CAOP 2)',
    prompt: '[E] Abrir Bancada de Fabrico FTX',
    position: [248, 0.5, -224],
    radius: 4.5,
    district: 'cazenga',
    data: { factionId: 'ftx_caop2' },
  });

  // Ponto de Mercado Negro / Armeiro em Sambizanga Norte
  interactables.push({
    id: 'armeiro-sambizanga',
    type: 'armory',
    title: 'Armeiro Clandestino (Sambizanga) 🔫',
    subtitle: 'Pistolas, Caçadeiras, AK-47, Coletes e Munições',
    prompt: '[E] Comprar Armamento',
    position: [-30, 3.0, -310],
    radius: 4.5,
    district: 'sambizanga',
  });

  // P) PRAIA & ZONA DE LAZER DA ILHA DE LUANDA (Rampa de Acesso, Pontão, Barcos, Guarda-sóis e Palco Sunset)
  const leisureGroup = new THREE.Group();

  // Rampa de madeira ligando a areia da praia (x=-44) ao pontão elevado (x=-51, y=0.85)
  const pierRamp = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 6.5),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.82 })
  );
  pierRamp.position.set(-47, 0.44, 16);
  pierRamp.rotation.z = -0.11;
  leisureGroup.add(pierRamp);

  // Pontão / Cais de Madeira sobre o Oceano Atlântico
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(44, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 })
  );
  pierDeck.position.set(-72, 0.85, 16);
  leisureGroup.add(pierDeck);

  // Pilares de madeira do pontão
  const pierPillarMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
  for (let px = -54; px >= -92; px -= 8) {
    for (const pz of [12.4, 19.6]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 3.4, 8), pierPillarMat);
      p.position.set(px, -0.6, pz);
      leisureGroup.add(p);
    }
  }
  const pierHead = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.45, 14),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 })
  );
  pierHead.position.set(-96, 0.88, 16);
  leisureGroup.add(pierHead);

  for (const bz of [4, 28]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 1.3, 3.2),
      new THREE.MeshStandardMaterial({ color: bz < 16 ? 0xf8fafc : 0x0284c7, roughness: 0.25, metalness: 0.2 })
    );
    boat.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.15, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.22 })
    );
    cabin.position.set(0.6, 1.1, 0);
    boat.add(cabin);
    boat.position.set(-88, -0.05, bz);
    leisureGroup.add(boat);
    boats.push(boat);
  }

  // Barcos de pesca ao largo + Boias marítimas de sinalização + Rochedos costeiros no Atlântico
  for (const [fx, fz, col] of [[-122, -42, 0xdc2626], [-115, 86, 0xf59e0b]] as [number, number, number][]) {
    const fBoat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.0, 2.5), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    fBoat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.8, 6), new THREE.MeshStandardMaterial({ color: 0x78350f }));
    mast.position.y = 1.9;
    fBoat.add(mast);
    fBoat.position.set(fx, -0.05, fz);
    leisureGroup.add(fBoat);
    boats.push(fBoat);
  }

  for (const [bx, bz] of [[-68, -60], [-72, -18], [-72, 48], [-66, 95]]) {
    const buoy = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }));
    buoy.add(base);
    const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.6 }));
    topBeacon.position.y = 0.9;
    buoy.add(topBeacon);
    buoy.position.set(bx, 0.0, bz);
    leisureGroup.add(buoy);
    boats.push(buoy);
  }

  for (const rz of [-165, -140, 95, 118]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.92 }));
    rock.scale.set(1.3, 0.65, 1.1);
    rock.position.set(-52, 0.1, rz);
    leisureGroup.add(rock);
  }

  // Espreguiçadeiras & Guarda-sóis coloridos na Praia de Lazer
  const umbrellaColors = [0xef4444, 0xfacc15, 0x06b6d4, 0x9333ea, 0x10b981];
  for (let i = 0; i < 7; i++) {
    const uz = -24 + i * 11;
    const ux = -48;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc })
    );
    pole.position.set(ux, 1.2, uz);
    leisureGroup.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: umbrellaColors[i % umbrellaColors.length], roughness: 0.55 })
    );
    top.position.set(ux, 2.45, uz);
    leisureGroup.add(top);

    const lounger = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.28, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.6 })
    );
    lounger.position.set(ux + 1.5, 0.2, uz);
    leisureGroup.add(lounger);
  }

  // Campo de Voleibol de Praia Sincronizado
  const [vxCourt, vzCourt] = VOLLEYBALL_COURT_CENTER;
  const courtLines = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 18),
    new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.9 })
  );
  courtLines.rotation.x = -Math.PI / 2;
  courtLines.position.set(vxCourt, 0.03, vzCourt);
  leisureGroup.add(courtLines);

  const netMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10.5, 1.1, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true })
  );
  netMesh.position.set(vxCourt, 1.5, vzCourt);
  leisureGroup.add(netMesh);

  const volleyballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.35 })
  );
  volleyballMesh.position.set(vxCourt, 0.35, vzCourt - 2.5);
  leisureGroup.add(volleyballMesh);
  interactables.push({
    id: 'praia-voleibol',
    type: 'volleyball',
    title: 'Voleibol de Praia Multiplayer 🏐',
    subtitle: 'Bola sincronizada em tempo real para todos na Praia da Ilha',
    prompt: '[E] Bater na Bola de Vólei',
    position: [vxCourt, 0.5, vzCourt],
    radius: 9.0,
    district: 'ilha',
  });

  // Palco & Mesa de DJ Global Paga (200.000 Kz)
  const stageBase = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 })
  );
  stageBase.position.set(-40, 0.45, 62);
  leisureGroup.add(stageBase);

  const djDeck = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.15, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x09090b, emissive: 0x9333ea, emissiveIntensity: 0.5 })
  );
  djDeck.position.set(-37, 1.45, 62);
  leisureGroup.add(djDeck);

  for (const sz of [57.2, 66.8]) {
    const speaker = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 3.2, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 0.25 })
    );
    speaker.position.set(-37.5, 2.4, sz);
    leisureGroup.add(speaker);
    djSpeakerMeshes.push(speaker);
  }

  const stageSignCanvas = document.createElement('canvas');
  stageSignCanvas.width = 768;
  stageSignCanvas.height = 192;
  const stctx = stageSignCanvas.getContext('2d')!;
  stctx.fillStyle = '#1e1b4b';
  stctx.fillRect(0, 0, 768, 192);
  stctx.strokeStyle = '#06b6d4';
  stctx.lineWidth = 10;
  stctx.strokeRect(5, 5, 758, 182);
  stctx.fillStyle = '#fde047';
  stctx.font = 'bold 44px sans-serif';
  stctx.textAlign = 'center';
  stctx.textBaseline = 'middle';
  stctx.fillText('PRAIA & DJ GLOBAL 🎧 200.000 Kz', 384, 72);
  stctx.fillStyle = '#ffffff';
  stctx.font = 'bold 28px sans-serif';
  stctx.fillText('SOM SINCRONIZADO PARA TODA A CIDADE', 384, 140);
  const stageTex = new THREE.CanvasTexture(stageSignCanvas);
  stageTex.colorSpace = THREE.SRGBColorSpace;
  const stageBanner = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 2.8),
    new THREE.MeshStandardMaterial({
      map: stageTex,
      emissiveMap: stageTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55,
    })
  );
  stageBanner.rotation.y = Math.PI / 2;
  stageBanner.position.set(-39, 4.4, 62);
  leisureGroup.add(stageBanner);

  root.add(leisureGroup);
  cityChunks.push({ centerX: -72, centerZ: 15, radius: 175, group: leisureGroup });
  interactables.push({
    id: 'praia-lazer-ilha',
    type: 'leisure',
    title: 'Praia & Zona de Lazer 🏖️🎶',
    subtitle: 'Ilha de Luanda — Relaxar na praia & recuperar energia',
    prompt: '[E] Relaxar na Praia & Recuperar Energia',
    position: [-43, 0.5, 62],
    radius: 5,
    district: 'ilha',
  });
  interactables.push({
    id: 'dj-booth-global',
    type: 'dj_booth',
    title: 'Mesa de DJ Global — Ilha Sunset 🎧',
    subtitle: 'Toca música sincronizada para TODOS os jogadores (200.000 Kz)',
    prompt: '[E] Abrir Consola DJ Global (200.000 Kz)',
    position: DJ_BOOTH_POS,
    radius: 4.5,
    district: 'ilha',
  });

  // Q) MONTANHAS DA SERRA DE LUANDA + LETREIRO MONUMENTAL "LUANDA RP" NA MONTANHA
  const mountainsGroup = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.95 });
  const greenRidgeMat = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.92 });

  const mountainPeaks: [number, number, number, number][] = [
    [400, 0, 88, 98],
    [405, -135, 76, 82],
    [405, 135, 78, 86],
    [395, -265, 82, 74],
    [395, 265, 82, 76],
    [380, -370, 74, 68],
    [380, 370, 74, 68],
    [230, -395, 78, 64],
    [95, -405, 72, 58],
    [230, 395, 78, 66],
    [95, 405, 72, 60],
    [345, -72, 52, 54],
    [345, 72, 54, 56],
  ];

  mountainPeaks.forEach(([mx, mz, mr, mh], idx) => {
    const rockCone = new THREE.Mesh(new THREE.ConeGeometry(mr, mh, 7), rockMat);
    rockCone.position.set(mx, mh / 2 - 2, mz);
    rockCone.rotation.y = idx * 0.7;
    mountainsGroup.add(rockCone);

    const lushCap = new THREE.Mesh(new THREE.ConeGeometry(mr * 0.68, mh * 0.45, 7), greenRidgeMat);
    lushCap.position.set(mx, mh * 0.72, mz);
    lushCap.rotation.y = idx * 0.7 + 0.3;
    mountainsGroup.add(lushCap);
  });

  const mountainSignCanvas = document.createElement('canvas');
  mountainSignCanvas.width = 1536;
  mountainSignCanvas.height = 384;
  const msctx = mountainSignCanvas.getContext('2d')!;
  msctx.clearRect(0, 0, 1536, 384);
  msctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  msctx.fillRect(16, 16, 1504, 352);
  msctx.strokeStyle = '#facc15';
  msctx.lineWidth = 14;
  msctx.strokeRect(18, 18, 1500, 348);

  msctx.font = '900 176px sans-serif';
  msctx.textAlign = 'center';
  msctx.textBaseline = 'middle';
  msctx.lineWidth = 18;
  msctx.strokeStyle = '#000000';
  msctx.strokeText('LUANDA RP', 768, 175);
  const grad = msctx.createLinearGradient(250, 80, 1280, 260);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#fde047');
  grad.addColorStop(1, '#a855f7');
  msctx.fillStyle = grad;
  msctx.fillText('LUANDA RP', 768, 175);

  msctx.font = 'bold 50px sans-serif';
  msctx.lineWidth = 8;
  msctx.strokeText('CIDADE ABERTA • ANGOLA 🇦🇴', 768, 305);
  msctx.fillStyle = '#38bdf8';
  msctx.fillText('CIDADE ABERTA • ANGOLA 🇦🇴', 768, 305);

  const mSignTex = new THREE.CanvasTexture(mountainSignCanvas);
  mSignTex.colorSpace = THREE.SRGBColorSpace;
  const mSignBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(118, 29),
    new THREE.MeshStandardMaterial({
      map: mSignTex,
      emissiveMap: mSignTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.78,
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  mSignBoard.rotation.y = -Math.PI / 2;
  mSignBoard.position.set(342, 48, 0);
  mountainsGroup.add(mSignBoard);

  for (const sz of [-44, -15, 15, 44]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 42, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 })
    );
    leg.position.set(344, 21, sz);
    mountainsGroup.add(leg);
  }
  root.add(mountainsGroup);
  cityChunks.push({ centerX: 330, centerZ: 0, radius: 360, group: mountainsGroup });

  // R) TORRE INGOMBOTA, PALÁCIO PRESIDENCIAL, NEGÓCIOS INTERATIVOS & CONDOMÍNIO VILA ATLÂNTICA (TODAS AS 18 CASAS!)
  buildComplex('TorreIngombota', 52, -98, 20, 42, 20, '#312e81', 0xa855f7, 'TORRE INGOMBOTA 🏙️', 0x9333ea);
  buildComplex('PalacioPresidencial', 68, -78, 28, 18, 18, '#fef3c7', 0xfacc15, 'PALÁCIO PRESIDENCIAL 🇦🇴', 0xf59e0b);
  interactables.push({
    id: 'palacio-presidencial-ext',
    type: 'politics',
    title: 'Palácio Presidencial da República 🏛️🇦🇴',
    subtitle: 'Partidos Políticos, Eleições Presidenciais & Decretos',
    prompt: '[E] Abrir Política, Votação & Presidência',
    position: PALACIO_PRESIDENCIAL_POS,
    radius: 5.0,
    district: 'centro',
  });
  interactables.push({
    id: 'palacio-presidencial-door',
    type: 'interior_door',
    title: 'Entrar no Palácio Presidencial 🏛️',
    subtitle: 'Gabinete da Presidência & Sala de Decretos',
    prompt: '[E] Entrar no Palácio Presidencial',
    position: [74, 0.5, -68],
    radius: 3.4,
    district: 'centro',
    data: { targetX: PALACIO_INTERIOR_ORIGIN[0], targetZ: PALACIO_INTERIOR_ORIGIN[1] + 9, targetRot: 0, label: 'Palácio Presidencial' },
  });

  // 2 Negócios Interativos de Luanda: Restaurante Sabores da Ilha & Boutique Moda Luanda
  buildComplex('RestauranteSaboresIlha', -25, -24, 10, 8, 8, '#9a3412', 0xfacc15, 'RESTAURANTE SABORES DA ILHA 🍽️', 0xf97316);
  interactables.push({
    id: 'enter-restaurante-ilha',
    type: 'interior_door',
    title: 'Entrar no Restaurante Sabores da Ilha 🍽️',
    subtitle: 'Cozinhar, servir pratos & trabalhar (40% Trabalhador / 60% Dono)',
    prompt: '[E] Entrar no Restaurante',
    position: [-25, 0.5, -18],
    radius: 3.2,
    district: 'ilha',
    data: {
      interiorId: 'restaurante_interior',
      targetX: INTERIOR_ORIGINS.restaurante_interior[0],
      targetZ: INTERIOR_ORIGINS.restaurante_interior[1] + 7.5,
      targetRot: 0,
      returnX: -25,
      returnZ: -16.5,
      label: 'Restaurante Sabores da Ilha',
    },
  });
  interactables.push({
    id: 'biz-station-restaurante-ext',
    type: 'business_station',
    title: 'Restaurante Sabores da Ilha (Gestão & Emprego) 🍽️',
    subtitle: 'Comprar empresa, contratar, trabalhar ou levantar lucros',
    prompt: '[E] Abrir Painel do Restaurante',
    position: [-29, 0.5, -18],
    radius: 3.0,
    district: 'ilha',
    data: { businessId: 'biz-restaurante-ilha' },
  });

  buildComplex('BoutiqueModaLuanda', 114, 26, 12, 9, 10, '#be185d', 0xfacc15, 'BOUTIQUE MODA LUANDA 👗', 0xec4899);
  interactables.push({
    id: 'enter-boutique-talatona',
    type: 'interior_door',
    title: 'Entrar na Boutique Moda Luanda 👗',
    subtitle: 'Produzir vestuário & atender clientes (40% / 60%)',
    prompt: '[E] Entrar na Boutique',
    position: [114, 0.5, 19],
    radius: 3.2,
    district: 'talatona',
    data: {
      interiorId: 'boutique_interior',
      targetX: INTERIOR_ORIGINS.boutique_interior[0],
      targetZ: INTERIOR_ORIGINS.boutique_interior[1] + 7.5,
      targetRot: 0,
      returnX: 114,
      returnZ: 17.5,
      label: 'Boutique Moda Luanda',
    },
  });
  interactables.push({
    id: 'biz-station-boutique-ext',
    type: 'business_station',
    title: 'Boutique Moda Luanda (Gestão & Emprego) 👗',
    subtitle: 'Comprar empresa, contratar, trabalhar ou levantar lucros',
    prompt: '[E] Abrir Painel da Boutique',
    position: [118, 0.5, 19],
    radius: 3.0,
    district: 'talatona',
    data: { businessId: 'biz-boutique-talatona' },
  });

  buildComplex('CondominioKilambaA', 64, 178, 18, 24, 16, '#be123c', 0xfacc15, 'KILAMBA BLOCO A 🏢', 0xf59e0b);
  buildComplex('CondominioKilambaB', 122, 178, 18, 24, 16, '#0f766e', 0xfacc15, 'KILAMBA BLOCO B 🏢', 0x10b981);

  // CONDOMÍNIO VILA ATLÂNTICA (Centro (141, -255), Todas as 18 Casas T1-T4, Parque, Estátua + Fonte Central e Portão Automático!)
  const condGroup = new THREE.Group();
  const [cxCond, czCond] = CONDOMINIO_CENTER;
  const condRoad = new THREE.Mesh(
    new THREE.BoxGeometry(80, 0.14, 122),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
  );
  condRoad.position.set(cxCond, 0.05, czCond);
  condGroup.add(condRoad);

  // Relvado Central + Estátua Realista + Fonte de Água Animada no centro do Condomínio [141, -255]
  const condPark = new THREE.Mesh(
    new THREE.CylinderGeometry(11.5, 12, 0.25, 24),
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.85 })
  );
  condPark.position.set(cxCond, 0.16, czCond);
  condGroup.add(condPark);

  const condBasinMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });
  const condBasin = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.9, 24), condBasinMat);
  condBasin.position.set(cxCond, 0.55, czCond);
  condGroup.add(condBasin);
  const condBasinWater = new THREE.Mesh(
    new THREE.CylinderGeometry(3.9, 3.9, 0.78, 24),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.12, metalness: 0.35 })
  );
  condBasinWater.position.set(cxCond, 0.65, czCond);
  condGroup.add(condBasinWater);
  const statuePedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.35, 2.2, 12), condBasinMat);
  statuePedestal.position.set(cxCond, 1.8, czCond);
  condGroup.add(statuePedestal);
  const statueBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 2.0, 10),
    new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.65, roughness: 0.28 })
  );
  statueBody.position.set(cxCond, 3.8, czCond);
  condGroup.add(statueBody);
  const statueHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.25 })
  );
  statueHead.position.set(cxCond, 5.15, czCond);
  condGroup.add(statueHead);
  for (let j = 0; j < 4; j++) {
    const jAng = (j / 4) * Math.PI * 2;
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.16, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.72, roughness: 0.1 })
    );
    jet.position.set(cxCond + Math.cos(jAng) * 1.9, 1.4, czCond + Math.sin(jAng) * 1.9);
    jet.rotation.z = -Math.cos(jAng) * 0.32;
    jet.rotation.x = Math.sin(jAng) * 0.32;
    condGroup.add(jet);
    fountainWaterJets.push(jet);
  }
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(cxCond, 1.5, czCond), new THREE.Vector3(8.8, 3.0, 8.8)));

  // Parque de Estacionamento Privativo dentro do Condomínio [116, -255]
  const condParkingLot = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.12, 22),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.88 })
  );
  condParkingLot.position.set(116, 0.12, czCond);
  condGroup.add(condParkingLot);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let pz = czCond - 8; pz <= czCond + 8; pz += 4) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.14), stripeMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(113, 0.19, pz);
    condGroup.add(line);
  }

  // Muralha perimetral do condomínio (x=100..182, z=-317..-193) com portão automático a Sul (z=-193)
  const condWallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 });
  const condWalls: [number, number, number, number][] = [
    [cxCond, -317, 82, 1.2],        // Norte
    [100, czCond, 1.2, 124],        // Oeste (x=100, livre da midRingRoad)
    [182, czCond, 1.2, 124],        // Este (x=182, encosta na borda da outerRingRoad sem pisar)
    [118, -193, 36, 1.2],           // Sul esq (x=100..136)
    [164, -193, 36, 1.2],           // Sul dir (x=146..182 -> abertura central de 10m!)
  ];
  condWalls.forEach(([wx, wz, ww, wd]) => {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(ww, 3.2, wd), condWallMat);
    cw.position.set(wx, 1.6, wz);
    condGroup.add(cw);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, 1.6, wz), new THREE.Vector3(ww + 0.3, 3.4, wd + 0.3)));
  });

  // Portão Automático Deslizante do Condomínio (abre automaticamente quando o jogador se aproxima)
  const condominioGate = new THREE.Group();
  const gateBars = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 2.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.25 })
  );
  gateBars.position.y = 1.4;
  condominioGate.add(gateBars);
  condominioGate.position.set(cxCond, 0, -193);
  condGroup.add(condominioGate);
  const condominioGateCollider = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(cxCond, 1.5, -193),
    new THREE.Vector3(9.8, 3.0, 0.7)
  );
  colliders.push(condominioGateCollider);

  // Guarita + Letreiro do Condomínio Vila Atlântica
  const condSignC = document.createElement('canvas');
  condSignC.width = 640;
  condSignC.height = 128;
  const cctx = condSignC.getContext('2d')!;
  cctx.fillStyle = '#0f172a';
  cctx.fillRect(0, 0, 640, 128);
  cctx.strokeStyle = '#facc15';
  cctx.lineWidth = 8;
  cctx.strokeRect(4, 4, 632, 120);
  cctx.fillStyle = '#facc15';
  cctx.font = 'bold 34px sans-serif';
  cctx.textAlign = 'center';
  cctx.textBaseline = 'middle';
  cctx.fillText('CONDOMÍNIO VILA ATLÂNTICA 🏡', 320, 64);
  const condSignTex = new THREE.CanvasTexture(condSignC);
  condSignTex.colorSpace = THREE.SRGBColorSpace;
  const condGateArch = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.2), new THREE.MeshBasicMaterial({ map: condSignTex, side: THREE.DoubleSide }));
  condGateArch.position.set(cxCond, 4.6, -193);
  condGroup.add(condGateArch);
  root.add(condGroup);
  cityChunks.push({ centerX: cxCond, centerZ: czCond, radius: 220, group: condGroup });

  // Construção das 18 Casas Físicas Entráveis (TODAS dentro do Condomínio Vila Atlântica, sincronizadas com server/db.ts)
  const houseInteriorCoords: Record<'t1' | 't2' | 't3' | 't4', [number, number]> = {
    t1: [640, 640],
    t2: [640, 700],
    t3: [640, 760],
    t4: [640, 820],
  };

  const physicalHouses: {
    propId: string;
    title: string;
    x: number;
    z: number;
    doorOffsetZ: number;
    district: District['id'];
    interiorType: 't1' | 't2' | 't3' | 't4';
    wallColor: number;
  }[] = [
    { propId: 'casa-cond-01', title: 'Vila Atlântica Casa 01 — T1 Jardim', x: 111, z: -305, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't1', wallColor: 0xfef3c7 },
    { propId: 'casa-cond-02', title: 'Vila Atlântica Casa 02 — T1 Nascente', x: 126, z: -305, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't1', wallColor: 0xe0f2fe },
    { propId: 'casa-cond-03', title: 'Vila Atlântica Casa 03 — T2 Palmeira', x: 141, z: -305, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't2', wallColor: 0xfce7f3 },
    { propId: 'casa-cond-04', title: 'Vila Atlântica Casa 04 — T2 Horizonte', x: 156, z: -305, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't2', wallColor: 0xdcfce7 },
    { propId: 'casa-cond-05', title: 'Vila Atlântica Casa 05 — T2 Brisa', x: 171, z: -305, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't2', wallColor: 0xfef9c3 },
    { propId: 'casa-cond-06', title: 'Vila Atlântica Casa 06 — T3 Esmeralda', x: 111, z: -280, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't3', wallColor: 0xe2e8f0 },
    { propId: 'casa-cond-07', title: 'Vila Atlântica Casa 07 — T3 Imperial', x: 126, z: -280, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't3', wallColor: 0xfde68a },
    { propId: 'casa-cond-08', title: 'Vila Atlântica Casa 08 — T3 Mirante', x: 156, z: -280, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't3', wallColor: 0xcffafe },
    { propId: 'casa-cond-09', title: 'Vila Atlântica Casa 09 — T4 Mansão Norte', x: 171, z: -280, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't4', wallColor: 0xf8fafc },
    { propId: 'casa-cond-10', title: 'Vila Atlântica Casa 10 — T4 Presidencial', x: 171, z: -255, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't4', wallColor: 0xede9fe },
    { propId: 'casa-cond-11', title: 'Vila Atlântica Casa 11 — T1 Flamingo', x: 111, z: -230, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't1', wallColor: 0xfed7aa },
    { propId: 'casa-cond-12', title: 'Vila Atlântica Casa 12 — T2 Baía', x: 126, z: -230, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't2', wallColor: 0xbae6fd },
    { propId: 'casa-cond-13', title: 'Vila Atlântica Casa 13 — T3 Colonial', x: 156, z: -230, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't3', wallColor: 0xfef08a },
    { propId: 'casa-cond-14', title: 'Vila Atlântica Casa 14 — T2 Acácia', x: 171, z: -230, doorOffsetZ: 5.5, district: 'condominio', interiorType: 't2', wallColor: 0xd9f99d },
    { propId: 'casa-cond-15', title: 'Vila Atlântica Casa 15 — T4 Real', x: 111, z: -207, doorOffsetZ: -5.5, district: 'condominio', interiorType: 't4', wallColor: 0xf1f5f9 },
    { propId: 'casa-cond-16', title: 'Vila Atlântica Casa 16 — T3 Marítima', x: 125, z: -207, doorOffsetZ: -5.5, district: 'condominio', interiorType: 't3', wallColor: 0xe0f2fe },
    { propId: 'casa-cond-17', title: 'Vila Atlântica Casa 17 — T2 Atlântico', x: 157, z: -207, doorOffsetZ: -5.5, district: 'condominio', interiorType: 't2', wallColor: 0xfde047 },
    { propId: 'casa-cond-18', title: 'Vila Atlântica Casa 18 — T4 Penthouse VIP', x: 171, z: -207, doorOffsetZ: -5.5, district: 'condominio', interiorType: 't4', wallColor: 0xc7d2fe },
  ];

  const hTrimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
  const hGlassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x38bdf8, emissiveIntensity: 0.18, roughness: 0.12, metalness: 0.5 });
  const hRoofTileMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.78 });
  const hRoofTrimMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.68 });

  physicalHouses.forEach((h) => {
    const mh = new THREE.Group();
    const bodyH = h.interiorType === 't4' ? 6.8 : h.interiorType === 't3' ? 5.6 : 4.4;
    const bodyW = h.interiorType === 't4' ? 10.6 : 9.0;
    const bodyD = h.interiorType === 't4' ? 9.0 : 8.0;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW, bodyH, bodyD),
      new THREE.MeshStandardMaterial({ color: h.wallColor, roughness: 0.72 })
    );
    body.position.y = bodyH / 2;
    mh.add(body);

    // Beiral & Telhado detalhado em 2 níveis + Chaminé
    const eave = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.9, 0.25, bodyD + 0.9), hRoofTrimMat);
    eave.position.y = bodyH + 0.12;
    mh.add(eave);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(bodyW * 0.78, 2.5, 4), hRoofTileMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = bodyH + 1.45;
    mh.add(roof);
    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.4), hRoofTrimMat);
    ridgeCap.position.y = bodyH + 2.62;
    mh.add(ridgeCap);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.5, 0.65), hRoofTrimMat);
    chimney.position.set(bodyW * 0.26, bodyH + 1.7, -bodyD * 0.2);
    mh.add(chimney);

    const frontZ = h.doorOffsetZ > 0 ? bodyD / 2 + 0.08 : -bodyD / 2 - 0.08;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 2.65, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.5 })
    );
    door.position.set(0, 1.32, frontZ);
    mh.add(door);

    // Janelas detalhadas com moldura branca, parapeito e vidro realista (frente + verso)
    for (const wzSign of [1, -1]) {
      const faceZ = wzSign * (bodyD / 2 + 0.07);
      for (const wx of [-bodyW * 0.3, bodyW * 0.3]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.45, 0.14), hTrimMat);
        frame.position.set(wx, 2.55, faceZ);
        mh.add(frame);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.16, 0.18), hGlassMat);
        glass.position.set(wx, 2.55, faceZ);
        mh.add(glass);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 0.26), hTrimMat);
        sill.position.set(wx, 1.82, faceZ);
        mh.add(sill);
        const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.18, 0.2), hTrimMat);
        mullionV.position.set(wx, 2.55, faceZ);
        mh.add(mullionV);
      }
    }

    mh.position.set(h.x, 0, h.z);
    mh.userData.propertyId = h.propId;
    root.add(mh);
    housePickObjects.push(mh);
    colliders.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(h.x, bodyH / 2, h.z),
        new THREE.Vector3(bodyW + 0.4, bodyH + 1, bodyD + 0.4)
      )
    );

    const [tx, tz] = houseInteriorCoords[h.interiorType];
    const entryZ = h.z + h.doorOffsetZ;
    const exitDir = h.doorOffsetZ < 0 ? -1.5 : 1.5;
    interactables.push({
      id: `house-door-${h.propId}`,
      type: 'interior_door',
      title: `${h.title} 🏠`,
      subtitle: `Tipologia ${h.interiorType.toUpperCase()} • Interior mobilado (Cama, Cozinha, WC)`,
      prompt: '[E] Abrir Casa / Gerir',
      position: [h.x, 0.5, entryZ],
      radius: 3.4,
      district: h.district,
      data: {
        propertyId: h.propId,
        targetX: tx,
        targetZ: tz + 5.2,
        targetRot: 0,
        returnX: h.x,
        returnZ: entryZ + exitDir,
        label: h.title,
      },
    });
  });

  // S) INTERIORES NAVEGÁVEIS COMPLETOS (Isolados em interiorsGroup — ocultos fora de interiores para zero custo GPU!)
  const interiorsGroup = new THREE.Group();
  interiorsGroup.visible = false;
  root.add(interiorsGroup);

  const buildFurnishedHouseInterior = (key: 't1' | 't2' | 't3' | 't4', label: string, wallHex: number, floorHex: number) => {
    const [cx, cz] = houseInteriorCoords[key];
    const room = new THREE.Group();
    const w = key === 't4' ? 20 : 16;
    const d = key === 't4' ? 18 : 14;
    const halfW = w / 2;
    const halfD = d / 2;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshStandardMaterial({ color: floorHex, roughness: 0.42 })
    );
    floor.position.set(cx, -0.15, cz);
    room.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.88 })
    );
    ceil.position.set(cx, 5.2, cz);
    room.add(ceil);

    const wMat = new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.72 });
    const walls: [number, number, number, number, number][] = [
      [cx, cz - halfD, w, 5.4, 0.5],
      [cx, cz + halfD, w, 5.4, 0.5],
      [cx - halfW, cz, 0.5, 5.4, d],
      [cx + halfW, cz, 0.5, 5.4, d],
    ];
    walls.forEach(([wx, wz, ww, wh, wd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wMat);
      m.position.set(wx, wh / 2, wz);
      room.add(m);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, wh / 2, wz), new THREE.Vector3(ww, wh, wd)));
    });

    // Sala (Sofá + Tapete + Mesa de Centro + TV + Candeeiro + Vasos com Plantas + Quadros na Parede)
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.5), new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.75 }));
    sofa.position.set(cx - halfW + 4.2, 0.5, cz - halfD + 3.6);
    room.add(sofa);
    const rug = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.04, 3.0), new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.9 }));
    rug.position.set(cx - halfW + 4.2, 0.02, cz - halfD + 2.0);
    room.add(rug);
    const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.48, 1.1), new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.5 }));
    coffeeTable.position.set(cx - halfW + 4.2, 0.24, cz - halfD + 1.9);
    room.add(coffeeTable);
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.65, 0.7), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
    tvStand.position.set(cx - halfW + 4.2, 0.32, cz - halfD + 0.6);
    room.add(tvStand);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 0.16), new THREE.MeshStandardMaterial({ color: 0x09090b, emissive: 0x1d4ed8, emissiveIntensity: 0.45 }));
    tv.position.set(cx - halfW + 4.2, 1.9, cz - halfD + 0.45);
    room.add(tv);
    houseInteriorGlowMeshes.push(tv);

    // Candeeiro de Pé na Sala + Lustre Central de Teto (controlados pela energia ENDE!)
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.24, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }));
    lampBase.position.set(cx - halfW + 1.1, 1.1, cz - halfD + 3.8);
    room.add(lampBase);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde047, emissiveIntensity: 0.55 }));
    lampShade.position.set(cx - halfW + 1.1, 2.35, cz - halfD + 3.8);
    room.add(lampShade);
    houseInteriorGlowMeshes.push(lampShade);

    const ceilingBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 0.85 })
    );
    ceilingBulb.position.set(cx, 4.9, cz);
    room.add(ceilingBulb);
    houseInteriorGlowMeshes.push(ceilingBulb);

    // Vasos com Plantas Ornamentais
    const addVasePlant = (vx: number, vz: number) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.25, 0.68, 10), new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.78 }));
      pot.position.set(vx, 0.34, vz);
      room.add(pot);
      const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 }));
      foliage.position.set(vx, 1.0, vz);
      room.add(foliage);
    };
    addVasePlant(cx - halfW + 1.0, cz - halfD + 1.0);
    addVasePlant(cx + halfW - 1.1, cz + halfD - 1.2);

    // Quadros Artísticos nas Paredes (CanvasTexture emoldurado)
    const addFramedPainting = (px: number, py: number, pz: number, rotY: number, bgHex: string, accentHex: string, titleTxt: string) => {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 256;
      pCanvas.height = 192;
      const pctx = pCanvas.getContext('2d')!;
      pctx.fillStyle = '#451a03';
      pctx.fillRect(0, 0, 256, 192);
      pctx.fillStyle = bgHex;
      pctx.fillRect(14, 14, 228, 164);
      pctx.fillStyle = accentHex;
      pctx.beginPath();
      pctx.arc(128, 86, 44, 0, Math.PI * 2);
      pctx.fill();
      pctx.fillStyle = '#ffffff';
      pctx.font = 'bold 22px sans-serif';
      pctx.textAlign = 'center';
      pctx.fillText(titleTxt, 128, 158);
      const pTex = new THREE.CanvasTexture(pCanvas);
      pTex.colorSpace = THREE.SRGBColorSpace;
      const pMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.4), new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.45 }));
      pMesh.position.set(px, py, pz);
      pMesh.rotation.y = rotY;
      room.add(pMesh);
    };
    addFramedPainting(cx, 2.8, cz - halfD + 0.3, 0, '#0284c7', '#facc15', 'BAÍA DE LUANDA');
    addFramedPainting(cx - halfW + 0.3, 2.7, cz - 1.2, Math.PI / 2, '#991b1b', '#f59e0b', 'ARTE ANGOLANA');
    addFramedPainting(cx + halfW - 0.3, 2.7, cz - 1.6, -Math.PI / 2, '#14532d', '#38bdf8', 'SERRA DO SUL');

    // Quarto com Cama (Dormir / Acordar)
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.65, 3.6), new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 }));
    bedFrame.position.set(cx + halfW - 3.2, 0.32, cz - halfD + 3.0);
    room.add(bedFrame);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 3.2), new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.7 }));
    mattress.position.set(cx + halfW - 3.2, 0.78, cz - halfD + 3.0);
    room.add(mattress);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 }));
    pillow.position.set(cx + halfW - 3.2, 1.0, cz - halfD + 1.8);
    room.add(pillow);

    // Sala de Jantar — Mesa + 4 Cadeiras + Pratos para Comer em Casa
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 });
    const diningTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 1.6), woodMat);
    diningTop.position.set(cx, 0.85, cz - 0.8);
    room.add(diningTop);
    for (const lx of [-1.2, 1.2]) {
      for (const lz of [-0.6, 0.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.84, 0.12), woodMat);
        leg.position.set(cx + lx, 0.42, cz - 0.8 + lz);
        room.add(leg);
      }
    }
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
    for (const px of [-0.65, 0.65]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.04, 12), plateMat);
      plate.position.set(cx + px, 0.94, cz - 0.8);
      room.add(plate);
    }
    for (const [chX, chZ] of [[cx - 0.65, cz - 1.9], [cx + 0.65, cz - 1.9], [cx - 0.65, cz + 0.3], [cx + 0.65, cz + 0.3]]) {
      const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.48, 0.55), new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.7 }));
      chairSeat.position.set(chX, 0.24, chZ);
      room.add(chairSeat);
    }

    // Cozinha + Bancada + Frigorífico + Fogão
    const kitchenCounter = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.05, 1.4), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 }));
    kitchenCounter.position.set(cx - halfW + 3.4, 0.52, cz + 1.8);
    room.add(kitchenCounter);
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.25, 1.1), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.5, roughness: 0.3 }));
    fridge.position.set(cx - halfW + 0.9, 1.12, cz + 1.8);
    room.add(fridge);
    const stoveTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.95), new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.3 }));
    stoveTop.position.set(cx - halfW + 4.2, 1.08, cz + 1.8);
    room.add(stoveTop);

    // Efeito de Fogo & Fumo leve ao cozinhar no fogão (oculto até o player cozinhar)
    const stoveFx = new THREE.Group();
    stoveFx.position.set(cx - halfW + 4.2, 1.15, cz + 1.8);
    stoveFx.visible = false;
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9 });
    const smokeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.48, roughness: 0.9 });
    for (const fxOff of [-0.22, 0.22]) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 6), flameMat);
      fl.position.set(fxOff, 0.12, 0);
      stoveFx.add(fl);
      const sm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), smokeMat);
      sm.position.set(fxOff, 0.55, 0);
      sm.userData.baseY = 0.55;
      stoveFx.add(sm);
    }
    room.add(stoveFx);
    stoveEffectGroups.push(stoveFx);

    // Casa de Banho (Lavatório / Sanita / Chuveiro / Espelho & Vidro)
    const bathUnit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.2), new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.3 }));
    bathUnit.position.set(cx + halfW - 2.4, 0.5, cz + 1.8);
    room.add(bathUnit);
    const toiletBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.52, 10), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 }));
    toiletBowl.position.set(cx + halfW - 1.1, 0.26, cz + 3.4);
    room.add(toiletBowl);
    const bathMirror = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.08), new THREE.MeshStandardMaterial({ color: 0xbae6fd, metalness: 0.9, roughness: 0.08 }));
    bathMirror.position.set(cx + halfW - 2.4, 2.1, cz + 0.8);
    room.add(bathMirror);
    const showerGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2.2, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.38, roughness: 0.14 })
    );
    showerGlass.position.set(cx + halfW - 3.6, 1.1, cz + 1.8);
    room.add(showerGlass);

    const doorMarker = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.9, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.28 })
    );
    doorMarker.position.set(cx, 1.45, cz + halfD - 0.35);
    room.add(doorMarker);

    const utilityBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.25, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 })
    );
    utilityBox.position.set(cx - 3.6, 1.55, cz + halfD - 0.36);
    room.add(utilityBox);
    const utilityLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.9 })
    );
    utilityLed.position.set(cx - 3.6, 1.92, cz + halfD - 0.48);
    room.add(utilityLed);

    // Colisores físicos da mobília principal da residência (deixando corredores livres até todas as zonas)
    const addFurnitureCollider = (fx: number, fz: number, fw: number, fh: number, fd: number) => {
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(fx, fh / 2, fz), new THREE.Vector3(fw, fh, fd)));
    };
    addFurnitureCollider(cx - halfW + 4.2, cz - halfD + 3.6, 4.0, 1.0, 1.4); // Sofá
    addFurnitureCollider(cx - halfW + 4.2, cz - halfD + 1.9, 1.9, 0.6, 1.0); // Mesa centro
    addFurnitureCollider(cx - halfW + 4.2, cz - halfD + 0.6, 3.1, 1.6, 0.65); // Móvel TV
    addFurnitureCollider(cx + halfW - 3.2, cz - halfD + 3.0, 2.7, 1.0, 3.4); // Cama
    addFurnitureCollider(cx, cz - 0.8, 2.6, 0.9, 1.5); // Mesa jantar
    addFurnitureCollider(cx - halfW + 3.4, cz + 1.8, 3.8, 1.1, 1.3); // Bancada cozinha
    addFurnitureCollider(cx - halfW + 0.9, cz + 1.8, 1.0, 2.2, 1.0); // Frigorífico
    addFurnitureCollider(cx + halfW - 2.4, cz + 1.8, 2.2, 1.0, 2.0); // Casa de banho

    interiorsGroup.add(room);

    interactables.push({
      id: `house-bed-${key}`,
      type: 'bed',
      title: `Cama da Residência (${label}) 🛏️`,
      subtitle: 'Dormir / Acordar para recuperar Sono (100%) e Energia',
      prompt: '[E] Dormir na Cama (Recuperar Sono)',
      position: [cx + halfW - 3.2, 0.5, cz - halfD + 3.0],
      radius: 3.5,
      district: 'condominio',
      data: { interiorKey: key },
    });
    interactables.push({
      id: `house-dining-${key}`,
      type: 'dining_table',
      title: 'Mesa de Jantar da Sala 🍽️',
      subtitle: 'Sentar e fazer refeição completa em casa (Fome & Sede)',
      prompt: '[E] Comer na Mesa de Jantar',
      position: [cx, 0.5, cz - 0.8],
      radius: 3.2,
      district: 'condominio',
    });
    interactables.push({
      id: `house-kitchen-${key}`,
      type: 'kitchen',
      title: 'Cozinha Equipada (Gás SONAGOL) 🍳',
      subtitle: 'Preparar refeição caseira no fogão',
      prompt: '[E] Preparar Refeição na Cozinha',
      position: [cx - halfW + 3.4, 0.5, cz + 1.8],
      radius: 3.2,
      district: 'condominio',
    });
    interactables.push({
      id: `house-bath-${key}`,
      type: 'bathroom',
      title: 'Casa de Banho / WC (Água EPAL) 🚿🚽',
      subtitle: 'Fazer necessidades, lavar mãos & tomar banho',
      prompt: '[E] Usar WC / Tomar Banho',
      position: [cx + halfW - 2.4, 0.5, cz + 2.2],
      radius: 3.2,
      district: 'condominio',
    });
    interactables.push({
      id: `house-panel-${key}`,
      type: 'house_panel',
      title: `Quadro & Impostos da Casa (${label}) ⚡`,
      subtitle: 'Pagar ENDE, EPAL, SONAGOL, Cofre, Baú e Chaves desta casa',
      prompt: '[E] Painel da Casa',
      position: [cx - 3.6, 0.5, cz + halfD - 1.2],
      radius: 2.5,
      district: 'condominio',
      data: { interiorKey: key },
    });
    interactables.push({
      id: `house-exit-${key}`,
      type: 'interior_door',
      title: 'Sair da Casa para a Rua 🚪',
      subtitle: 'Regressar exatamente à porta da tua casa',
      prompt: '[E] Sair para o Exterior',
      position: [cx, 0.5, cz + halfD - 1.2],
      radius: 2.6,
      district: 'condominio',
      data: { isDynamicHouseExit: true, targetX: 48, targetZ: 34, targetRot: Math.PI, label: 'Exterior' },
    });
  };

  buildFurnishedHouseInterior('t1', 'T1 Compacta', 0xfef3c7, 0xd6d3d1);
  buildFurnishedHouseInterior('t2', 'T2 Familiar', 0xe0f2fe, 0xcbd5e1);
  buildFurnishedHouseInterior('t3', 'T3 Executiva', 0xfce7f3, 0xa8a29e);
  buildFurnishedHouseInterior('t4', 'T4 Luxo', 0xf8fafc, 0x78716c);

  // INTERIOR ESQUADRA PNA (820, 640)
  {
    const [ex, ez] = ESQUADRA_INTERIOR_ORIGIN;
    const eqGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
    floor.position.set(ex, -0.15, ez);
    eqGroup.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 }));
    ceil.position.set(ex, 5.2, ez);
    eqGroup.add(ceil);
    const ewMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.7 });
    [
      [ex, ez - 12, 28, 5.4, 0.6],
      [ex, ez + 12, 28, 5.4, 0.6],
      [ex - 14, ez, 0.6, 5.4, 24],
      [ex + 14, ez, 0.6, 5.4, 24],
    ].forEach(([wx, wz, ww, wh, wd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), ewMat);
      m.position.set(wx, wh / 2, wz);
      eqGroup.add(m);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, wh / 2, wz), new THREE.Vector3(ww, wh, wd)));
    });
    const opsDesk = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 }));
    opsDesk.position.set(ex, 0.6, ez - 5);
    eqGroup.add(opsDesk);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(ex, 0.6, ez - 5), new THREE.Vector3(8, 1.2, 2.2)));
    interiorsGroup.add(eqGroup);

    interactables.push({
      id: 'interior-esquadra-cad',
      type: 'police',
      title: 'Central de Operações & CAD PNA 🚔',
      subtitle: 'Identificação, Mandados, Multas & Detenções',
      prompt: '[E] Aceder ao Terminal CAD PNA',
      position: [ex, 0.5, ez - 2.5],
      radius: 3.8,
      district: 'complexo_pna',
    });
    interactables.push({
      id: 'interior-esquadra-exit',
      type: 'interior_door',
      title: 'Sair da Esquadra PNA 🚪',
      subtitle: 'Regressar ao Complexo PNA',
      prompt: '[E] Sair da Esquadra',
      position: [ex, 0.5, ez + 10],
      radius: 3.5,
      district: 'complexo_pna',
      data: { targetX: ESQUADRA_ENTRANCE_POS[0], targetZ: ESQUADRA_ENTRANCE_POS[2], targetRot: Math.PI, label: 'Complexo PNA' },
    });
  }

  // INTERIOR PRISÃO CENTRAL DE LUANDA (900, 640) — 4 Celas Individuais Gradeadas + Corredor + Guardas
  {
    const [px, pz] = PRISON_INTERIOR_ORIGIN;
    const prGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 42), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 }));
    floor.position.set(px, -0.15, pz);
    prGroup.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 42), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }));
    ceil.position.set(px, 5.4, pz);
    prGroup.add(ceil);

    const pwMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
    [
      [px, pz - 21, 40, 5.6, 0.6],
      [px, pz + 21, 40, 5.6, 0.6],
      [px - 20, pz, 0.6, 5.6, 42],
      [px + 20, pz, 0.6, 5.6, 42],
    ].forEach(([wx, wz, ww, wh, wd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), pwMat);
      m.position.set(wx, wh / 2, wz);
      prGroup.add(m);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, wh / 2, wz), new THREE.Vector3(ww, wh, wd)));
    });

    // Construção das 4 Celas individuais (cada uma com cama, sanita e grades frontais — porta de 2.4m no centro!)
    const barMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 });
    PRISON_CELL_SPAWNS.forEach((cell) => {
      const [cx, , cz] = cell.spawn;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      bed.position.set(cx - 1.5, 0.3, cz - 1.8);
      prGroup.add(bed);
      const toilet = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
      toilet.position.set(cx + 1.8, 0.3, cz - 1.8);
      prGroup.add(toilet);
      // Grades na frente da cela (com passagem aberta no centro)
      for (const gx of [-2.4, -1.6, 1.6, 2.4]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), barMat);
        bar.position.set(cx + gx, 1.8, cz + 2.8);
        prGroup.add(bar);
      }
      interactables.push({
        id: `prison-cell-door-${cell.cellNumber}`,
        type: 'prison_door',
        title: `Cela #${cell.cellNumber} — Prisão Central 🔒`,
        subtitle: 'Estado da pena / Fiança ou saída após cumprimento',
        prompt: '[E] Verificar Estado da Pena / Fiança',
        position: [cx, 0.5, cz + 2.5],
        radius: 3.2,
        district: 'complexo_pna',
        data: { cellNumber: cell.cellNumber },
      });
    });

    interiorsGroup.add(prGroup);
    interactables.push({
      id: 'interior-prisao-exit',
      type: 'prison_door',
      title: 'Portão de Saída da Prisão 🚪',
      subtitle: 'Saída autorizada apenas após o cumprimento da pena (PNA)',
      prompt: '[E] Sair para o Pátio / Liberdade',
      position: [px, 0.5, pz + 18.5],
      radius: 3.6,
      district: 'complexo_pna',
      data: { targetX: PRISON_RELEASE_POS[0], targetZ: PRISON_RELEASE_POS[2], targetRot: Math.PI, label: 'Liberdade Complexo PNA', isPrisonExit: true },
    });
  }

  // INTERIOR PALÁCIO PRESIDENCIAL (980, 640)
  {
    const [palX, palZ] = PALACIO_INTERIOR_ORIGIN;
    const palGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.35 }));
    floor.position.set(palX, -0.15, palZ);
    palGroup.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 }));
    ceil.position.set(palX, 5.8, palZ);
    palGroup.add(ceil);
    const palWMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.65 });
    [
      [palX, palZ - 12, 28, 6.0, 0.6],
      [palX, palZ + 12, 28, 6.0, 0.6],
      [palX - 14, palZ, 0.6, 6.0, 24],
      [palX + 14, palZ, 0.6, 6.0, 24],
    ].forEach(([wx, wz, ww, wh, wd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), palWMat);
      m.position.set(wx, wh / 2, wz);
      palGroup.add(m);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, wh / 2, wz), new THREE.Vector3(ww, wh, wd)));
    });
    const presDesk = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.35 }));
    presDesk.position.set(palX, 0.55, palZ - 5.5);
    palGroup.add(presDesk);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(palX, 0.55, palZ - 5.5), new THREE.Vector3(5.5, 1.1, 2.2)));
    interiorsGroup.add(palGroup);

    interactables.push({
      id: 'palacio-gabinete-politics',
      type: 'politics',
      title: 'Gabinete Presidencial & Urna Eleitoral 🏛️🇦🇴',
      subtitle: 'Eleições, Presidente Único & Decretos da República',
      prompt: '[E] Aceder ao Sistema Político & Eleições',
      position: [palX, 0.5, palZ - 3],
      radius: 4.0,
      district: 'centro',
    });
    interactables.push({
      id: 'palacio-exit',
      type: 'interior_door',
      title: 'Sair do Palácio Presidencial 🚪',
      subtitle: 'Regressar à Praça da Mutamba',
      prompt: '[E] Sair do Palácio',
      position: [palX, 0.5, palZ + 10],
      radius: 3.5,
      district: 'centro',
      data: { targetX: PALACIO_PRESIDENCIAL_POS[0], targetZ: PALACIO_PRESIDENCIAL_POS[2] + 3, targetRot: Math.PI, label: 'Centro de Luanda' },
    });
  }

  // RESTANTES 13 INTERIORES NAVEGÁVEIS DE LUANDA RP (Hospital, OAA, Tribunal, CV/FTX/BMR, Garagem, Oficina, Lojas, 4 Sedes de Emprego)
  const buildStandardInteriorRoom = (
    interiorId: keyof typeof INTERIOR_ORIGINS,
    w: number,
    d: number,
    floorHex: number,
    wallHex: number,
    accentHex: number,
    exitTarget: [number, number],
    exitLabel: string,
    district: DistrictId,
    furnitureBuilder: (room: THREE.Group, cx: number, cz: number) => void
  ) => {
    const [cx, cz] = INTERIOR_ORIGINS[interiorId];
    const room = new THREE.Group();
    const halfW = w / 2;
    const halfD = d / 2;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshStandardMaterial({ color: floorHex, roughness: 0.52 })
    );
    floor.position.set(cx, -0.15, cz);
    room.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85 })
    );
    ceil.position.set(cx, 5.4, cz);
    room.add(ceil);

    const wMat = new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.7 });
    [
      [cx, cz - halfD, w, 5.6, 0.6],
      [cx, cz + halfD, w, 5.6, 0.6],
      [cx - halfW, cz, 0.6, 5.6, d],
      [cx + halfW, cz, 0.6, 5.6, d],
    ].forEach(([wx, wz, ww, wh, wd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wMat);
      m.position.set(wx, wh / 2, wz);
      room.add(m);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(wx, wh / 2, wz), new THREE.Vector3(ww, wh, wd)));
    });

    const doorMarker = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.9, 0.3),
      new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.32 })
    );
    doorMarker.position.set(cx, 1.45, cz + halfD - 0.35);
    room.add(doorMarker);

    furnitureBuilder(room, cx, cz);
    interiorsGroup.add(room);

    interactables.push({
      id: `exit-${interiorId}`,
      type: 'interior_door',
      title: `Sair para ${exitLabel} 🚪`,
      subtitle: 'Regressar ao exterior de Luanda',
      prompt: '[E] Sair do Edifício',
      position: [cx, 0.5, cz + halfD - 1.5],
      radius: 3.4,
      district,
      data: { targetX: exitTarget[0], targetZ: exitTarget[1], targetRot: Math.PI, label: exitLabel },
    });
  };

  // 1) Hospital INEMA [1060, 640]
  buildStandardInteriorRoom('hospital_inema', 32, 26, 0xe2e8f0, 0xf8fafc, 0xef4444, [43, 50], 'Hospital Josina Machel', 'maianga', (room, cx, cz) => {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 }));
    desk.position.set(cx, 0.55, cz - 4.5);
    room.add(desk);
    for (const bx of [-9, -3, 3, 9]) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 3.2), new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.55 }));
      bed.position.set(cx + bx, 0.35, cz - 9);
      room.add(bed);
    }
    interactables.push({
      id: 'interior-hospital-recepcao',
      type: 'hospital',
      title: 'Triagem & Urgências INEMA 🏥',
      subtitle: 'Atendimento médico, altas e despacho 112',
      prompt: '[E] Aceder ao Terminal Médico INEMA',
      position: [cx, 0.5, cz - 2.4],
      radius: 3.8,
      district: 'maianga',
    });
  });

  // 2) Escritório de Advogados OAA [1140, 640]
  buildStandardInteriorRoom('advogados_escritorio', 24, 20, 0x78350f, 0xfef3c7, 0xfacc15, [59, -13.5], 'Escritório OAA', 'centro', (room, cx, cz) => {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.0, 1.8), new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.4 }));
    desk.position.set(cx, 0.5, cz - 4);
    room.add(desk);
    interactables.push({
      id: 'interior-oaa-desk',
      type: 'lawyer_office',
      title: 'Gabinete Jurídico OAA ⚖️',
      subtitle: 'Registo criminal, representação legal e fianças',
      prompt: '[E] Abrir Processos OAA',
      position: [cx, 0.5, cz - 2],
      radius: 3.6,
      district: 'centro',
    });
  });

  // 3) Tribunal Provincial [1220, 640] (com Murais da Justiça)
  buildStandardInteriorRoom('tribunal', 30, 26, 0x451a03, 0xfde68a, 0xd97706, [72, -8.5], 'Tribunal Provincial', 'centro', (room, cx, cz) => {
    const judgeBench = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.45 }));
    judgeBench.position.set(cx, 0.7, cz - 7.5);
    room.add(judgeBench);
    for (const rz of [-1, 2.5]) {
      const pew = new THREE.Mesh(new THREE.BoxGeometry(10, 0.9, 1.0), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 }));
      pew.position.set(cx, 0.45, cz + rz);
      room.add(pew);
    }
    const addJusticeMural = (mx: number, mz: number, rotY: number, title: string) => {
      const c = document.createElement('canvas');
      c.width = 384;
      c.height = 192;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#451a03';
      ctx.fillRect(0, 0, 384, 192);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(14, 14, 356, 164);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 4;
      ctx.strokeRect(18, 18, 348, 156);
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, 192, 96);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ map: tex }));
      m.position.set(mx, 2.9, mz);
      m.rotation.y = rotY;
      room.add(m);
    };
    addJusticeMural(cx, cz - 12.6, 0, 'JUSTIÇA & CONSTITUIÇÃO ⚖️');
    addJusticeMural(cx - 14.6, cz - 3, Math.PI / 2, 'TRIBUNAL PROVINCIAL LUANDA');

    interactables.push({
      id: 'interior-tribunal-sala',
      type: 'tribunal',
      title: 'Sala de Audiências — Juiz & Advogados ⚖️',
      subtitle: 'Julgamentos, redução de penas, fianças e absolvições',
      prompt: '[E] Aceder à Sala de Audiências',
      position: [cx, 0.5, cz - 5.2],
      radius: 4.0,
      district: 'centro',
    });
  });

  // 4) Base Secreta CV [1300, 640]
  buildStandardInteriorRoom('base_cv', 28, 24, 0x1e293b, 0x334155, 0xdc2626, [298, -25], 'Morro CV', 'viana', (room, cx, cz) => {
    const carFrame = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.2, 2.0), new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.6, roughness: 0.4 }));
    carFrame.position.set(cx - 4, 0.8, cz - 4);
    room.add(carFrame);
    interactables.push({
      id: 'interior-base-cv-op',
      type: 'faction_station',
      title: 'Oficina Interna de Desmanche CV 🔧',
      subtitle: 'Operação de desmanche e cofre CV - Vianalândia',
      prompt: '[E] Operar Desmanche / Cofre CV',
      position: [cx - 4, 0.5, cz - 1.5],
      radius: 4.0,
      district: 'viana',
      data: { factionId: 'cv_vianalandia', roleId: 'desmanche' },
    });
  });

  // 5) Base Secreta FTX [1380, 640]
  buildStandardInteriorRoom('base_ftx', 28, 24, 0x18181b, 0x27272a, 0xef4444, [268, -235], 'Morro FTX', 'cazenga', (room, cx, cz) => {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.0, 1.6), new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.5 }));
    bench.position.set(cx, 0.5, cz - 5);
    room.add(bench);
    interactables.push({
      id: 'interior-base-ftx-bench',
      type: 'gang_workbench',
      title: 'Bancada Tática de Fabrico FTX 🔫',
      subtitle: 'Produção controlada de armas & munições RP',
      prompt: '[E] Usar Bancada FTX',
      position: [cx, 0.5, cz - 2.8],
      radius: 4.0,
      district: 'cazenga',
      data: { factionId: 'ftx_caop2' },
    });
  });

  // 6) Base Secreta BMR [1460, 640]
  buildStandardInteriorRoom('base_bmr', 28, 24, 0x0f172a, 0x1e293b, 0x2563eb, [268, 235], 'Morro BMR', 'talatona', (room, cx, cz) => {
    for (const gx of [-5, 0, 5]) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 5.2), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 }));
      rack.position.set(cx + gx, 0.45, cz - 4.5);
      room.add(rack);
    }
    interactables.push({
      id: 'interior-base-bmr-op',
      type: 'faction_station',
      title: 'Estufa & Branqueamento BMR 🌿💵',
      subtitle: 'Cultivo virtual por fases e lavagem de capital',
      prompt: '[E] Operar Estufa / Lavagem BMR',
      position: [cx, 0.5, cz - 0.8],
      radius: 4.0,
      district: 'talatona',
      data: { factionId: 'bmr_matanga', roleId: 'estufa_lavagem' },
    });
  });

  // 7) Garagem Central [1060, 740]
  buildStandardInteriorRoom('garagem_central', 28, 24, 0x334155, 0x475569, 0x38bdf8, [18, -10.5], 'Baixa', 'centro', (room, cx, cz) => {
    const term = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 1.0), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 }));
    term.position.set(cx, 0.75, cz - 5);
    room.add(term);
    interactables.push({
      id: 'interior-garagem-term',
      type: 'garage',
      title: 'Terminal da Garagem Central 🅿️',
      subtitle: 'Retirar ou guardar viaturas pessoais',
      prompt: '[E] Gerir Viaturas',
      position: [cx, 0.5, cz - 3],
      radius: 3.8,
      district: 'centro',
    });
  });

  // 8) Oficina Auto Luanda [1140, 740]
  buildStandardInteriorRoom('oficina_auto', 28, 24, 0x1e293b, 0x334155, 0xf59e0b, [103, 53], 'Talatona', 'talatona', (room, cx, cz) => {
    const lift = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 6.2), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }));
    lift.position.set(cx, 0.18, cz - 3.5);
    room.add(lift);
    interactables.push({
      id: 'interior-oficina-lift',
      type: 'workshop',
      title: 'Elevador Auto Luanda 🔧',
      subtitle: 'Pintura, motor, suspensão & reparações',
      prompt: '[E] Aceder à Bancada Mecânica',
      position: [cx, 0.5, cz - 0.5],
      radius: 4.0,
      district: 'talatona',
    });
  });

  // 9) Loja Moda & Mercado [1220, 740]
  buildStandardInteriorRoom('mercado_lojas', 24, 20, 0xf1f5f9, 0xfdf2f8, 0xec4899, [41, 7.5], 'Centro', 'centro', (room, cx, cz) => {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.45 }));
    rack.position.set(cx, 0.8, cz - 4.5);
    room.add(rack);
    interactables.push({
      id: 'interior-loja-balcao',
      type: 'clothing',
      title: 'Provadores & Eletrónica 5G 👕📱',
      subtitle: 'Vestuário, skins, acessórios e mantimentos',
      prompt: '[E] Abrir Catálogo da Loja',
      position: [cx, 0.5, cz - 2.5],
      radius: 3.8,
      district: 'centro',
    });
  });

  // 10-13) 4 Sedes Oficiais dos Empregos (Yango, ENDE, Pescador, ELISAL)
  const jobHqMeta: {
    interiorId: keyof typeof INTERIOR_ORIGINS;
    hubType: InteractableObject['type'];
    title: string;
    exit: [number, number];
    district: DistrictId;
    accent: number;
  }[] = [
    { interiorId: 'job_hq_yango', hubType: 'yango_hub', title: 'Sede Operacional YANGO Táxi 🚕', exit: [-9, 15], district: 'centro', accent: 0xdc2626 },
    { interiorId: 'job_hq_ende', hubType: 'ende_hub', title: 'Central Técnica ENDE Eletricidade ⚡', exit: [41, 19], district: 'maianga', accent: 0xf59e0b },
    { interiorId: 'job_hq_pescador', hubType: 'pescador_hub', title: 'Capitania & Cooperativa Pescador 🎣', exit: [-33, -55], district: 'ilha', accent: 0x0284c7 },
    { interiorId: 'job_hq_elisal', hubType: 'elisal_hub', title: 'Base Logística ELISAL Limpeza 🚛', exit: [121, -27], district: 'viana', accent: 0x16a34a },
  ];
  jobHqMeta.forEach((hq) => {
    buildStandardInteriorRoom(hq.interiorId, 22, 18, 0x1e293b, 0xe2e8f0, hq.accent, hq.exit, hq.title, hq.district, (room, cx, cz) => {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.05, 1.6), new THREE.MeshStandardMaterial({ color: hq.accent, roughness: 0.45 }));
      desk.position.set(cx, 0.52, cz - 4.0);
      room.add(desk);
      interactables.push({
        id: `interior-desk-${hq.interiorId}`,
        type: hq.hubType,
        title: hq.title,
        subtitle: 'Painel de serviço, chamadas, viatura e fardamento oficial',
        prompt: `[E] Abrir ${hq.title}`,
        position: [cx, 0.5, cz - 2.0],
        radius: 3.6,
        district: hq.district,
      });
    });
  });

  // 14) Stand CICOMEX Motors Interior [1060, 840]
  buildStandardInteriorRoom('cicomex_interior', 30, 24, 0x0f172a, 0xe2e8f0, 0xfacc15, [20, -44], 'Stand CICOMEX Motors', 'centro', (room, cx, cz) => {
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.35, 24), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 }));
    podium.position.set(cx, 0.18, cz - 2.5);
    room.add(podium);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.05, 1.6), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35 }));
    desk.position.set(cx, 0.52, cz - 8.5);
    room.add(desk);
    interactables.push({
      id: 'interior-cicomex-desk',
      type: 'dealership',
      title: 'Balcão CICOMEX Motors 🚘',
      subtitle: 'Catálogo completo de viaturas & Test Drive gratuito (90s)',
      prompt: '[E] Comprar Viatura / Test Drive',
      position: [cx, 0.5, cz - 6.2],
      radius: 4.0,
      district: 'centro',
    });
  });

  // 15) Restaurante Sabores da Ilha Interior [1140, 840]
  buildStandardInteriorRoom('restaurante_interior', 26, 22, 0x7c2d12, 0xfef3c7, 0xf97316, [-25, -16.5], 'Ilha de Luanda', 'ilha', (room, cx, cz) => {
    const stove = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.05, 1.5), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 }));
    stove.position.set(cx - 5, 0.52, cz - 6.5);
    room.add(stove);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 1.4), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6 }));
    sink.position.set(cx + 5, 0.5, cz - 6.5);
    room.add(sink);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.05, 1.4), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.45 }));
    counter.position.set(cx, 0.52, cz - 1.5);
    room.add(counter);
    interactables.push({
      id: 'interior-restaurante-station',
      type: 'business_station',
      title: 'Balcão & Cozinha Sabores da Ilha 🍽️',
      subtitle: 'Cozinhar pratos, levantar pratos, lavar louça (40% Trabalhador / 60% Dono)',
      prompt: '[E] Trabalhar / Gerir Restaurante',
      position: [cx, 0.5, cz + 0.8],
      radius: 4.5,
      district: 'ilha',
      data: { businessId: 'biz-restaurante-ilha' },
    });
  });

  // 16) Boutique Moda Luanda Interior [1220, 840]
  buildStandardInteriorRoom('boutique_interior', 26, 22, 0xfdf2f8, 0xfce7f3, 0xec4899, [114, 17.5], 'Talatona', 'talatona', (room, cx, cz) => {
    const workbench = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.05, 1.5), new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.45 }));
    workbench.position.set(cx - 5, 0.52, cz - 6);
    room.add(workbench);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.05, 1.5), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }));
    counter.position.set(cx + 4, 0.52, cz - 2);
    room.add(counter);
    interactables.push({
      id: 'interior-boutique-station',
      type: 'business_station',
      title: 'Atelier & Caixa Boutique Moda Luanda 👗',
      subtitle: 'Produzir peças e atender clientes (40% Trabalhador / 60% Dono)',
      prompt: '[E] Trabalhar / Gerir Boutique',
      position: [cx, 0.5, cz + 0.5],
      radius: 4.5,
      district: 'talatona',
      data: { businessId: 'biz-boutique-talatona' },
    });
  });

  // M) Balizas 3D Luminosas com Seta Holográfica 3D Animada para Empregos e GPS
  const buildBeacon = (colorHex: number): THREE.Group => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.3, 28),
      new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.16;
    g.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.92, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    beam.position.y = 8;
    g.add(beam);

    const arrowCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 1.7, 6),
      new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.7 })
    );
    arrowCone.rotation.x = Math.PI;
    arrowCone.position.y = 4.2;
    arrowCone.name = 'BeaconArrow';
    g.add(arrowCone);

    g.visible = false;
    root.add(g);
    return g;
  };

  const checkpointBeacon = buildBeacon(0xfacc15); // Amarelo para passo de emprego
  const gpsBeacon = buildBeacon(0x38bdf8); // Azul ciano para marcador GPS
  const droppedItemsGroup = new THREE.Group();
  root.add(droppedItemsGroup);

  const districts: District[] = LUANDA_DISTRICTS;
  const trafficVehicles = setupLuandaTraffic(root);

  return {
    rootGroup: root,
    colliders,
    interactables,
    districts,
    streetLamps,
    streetLampsByDistrict,
    oceanMesh,
    oceanWater,
    boats,
    flagMesh,
    extraFlags,
    swayingTrees,
    trafficVehicles,
    drivableVehicles,
    drivableVan: drivableVehicles[0],
    trafficLights,
    beaconMesh,
    lampHeadMat,
    checkpointBeacon,
    gpsBeacon,
    droppedItemsGroup,
    interiorsGroup,
    cityChunks,
    djSpeakerMeshes,
    houseInteriorLights,
    houseInteriorGlowMeshes,
    housePickObjects,
    condominioGate,
    condominioGateCollider,
    pnaGate,
    pnaGateCollider,
    fountainWaterJets,
    stoveEffectGroups,
    airplanes,
    farmPlantDisplays,
    volleyballMesh,
  };
}
