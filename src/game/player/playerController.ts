/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { soundFx } from '../audio/soundFx';
import {
  clampToValidWorldBounds,
  getAssignedCellData,
  getSurfaceHeightAt,
  isInInteriorPocket,
} from '../city/terrainPhysics';
import { getWaveHeightAt } from '../city/worldEnvironment';
import { animateHumanRig } from './humanRig';
import { AnimationState, PlayerCustomization, PlayerStats, WeaponId } from '../types';

export interface PlayerControlsInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  analogX?: number; // -1 (left) .. +1 (right)
  analogY?: number; // +1 (forward) .. -1 (backward)
  sprint: boolean;
  jump: boolean;
  crouch: boolean;
  interact: boolean;
}

// Zero-allocation horizontal pushout collision physics active

export class PlayerCharacter {
  public mesh: THREE.Group;
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY = 0;
  public isGrounded = true;
  public isCrouching = false;
  public isSwimming = false;
  public isAiming = false;
  public animState: AnimationState = 'idle';

  private torsoGroup!: THREE.Group;
  private headGroup!: THREE.Group;
  private hairContainer!: THREE.Group;
  private headAccessoryGroup!: THREE.Group;
  private torsoAccessoryGroup!: THREE.Group;
  private equippedWeaponGroup!: THREE.Group;
  private armorVestMesh!: THREE.Mesh;
  private leftArmGroup!: THREE.Group;
  private rightArmGroup!: THREE.Group;
  private leftForearmGroup!: THREE.Group;
  private rightForearmGroup!: THREE.Group;
  private leftLegGroup!: THREE.Group;
  private rightLegGroup!: THREE.Group;
  private leftLowerLegGroup!: THREE.Group;
  private rightLowerLegGroup!: THREE.Group;

  private skinMat!: THREE.MeshStandardMaterial;
  private shirtMat!: THREE.MeshStandardMaterial;
  private pantsMat!: THREE.MeshStandardMaterial;
  private shoesMat!: THREE.MeshStandardMaterial;
  private shoesSoleMat!: THREE.MeshStandardMaterial;
  private hairMat!: THREE.MeshStandardMaterial;
  private beltMat!: THREE.MeshStandardMaterial;
  private buckleMat!: THREE.MeshStandardMaterial;

  private animTimer = 0;
  private footstepTimer = 0;
  private jumpVelocity = 0;
  private gravity = -25;
  private targetAngle = 0;
  public currentSpeed = 0;
  private punchTimer = 0;
  private weaponRecoilTimer = 0;
  private weaponReloadTimer = 0;
  private sleepAnimTimer = 0;
  private muzzleFlashMesh: THREE.Mesh | null = null;
  private barrelTipObj: THREE.Object3D | null = null;
  private activeEmote: AnimationState | null = null;
  private lieLiftY = 0;
  private peakFallY = 0;
  private onFallImpact?: (damage: number) => void;
  private currentCustomization: PlayerCustomization;

  public getEquippedWeapon(): WeaponId {
    return (this.currentCustomization?.equippedWeapon as WeaponId) || 'none';
  }

  constructor(customization: PlayerCustomization, onFallImpact?: (damage: number) => void) {
    this.currentCustomization = customization;
    this.onFallImpact = onFallImpact;
    this.mesh = new THREE.Group();
    this.mesh.name = 'HumanizedPlayerCharacter';
    this.buildBody(customization);
  }

