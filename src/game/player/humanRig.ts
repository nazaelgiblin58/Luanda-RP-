/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sistema partilhado de anatomia humana 3D realista com cache de geometrias (alta FPS).
 * Usado por NPCs, Soldados FAA, Agentes PNA e Jogadores Remotos.
 */

import * as THREE from 'three';
import type { PlayerCustomization, WeaponId } from '../types';

const _geoCache: Record<string, THREE.BufferGeometry> = {};
function g(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!_geoCache[key]) {
    _geoCache[key] = factory();
  }
  return _geoCache[key];
}

const _sharedMats: Record<string, THREE.Material> = {};
function sm(key: string, factory: () => THREE.Material): THREE.Material {
  if (!_sharedMats[key]) {
    _sharedMats[key] = factory();
  }
  return _sharedMats[key];
}

export interface HumanRigHandles {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftForearmGroup: THREE.Group;
  rightForearmGroup: THREE.Group;
  leftLegGroup: THREE.Group;
  rightLegGroup: THREE.Group;
  leftLowerLegGroup: THREE.Group;
  rightLowerLegGroup: THREE.Group;
  weaponMount: THREE.Group;
}

export interface HumanRigOptions {
  gender?: 'masculino' | 'feminino';
  skinColor?: string | number;
  shirtColor?: string | number;
  pantsColor?: string | number;
  shoesColor?: string | number;
  hairColor?: string | number;
  hairStyle?: 'curto' | 'afro' | 'trancas' | 'bone';
  outfitStyle?: PlayerCustomization['outfitStyle'];
  hasVest?: boolean;
  vestColor?: number;
  hasCap?: boolean;
  capColor?: string | number;
  hasMask?: boolean;
  maskColor?: string | number;
  hasSunglasses?: boolean;
  hasChain?: boolean;
  hasBag?: boolean;
  heightScale?: number;
  equippedWeapon?: WeaponId;
  castShadow?: boolean;
}

export function buildDetailedWeaponMesh(weaponId: WeaponId): THREE.Group {
  const grp = new THREE.Group();
  if (!weaponId || weaponId === 'none') return grp;

  const metalMat = sm('w_metal', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.82, roughness: 0.25 }));
  const darkSteelMat = sm('w_dark', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.88, roughness: 0.22 }));
  const chromeMat = sm('w_chrome', () => new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.18 }));
  const gripMat = sm('w_grip', () => new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.82 }));
  const woodMat = sm('w_wood', () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 }));

  if (weaponId === 'bastao_tatico') {
    const handle = new THREE.Mesh(
      g('w_baton_h', () => {
        const geo = new THREE.CylinderGeometry(0.022, 0.022, 0.15, 8);
        geo.rotateX(Math.PI / 2);
        return geo;
      }),
      gripMat
    );
    handle.position.set(0, -0.01, 0.05);
    grp.add(handle);
    const baton = new THREE.Mesh(
      g('w_baton_b', () => {
        const geo = new THREE.CylinderGeometry(0.02, 0.018, 0.42, 8);
        geo.rotateX(Math.PI / 2);
        return geo;
      }),
      darkSteelMat
    );
    baton.position.set(0, -0.01, 0.34);
    grp.add(baton);
    return grp;
  }

  if (weaponId === 'pistola_9mm') {
    const slide = new THREE.Mesh(g('w_p_slide', () => new THREE.BoxGeometry(0.042, 0.044, 0.24)), metalMat);
    slide.position.set(0, 0.04, 0.12);
    grp.add(slide);
    const frame = new THREE.Mesh(g('w_p_frame', () => new THREE.BoxGeometry(0.038, 0.032, 0.21)), darkSteelMat);
    frame.position.set(0, 0.012, 0.1);
    grp.add(frame);
    const grip = new THREE.Mesh(g('w_p_grip', () => new THREE.BoxGeometry(0.036, 0.11, 0.052)), gripMat);
    grip.position.set(0, -0.035, 0.025);
    grip.rotation.x = -0.22;
    grp.add(grip);
    const barrel = new THREE.Mesh(
      g('w_p_bar', () => {
        const geo = new THREE.CylinderGeometry(0.011, 0.011, 0.06, 6);
        geo.rotateX(Math.PI / 2);
        return geo;
      }),
      chromeMat
    );
    barrel.position.set(0, 0.042, 0.245);
    grp.add(barrel);
    return grp;
  }

  if (weaponId === 'espingarda_12') {
    const rec = new THREE.Mesh(g('w_s_rec', () => new THREE.BoxGeometry(0.058, 0.075, 0.26)), darkSteelMat);
    rec.position.set(0, 0.025, 0.12);
    grp.add(rec);
    const bar = new THREE.Mesh(
      g('w_s_bar', () => {
        const geo = new THREE.CylinderGeometry(0.018, 0.02, 0.42, 8);
        geo.rotateX(Math.PI / 2);
        return geo;
      }),
      metalMat
    );
    bar.position.set(0, 0.048, 0.44);
    grp.add(bar);
    const stock = new THREE.Mesh(g('w_s_stk', () => new THREE.BoxGeometry(0.048, 0.09, 0.22)), woodMat);
    stock.position.set(0, 0.005, -0.1);
    grp.add(stock);
    return grp;
  }

  // ak47_tatica
  const rec = new THREE.Mesh(g('w_ak_rec', () => new THREE.BoxGeometry(0.056, 0.08, 0.34)), darkSteelMat);
  rec.position.set(0, 0.03, 0.14);
  grp.add(rec);
  const hg = new THREE.Mesh(g('w_ak_hg', () => new THREE.BoxGeometry(0.052, 0.064, 0.22)), gripMat);
  hg.position.set(0, 0.028, 0.37);
  grp.add(hg);
  const bar = new THREE.Mesh(
    g('w_ak_bar', () => {
      const geo = new THREE.CylinderGeometry(0.013, 0.015, 0.26, 8);
      geo.rotateX(Math.PI / 2);
      return geo;
    }),
    metalMat
  );
  bar.position.set(0, 0.042, 0.6);
  grp.add(bar);
  const mag = new THREE.Mesh(g('w_ak_mag', () => new THREE.BoxGeometry(0.036, 0.18, 0.06)), metalMat);
  mag.position.set(0, -0.085, 0.2);
  mag.rotation.x = 0.32;
  grp.add(mag);
  const stk = new THREE.Mesh(g('w_ak_stk', () => new THREE.BoxGeometry(0.046, 0.086, 0.22)), woodMat);
  stk.position.set(0, 0.01, -0.13);
  grp.add(stk);
  return grp;
}

