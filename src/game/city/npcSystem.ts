/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { buildDetailedHumanRig, type HumanRigHandles } from '../player/humanRig';
import { FAA_BASE_BOUNDS, getSurfaceHeightAt } from './terrainPhysics';

export interface WorldNpc {
  id: string;
  label: string;
  factionId?: string;
  isGuard: boolean;
  isPolice: boolean;
  isFaa?: boolean;
  isDynamicPursuit?: boolean;
  mesh: THREE.Group;
  rig: HumanRigHandles;
  position: THREE.Vector3;
  baseY: number;
  waypoints: [number, number][];
  waypointIdx: number;
  speed: number;
  baseSpeed: number;
  hp: number;
  maxHp: number;
  knockedOutUntil: number;
  panicUntil: number;
  handsUpUntil: number;
  robbedCooldownUntil: number;
  attackCooldownUntil: number;
  arrestProgress: number;
  walkPhase: number;
}

export interface NpcUpdateOptions {
  wantedStars: number;
  playerSpeed: number;
  playerUnconscious: boolean;
  isJailed: boolean;
  playerFactionId?: string | null;
  faaHeistActive?: boolean;
  colliders?: THREE.Box3[];
  onPoliceShot?: (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, damage: number) => void;
  onPoliceArrest?: (reason: string) => void;
}

const _tmpDelta = new THREE.Vector3();
const _toNpc = new THREE.Vector3();

function makeNpcSprite(label: string, accent: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 72;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
  ctx.fillRect(0, 0, 384, 72);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 378, 66);
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(label, 192, 36);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 192, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2.25, 0.46, 1);
  sp.position.set(0, 2.38, 0);
  return sp;
}

export class NpcSystem {
  public npcs: WorldNpc[] = [];
  private root: THREE.Group;
  private pursuitSeq = 0;

  constructor(root: THREE.Group) {
    this.root = root;
    this.spawnCityNpcs();
  }

  private createNpc(opts: {
    id: string;
    label: string;
    gender?: 'masculino' | 'feminino';
    shirtColor: number;
    pantsColor: number;
    skinColor: number;
    hairStyle?: 'curto' | 'afro' | 'trancas' | 'bone';
    hairColor?: number;
    hasVest?: boolean;
    capColor?: number;
    hasSunglasses?: boolean;
    hasBag?: boolean;
    accent: string;
    factionId?: string;
    isGuard: boolean;
    isPolice?: boolean;
    isFaa?: boolean;
    isDynamicPursuit?: boolean;
    baseY?: number;
    speed: number;
    waypoints: [number, number][];
  }): WorldNpc {
    const g = new THREE.Group();
    const baseY = opts.baseY ?? 0;

    const rig = buildDetailedHumanRig({
      gender: opts.gender || 'masculino',
      skinColor: opts.skinColor,
      shirtColor: opts.shirtColor,
      pantsColor: opts.pantsColor,
      shoesColor: opts.isPolice || opts.isFaa ? 0x111827 : 0xf8fafc,
      hairColor: opts.hairColor ?? 0x18181b,
      hairStyle: opts.hairStyle || (opts.gender === 'feminino' ? 'trancas' : 'curto'),
      hasVest: opts.hasVest,
      vestColor: opts.isFaa ? 0x2f3b22 : opts.isPolice ? 0x0f172a : 0x18181b,
      hasCap: opts.capColor !== undefined,
      capColor: opts.capColor,
      hasSunglasses: opts.hasSunglasses,
      hasBag: opts.hasBag,
      equippedWeapon: opts.isFaa ? 'ak47_tatica' : opts.isPolice ? 'pistola_9mm' : opts.isGuard ? 'ak47_tatica' : 'none',
      castShadow: false,
    });
    g.add(rig.root);
    g.add(makeNpcSprite(opts.label, opts.accent));

    const start = opts.waypoints[0];
    g.position.set(start[0], baseY, start[1]);
    this.root.add(g);

    const npc: WorldNpc = {
      id: opts.id,
      label: opts.label,
      factionId: opts.factionId,
      isGuard: opts.isGuard,
      isPolice: !!opts.isPolice,
      isFaa: !!opts.isFaa,
      isDynamicPursuit: opts.isDynamicPursuit,
      mesh: g,
      rig,
      position: new THREE.Vector3(start[0], baseY, start[1]),
      baseY,
      waypoints: opts.waypoints,
      waypointIdx: 1 % opts.waypoints.length,
      speed: opts.speed,
      baseSpeed: opts.speed,
      hp: opts.isFaa ? 170 : opts.isPolice ? 140 : opts.isGuard ? 120 : 80,
      maxHp: opts.isFaa ? 170 : opts.isPolice ? 140 : opts.isGuard ? 120 : 80,
      knockedOutUntil: 0,
      panicUntil: 0,
      handsUpUntil: 0,
      robbedCooldownUntil: 0,
      attackCooldownUntil: 0,
      arrestProgress: 0,
      walkPhase: Math.random() * Math.PI * 2,
    };

    this.npcs.push(npc);
    return npc;
  }