  private buildBody(cust: PlayerCustomization) {
    this.skinMat = new THREE.MeshStandardMaterial({
      color: cust.skinTone || '#9e563f',
      roughness: 0.62,
      metalness: 0.04,
    });
    this.shirtMat = new THREE.MeshStandardMaterial({
      color: cust.shirtColor || '#dc2626',
      roughness: 0.68,
      metalness: 0.06,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({
      color: cust.pantsColor || '#09090b',
      roughness: 0.75,
      metalness: 0.05,
    });
    this.shoesMat = new THREE.MeshStandardMaterial({
      color: cust.shoesColor || '#ffffff',
      roughness: 0.42,
      metalness: 0.1,
    });
    this.shoesSoleMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
    });
    this.hairMat = new THREE.MeshStandardMaterial({
      color: cust.hairColor || '#d4d4d8',
      roughness: 0.82,
      metalness: 0.05,
    });
    this.beltMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5 });
    this.buckleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.22 });

    const blackClothMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.72, metalness: 0.05 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.7, roughness: 0.25 });
    const darkHairInkMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.85 });

    const isFemale = cust.gender === 'feminino';

    // Cintura / Tronco Atlético (ombros largos, cintura definida)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.96;

    const pelvisGeo = new THREE.CylinderGeometry(isFemale ? 0.235 : 0.245, isFemale ? 0.25 : 0.225, 0.18, 14);
    const pelvisMesh = new THREE.Mesh(pelvisGeo, this.pantsMat);
    pelvisMesh.position.y = 0.09;
    this.torsoGroup.add(pelvisMesh);

    const beltGeo = new THREE.CylinderGeometry(0.248, 0.248, 0.055, 16);
    const beltMesh = new THREE.Mesh(beltGeo, this.beltMat);
    beltMesh.position.y = 0.16;
    this.torsoGroup.add(beltMesh);

    const buckleGeo = new THREE.BoxGeometry(0.075, 0.052, 0.04);
    const buckleMesh = new THREE.Mesh(buckleGeo, this.buckleMat);
    buckleMesh.position.set(0, 0.16, 0.242);
    this.torsoGroup.add(buckleMesh);

    // Peitoral / Camisola Desportiva
    const chestGeo = new THREE.CylinderGeometry(isFemale ? 0.26 : 0.305, isFemale ? 0.22 : 0.242, 0.48, 14);
    chestGeo.scale(1.06, 1.0, 0.82);
    const chestMesh = new THREE.Mesh(chestGeo, this.shirtMat);
    chestMesh.position.y = 0.43;
    chestMesh.castShadow = true;
    this.torsoGroup.add(chestMesh);

    // Faixa preta horizontal no peito (estilo camisola rubro-negra da referência)
    const chestStripeGeo = new THREE.CylinderGeometry(isFemale ? 0.248 : 0.286, isFemale ? 0.234 : 0.266, 0.13, 14);
    chestStripeGeo.scale(1.075, 1.0, 0.835);
    const chestStripeMesh = new THREE.Mesh(chestStripeGeo, blackClothMat);
    chestStripeMesh.position.y = 0.43;
    this.torsoGroup.add(chestStripeMesh);

    // Faixa preta inferior da camisola
    const hemStripeGeo = new THREE.CylinderGeometry(isFemale ? 0.228 : 0.252, isFemale ? 0.224 : 0.244, 0.075, 14);
    hemStripeGeo.scale(1.075, 1.0, 0.835);
    const hemStripeMesh = new THREE.Mesh(hemStripeGeo, blackClothMat);
    hemStripeMesh.position.y = 0.235;
    this.torsoGroup.add(hemStripeMesh);

    // Gola preta atlética em V
    const collarGeo = new THREE.CylinderGeometry(0.145, 0.21, 0.08, 14);
    collarGeo.scale(1.05, 1.0, 0.85);
    const collarMesh = new THREE.Mesh(collarGeo, blackClothMat);
    collarMesh.position.y = 0.67;
    this.torsoGroup.add(collarMesh);

    // Escudo dourado no peito esquerdo + logo losango no peito direito
    const crestShield = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.078, 0.015), blackClothMat);
    crestShield.position.set(0.125, 0.45, 0.236);
    this.torsoGroup.add(crestShield);
    const crestGold = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.058, 0.018), goldMat);
    crestGold.position.set(0.125, 0.45, 0.238);
    this.torsoGroup.add(crestGold);
    const starAccent = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.014, 0.018), goldMat);
    starAccent.position.set(0.125, 0.505, 0.236);
    this.torsoGroup.add(starAccent);

    const rightDiamond = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.015), goldMat);
    rightDiamond.rotation.z = Math.PI / 6;
    rightDiamond.position.set(-0.12, 0.44, 0.236);
    this.torsoGroup.add(rightDiamond);

    // Colete Tático (visível quando armor > 0)
    const vestGeo = new THREE.CylinderGeometry(0.32, 0.265, 0.36, 14);
    vestGeo.scale(1.06, 1.0, 0.84);
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.2 });
    this.armorVestMesh = new THREE.Mesh(vestGeo, vestMat);
    this.armorVestMesh.position.y = 0.44;
    this.armorVestMesh.visible = false;
    this.torsoGroup.add(this.armorVestMesh);

    // Pescoço forte com linhas estilizadas na frente
    const neckGeo = new THREE.CylinderGeometry(0.092, 0.108, 0.16, 12);
    const neckMesh = new THREE.Mesh(neckGeo, this.skinMat);
    neckMesh.position.y = 0.73;
    this.torsoGroup.add(neckMesh);

    for (let i = -2; i <= 2; i++) {
      const neckMark = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.095, 0.01), darkHairInkMat);
      neckMark.position.set(i * 0.022, 0.72, 0.095);
      this.torsoGroup.add(neckMark);
    }

    // Cabeça & Rosto fiel à imagem de referência
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.96;

    const headGeo = new THREE.SphereGeometry(0.185, 16, 16);
    headGeo.scale(0.92, 1.08, 0.98);
    const headMesh = new THREE.Mesh(headGeo, this.skinMat);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const jawGeo = new THREE.CylinderGeometry(0.135, 0.092, 0.13, 10);
    const jawMesh = new THREE.Mesh(jawGeo, this.skinMat);
    jawMesh.position.set(0, -0.105, 0.03);
    this.headGroup.add(jawMesh);

    // Barba no queixo + bigode fino
    const chinBeardGeo = new THREE.BoxGeometry(0.145, 0.036, 0.09);
    const chinBeard = new THREE.Mesh(chinBeardGeo, darkHairInkMat);
    chinBeard.position.set(0, -0.155, 0.078);
    this.headGroup.add(chinBeard);

    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.014, 0.022), darkHairInkMat);
    mustache.position.set(0, -0.048, 0.168);
    this.headGroup.add(mustache);

    // Sorriso confiante
    const mouthOutline = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.036, 0.016), darkHairInkMat);
    mouthOutline.position.set(0, -0.078, 0.164);
    this.headGroup.add(mouthOutline);
    const teethMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const smileTeeth = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.024, 0.018), teethMat);
    smileTeeth.position.set(0, -0.076, 0.167);
    this.headGroup.add(smileTeeth);

    // Nariz estilizado
    const noseGeo = new THREE.ConeGeometry(0.032, 0.068, 4);
    noseGeo.rotateX(Math.PI * 0.42);
    const noseMesh = new THREE.Mesh(noseGeo, this.skinMat);
    noseMesh.position.set(0, 0.002, 0.18);
    this.headGroup.add(noseMesh);

    // Olhos expressivos com íris cinza-prata e sobrancelhas grossas
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const irisMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

    [-1, 1].forEach((side) => {
      const ex = side * 0.064;
      const eyeWhite = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.024), eyeWhiteMat);
      eyeWhite.position.set(ex, 0.048, 0.172);
      this.headGroup.add(eyeWhite);

      const iris = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.022), irisMat);
      iris.position.set(ex, 0.048, 0.174);
      this.headGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.PlaneGeometry(0.009, 0.011), pupilMat);
      pupil.position.set(ex, 0.048, 0.176);
      this.headGroup.add(pupil);

      // Sobrancelha espessa preta
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.018, 0.018), darkHairInkMat);
      brow.position.set(ex, 0.078, 0.174);
      brow.rotation.z = side * -0.08;
      this.headGroup.add(brow);

      // Riscos pretos debaixo dos olhos (eye-black da referência)
      const eyePaint = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.016, 0.016), darkHairInkMat);
      eyePaint.position.set(ex, 0.014, 0.174);
      this.headGroup.add(eyePaint);
    });

    const earGeo = new THREE.CylinderGeometry(0.032, 0.04, 0.065, 8);
    earGeo.rotateZ(Math.PI / 2);
    const earL = new THREE.Mesh(earGeo, this.skinMat);
    earL.position.set(-0.178, 0.01, 0);
    this.headGroup.add(earL);
    const earR = new THREE.Mesh(earGeo, this.skinMat);
    earR.position.set(0.178, 0.01, 0);
    this.headGroup.add(earR);

    this.hairContainer = new THREE.Group();
    this.buildHair(cust.hairStyle || 'trancas');
    this.headGroup.add(this.hairContainer);

    this.headAccessoryGroup = new THREE.Group();
    this.headGroup.add(this.headAccessoryGroup);

    this.torsoGroup.add(this.headGroup);

    this.torsoAccessoryGroup = new THREE.Group();
    this.torsoGroup.add(this.torsoAccessoryGroup);

    // Braços atléticos com mangas da camisola e punho preto
    const armOffsetX = isFemale ? 0.31 : 0.36;
    const shoulderGeo = new THREE.SphereGeometry(0.095, 12, 12);
    const upperArmGeo = new THREE.CylinderGeometry(0.08, 0.068, 0.25, 10);
    upperArmGeo.translate(0, -0.125, 0);
    const sleeveCuffGeo = new THREE.CylinderGeometry(0.072, 0.07, 0.035, 10);
    sleeveCuffGeo.translate(0, -0.24, 0);
    const forearmGeo = new THREE.CylinderGeometry(0.066, 0.054, 0.25, 10);
    forearmGeo.translate(0, -0.125, 0);

    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-armOffsetX, 0.62, 0);
    this.leftArmGroup.add(new THREE.Mesh(shoulderGeo, this.shirtMat));
    const upperArmL = new THREE.Mesh(upperArmGeo, this.shirtMat);
    upperArmL.castShadow = true;
    this.leftArmGroup.add(upperArmL);
    this.leftArmGroup.add(new THREE.Mesh(sleeveCuffGeo, blackClothMat));
    this.leftForearmGroup = new THREE.Group();
    this.leftForearmGroup.position.set(0, -0.25, 0);
    const forearmL = new THREE.Mesh(forearmGeo, this.skinMat);
    this.leftForearmGroup.add(forearmL);
    const handL = this.buildHand(true);
    handL.position.set(0, -0.26, 0);
    this.leftForearmGroup.add(handL);
    this.leftArmGroup.add(this.leftForearmGroup);
    this.torsoGroup.add(this.leftArmGroup);

    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(armOffsetX, 0.62, 0);
    this.rightArmGroup.add(new THREE.Mesh(shoulderGeo, this.shirtMat));
    const upperArmR = new THREE.Mesh(upperArmGeo, this.shirtMat);
    upperArmR.castShadow = true;
    this.rightArmGroup.add(upperArmR);
    this.rightArmGroup.add(new THREE.Mesh(sleeveCuffGeo, blackClothMat));
    this.rightForearmGroup = new THREE.Group();
    this.rightForearmGroup.position.set(0, -0.25, 0);
    const forearmR = new THREE.Mesh(forearmGeo, this.skinMat);
    this.rightForearmGroup.add(forearmR);
    const handR = this.buildHand(false);
    handR.position.set(0, -0.26, 0);
    this.rightForearmGroup.add(handR);

    this.equippedWeaponGroup = new THREE.Group();
    this.equippedWeaponGroup.position.set(0, -0.27, 0.04);
    this.rightForearmGroup.add(this.equippedWeaponGroup);

    this.rightArmGroup.add(this.rightForearmGroup);
    this.torsoGroup.add(this.rightArmGroup);

    // Pernas proporcionais atléticas
    const thighGeo = new THREE.CylinderGeometry(0.115, 0.092, 0.44, 12);
    thighGeo.translate(0, -0.22, 0);
    const calfGeo = new THREE.CylinderGeometry(0.092, 0.075, 0.42, 12);
    calfGeo.translate(0, -0.21, 0);

    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.135, 0.92, 0);
    const thighL = new THREE.Mesh(thighGeo, this.pantsMat);
    thighL.castShadow = true;
    this.leftLegGroup.add(thighL);
    this.leftLowerLegGroup = new THREE.Group();
    this.leftLowerLegGroup.position.set(0, -0.44, 0);
    const calfL = new THREE.Mesh(calfGeo, this.pantsMat);
    calfL.castShadow = true;
    this.leftLowerLegGroup.add(calfL);
    const sneakerL = this.buildSneaker();
    sneakerL.position.set(0, -0.48, 0.06);
    this.leftLowerLegGroup.add(sneakerL);
    this.leftLegGroup.add(this.leftLowerLegGroup);
    this.mesh.add(this.leftLegGroup);

    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.135, 0.92, 0);
    const thighR = new THREE.Mesh(thighGeo, this.pantsMat);
    thighR.castShadow = true;
    this.rightLegGroup.add(thighR);
    this.rightLowerLegGroup = new THREE.Group();
    this.rightLowerLegGroup.position.set(0, -0.44, 0);
    const calfR = new THREE.Mesh(calfGeo, this.pantsMat);
    calfR.castShadow = true;
    this.rightLowerLegGroup.add(calfR);
    const sneakerR = this.buildSneaker();
    sneakerR.position.set(0, -0.48, 0.06);
    this.rightLowerLegGroup.add(sneakerR);
    this.rightLegGroup.add(this.rightLowerLegGroup);
    this.mesh.add(this.rightLegGroup);

    this.mesh.add(this.torsoGroup);
    this.mesh.scale.setScalar(cust.heightScale || 1.0);
    this.rebuildAccessories(cust);
    this.buildWeaponMesh(cust.equippedWeapon || 'none');
  }

  private buildHand(isLeft: boolean): THREE.Group {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), this.skinMat);
    hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.035), this.skinMat);
    fingers.position.set(0, -0.05, 0.01);
    hand.add(fingers);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), this.skinMat);
    thumb.position.set(isLeft ? 0.045 : -0.045, -0.02, 0.02);
    hand.add(thumb);
    return hand;
  }

  private buildSneaker(): THREE.Group {
    const sneaker = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.32), this.shoesSoleMat);
    sole.position.y = 0.025;
    sneaker.add(sole);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.3), this.shoesMat);
    upper.position.y = 0.09;
    sneaker.add(upper);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.08), this.shoesSoleMat);
    toe.position.set(0, 0.07, 0.12);
    sneaker.add(toe);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.12), this.shoesSoleMat);
    lace.position.set(0, 0.155, 0.01);
    sneaker.add(lace);
    return sneaker;
  }

  private buildHair(style: 'curto' | 'afro' | 'trancas' | 'bone') {
    while (this.hairContainer.children.length > 0) {
      this.hairContainer.remove(this.hairContainer.children[0]);
    }
    if (style === 'afro') {
      const afroGeo = new THREE.SphereGeometry(0.23, 14, 12);
      afroGeo.scale(1.0, 0.85, 1.05);
      const afroMesh = new THREE.Mesh(afroGeo, this.hairMat);
      afroMesh.position.set(0, 0.1, -0.02);
      this.hairContainer.add(afroMesh);
    } else if (style === 'trancas') {
      // Coroa densa + dreadlocks espessos e encorpados como na imagem de referência
      const crownMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), this.hairMat);
      crownMesh.scale.set(0.98, 0.68, 1.02);
      crownMesh.position.set(0, 0.135, -0.01);
      this.hairContainer.add(crownMesh);

      const dreadGeoLong = new THREE.CylinderGeometry(0.027, 0.022, 0.31, 8);
      dreadGeoLong.translate(0, -0.155, 0);
      const dreadGeoFront = new THREE.CylinderGeometry(0.026, 0.022, 0.21, 8);
      dreadGeoFront.translate(0, -0.105, 0);

      // Dreads laterais e traseiros longos emoldurando o rosto e pescoço
      const outerCount = 14;
      for (let i = 0; i < outerCount; i++) {
        const angle = (i / outerCount) * Math.PI * 2;
        const isFrontArea = Math.cos(angle) > 0.45;
        const dread = new THREE.Mesh(isFrontArea ? dreadGeoFront : dreadGeoLong, this.hairMat);
        const rx = Math.sin(angle) * 0.175;
        const rz = Math.cos(angle) * 0.175;
        dread.position.set(rx, 0.18, rz);
        dread.rotation.z = -Math.sin(angle) * (isFrontArea ? 0.38 : 0.26);
        dread.rotation.x = Math.cos(angle) * (isFrontArea ? 0.35 : 0.22);
        this.hairContainer.add(dread);
      }

      // Camada superior de dreads sobre a testa e topo (volume característico)
      for (let i = 0; i < 7; i++) {
        const angle = -Math.PI * 0.55 + (i / 6) * Math.PI * 1.1;
        const topDread = new THREE.Mesh(dreadGeoFront, this.hairMat);
        topDread.position.set(Math.sin(angle) * 0.09, 0.225, Math.cos(angle) * 0.09);
        topDread.rotation.z = -Math.sin(angle) * 0.58;
        topDread.rotation.x = Math.cos(angle) * 0.58;
        this.hairContainer.add(topDread);
      }
    } else if (style === 'bone') {
      const capMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), capMat);
      cap.position.set(0, 0.09, -0.01);
      this.hairContainer.add(cap);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14), capMat);
      visor.position.set(0, 0.06, 0.22);
      visor.rotation.x = 0.1;
      this.hairContainer.add(visor);
    } else {
      const shortMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), this.hairMat);
      shortMesh.position.set(0, 0.08, -0.01);
      this.hairContainer.add(shortMesh);
    }
  }

  private rebuildAccessories(cust: PlayerCustomization) {
    if (!this.headAccessoryGroup || !this.torsoAccessoryGroup) return;
    while (this.headAccessoryGroup.children.length > 0) {
      this.headAccessoryGroup.remove(this.headAccessoryGroup.children[0]);
    }
    while (this.torsoAccessoryGroup.children.length > 0) {
      this.torsoAccessoryGroup.remove(this.torsoAccessoryGroup.children[0]);
    }

    // 1. Máscara / Bandana facial
    if (cust.hasMask) {
      const maskMat = new THREE.MeshStandardMaterial({ color: cust.maskColor || '#09090b', roughness: 0.85 });
      const maskMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.145, 0.165, 14), maskMat);
      maskMesh.position.set(0, -0.085, 0.02);
      this.headAccessoryGroup.add(maskMesh);
    }

    // 2. Óculos escuros
    if (cust.hasSunglasses) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.048, 0.055), glassMat);
      bridge.position.set(0, 0.048, 0.165);
      this.headAccessoryGroup.add(bridge);
    }

    // 3. Boné / Boina tática com sigla da facção (FTX, BMR, CV, TCP, VAGOS, BMB, FAA)
    if (cust.hasCap) {
      const capColor = cust.capColor || '#09090b';
      const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.65 });
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.198, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
        capMat
      );
      crown.position.set(0, 0.055, -0.01);
      this.headAccessoryGroup.add(crown);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.16), capMat);
      visor.position.set(0, 0.085, 0.2);
      visor.rotation.x = 0.08;
      this.headAccessoryGroup.add(visor);

      if (cust.capText) {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 64;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = capColor;
        ctx.fillRect(0, 0, 128, 64);
        ctx.fillStyle = capColor.toLowerCase() === '#f8fafc' ? '#09090b' : '#ffffff';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cust.capText.slice(0, 6), 64, 34);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const patch = new THREE.Mesh(
          new THREE.PlaneGeometry(0.14, 0.07),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        patch.position.set(0, 0.135, 0.185);
        this.headAccessoryGroup.add(patch);
      }
    }

    // 4. Colete Tático / Uniformes Oficiais / Peitoral com texto da Facção ou FAA
    const st = cust.outfitStyle;
    const isUniformVest =
      st === 'yango_uniform' ||
      st === 'ende_uniform' ||
      st === 'pescador_uniform' ||
      st === 'elisal_uniform' ||
      st === 'pna_uniform' ||
      st === 'inema_uniform' ||
      st === 'agricultor_uniform' ||
      st === 'restaurante_uniform' ||
      st === 'boutique_uniform';
    if (st === 'tactical_vest' || st === 'military' || isUniformVest || cust.vestText) {
      const isVest = st === 'tactical_vest' || st === 'military' || isUniformVest;
      if (isVest) {
        const vCol =
          st === 'military'
            ? 0x29321e
            : st === 'ende_uniform'
            ? 0xf59e0b
            : st === 'elisal_uniform'
            ? 0x16a34a
            : st === 'yango_uniform'
            ? 0xdc2626
            : st === 'pescador_uniform'
            ? 0x0284c7
            : st === 'pna_uniform'
            ? 0x1e3a8a
            : st === 'inema_uniform'
            ? 0xe11d48
            : st === 'agricultor_uniform'
            ? 0x65a30d
            : st === 'restaurante_uniform'
            ? 0xf8fafc
            : st === 'boutique_uniform'
            ? 0xbe185d
            : 0x0f172a;
        const vestMat = new THREE.MeshStandardMaterial({ color: vCol, roughness: 0.72 });
        const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.42, 14), vestMat);
        vest.scale.set(1.07, 1, 0.86);
        vest.position.y = 0.43;
        this.torsoAccessoryGroup.add(vest);

        if (st === 'ende_uniform' || st === 'elisal_uniform' || st === 'inema_uniform' || st === 'pna_uniform' || st === 'agricultor_uniform') {
          const refMat = new THREE.MeshStandardMaterial({
            color: st === 'inema_uniform' ? 0xfef08a : st === 'agricultor_uniform' ? 0xfacc15 : 0xe2e8f0,
            emissive: st === 'inema_uniform' ? 0xfef08a : st === 'agricultor_uniform' ? 0xfacc15 : 0xe2e8f0,
            emissiveIntensity: 0.22,
          });
          const refBand = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.295, 0.06, 14), refMat);
          refBand.scale.set(1.08, 1, 0.87);
          refBand.position.y = 0.36;
          this.torsoAccessoryGroup.add(refBand);
        }

        if (st === 'agricultor_uniform') {
          // Chapéu de palha largo do agricultor da Fazenda
          const strawMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.85 });
          const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.025, 16), strawMat);
          brim.position.set(0, 0.14, 0);
          this.headAccessoryGroup.add(brim);
          const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.13, 14), strawMat);
          dome.position.set(0, 0.21, 0);
          this.headAccessoryGroup.add(dome);
        } else if (st === 'restaurante_uniform') {
          // Chapéu de Chefe
          const chefMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.08, 14), chefMat);
          band.position.set(0, 0.17, 0);
          this.headAccessoryGroup.add(band);
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), chefMat);
          puff.position.set(0, 0.27, 0);
          this.headAccessoryGroup.add(puff);
        }
      }
      const badgeLabel =
        cust.vestText ||
        (st === 'yango_uniform'
          ? 'YANGO'
          : st === 'ende_uniform'
          ? 'ENDE'
          : st === 'pescador_uniform'
          ? 'PESCA'
          : st === 'elisal_uniform'
          ? 'ELISAL'
          : st === 'pna_uniform'
          ? 'PNA'
          : st === 'inema_uniform'
          ? 'INEMA'
          : st === 'agricultor_uniform'
          ? 'AGRO'
          : st === 'restaurante_uniform'
          ? 'CHEF'
          : st === 'boutique_uniform'
          ? 'MODA'
          : '');
      if (badgeLabel) {
        const vc = document.createElement('canvas');
        vc.width = 192;
        vc.height = 64;
        const vctx = vc.getContext('2d')!;
        vctx.fillStyle = st === 'restaurante_uniform' ? '#e11d48' : isVest ? '#0f172a' : cust.shirtColor;
        vctx.fillRect(0, 0, 192, 64);
        vctx.fillStyle = cust.shirtColor === '#f8fafc' && !isVest ? '#dc2626' : '#f8fafc';
        vctx.font = 'bold 32px sans-serif';
        vctx.textAlign = 'center';
        vctx.textBaseline = 'middle';
        vctx.fillText(badgeLabel.slice(0, 6), 96, 32);
        const vtex = new THREE.CanvasTexture(vc);
        vtex.colorSpace = THREE.SRGBColorSpace;
        const chestSign = new THREE.Mesh(
          new THREE.PlaneGeometry(0.32, 0.11),
          new THREE.MeshBasicMaterial({ map: vtex })
        );
        chestSign.position.set(0, 0.48, 0.258);
        this.torsoAccessoryGroup.add(chestSign);
      }
    } else if (st === 'advogado_suit') {
      const shirtV = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.24, 0.025),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
      );
      shirtV.position.set(0, 0.52, 0.245);
      this.torsoAccessoryGroup.add(shirtV);
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.26, 0.028),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 })
      );
      tie.position.set(0, 0.48, 0.255);
      this.torsoAccessoryGroup.add(tie);
    }

    // 5. Puffer / Hoodie / Corrente de Ouro / Mala Transversal / Tatuagens
    if (cust.outfitStyle === 'puffer') {
      const puffer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.28, 0.46, 14),
        new THREE.MeshStandardMaterial({ color: cust.shirtColor || '#111827', roughness: 0.45 })
      );
      puffer.scale.set(1.08, 1, 0.9);
      puffer.position.y = 0.43;
      this.torsoAccessoryGroup.add(puffer);
    }

    if (cust.outfitStyle === 'hoodie') {
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 10, 8),
        new THREE.MeshStandardMaterial({ color: cust.shirtColor || '#18181b', roughness: 0.75 })
      );
      hood.position.set(0, 0.7, -0.15);
      this.torsoAccessoryGroup.add(hood);
    }

    if (cust.hasChain) {
      const chain = new THREE.Mesh(
        new THREE.TorusGeometry(0.125, 0.018, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.88, roughness: 0.18 })
      );
      chain.rotation.x = Math.PI / 2.2;
      chain.position.set(0, 0.65, 0.09);
      this.torsoAccessoryGroup.add(chain);
    }

    if (cust.hasBag) {
      const bagMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.65 });
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.32), bagMat);
      strap.position.set(0.06, 0.42, 0);
      strap.rotation.z = 0.48;
      this.torsoAccessoryGroup.add(strap);

      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.09), bagMat);
      pouch.position.set(0.24, 0.16, 0.16);
      this.torsoAccessoryGroup.add(pouch);
    }

    if (cust.hasTattoos) {
      const tatMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
      const sleeveTat = new THREE.CylinderGeometry(0.068, 0.056, 0.18, 8);
      const tL = new THREE.Mesh(sleeveTat, tatMat);
      tL.position.set(-0.34, 0.26, 0);
      this.torsoAccessoryGroup.add(tL);
      const tR = new THREE.Mesh(sleeveTat, tatMat);
      tR.position.set(0.34, 0.26, 0);
      this.torsoAccessoryGroup.add(tR);
    }
  }

  public buildWeaponMesh(weaponId: WeaponId) {
    if (!this.equippedWeaponGroup) return;
    while (this.equippedWeaponGroup.children.length > 0) {
      this.equippedWeaponGroup.remove(this.equippedWeaponGroup.children[0]);
    }
    this.muzzleFlashMesh = null;
    this.barrelTipObj = null;
    if (!weaponId || weaponId === 'none') return;

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.82, roughness: 0.25 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.88, roughness: 0.22 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.18 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.82 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });

    let muzzleZ = 0.28;
    let muzzleY = 0.04;

    if (weaponId === 'bastao_tatico') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), gripMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, -0.01, 0.06);
      this.equippedWeaponGroup.add(handle);
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.025, 10), chromeMat);
      guard.rotation.x = Math.PI / 2;
      guard.position.set(0, -0.01, 0.14);
      this.equippedWeaponGroup.add(guard);
      const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.019, 0.44, 10), darkSteelMat);
      baton.rotation.x = Math.PI / 2;
      baton.position.set(0, -0.01, 0.36);
      this.equippedWeaponGroup.add(baton);
      return;
    } else if (weaponId === 'pistola_9mm') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.22), darkSteelMat);
      frame.position.set(0, 0.012, 0.11);
      this.equippedWeaponGroup.add(frame);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.045, 0.25), metalMat);
      slide.position.set(0, 0.045, 0.125);
      this.equippedWeaponGroup.add(slide);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 8), chromeMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.045, 0.25);
      this.equippedWeaponGroup.add(barrel);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.115, 0.055), gripMat);
      grip.position.set(0, -0.035, 0.025);
      grip.rotation.x = -0.22;
      this.equippedWeaponGroup.add(grip);
      const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.055), darkSteelMat);
      triggerGuard.position.set(0, -0.01, 0.085);
      this.equippedWeaponGroup.add(triggerGuard);
      const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.016), chromeMat);
      frontSight.position.set(0, 0.072, 0.22);
      this.equippedWeaponGroup.add(frontSight);
      muzzleZ = 0.29;
      muzzleY = 0.045;
    } else if (weaponId === 'espingarda_12') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.28), darkSteelMat);
      receiver.position.set(0, 0.025, 0.12);
      this.equippedWeaponGroup.add(receiver);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.44, 10), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.05, 0.46);
      this.equippedWeaponGroup.add(barrel);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.38, 10), chromeMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.012, 0.43);
      this.equippedWeaponGroup.add(tube);
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.2, 10), gripMat);
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, 0.008, 0.39);
      this.equippedWeaponGroup.add(pump);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.095, 0.24), woodMat);
      stock.position.set(0, 0.005, -0.11);
      stock.rotation.x = 0.1;
      this.equippedWeaponGroup.add(stock);
      muzzleZ = 0.69;
      muzzleY = 0.05;
    } else if (weaponId === 'ak47_tatica') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.085, 0.36), darkSteelMat);
      receiver.position.set(0, 0.032, 0.14);
      this.equippedWeaponGroup.add(receiver);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.022, 0.26), chromeMat);
      rail.position.set(0, 0.082, 0.15);
      this.equippedWeaponGroup.add(rail);
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.068, 0.24), gripMat);
      handguard.position.set(0, 0.03, 0.39);
      this.equippedWeaponGroup.add(handguard);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.26, 10), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.045, 0.62);
      this.equippedWeaponGroup.add(barrel);
      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.06, 10), chromeMat);
      muzzleBrake.rotation.x = Math.PI / 2;
      muzzleBrake.position.set(0, 0.045, 0.75);
      this.equippedWeaponGroup.add(muzzleBrake);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.092, 0.24), woodMat);
      stock.position.set(0, 0.012, -0.14);
      this.equippedWeaponGroup.add(stock);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.19, 0.062), metalMat);
      mag.position.set(0, -0.09, 0.21);
      mag.rotation.x = 0.34;
      this.equippedWeaponGroup.add(mag);
      const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.1, 0.05), gripMat);
      pGrip.position.set(0, -0.045, 0.03);
      pGrip.rotation.x = -0.28;
      this.equippedWeaponGroup.add(pGrip);
      muzzleZ = 0.79;
      muzzleY = 0.045;
    }

    const tip = new THREE.Object3D();
    tip.position.set(0, muzzleY, muzzleZ);
    this.equippedWeaponGroup.add(tip);
    this.barrelTipObj = tip;

    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.22, 6),
      new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.92 })
    );
    flash.rotation.x = Math.PI / 2;
    flash.position.set(0, muzzleY, muzzleZ + 0.08);
    flash.visible = false;
    this.equippedWeaponGroup.add(flash);
    this.muzzleFlashMesh = flash;
  }

  public getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.barrelTipObj) {
      this.barrelTipObj.getWorldPosition(out);
      return out;
    }
    if (this.equippedWeaponGroup) {
      this.equippedWeaponGroup.getWorldPosition(out);
      out.y += 0.06;
      return out;
    }
    return out.set(this.position.x, this.position.y + 1.45, this.position.z);
  }

  public triggerWeaponRecoil() {
    this.weaponRecoilTimer = 0.14;
    if (this.muzzleFlashMesh) {
      this.muzzleFlashMesh.visible = true;
      this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    }
  }

  public triggerReload() {
    this.weaponReloadTimer = 0.85;
  }

  public triggerSleepWakeAnimation() {
    this.sleepAnimTimer = 2.6;
  }

  public updateCustomization(cust: PlayerCustomization) {
    this.currentCustomization = cust;
    if (this.skinMat) this.skinMat.color.set(cust.skinTone);
    if (this.shirtMat) this.shirtMat.color.set(cust.shirtColor);
    if (this.pantsMat) this.pantsMat.color.set(cust.pantsColor);
    if (this.shoesMat) this.shoesMat.color.set(cust.shoesColor);
    if (this.hairMat) this.hairMat.color.set(cust.hairColor);
    if (cust.hairStyle) this.buildHair(cust.hairStyle);
    if (this.mesh && cust.heightScale) this.mesh.scale.setScalar(cust.heightScale);
    this.rebuildAccessories(cust);
    this.buildWeaponMesh(cust.equippedWeapon || 'none');
  }

  public triggerPunch() {
    if (this.punchTimer <= 0) {
      this.punchTimer = 0.45;
      this.activeEmote = null;
      soundFx.playPunch();
    }
  }

  public setEmote(emote: AnimationState | null) {
    this.activeEmote = emote;
  }

  public update(
    delta: number,
    input: PlayerControlsInput,
    cameraYaw: number,
    colliders: THREE.Box3[],
    stats: PlayerStats,
    elapsedTime = 0,
    waveAmp = 1.0
  ) {
    // Exibir colete tático caso stats.armor > 0
    if (this.armorVestMesh) {
      this.armorVestMesh.visible = stats.armor > 0;
    }

    // Se congelado pelo admin ou inconsciente, bloqueia movimentação física
    if (stats.isFrozen || stats.isUnconscious) {
      this.currentSpeed = 0;
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.rotationY;
      this.updateAnimations(delta, false, false, stats.isUnconscious, Boolean(stats.handcuffed));
      this.mesh.position.y = this.position.y + this.lieLiftY;
      return;
    }

    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - delta);
    }
    if (this.weaponRecoilTimer > 0) {
      this.weaponRecoilTimer = Math.max(0, this.weaponRecoilTimer - delta);
      if (this.muzzleFlashMesh && this.weaponRecoilTimer < 0.08) {
        this.muzzleFlashMesh.visible = false;
      }
    } else if (this.muzzleFlashMesh && this.muzzleFlashMesh.visible) {
      this.muzzleFlashMesh.visible = false;
    }
    if (this.weaponReloadTimer > 0) {
      this.weaponReloadTimer = Math.max(0, this.weaponReloadTimer - delta);
    }
    if (this.sleepAnimTimer > 0) {
      this.sleepAnimTimer = Math.max(0, this.sleepAnimTimer - delta);
      this.currentSpeed = 0;
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.rotationY;
      this.animState = this.sleepAnimTimer > 0.7 ? 'sleep' : 'waking_up';
      const animRes = animateHumanRig(
        {
          poseRoot: this.mesh,
          torsoGroup: this.torsoGroup,
          headGroup: this.headGroup,
          leftArmGroup: this.leftArmGroup,
          rightArmGroup: this.rightArmGroup,
          leftForearmGroup: this.leftForearmGroup,
          rightForearmGroup: this.rightForearmGroup,
          leftLegGroup: this.leftLegGroup,
          rightLegGroup: this.rightLegGroup,
          leftLowerLegGroup: this.leftLowerLegGroup,
          rightLowerLegGroup: this.rightLowerLegGroup,
        },
        {
          animState: this.animState,
          delta,
          animTimer: this.animTimer,
          baseTorsoY: 0.96,
        }
      );
      this.animTimer = animRes.nextAnimTimer;
      this.lieLiftY = THREE.MathUtils.damp(this.lieLiftY, animRes.targetLieOffsetY, 10, delta);
      this.mesh.position.y = this.position.y + this.lieLiftY;
      return;
    }

    const digitalRight = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const digitalForward = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const hasAnalog =
      (input.analogX !== undefined && Math.abs(input.analogX) > 0.06) ||
      (input.analogY !== undefined && Math.abs(input.analogY) > 0.06);

    const rawRight = hasAnalog ? (input.analogX || 0) : digitalRight;
    const rawForward = hasAnalog ? (input.analogY || 0) : digitalForward;

    const rawLen = Math.hypot(rawRight, rawForward);
    const isMoving = rawLen > 0.06;
    if (isMoving) {
      this.activeEmote = null; // Mover-se cancela emote estático
    }

    // Plataformas costeiras elevadas (Aeroporto, Ponte FAA, Pontão Praia & Lazer)
    const onAirportDeck =
      this.position.x >= -138 && this.position.x <= -48 && this.position.z >= -132 && this.position.z <= -58;
    const onFaaBridge =
      this.position.x >= -132 && this.position.x <= -14 && this.position.z >= 122 && this.position.z <= 138;
    const onPierDeck =
      (this.position.x >= -94 && this.position.x <= -49 && this.position.z >= 12 && this.position.z <= 20) ||
      (this.position.x >= -102 && this.position.x <= -89 && this.position.z >= 9 && this.position.z <= 23);
    const onPierRamp =
      this.position.x > -49 && this.position.x <= -43 && this.position.z >= 12.5 && this.position.z <= 19.5;

    const wasSwimming = this.isSwimming;
    this.isSwimming = this.position.x < -49.5 && !onAirportDeck && !onFaaBridge && !onPierDeck;
    if (this.isSwimming !== wasSwimming) {
      soundFx.playWaterSplash(this.isSwimming);
      if (!this.isSwimming) {
        this.torsoGroup.rotation.x = 0;
      }
    }

    this.isCrouching = !this.isSwimming && input.crouch && this.isGrounded;

    const canRun = stats.energy > 5 && !this.isCrouching && !stats.handcuffed;
    const isRunning = isMoving && input.sprint && canRun;
    const analogFactor = Math.min(1, rawLen);
    const targetMoveSpeed = (stats.handcuffed
      ? 2.3
      : this.isSwimming
      ? 3.8
      : this.isCrouching
      ? 2.4
      : isRunning
      ? 8.8
      : 4.7) * (hasAnalog ? Math.max(0.45, analogFactor) : 1);

    if (isMoving) {
      this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, targetMoveSpeed, 10, delta);
    } else {
      this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, 0, 14, delta);
    }

    if (this.currentSpeed > 0.05 && isMoving) {
      const len = rawLen || 1;
      const r = rawRight / len;
      const f = rawForward / len;

      // Câmara está em Target + radius*(sinYaw, ..., cosYaw), logo:
      // Frente da câmara = (-sinYaw, -cosYaw) | Direita da câmara = (+cosYaw, -sinYaw)
      const cosYaw = Math.cos(cameraYaw);
      const sinYaw = Math.sin(cameraYaw);
      const worldMoveX = r * cosYaw - f * sinYaw;
      const worldMoveZ = -r * sinYaw - f * cosYaw;

      this.targetAngle = Math.atan2(worldMoveX, worldMoveZ);

      const stepX = worldMoveX * this.currentSpeed * delta;
      const stepZ = worldMoveZ * this.currentSpeed * delta;
      const playerRadius = 0.42;
      let tryX = this.position.x + stepX;
      let tryZ = this.position.z + stepZ;

      const pyMin = this.position.y + 0.14;
      const pyMax = this.position.y + 1.78;
      // Resolução suave em 2 passagens (empurra para fora pelo eixo de menor penetração -> deslizamento limpo nas quinas)
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < colliders.length; i++) {
          const b = colliders[i];
          if (pyMax < b.min.y || pyMin > b.max.y) continue;
          const closestX = Math.max(b.min.x, Math.min(tryX, b.max.x));
          const closestZ = Math.max(b.min.z, Math.min(tryZ, b.max.z));
          const dx = tryX - closestX;
          const dz = tryZ - closestZ;
          const distSq = dx * dx + dz * dz;
          if (distSq < playerRadius * playerRadius) {
            if (distSq > 0.00001) {
              const dist = Math.sqrt(distSq);
              const push = playerRadius - dist;
              tryX += (dx / dist) * push;
              tryZ += (dz / dist) * push;
            } else {
              // Centro dentro da AABB: empurra para fora pelo lado mais próximo
              const penLeft = Math.abs(tryX - b.min.x);
              const penRight = Math.abs(b.max.x - tryX);
              const penTop = Math.abs(tryZ - b.min.z);
              const penBot = Math.abs(b.max.z - tryZ);
              const minPen = Math.min(penLeft, penRight, penTop, penBot);
              if (minPen === penLeft) tryX = b.min.x - playerRadius;
              else if (minPen === penRight) tryX = b.max.x + playerRadius;
              else if (minPen === penTop) tryZ = b.min.z - playerRadius;
              else tryZ = b.max.z + playerRadius;
            }
          }
        }
      }

      this.position.x = tryX;
      this.position.z = tryZ;

      // Limites amplos (respeita TODOS os bolsos interiores e todo o mapa incluindo Morros e Condomínio)
      if (!isInInteriorPocket(this.position.x, this.position.z)) {
        const clamped = clampToValidWorldBounds(this.position.x, this.position.z);
        this.position.x = clamped.x;
        this.position.z = clamped.z;
      }
    }

    // Contenção física na Cela atribuída da Prisão Central enquanto cumpre pena
    if (stats.jailUntil > Date.now()) {
      const cell = getAssignedCellData(stats.assignedCell);
      const jailCenterX = cell.spawn[0];
      const jailCenterZ = cell.spawn[2];
      const maxJailRadius = 3.2;
      const jdx = this.position.x - jailCenterX;
      const jdz = this.position.z - jailCenterZ;
      const jDist = Math.hypot(jdx, jdz);
      if (jDist > maxJailRadius) {
        if (jDist > 18) {
          this.position.x = jailCenterX;
          this.position.z = jailCenterZ;
        } else {
          this.position.x = jailCenterX + (jdx / jDist) * maxJailRadius;
          this.position.z = jailCenterZ + (jdz / jDist) * maxJailRadius;
        }
      }
    }

    // Se está a apontar arma, orienta o corpo para onde a câmara aponta
    if (this.isAiming) {
      this.targetAngle = cameraYaw + Math.PI;
    }

    // Altura contínua do terreno (inclui os 5 Morros, rampas suaves, praia, pontão e ponte FAA!)
    const groundY = getSurfaceHeightAt(this.position.x, this.position.z, this.position.y);

    // Salto, Natação com ondulação real e Dano de Queda
    if (this.isSwimming) {
      const waveY = getWaveHeightAt(this.position.x, this.position.z, elapsedTime, waveAmp);
      this.position.y = THREE.MathUtils.damp(this.position.y, waveY - 0.68, 8, delta);
      this.isGrounded = true;
      this.jumpVelocity = 0;
    } else {
      if (input.jump && this.isGrounded && !this.isCrouching) {
        this.jumpVelocity = 8.8;
        this.isGrounded = false;
        this.peakFallY = this.position.y;
        this.animState = 'jump';
        soundFx.playJump();
      }

      if (!this.isGrounded) {
        this.jumpVelocity += this.gravity * delta;
        this.position.y += this.jumpVelocity * delta;
        if (this.position.y > this.peakFallY) {
          this.peakFallY = this.position.y;
        }
        if (this.position.y <= groundY) {
          const dropHeight = this.peakFallY - groundY;
          this.position.y = groundY;
          this.jumpVelocity = 0;
          this.isGrounded = true;
          soundFx.playLand();
          if (dropHeight > 4.5 && this.onFallImpact) {
            const dmg = Math.min(75, Math.round((dropHeight - 4.0) * 10));
            this.onFallImpact(dmg);
          }
          this.peakFallY = 0;
        }
      } else {
        this.position.y = THREE.MathUtils.damp(this.position.y, groundY, 14, delta);
      }
    }

    // Rotação suave
    let diff = this.targetAngle - this.rotationY;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.rotationY += diff * Math.min(1, (this.isAiming ? 24 : 16) * delta);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;

    this.updateAnimations(delta, isMoving, isRunning, false, Boolean(stats.handcuffed));
    this.mesh.position.y = this.position.y + this.lieLiftY;

    if (isMoving && this.isGrounded && !this.isSwimming) {
      this.footstepTimer += delta * (isRunning ? 12.5 : this.isCrouching ? 5.0 : 7.8);
      if (this.footstepTimer >= Math.PI) {
        this.footstepTimer = 0;
        soundFx.playFootstep(isRunning);
      }
    } else {
      this.footstepTimer = 0;
    }
  }

  public dispose() {
    this.mesh.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) std.map.dispose();
          m.dispose();
        }
      }
    });
  }

  private updateAnimations(
    delta: number,
    isMoving: boolean,
    isRunning: boolean,
    isUnconscious: boolean,
    isHandcuffed = false
  ) {
    if (isUnconscious) {
      this.animState = 'unconscious';
    } else if (this.punchTimer > 0 && !isHandcuffed) {
      this.animState = 'punch';
    } else if (this.isSwimming) {
      this.animState = 'swim';
    } else if (!this.isGrounded) {
      this.animState = 'jump';
    } else if (this.activeEmote && !isMoving && !isHandcuffed) {
      this.animState = this.activeEmote;
    } else if (isMoving && this.currentSpeed > 0.2) {
      this.animState = this.isCrouching ? 'crouch' : isRunning ? 'run' : 'walk';
    } else {
      this.animState = this.isCrouching ? 'crouch' : 'idle';
    }

    const hasWeapon = Boolean(
      !isHandcuffed && this.currentCustomization.equippedWeapon && this.currentCustomization.equippedWeapon !== 'none'
    );
    const res = animateHumanRig(
      {
        poseRoot: this.mesh,
        torsoGroup: this.torsoGroup,
        headGroup: this.headGroup,
        leftArmGroup: this.leftArmGroup,
        rightArmGroup: this.rightArmGroup,
        leftForearmGroup: this.leftForearmGroup,
        rightForearmGroup: this.rightForearmGroup,
        leftLegGroup: this.leftLegGroup,
        rightLegGroup: this.rightLegGroup,
        leftLowerLegGroup: this.leftLowerLegGroup,
        rightLowerLegGroup: this.rightLowerLegGroup,
      },
      {
        animState: this.animState,
        delta,
        animTimer: this.animTimer,
        baseTorsoY: 0.96,
        speedRatio: isMoving && this.currentSpeed > 0.2 ? 1 : 0,
        isHandcuffed,
        hasWeapon,
        isAiming: this.isAiming,
        weaponRecoilTimer: this.weaponRecoilTimer,
        weaponReloadTimer: this.weaponReloadTimer,
        punchTimer: this.punchTimer,
      }
    );
    this.animTimer = res.nextAnimTimer;
    this.lieLiftY = THREE.MathUtils.damp(this.lieLiftY, res.targetLieOffsetY, 10, delta);
  }
}