export function buildDetailedHumanRig(opts: HumanRigOptions): HumanRigHandles {
  const root = new THREE.Group();
  const isFemale = opts.gender === 'feminino';
  const cast = Boolean(opts.castShadow);

  const skinMat = new THREE.MeshStandardMaterial({ color: opts.skinColor ?? '#9e563f', roughness: 0.64, metalness: 0.03 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: opts.shirtColor ?? '#dc2626', roughness: 0.68, metalness: 0.05 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: opts.pantsColor ?? '#09090b', roughness: 0.76, metalness: 0.04 });
  const shoesMat = new THREE.MeshStandardMaterial({ color: opts.shoesColor ?? '#f8fafc', roughness: 0.45, metalness: 0.08 });
  const hairMat = new THREE.MeshStandardMaterial({ color: opts.hairColor ?? '#18181b', roughness: 0.85 });

  const blackClothMat = sm('hr_blk', () => new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.74 }));
  const beltMat = sm('hr_belt', () => new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.52 }));
  const buckleMat = sm('hr_buckle', () => new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.82, roughness: 0.24 }));
  const soleMat = sm('hr_sole', () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 }));
  const eyeWhiteMat = sm('hr_ew', () => new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
  const pupilMat = sm('hr_ep', () => new THREE.MeshBasicMaterial({ color: 0x09090b }));

  // Tronco Anatómico (cintura + pélvis + peitoral + ombros + pescoço)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.94;

  const pelvisMesh = new THREE.Mesh(
    g(isFemale ? 'pelvis_f' : 'pelvis_m', () =>
      new THREE.CylinderGeometry(isFemale ? 0.22 : 0.23, isFemale ? 0.24 : 0.21, 0.17, 10)
    ),
    pantsMat
  );
  pelvisMesh.position.y = 0.08;
  torsoGroup.add(pelvisMesh);

  const beltMesh = new THREE.Mesh(
    g('belt', () => new THREE.CylinderGeometry(0.235, 0.235, 0.05, 10)),
    beltMat
  );
  beltMesh.position.y = 0.15;
  torsoGroup.add(beltMesh);

  const buckleMesh = new THREE.Mesh(g('buckle', () => new THREE.BoxGeometry(0.068, 0.048, 0.036)), buckleMat);
  buckleMesh.position.set(0, 0.15, 0.228);
  torsoGroup.add(buckleMesh);

  const chestMesh = new THREE.Mesh(
    g(isFemale ? 'chest_f' : 'chest_m', () => {
      const geo = new THREE.CylinderGeometry(isFemale ? 0.245 : 0.285, isFemale ? 0.205 : 0.225, 0.46, 10);
      geo.scale(1.06, 1.0, 0.82);
      return geo;
    }),
    shirtMat
  );
  chestMesh.position.y = 0.41;
  chestMesh.castShadow = cast;
  torsoGroup.add(chestMesh);

  const collarMesh = new THREE.Mesh(
    g('collar', () => {
      const geo = new THREE.CylinderGeometry(0.135, 0.195, 0.075, 10);
      geo.scale(1.05, 1.0, 0.85);
      return geo;
    }),
    blackClothMat
  );
  collarMesh.position.y = 0.645;
  torsoGroup.add(collarMesh);

  const style = opts.outfitStyle;
  const isUniformVest =
    style === 'ende_uniform' ||
    style === 'elisal_uniform' ||
    style === 'yango_uniform' ||
    style === 'pescador_uniform' ||
    style === 'pna_uniform' ||
    style === 'inema_uniform' ||
    style === 'agricultor_uniform' ||
    style === 'restaurante_uniform' ||
    style === 'boutique_uniform';

  if (opts.hasVest || style === 'tactical_vest' || style === 'military' || isUniformVest) {
    const defaultVestColor =
      style === 'military'
        ? 0x29321e
        : style === 'ende_uniform'
        ? 0xf59e0b
        : style === 'elisal_uniform'
        ? 0x16a34a
        : style === 'yango_uniform'
        ? 0xdc2626
        : style === 'pescador_uniform'
        ? 0x0284c7
        : style === 'pna_uniform'
        ? 0x1e3a8a
        : style === 'inema_uniform'
        ? 0xe11d48
        : style === 'agricultor_uniform'
        ? 0x65a30d
        : style === 'restaurante_uniform'
        ? 0xf8fafc
        : style === 'boutique_uniform'
        ? 0xbe185d
        : 0x0f172a;
    const vColor = opts.vestColor ?? defaultVestColor;
    const vestMat = sm(
      `vest_${vColor}`,
      () => new THREE.MeshStandardMaterial({ color: vColor, roughness: 0.72 })
    );
    const vest = new THREE.Mesh(
      g('vest_geo', () => {
        const geo = new THREE.CylinderGeometry(0.3, 0.245, 0.4, 10);
        geo.scale(1.06, 1, 0.85);
        return geo;
      }),
      vestMat
    );
    vest.position.y = 0.41;
    torsoGroup.add(vest);

    if (style === 'ende_uniform' || style === 'elisal_uniform' || style === 'inema_uniform' || style === 'pna_uniform' || style === 'agricultor_uniform') {
      const stripeCol = style === 'inema_uniform' ? 0xfef08a : style === 'agricultor_uniform' ? 0xfacc15 : 0xe2e8f0;
      const refMat = sm(`ref_${stripeCol}`, () => new THREE.MeshStandardMaterial({ color: stripeCol, emissive: stripeCol, emissiveIntensity: 0.22, roughness: 0.35 }));
      const stripe = new THREE.Mesh(
        g('vest_ref_stripe', () => {
          const geo = new THREE.CylinderGeometry(0.285, 0.275, 0.055, 10);
          geo.scale(1.07, 1, 0.86);
          return geo;
        }),
        refMat
      );
      stripe.position.y = 0.35;
      torsoGroup.add(stripe);
    }
  } else if (style === 'advogado_suit') {
    const tieMat = sm('adv_tie', () => new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 }));
    const lapelMat = sm('adv_lapel', () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }));
    const shirtV = new THREE.Mesh(g('adv_v', () => new THREE.BoxGeometry(0.11, 0.22, 0.02)), lapelMat);
    shirtV.position.set(0, 0.52, 0.235);
    torsoGroup.add(shirtV);
    const tie = new THREE.Mesh(g('adv_tie_g', () => new THREE.BoxGeometry(0.036, 0.24, 0.024)), tieMat);
    tie.position.set(0, 0.48, 0.245);
    torsoGroup.add(tie);
  }

  if (opts.hasChain) {
    const chain = new THREE.Mesh(g('chain', () => new THREE.TorusGeometry(0.115, 0.016, 6, 12)), buckleMat);
    chain.rotation.x = Math.PI / 2.2;
    chain.position.set(0, 0.62, 0.08);
    torsoGroup.add(chain);
  }

  if (opts.hasBag) {
    const bag = new THREE.Mesh(g('bag', () => new THREE.BoxGeometry(0.16, 0.2, 0.09)), blackClothMat);
    bag.position.set(0.22, 0.16, 0.15);
    torsoGroup.add(bag);
  }

  const neckMesh = new THREE.Mesh(g('neck', () => new THREE.CylinderGeometry(0.086, 0.1, 0.15, 8)), skinMat);
  neckMesh.position.y = 0.7;
  torsoGroup.add(neckMesh);

  // Cabeça esculpida realista (crânio + maxilar + orelhas + nariz + olhos + sobrancelhas + boca)
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.92;

  const headMesh = new THREE.Mesh(
    g('head_sphere', () => {
      const geo = new THREE.SphereGeometry(0.175, 12, 12);
      geo.scale(0.92, 1.07, 0.98);
      return geo;
    }),
    skinMat
  );
  headMesh.castShadow = cast;
  headGroup.add(headMesh);

  const jawMesh = new THREE.Mesh(
    g('jaw', () => new THREE.CylinderGeometry(0.125, 0.085, 0.12, 8)),
    skinMat
  );
  jawMesh.position.set(0, -0.098, 0.028);
  headGroup.add(jawMesh);

  const noseMesh = new THREE.Mesh(
    g('nose', () => {
      const geo = new THREE.ConeGeometry(0.028, 0.06, 4);
      geo.rotateX(Math.PI * 0.42);
      return geo;
    }),
    skinMat
  );
  noseMesh.position.set(0, 0.0, 0.168);
  headGroup.add(noseMesh);

  const earGeo = g('ear', () => {
    const geo = new THREE.CylinderGeometry(0.028, 0.036, 0.058, 6);
    geo.rotateZ(Math.PI / 2);
    return geo;
  });
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.165, 0.008, 0);
  headGroup.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.165, 0.008, 0);
  headGroup.add(earR);

  for (const side of [-1, 1]) {
    const ex = side * 0.058;
    const ew = new THREE.Mesh(g('ew', () => new THREE.PlaneGeometry(0.044, 0.022)), eyeWhiteMat);
    ew.position.set(ex, 0.044, 0.162);
    headGroup.add(ew);
    const ep = new THREE.Mesh(g('ep', () => new THREE.PlaneGeometry(0.018, 0.018)), pupilMat);
    ep.position.set(ex, 0.044, 0.164);
    headGroup.add(ep);
    const brow = new THREE.Mesh(g('brow', () => new THREE.BoxGeometry(0.054, 0.015, 0.015)), blackClothMat);
    brow.position.set(ex, 0.072, 0.164);
    brow.rotation.z = side * -0.08;
    headGroup.add(brow);
  }

  const mouth = new THREE.Mesh(g('mouth', () => new THREE.BoxGeometry(0.074, 0.018, 0.014)), blackClothMat);
  mouth.position.set(0, -0.072, 0.156);
  headGroup.add(mouth);

  if (opts.hasMask) {
    const maskMat = sm(`mask_${opts.maskColor ?? '#09090b'}`, () => new THREE.MeshStandardMaterial({ color: opts.maskColor ?? '#09090b', roughness: 0.85 }));
    const mask = new THREE.Mesh(g('mask', () => new THREE.CylinderGeometry(0.172, 0.138, 0.155, 10)), maskMat);
    mask.position.set(0, -0.082, 0.018);
    headGroup.add(mask);
  }

  if (opts.hasSunglasses) {
    const glassMat = sm('shades_m', () => new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 }));
    const shades = new THREE.Mesh(g('shades', () => new THREE.BoxGeometry(0.22, 0.044, 0.05)), glassMat);
    shades.position.set(0, 0.044, 0.156);
    headGroup.add(shades);
  }

  // Cabelo / Boné
  const hStyle = opts.hairStyle || 'curto';
  if (opts.hasCap || hStyle === 'bone') {
    const cCol = opts.capColor ?? 0x111827;
    const capMat = sm(`cap_${cCol}`, () => new THREE.MeshStandardMaterial({ color: cCol, roughness: 0.65 }));
    const crown = new THREE.Mesh(
      g('cap_cr', () => new THREE.SphereGeometry(0.188, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      capMat
    );
    crown.position.set(0, 0.052, -0.01);
    headGroup.add(crown);
    const visor = new THREE.Mesh(g('cap_vis', () => new THREE.BoxGeometry(0.2, 0.022, 0.145)), capMat);
    visor.position.set(0, 0.078, 0.185);
    visor.rotation.x = 0.08;
    headGroup.add(visor);
  } else if (hStyle === 'afro') {
    const afro = new THREE.Mesh(
      g('hair_afro', () => {
        const geo = new THREE.SphereGeometry(0.215, 10, 8);
        geo.scale(1.0, 0.85, 1.04);
        return geo;
      }),
      hairMat
    );
    afro.position.set(0, 0.095, -0.018);
    headGroup.add(afro);
  } else if (hStyle === 'trancas') {
    const crown = new THREE.Mesh(
      g('hair_tr_cr', () => {
        const geo = new THREE.SphereGeometry(0.182, 10, 8);
        geo.scale(0.98, 0.68, 1.02);
        return geo;
      }),
      hairMat
    );
    crown.position.set(0, 0.125, -0.01);
    headGroup.add(crown);
    const dreadGeo = g('dread_g', () => {
      const geo = new THREE.CylinderGeometry(0.024, 0.02, 0.28, 6);
      geo.translate(0, -0.14, 0);
      return geo;
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = new THREE.Mesh(dreadGeo, hairMat);
      d.position.set(Math.sin(a) * 0.165, 0.165, Math.cos(a) * 0.165);
      d.rotation.z = -Math.sin(a) * 0.28;
      d.rotation.x = Math.cos(a) * 0.24;
      headGroup.add(d);
    }
  } else {
    const shortHair = new THREE.Mesh(g('hair_curto', () => new THREE.SphereGeometry(0.18, 10, 8)), hairMat);
    shortHair.position.set(0, 0.075, -0.012);
    headGroup.add(shortHair);
  }

  torsoGroup.add(headGroup);

  // Braços articulados (ombro -> manga -> antebraço -> mão)
  const armOffsetX = isFemale ? 0.295 : 0.335;
  const shoulderGeo = g('shld', () => new THREE.SphereGeometry(0.086, 8, 8));
  const upperArmGeo = g('uarm', () => {
    const geo = new THREE.CylinderGeometry(0.074, 0.062, 0.23, 8);
    geo.translate(0, -0.115, 0);
    return geo;
  });
  const forearmGeo = g('farm', () => {
    const geo = new THREE.CylinderGeometry(0.06, 0.048, 0.23, 8);
    geo.translate(0, -0.115, 0);
    return geo;
  });
  const handGeo = g('hand', () => new THREE.BoxGeometry(0.072, 0.095, 0.04));

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-armOffsetX, 0.59, 0);
  leftArmGroup.add(new THREE.Mesh(shoulderGeo, shirtMat));
  leftArmGroup.add(new THREE.Mesh(upperArmGeo, shirtMat));
  const leftForearmGroup = new THREE.Group();
  leftForearmGroup.position.set(0, -0.23, 0);
  leftForearmGroup.add(new THREE.Mesh(forearmGeo, skinMat));
  const handL = new THREE.Mesh(handGeo, skinMat);
  handL.position.set(0, -0.24, 0);
  leftForearmGroup.add(handL);
  leftArmGroup.add(leftForearmGroup);
  torsoGroup.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(armOffsetX, 0.59, 0);
  rightArmGroup.add(new THREE.Mesh(shoulderGeo, shirtMat));
  rightArmGroup.add(new THREE.Mesh(upperArmGeo, shirtMat));
  const rightForearmGroup = new THREE.Group();
  rightForearmGroup.position.set(0, -0.23, 0);
  rightForearmGroup.add(new THREE.Mesh(forearmGeo, skinMat));
  const handR = new THREE.Mesh(handGeo, skinMat);
  handR.position.set(0, -0.24, 0);
  rightForearmGroup.add(handR);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.25, 0.04);
  if (opts.equippedWeapon && opts.equippedWeapon !== 'none') {
    weaponMount.add(buildDetailedWeaponMesh(opts.equippedWeapon));
  }
  rightForearmGroup.add(weaponMount);
  rightArmGroup.add(rightForearmGroup);
  torsoGroup.add(rightArmGroup);

  // Pernas articuladas (coxa -> joelho/canela -> ténis bicolor)
  const thighGeo = g('thigh', () => {
    const geo = new THREE.CylinderGeometry(0.108, 0.086, 0.43, 8);
    geo.translate(0, -0.215, 0);
    return geo;
  });
  const calfGeo = g('calf', () => {
    const geo = new THREE.CylinderGeometry(0.086, 0.068, 0.41, 8);
    geo.translate(0, -0.205, 0);
    return geo;
  });
  const soleGeo = g('sn_sole', () => new THREE.BoxGeometry(0.17, 0.045, 0.3));
  const upperShoeGeo = g('sn_up', () => new THREE.BoxGeometry(0.16, 0.11, 0.28));

  const buildLeg = (side: -1 | 1) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.125, 0.9, 0);
    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.castShadow = cast;
    legGroup.add(thigh);
    const lowerLeg = new THREE.Group();
    lowerLeg.position.set(0, -0.43, 0);
    const calf = new THREE.Mesh(calfGeo, pantsMat);
    calf.castShadow = cast;
    lowerLeg.add(calf);
    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(0, -0.4475, 0.055);
    lowerLeg.add(sole);
    const upper = new THREE.Mesh(upperShoeGeo, shoesMat);
    upper.position.set(0, -0.37, 0.05);
    lowerLeg.add(upper);
    legGroup.add(lowerLeg);
    return { legGroup, lowerLeg };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  root.add(leftLeg.legGroup);
  root.add(rightLeg.legGroup);
  root.add(torsoGroup);

  if (opts.heightScale && opts.heightScale !== 1.0) {
    root.scale.setScalar(opts.heightScale);
  }

  return {
    root,
    torsoGroup,
    headGroup,
    leftArmGroup,
    rightArmGroup,
    leftForearmGroup,
    rightForearmGroup,
    leftLegGroup: leftLeg.legGroup,
    rightLegGroup: rightLeg.legGroup,
    leftLowerLegGroup: leftLeg.lowerLeg,
    rightLowerLegGroup: rightLeg.lowerLeg,
    weaponMount,
  };
}