  private spawnCityNpcs() {
    const civilians: {
      label: string;
      gender?: 'masculino' | 'feminino';
      shirt: number;
      pants: number;
      skin: number;
      hair?: 'curto' | 'afro' | 'trancas';
      glasses?: boolean;
      bag?: boolean;
      wp: [number, number][];
    }[] = [
      { label: 'Cidadão Marginal', shirt: 0xf59e0b, pants: 0x1e293b, skin: 0x8d5524, hair: 'curto', glasses: true, wp: [[-22, -55], [-22, 55]] },
      { label: 'Banhista Praia & Lazer', gender: 'feminino', shirt: 0x06b6d4, pants: 0xfde047, skin: 0x9c6644, hair: 'trancas', wp: [[-37, -20], [-37, 50]] },
      { label: 'Vendedora da Ilha', gender: 'feminino', shirt: 0xec4899, pants: 0x0f172a, skin: 0x9c6644, hair: 'afro', bag: true, wp: [[-29, -48], [-29, 45]] },
      { label: 'Transeunte Baixa', shirt: 0x3b82f6, pants: 0x111827, skin: 0xa16244, hair: 'trancas', bag: true, wp: [[12, -40], [46, -40], [46, -12], [12, -12]] },
      { label: 'Morador Maianga', shirt: 0x10b981, pants: 0x18181b, skin: 0x7c4a2d, hair: 'curto', wp: [[28, 24], [52, 24], [52, 48], [28, 48]] },
      { label: 'Executivo Ingombota', shirt: 0xe2e8f0, pants: 0x0f172a, skin: 0x8d5524, hair: 'curto', glasses: true, wp: [[20, -90], [55, -90], [55, -60], [20, -60]] },
      { label: 'Executivo Talatona', shirt: 0xf8fafc, pants: 0x09090b, skin: 0x8d5524, hair: 'curto', glasses: true, bag: true, wp: [[102, 44], [128, 44], [128, 86], [102, 86]] },
      { label: 'Moradora Kilamba', gender: 'feminino', shirt: 0x9333ea, pants: 0x1e1b4b, skin: 0xb47b56, hair: 'trancas', wp: [[74, 148], [108, 148], [108, 185], [74, 185]] },
      { label: 'Comerciante Viana', shirt: 0xea580c, pants: 0x18181b, skin: 0x9c6644, hair: 'afro', wp: [[148, -50], [178, -50], [178, -18], [148, -18]] },
      { label: 'Estivador Porto', shirt: 0x0284c7, pants: 0x334155, skin: 0x7c4a2d, hair: 'curto', wp: [[58, -172], [95, -172], [95, -150], [58, -150]] },
    ];

    civilians.forEach((c, idx) => {
      this.createNpc({
        id: `npc-civ-${idx}`,
        label: c.label,
        gender: c.gender,
        shirtColor: c.shirt,
        pantsColor: c.pants,
        skinColor: c.skin,
        hairStyle: c.hair,
        hasSunglasses: c.glasses,
        hasBag: c.bag,
        accent: '#38bdf8',
        isGuard: false,
        isPolice: false,
        speed: 2.1 + (idx % 3) * 0.25,
        waypoints: c.wp,
      });
    });

    const policePatrols: { id: string; label: string; wp: [number, number][] }[] = [
      { id: 'pna-patrol-1', label: '[PNA] Agente Esquadra', wp: [[204, 110], [238, 110], [238, 142], [204, 142]] },
      { id: 'pna-patrol-2', label: '[PNA] Patrulha Baixa', wp: [[2, -24], [14, -24], [14, -10], [2, -10]] },
      { id: 'pna-patrol-3', label: '[PNA] Patrulha Talatona', wp: [[102, 56], [124, 56], [124, 84], [102, 84]] },
    ];

    policePatrols.forEach((pol) => {
      this.createNpc({
        id: pol.id,
        label: pol.label,
        factionId: 'policia',
        shirtColor: 0x1e3a8a,
        pantsColor: 0x0f172a,
        skinColor: 0x8d5524,
        hasVest: true,
        capColor: 0x1d4ed8,
        accent: '#ef4444',
        isGuard: true,
        isPolice: true,
        speed: 2.5,
        waypoints: pol.wp,
      });
    });

    const guards: {
      id: string;
      label: string;
      factionId: string;
      shirt: number;
      cap: number;
      accent: string;
      baseY: number;
      isFaa?: boolean;
      wp: [number, number][];
    }[] = [
      {
        id: 'guard-faa-1',
        label: '[FAA] Sentinela Base',
        factionId: 'faa',
        shirt: 0x3f4f2f,
        cap: 0x2f3b22,
        accent: '#84cc16',
        baseY: 0,
        isFaa: true,
        wp: [[-126, 116], [-148, 116], [-148, 142], [-126, 142]],
      },
      {
        id: 'guard-faa-2',
        label: '[FAA] Guarda Portão',
        factionId: 'faa',
        shirt: 0x3f4f2f,
        cap: 0x2f3b22,
        accent: '#84cc16',
        baseY: 0,
        isFaa: true,
        wp: [[-112, 118], [-112, 142]],
      },
      {
        id: 'guard-faa-3',
        label: '[FAA] Guarda Cofre',
        factionId: 'faa',
        shirt: 0x3f4f2f,
        cap: 0x2f3b22,
        accent: '#84cc16',
        baseY: 0,
        isFaa: true,
        wp: [[-154, 122], [-142, 122], [-142, 134], [-154, 134]],
      },
      {
        id: 'guard-ftx-1',
        label: 'Tático FTX',
        factionId: 'ftx_caop2',
        shirt: 0x111827,
        cap: 0xdc2626,
        accent: '#ef4444',
        baseY: 2.8,
        wp: [[267, -243], [283, -243], [283, -227], [267, -227]],
      },
      {
        id: 'guard-bmr-1',
        label: 'Tático BMR',
        factionId: 'bmr_matanga',
        shirt: 0x1d4ed8,
        cap: 0x0f172a,
        accent: '#3b82f6',
        baseY: 2.8,
        wp: [[267, 227], [283, 227], [283, 243], [267, 243]],
      },
      {
        id: 'guard-cv-1',
        label: 'Frente CV',
        factionId: 'cv_vianalandia',
        shirt: 0x991b1b,
        cap: 0x09090b,
        accent: '#dc2626',
        baseY: 2.8,
        wp: [[297, -33], [313, -33], [313, -17], [297, -17]],
      },
      {
        id: 'guard-cv-2',
        label: 'Desmanche CV',
        factionId: 'cv_vianalandia',
        shirt: 0x7f1d1d,
        cap: 0x09090b,
        accent: '#dc2626',
        baseY: 0,
        wp: [[266, -42], [278, -42], [278, -30], [266, -30]],
      },
    ];

    guards.forEach((gd) => {
      this.createNpc({
        id: gd.id,
        label: gd.label,
        factionId: gd.factionId,
        shirtColor: gd.shirt,
        pantsColor: gd.isFaa ? 0x2f3b22 : 0x09090b,
        skinColor: 0x8d5524,
        hasVest: true,
        capColor: gd.cap,
        accent: gd.accent,
        isGuard: true,
        isPolice: false,
        isFaa: gd.isFaa,
        baseY: gd.baseY,
        speed: gd.isFaa ? 2.4 : 2.0,
        waypoints: gd.wp,
      });
    });
  }