export interface HumanRigAnimTargets {
  poseRoot: THREE.Object3D;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftForearmGroup: THREE.Group;
  rightForearmGroup: THREE.Group;
  leftLegGroup: THREE.Group;
  rightLegGroup: THREE.Group;
  leftLowerLegGroup: THREE.Group;
  rightLowerLegGroup: THREE.Group;
}

export interface HumanRigAnimOptions {
  animState: string;
  delta: number;
  animTimer: number;
  baseTorsoY?: number;
  speedRatio?: number;
  isHandcuffed?: boolean;
  hasWeapon?: boolean;
  isAiming?: boolean;
  weaponRecoilTimer?: number;
  weaponReloadTimer?: number;
  punchTimer?: number;
}

/**
 * Controlador anatómico unificado para Player local e Jogadores Remotos.
 * Garante todas as posturas, emotes RP e compensação vertical (y=+0.28) ao deitar/cair inconsciente.
 */
export function animateHumanRig(
  rig: HumanRigAnimTargets,
  opts: HumanRigAnimOptions
): { nextAnimTimer: number; targetLieOffsetY: number } {
  const {
    animState,
    delta,
    baseTorsoY = 0.94,
    isHandcuffed = false,
    hasWeapon = false,
    isAiming = false,
    weaponRecoilTimer = 0,
    weaponReloadTimer = 0,
    punchTimer = 0,
  } = opts;

  let t = opts.animTimer;
  const isUnconscious = animState === 'unconscious';
  const isLying = animState === 'sleep' || animState === 'emote_lie';
  const isWaking = animState === 'waking_up';
  const targetPitchX = isUnconscious || isLying ? -Math.PI / 2 : 0;
  const targetLieOffsetY = isUnconscious || isLying ? 0.28 : 0;

  rig.poseRoot.rotation.x = THREE.MathUtils.damp(
    rig.poseRoot.rotation.x,
    isWaking ? 0 : targetPitchX,
    12,
    delta
  );

  if (isUnconscious) {
    rig.torsoGroup.position.y = baseTorsoY;
    rig.torsoGroup.rotation.set(0, 0, 0);
    rig.headGroup.rotation.set(0, 0, 0.14);
    rig.leftArmGroup.rotation.set(-0.18, 0, -0.22);
    rig.rightArmGroup.rotation.set(-0.18, 0, 0.22);
    rig.leftForearmGroup.rotation.set(-0.18, 0, 0);
    rig.rightForearmGroup.rotation.set(-0.18, 0, 0);
    rig.leftLegGroup.rotation.set(0, 0, -0.06);
    rig.rightLegGroup.rotation.set(0, 0, 0.06);
    rig.leftLowerLegGroup.rotation.set(0.08, 0, 0);
    rig.rightLowerLegGroup.rotation.set(0.08, 0, 0);
    return { nextAnimTimer: t, targetLieOffsetY };
  }

  if (animState === 'punch' || (punchTimer > 0 && !isHandcuffed)) {
    t += delta * 11;
    const pPhase = punchTimer > 0
      ? Math.sin(((0.45 - punchTimer) / 0.45) * Math.PI)
      : Math.abs(Math.sin(t));
    rig.rightArmGroup.rotation.set(-1.55 * pPhase, 0, 0);
    rig.rightForearmGroup.rotation.set(-0.45, 0, 0);
    rig.leftArmGroup.rotation.set(-0.5 * pPhase, 0, 0);
    rig.leftForearmGroup.rotation.set(-0.85, 0, 0);
    rig.torsoGroup.rotation.set(0.08, -0.35 * pPhase, 0);
    return { nextAnimTimer: t, targetLieOffsetY: 0 };
  }

  if (animState === 'swim') {
    t += delta * 6.5;
    const stroke = Math.sin(t);
    rig.torsoGroup.position.y = baseTorsoY;
    rig.torsoGroup.rotation.set(0.95, 0, 0);
    rig.headGroup.rotation.set(-0.45, 0, 0);
    rig.leftArmGroup.rotation.set(-1.6 + stroke * 0.8, 0, 0);
    rig.rightArmGroup.rotation.set(-1.6 - stroke * 0.8, 0, 0);
    rig.leftForearmGroup.rotation.set(-0.35, 0, 0);
    rig.rightForearmGroup.rotation.set(-0.35, 0, 0);
    rig.leftLegGroup.rotation.set(0.5 + stroke * 0.4, 0, 0);
    rig.rightLegGroup.rotation.set(0.5 - stroke * 0.4, 0, 0);
    rig.leftLowerLegGroup.rotation.set(0.25, 0, 0);
    rig.rightLowerLegGroup.rotation.set(0.25, 0, 0);
    return { nextAnimTimer: t, targetLieOffsetY: 0 };
  }

  if (animState === 'jump') {
    rig.torsoGroup.position.y = baseTorsoY;
    rig.torsoGroup.rotation.set(0.06, 0, 0);
    rig.headGroup.rotation.set(0, 0, 0);
    rig.leftLegGroup.rotation.set(-0.42, 0, 0);
    rig.rightLegGroup.rotation.set(-0.62, 0, 0);
    rig.leftLowerLegGroup.rotation.set(0.5, 0, 0);
    rig.rightLowerLegGroup.rotation.set(0.65, 0, 0);
    rig.leftArmGroup.rotation.set(isHandcuffed ? 0.45 : -0.6, 0, 0);
    rig.rightArmGroup.rotation.set(isHandcuffed ? 0.45 : -0.5, 0, 0);
    rig.leftForearmGroup.rotation.set(isHandcuffed ? -0.9 : -0.7, 0, 0);
    rig.rightForearmGroup.rotation.set(isHandcuffed ? -0.9 : -0.7, 0, 0);
    return { nextAnimTimer: t, targetLieOffsetY: 0 };
  }

  if (animState.startsWith('emote_') || isLying) {
    t += delta * 4.5;
    rig.torsoGroup.rotation.set(0, 0, 0);
    rig.torsoGroup.position.y = baseTorsoY;
    rig.headGroup.rotation.set(0, 0, 0);
    rig.leftArmGroup.rotation.set(-0.04, 0, 0);
    rig.rightArmGroup.rotation.set(-0.04, 0, 0);
    rig.leftForearmGroup.rotation.set(-0.14, 0, 0);
    rig.rightForearmGroup.rotation.set(-0.14, 0, 0);
    rig.leftLegGroup.rotation.set(0, 0, 0);
    rig.rightLegGroup.rotation.set(0, 0, 0);
    rig.leftLowerLegGroup.rotation.set(0, 0, 0);
    rig.rightLowerLegGroup.rotation.set(0, 0, 0);

    switch (animState) {
      case 'emote_wave':
        rig.rightArmGroup.rotation.x = -2.6;
        rig.rightForearmGroup.rotation.z = Math.sin(t * 2) * 0.4;
        break;
      case 'emote_greet':
        rig.torsoGroup.rotation.x = 0.14;
        rig.rightArmGroup.rotation.x = -1.15;
        rig.rightForearmGroup.rotation.x = -0.35 + Math.sin(t * 1.5) * 0.12;
        break;
      case 'emote_clap':
        rig.leftArmGroup.rotation.set(-1.1, 0, -0.35);
        rig.rightArmGroup.rotation.set(-1.1, 0, 0.35);
        rig.leftForearmGroup.rotation.set(-0.8, 0, 0.25 + Math.abs(Math.sin(t * 2.5)) * 0.35);
        rig.rightForearmGroup.rotation.set(-0.8, 0, -0.25 - Math.abs(Math.sin(t * 2.5)) * 0.35);
        break;
      case 'emote_dance':
        rig.torsoGroup.position.y = baseTorsoY + Math.abs(Math.sin(t * 2)) * 0.08;
        rig.torsoGroup.rotation.y = Math.sin(t) * 0.32;
        rig.leftArmGroup.rotation.x = -1.2 + Math.sin(t * 2) * 0.6;
        rig.rightArmGroup.rotation.x = -1.2 - Math.sin(t * 2) * 0.6;
        rig.leftForearmGroup.rotation.x = -0.5;
        rig.rightForearmGroup.rotation.x = -0.5;
        rig.leftLegGroup.rotation.x = -Math.sin(t * 2) * 0.3;
        rig.rightLegGroup.rotation.x = Math.sin(t * 2) * 0.3;
        break;
      case 'emote_laugh':
        rig.torsoGroup.rotation.x = -0.1 + Math.sin(t * 3) * 0.08;
        rig.headGroup.rotation.x = -0.22 + Math.sin(t * 3) * 0.12;
        rig.leftArmGroup.rotation.x = -0.75;
        rig.rightArmGroup.rotation.x = -0.75;
        rig.leftForearmGroup.rotation.x = -0.9;
        rig.rightForearmGroup.rotation.x = -0.9;
        break;
      case 'emote_cry':
        rig.torsoGroup.rotation.x = 0.22;
        rig.headGroup.rotation.x = 0.35;
        rig.leftArmGroup.rotation.x = -1.65;
        rig.rightArmGroup.rotation.x = -1.65;
        rig.leftForearmGroup.rotation.x = -1.35;
        rig.rightForearmGroup.rotation.x = -1.35;
        break;
      case 'emote_point':
        rig.rightArmGroup.rotation.x = -1.55;
        rig.rightForearmGroup.rotation.x = -0.05;
        break;
      case 'emote_phone':
        rig.rightArmGroup.rotation.x = -1.35;
        rig.rightForearmGroup.rotation.x = -1.45;
        rig.headGroup.rotation.z = -0.14;
        break;
      case 'emote_smoke':
        rig.rightArmGroup.rotation.x = -1.15;
        rig.rightForearmGroup.rotation.x = -1.15 + Math.sin(t * 0.8) * 0.25;
        rig.leftArmGroup.rotation.x = -0.25;
        break;
      case 'emote_surrender':
        rig.leftArmGroup.rotation.x = -2.85;
        rig.rightArmGroup.rotation.x = -2.85;
        break;
      case 'emote_docs':
        rig.rightArmGroup.rotation.x = -1.1;
        rig.rightForearmGroup.rotation.x = -0.35;
        break;
      case 'emote_carry_box':
      case 'emote_trash':
        rig.leftArmGroup.rotation.set(-0.95, 0, -0.15);
        rig.rightArmGroup.rotation.set(-0.95, 0, 0.15);
        rig.leftForearmGroup.rotation.x = -0.85;
        rig.rightForearmGroup.rotation.x = -0.85;
        break;
      case 'emote_work':
      case 'emote_repair_elec':
        rig.torsoGroup.rotation.x = 0.2;
        rig.leftArmGroup.rotation.x = -1.05;
        rig.rightArmGroup.rotation.x = -1.05 + Math.sin(t * 2.2) * 0.28;
        rig.leftForearmGroup.rotation.x = -0.55;
        rig.rightForearmGroup.rotation.x = -0.55;
        break;
      case 'emote_fish':
        rig.rightArmGroup.rotation.x = -0.95 + Math.sin(t * 0.7) * 0.18;
        rig.rightForearmGroup.rotation.x = -0.65;
        rig.leftArmGroup.rotation.x = -0.65;
        rig.leftForearmGroup.rotation.x = -0.5;
        break;
      case 'emote_repair_car':
        rig.torsoGroup.position.y = baseTorsoY - 0.2;
        rig.torsoGroup.rotation.x = 0.45;
        rig.leftLegGroup.rotation.x = -0.55;
        rig.rightLegGroup.rotation.x = -0.55;
        rig.leftLowerLegGroup.rotation.x = 0.95;
        rig.rightLowerLegGroup.rotation.x = 0.95;
        rig.rightArmGroup.rotation.x = -1.2 + Math.sin(t * 2.6) * 0.25;
        rig.leftArmGroup.rotation.x = -1.0;
        break;
      case 'emote_handcuff':
      case 'emote_frisk':
        rig.torsoGroup.rotation.x = 0.18;
        rig.leftArmGroup.rotation.x = -1.25;
        rig.rightArmGroup.rotation.x = -1.25;
        rig.leftForearmGroup.rotation.x = -0.45 + Math.sin(t * 2) * 0.15;
        rig.rightForearmGroup.rotation.x = -0.45 - Math.sin(t * 2) * 0.15;
        break;
      case 'emote_carry_injured':
        rig.torsoGroup.position.y = baseTorsoY - 0.18;
        rig.torsoGroup.rotation.x = 0.42;
        rig.leftLegGroup.rotation.x = -0.5;
        rig.rightLegGroup.rotation.x = -0.5;
        rig.leftLowerLegGroup.rotation.x = 0.85;
        rig.rightLowerLegGroup.rotation.x = 0.85;
        rig.leftArmGroup.rotation.x = -1.25;
        rig.rightArmGroup.rotation.x = -1.25;
        rig.leftForearmGroup.rotation.x = -0.4 + Math.sin(t * 2.5) * 0.14;
        rig.rightForearmGroup.rotation.x = -0.4 + Math.sin(t * 2.5) * 0.14;
        break;
      case 'emote_sit':
        rig.torsoGroup.position.y = baseTorsoY - 0.4;
        rig.leftLegGroup.rotation.x = -1.35;
        rig.rightLegGroup.rotation.x = -1.35;
        rig.leftLowerLegGroup.rotation.x = 1.35;
        rig.rightLowerLegGroup.rotation.x = 1.35;
        break;
      case 'emote_lie':
      case 'sleep':
        rig.torsoGroup.position.y = baseTorsoY;
        rig.leftArmGroup.rotation.x = -0.15;
        rig.rightArmGroup.rotation.x = -0.15;
        break;
    }
    return { nextAnimTimer: t, targetLieOffsetY };
  }

  rig.rightForearmGroup.rotation.z = 0;
  rig.leftForearmGroup.rotation.z = 0;
  rig.headGroup.rotation.set(0, 0, 0);

  if (animState === 'drive' || animState === 'passenger') {
    rig.torsoGroup.position.y = baseTorsoY - 0.34;
    rig.torsoGroup.rotation.set(0.06, 0, 0);
    rig.leftLegGroup.rotation.set(-1.35, 0, 0);
    rig.rightLegGroup.rotation.set(-1.35, 0, 0);
    rig.leftLowerLegGroup.rotation.set(1.3, 0, 0);
    rig.rightLowerLegGroup.rotation.set(1.3, 0, 0);
    rig.leftArmGroup.rotation.set(animState === 'drive' ? -0.95 : -0.25, 0, 0);
    rig.rightArmGroup.rotation.set(animState === 'drive' ? -0.95 : -0.25, 0, 0);
    rig.leftForearmGroup.rotation.set(animState === 'drive' ? -0.45 : -0.35, 0, 0);
    rig.rightForearmGroup.rotation.set(animState === 'drive' ? -0.45 : -0.35, 0, 0);
    return { nextAnimTimer: t, targetLieOffsetY: 0 };
  }

  const isMovingState = animState === 'walk' || animState === 'run' || (animState === 'crouch' && (opts.speedRatio ?? 0) > 0.15);
  if (isMovingState) {
    const isRunning = animState === 'run';
    const isCrouching = animState === 'crouch';
    const animFreq = isRunning ? 13.5 : isCrouching ? 6.0 : 8.2;
    t += delta * animFreq;

    const stride = Math.sin(t);
    const recover = Math.cos(t);
    const amp = isRunning ? 0.85 : isCrouching ? 0.36 : 0.56;
    const crouchOffset = isCrouching ? 0.48 : 0;

    rig.leftLegGroup.rotation.x = -stride * amp - crouchOffset;
    rig.rightLegGroup.rotation.x = stride * amp - crouchOffset;

    const leftKneeBend = Math.max(0.04, recover * (isRunning ? 1.15 : 0.7) + Math.max(0, -stride) * 0.22);
    const rightKneeBend = Math.max(0.04, -recover * (isRunning ? 1.15 : 0.7) + Math.max(0, stride) * 0.22);
    rig.leftLowerLegGroup.rotation.x = leftKneeBend + (isCrouching ? 0.78 : 0);
    rig.rightLowerLegGroup.rotation.x = rightKneeBend + (isCrouching ? 0.78 : 0);

    if (isHandcuffed) {
      rig.leftArmGroup.rotation.x = 0.45;
      rig.rightArmGroup.rotation.x = 0.45;
      rig.leftForearmGroup.rotation.x = -0.95;
      rig.rightForearmGroup.rotation.x = -0.95;
    } else {
      const leftArmRot = isCrouching ? -0.18 + stride * 0.16 : stride * (amp * 0.78);
      const rightArmRot = isCrouching ? -0.18 - stride * 0.16 : -stride * (amp * 0.78);
      rig.leftArmGroup.rotation.x = leftArmRot;
      rig.rightArmGroup.rotation.x = rightArmRot;
      rig.leftForearmGroup.rotation.x = isRunning
        ? -1.15
        : isCrouching
        ? -0.55
        : -0.32 - Math.max(0, -leftArmRot) * 0.35;
      rig.rightForearmGroup.rotation.x = isRunning
        ? -1.15
        : isCrouching
        ? -0.55
        : -0.32 - Math.max(0, -rightArmRot) * 0.35;
    }

    rig.torsoGroup.rotation.x = isRunning ? 0.16 : isCrouching ? 0.32 : 0.05;
    rig.torsoGroup.rotation.y = stride * 0.06;

    const moveBaseY = isCrouching ? baseTorsoY - 0.24 : baseTorsoY;
    rig.torsoGroup.position.y = moveBaseY + Math.abs(recover) * (isRunning ? 0.07 : 0.025);
  } else {
    const isCrouching = animState === 'crouch';
    t += delta * 2.2;
    const breath = Math.sin(t) * 0.015;
    rig.torsoGroup.position.y = (isCrouching ? baseTorsoY - 0.24 : baseTorsoY) + breath;
    rig.torsoGroup.rotation.x = isCrouching ? 0.25 : 0;
    rig.torsoGroup.rotation.y = 0;

    const restLeg = isCrouching ? -0.55 : 0;
    const restKnee = isCrouching ? 0.95 : 0;
    rig.leftLegGroup.rotation.x = THREE.MathUtils.damp(rig.leftLegGroup.rotation.x, restLeg, 10, delta);
    rig.rightLegGroup.rotation.x = THREE.MathUtils.damp(rig.rightLegGroup.rotation.x, restLeg, 10, delta);
    rig.leftLowerLegGroup.rotation.x = THREE.MathUtils.damp(rig.leftLowerLegGroup.rotation.x, restKnee, 10, delta);
    rig.rightLowerLegGroup.rotation.x = THREE.MathUtils.damp(rig.rightLowerLegGroup.rotation.x, restKnee, 10, delta);
    if (isHandcuffed) {
      rig.leftArmGroup.rotation.x = THREE.MathUtils.damp(rig.leftArmGroup.rotation.x, 0.45, 10, delta);
      rig.rightArmGroup.rotation.x = THREE.MathUtils.damp(rig.rightArmGroup.rotation.x, 0.45, 10, delta);
      rig.leftForearmGroup.rotation.x = THREE.MathUtils.damp(rig.leftForearmGroup.rotation.x, -0.95, 10, delta);
      rig.rightForearmGroup.rotation.x = THREE.MathUtils.damp(rig.rightForearmGroup.rotation.x, -0.95, 10, delta);
    } else {
      rig.leftArmGroup.rotation.x = THREE.MathUtils.damp(rig.leftArmGroup.rotation.x, -0.04, 10, delta);
      rig.rightArmGroup.rotation.x = THREE.MathUtils.damp(rig.rightArmGroup.rotation.x, -0.04, 10, delta);
      rig.leftForearmGroup.rotation.x = THREE.MathUtils.damp(rig.leftForearmGroup.rotation.x, -0.14, 10, delta);
      rig.rightForearmGroup.rotation.x = THREE.MathUtils.damp(rig.rightForearmGroup.rotation.x, -0.14, 10, delta);
    }
  }

  if (!isHandcuffed && hasWeapon) {
    if (weaponReloadTimer > 0 || animState === 'reload') {
      const rPhase = weaponReloadTimer > 0
        ? Math.sin((weaponReloadTimer / 0.85) * Math.PI)
        : Math.abs(Math.sin(t * 2));
      rig.rightArmGroup.rotation.x = -0.85;
      rig.rightForearmGroup.rotation.x = -0.65 - rPhase * 0.45;
      rig.leftArmGroup.rotation.x = -0.95;
      rig.leftForearmGroup.rotation.x = -0.9 - rPhase * 0.35;
    } else if (isAiming || weaponRecoilTimer > 0 || animState === 'aim') {
      const recoilKick = weaponRecoilTimer > 0 ? Math.sin((weaponRecoilTimer / 0.14) * Math.PI) * 0.24 : 0;
      rig.rightArmGroup.rotation.x = -1.48 - recoilKick;
      rig.rightForearmGroup.rotation.x = -0.1;
    }
  }

  return { nextAnimTimer: t, targetLieOffsetY: 0 };
}