  public spawnPolicePursuit(playerX: number, playerZ: number, wantedStars: number, includeFaa = false): number {
    const desiredCount = Math.min(includeFaa ? 6 : 4, (includeFaa ? 2 : 1) + wantedStars);
    const now = Date.now();
    const nearbyCops = this.npcs.filter(
      (n) =>
        (n.isPolice || n.isFaa) &&
        n.knockedOutUntil <= now &&
        Math.hypot(n.position.x - playerX, n.position.z - playerZ) < 85
    );
    let spawned = 0;
    const needed = Math.max(0, desiredCount - nearbyCops.length);
    for (let i = 0; i < needed; i++) {
      this.pursuitSeq += 1;
      const angle = (i / Math.max(1, needed)) * Math.PI * 1.4 + Math.random() * 0.7;
      const dist = 28 + i * 6;
      const sx = Math.max(-162, Math.min(360, playerX + Math.cos(angle) * dist));
      const sz = Math.max(-360, Math.min(360, playerZ + Math.sin(angle) * dist));
      const spawnFaa = includeFaa && i % 2 === 0;
      this.createNpc({
        id: `pna-pursuit-${this.pursuitSeq}`,
        label: spawnFaa ? '[FAA] Comando' : '[PNA] Intervenção',
        factionId: spawnFaa ? 'faa' : 'policia',
        shirtColor: spawnFaa ? 0x3f4f2f : 0x1e3a8a,
        pantsColor: spawnFaa ? 0x2f3b22 : 0x09090b,
        skinColor: 0x8d5524,
        hasVest: true,
        capColor: spawnFaa ? 0x2f3b22 : 0xef4444,
        accent: spawnFaa ? '#84cc16' : '#ef4444',
        isGuard: true,
        isPolice: true,
        isFaa: spawnFaa,
        isDynamicPursuit: true,
        baseY: 0,
        speed: spawnFaa ? 6.8 : 6.4,
        waypoints: [
          [sx, sz],
          [playerX, playerZ],
        ],
      });
      spawned += 1;
    }
    return spawned;
  }

  public clearPolicePursuit() {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if (n.isDynamicPursuit) {
        this.root.remove(n.mesh);
        this.npcs.splice(i, 1);
      } else if (n.isPolice || n.isFaa) {
        n.arrestProgress = 0;
        n.attackCooldownUntil = 0;
      }
    }
  }

  public findNearestCivilian(x: number, z: number, maxDist = 4.2): WorldNpc | null {
    const now = Date.now();
    let best: WorldNpc | null = null;
    let bestDist = maxDist;
    for (const npc of this.npcs) {
      if (npc.isGuard || npc.isPolice || npc.isFaa) continue;
      if (npc.knockedOutUntil > now) continue;
      const d = Math.hypot(npc.position.x - x, npc.position.z - z);
      if (d <= bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  }

  public findAimedCivilian(origin: THREE.Vector3, camDir: THREE.Vector3, maxDist = 11): WorldNpc | null {
    const now = Date.now();
    let best: WorldNpc | null = null;
    let bestDist = maxDist;
    for (const npc of this.npcs) {
      if (npc.isGuard || npc.isPolice || npc.isFaa || npc.knockedOutUntil > now) continue;
      _toNpc.set(npc.position.x - origin.x, npc.baseY + 1.2 - origin.y, npc.position.z - origin.z);
      const dist = _toNpc.length();
      if (dist <= maxDist && dist > 0.4) {
        _toNpc.divideScalar(dist);
        const dot = _toNpc.dot(camDir);
        if (dot > 0.9 && dist < bestDist) {
          bestDist = dist;
          best = npc;
        }
      }
    }
    return best;
  }

  public markNpcThreatened(npc: WorldNpc, robbed = false) {
    const now = Date.now();
    npc.handsUpUntil = now + (robbed ? 3500 : 2800);
    npc.panicUntil = now + 9000;
    if (robbed) npc.robbedCooldownUntil = now + 20000;
  }

  public triggerGunshotPanic(x: number, z: number, radius = 42) {
    const now = Date.now();
    for (const npc of this.npcs) {
      if (npc.isPolice || npc.isFaa) continue;
      const dx = npc.position.x - x;
      const dz = npc.position.z - z;
      if (dx * dx + dz * dz <= radius * radius) {
        npc.panicUntil = now + 6000;
      }
    }
  }

  public damageNpc(npc: WorldNpc, damage: number): boolean {
    const now = Date.now();
    if (npc.knockedOutUntil > now) return false;
    npc.hp = Math.max(0, npc.hp - damage);
    npc.panicUntil = now + 6500;
    if (npc.hp <= 0) {
      npc.knockedOutUntil = now + 18000;
      npc.mesh.rotation.x = -Math.PI / 2;
      npc.mesh.position.y = npc.baseY + 0.22;
      return true;
    }
    return false;
  }

  private resolveColliders(npc: WorldNpc, colliders?: THREE.Box3[]): boolean {
    if (!colliders || colliders.length === 0) return false;
    const radius = 0.44;
    const pyMin = npc.baseY + 0.14;
    const pyMax = npc.baseY + 1.78;
    let pushed = false;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (pyMax < b.min.y || pyMin > b.max.y) continue;
      const closestX = Math.max(b.min.x, Math.min(npc.position.x, b.max.x));
      const closestZ = Math.max(b.min.z, Math.min(npc.position.z, b.max.z));
      const dx = npc.position.x - closestX;
      const dz = npc.position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        pushed = true;
        if (distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          npc.position.x += (dx / dist) * push;
          npc.position.z += (dz / dist) * push;
        } else {
          const penLeft = Math.abs(npc.position.x - b.min.x);
          const penRight = Math.abs(b.max.x - npc.position.x);
          const penTop = Math.abs(npc.position.z - b.min.z);
          const penBot = Math.abs(b.max.z - npc.position.z);
          const minPen = Math.min(penLeft, penRight, penTop, penBot);
          if (minPen === penLeft) npc.position.x = b.min.x - radius;
          else if (minPen === penRight) npc.position.x = b.max.x + radius;
          else if (minPen === penTop) npc.position.z = b.min.z - radius;
          else npc.position.z = b.max.z + radius;
        }
      }
    }
    return pushed;
  }

  public update(dt: number, playerX: number, playerZ: number, opts?: NpcUpdateOptions) {
    const now = Date.now();
    const wantedStars = opts?.wantedStars || 0;
    const isJailed = !!opts?.isJailed;
    const playerSpeed = opts?.playerSpeed || 0;
    const playerUnconscious = !!opts?.playerUnconscious;
    const faaHeistActive = !!opts?.faaHeistActive;
    const playerFactionId = opts?.playerFactionId || null;
    const colliders = opts?.colliders;

    const inFaaBase =
      playerX >= FAA_BASE_BOUNDS.minX &&
      playerX <= FAA_BASE_BOUNDS.maxX &&
      playerZ >= FAA_BASE_BOUNDS.minZ &&
      playerZ <= FAA_BASE_BOUNDS.maxZ;
    const isAuthorizedFaa = playerFactionId === 'faa' || playerFactionId === 'policia';
    const faaHostileTarget = (inFaaBase && !isAuthorizedFaa) || faaHeistActive;

    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      const pDx = playerX - npc.position.x;
      const pDz = playerZ - npc.position.z;
      const distSq = pDx * pDx + pDz * pDz;
      const inRange = distSq <= 190 * 190;
      npc.mesh.visible =
        inRange || Boolean((npc.isPolice || npc.isFaa) && (wantedStars > 0 || faaHostileTarget));

      if (npc.isDynamicPursuit && ((wantedStars <= 0 && !faaHostileTarget) || isJailed || distSq > 165 * 165)) {
        this.root.remove(npc.mesh);
        this.npcs.splice(i, 1);
        continue;
      }

      if (!npc.mesh.visible) continue;

      if (npc.knockedOutUntil > 0) {
        if (now >= npc.knockedOutUntil) {
          npc.knockedOutUntil = 0;
          npc.hp = npc.maxHp;
          npc.mesh.rotation.x = 0;
          npc.mesh.position.y = npc.baseY;
        } else {
          continue;
        }
      }

      const { leftArmGroup, rightArmGroup, leftForearmGroup, rightForearmGroup, leftLegGroup, rightLegGroup, leftLowerLegGroup, rightLowerLegGroup } = npc.rig;

      if (!npc.isPolice && !npc.isFaa && now < npc.handsUpUntil) {
        npc.mesh.rotation.y = Math.atan2(pDx, pDz);
        leftArmGroup.rotation.x = -2.85;
        rightArmGroup.rotation.x = -2.85;
        leftLegGroup.rotation.x = 0;
        rightLegGroup.rotation.x = 0;
        continue;
      }

      // EXECUÇÃO FAA A INTRUSOS NA ÁREA MILITAR OU ASSALTANTES DO COFRE FAA (fogo letal imediato!)
      if (npc.isFaa && faaHostileTarget && !isJailed && !playerUnconscious && distSq <= 78 * 78) {
        const dist = Math.sqrt(distSq) || 0.001;
        npc.mesh.rotation.y = Math.atan2(pDx, pDz);

        if (dist <= 38 && now >= npc.attackCooldownUntil) {
          npc.attackCooldownUntil = now + 520;
          opts?.onPoliceShot?.(
            { x: npc.position.x, y: npc.baseY + 1.42, z: npc.position.z },
            { x: playerX, y: 1.15, z: playerZ },
            22
          );
        }

        if (dist > 7.5) {
          const rushSpeed = 6.8;
          npc.position.x += (pDx / dist) * rushSpeed * dt;
          npc.position.z += (pDz / dist) * rushSpeed * dt;
          this.resolveColliders(npc, colliders);
          npc.baseY = getSurfaceHeightAt(npc.position.x, npc.position.z, npc.baseY);
          npc.mesh.position.set(npc.position.x, npc.baseY, npc.position.z);
          npc.walkPhase += dt * rushSpeed * 3.8;
          const swing = Math.sin(npc.walkPhase) * 0.65;
          leftLegGroup.rotation.x = swing;
          rightLegGroup.rotation.x = -swing;
          leftLowerLegGroup.rotation.x = Math.max(0.05, Math.cos(npc.walkPhase) * 0.7);
          rightLowerLegGroup.rotation.x = Math.max(0.05, -Math.cos(npc.walkPhase) * 0.7);
        } else {
          leftLegGroup.rotation.x = 0;
          rightLegGroup.rotation.x = 0;
        }
        leftArmGroup.rotation.x = -0.9;
        leftForearmGroup.rotation.x = -0.6;
        rightArmGroup.rotation.x = -1.42;
        rightForearmGroup.rotation.x = -0.15;
        continue;
      }

      // IA ATIVA DA POLÍCIA PNA QUANDO HÁ ESTRELAS OU ASSALTO FAA
      if (npc.isPolice && (wantedStars > 0 || faaHeistActive) && !isJailed) {
        const dist = Math.sqrt(distSq) || 0.001;
        npc.mesh.rotation.y = Math.atan2(pDx, pDz);

        const arrestRange = playerSpeed < 4.5 ? 3.35 : 2.5;
        if (dist <= arrestRange || (playerUnconscious && dist <= 6.2)) {
          npc.arrestProgress += dt;
          leftArmGroup.rotation.x = -1.35;
          rightArmGroup.rotation.x = -1.35;
          leftLegGroup.rotation.x = 0;
          rightLegGroup.rotation.x = 0;
          if (npc.arrestProgress >= 0.9 || playerUnconscious) {
            npc.arrestProgress = 0;
            opts?.onPoliceArrest?.(
              faaHeistActive
                ? 'Abatido e preso após assalto ao Tesouro das FAA'
                : 'Detido pela Polícia Nacional PNA após ocorrência criminal'
            );
            return;
          }
          continue;
        } else {
          npc.arrestProgress = Math.max(0, npc.arrestProgress - dt * 0.4);
        }

        if (dist <= 28 && dist > 4.2 && now >= npc.attackCooldownUntil) {
          npc.attackCooldownUntil = now + Math.max(820, 1450 - wantedStars * 110);
          opts?.onPoliceShot?.(
            { x: npc.position.x, y: npc.baseY + 1.35, z: npc.position.z },
            { x: playerX, y: 1.15, z: playerZ },
            faaHeistActive ? 14 : 7 + wantedStars
          );
        }

        const chaseSpeed = Math.min(7.5, 5.8 + wantedStars * 0.35);
        npc.position.x += (pDx / dist) * chaseSpeed * dt;
        npc.position.z += (pDz / dist) * chaseSpeed * dt;
        this.resolveColliders(npc, colliders);
        npc.baseY = getSurfaceHeightAt(npc.position.x, npc.position.z, npc.baseY);
        npc.mesh.position.set(npc.position.x, npc.baseY, npc.position.z);

        npc.walkPhase += dt * chaseSpeed * 3.8;
        const swing = Math.sin(npc.walkPhase) * 0.65;
        leftLegGroup.rotation.x = swing;
        rightLegGroup.rotation.x = -swing;
        leftLowerLegGroup.rotation.x = Math.max(0.05, Math.cos(npc.walkPhase) * 0.65);
        rightLowerLegGroup.rotation.x = Math.max(0.05, -Math.cos(npc.walkPhase) * 0.65);
        leftArmGroup.rotation.x = -swing * 0.65;
        leftForearmGroup.rotation.x = -0.35;
        rightArmGroup.rotation.x = -1.35;
        rightForearmGroup.rotation.x = -0.1;
        continue;
      }

      // Patrulha / Caminhada normal ou Fuga em Pânico
      const target = npc.waypoints[npc.waypointIdx];
      _tmpDelta.set(target[0] - npc.position.x, 0, target[1] - npc.position.z);
      const dist = _tmpDelta.length();

      if (dist < 0.8) {
        npc.waypointIdx = (npc.waypointIdx + 1) % npc.waypoints.length;
        continue;
      }

      const activeSpeed = now < npc.panicUntil ? npc.baseSpeed * 2.25 : npc.baseSpeed;
      _tmpDelta.divideScalar(dist);
      npc.position.x += _tmpDelta.x * activeSpeed * dt;
      npc.position.z += _tmpDelta.z * activeSpeed * dt;
      const blocked = this.resolveColliders(npc, colliders);
      if (blocked && Math.random() < dt * 1.4) {
        npc.waypointIdx = (npc.waypointIdx + 1) % npc.waypoints.length;
      }
      npc.baseY = getSurfaceHeightAt(npc.position.x, npc.position.z, npc.baseY);
      npc.mesh.position.set(npc.position.x, npc.baseY, npc.position.z);
      npc.mesh.rotation.y = Math.atan2(_tmpDelta.x, _tmpDelta.z);

      npc.walkPhase += dt * activeSpeed * 3.6;
      const swing = Math.sin(npc.walkPhase) * 0.52;
      leftLegGroup.rotation.x = swing;
      rightLegGroup.rotation.x = -swing;
      leftLowerLegGroup.rotation.x = Math.max(0.04, Math.cos(npc.walkPhase) * 0.55);
      rightLowerLegGroup.rotation.x = Math.max(0.04, -Math.cos(npc.walkPhase) * 0.55);
      leftArmGroup.rotation.x = -swing * 0.65;
      rightArmGroup.rotation.x = swing * 0.65;
      leftForearmGroup.rotation.x = -0.25;
      rightForearmGroup.rotation.x = -0.25;
    }
  }
}
