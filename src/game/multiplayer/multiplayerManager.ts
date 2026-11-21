/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import {
  AdminRole,
  ChatMessage,
  GlobalDjState,
  PlayerCustomization,
  PoliticsState,
  SharedWorldVehicle,
  VehiclePhysicsProfile,
  VolleyballState,
  WeatherForecastData,
  WeatherMode,
  WeatherType,
  WorldDynamicState,
} from '../types';

export interface RemotePlayerData {
  id: string;
  characterId?: string;
  name: string;
  badge: string;
  role?: AdminRole;
  interiorId?: string | null;
  position: { x: number; y: number; z: number };
  rotationY: number;
  animState: string;
  isDriving: boolean;
  vehicleId?: string;
  seatIndex?: number;
  vehicleName?: string;
  customization: Partial<PlayerCustomization> & {
    skinColor?: string;
    skinTone?: string;
    shirtColor: string;
    pantsColor: string;
    shoesColor: string;
    hairStyle: string;
    hairColor: string;
  };
}

export interface WorldSyncPayload {
  weather?: WeatherType;
  weatherMode?: WeatherMode;
  timeOfDay?: number;
  timeSpeed?: number;
  forecast?: WeatherForecastData;
}

export interface AdminEffectPayload {
  action: 'heal' | 'revive' | 'freeze' | 'teleport' | 'kick' | 'ban' | 'refresh_character' | 'spawn_vehicle';
  x?: number;
  z?: number;
  frozen?: boolean;
  reason?: string;
  vehicleModelId?: string;
}

export interface EmergencyAlertPayload {
  service: 'policia' | 'medico' | 'crime';
  title: string;
  message: string;
  x: number;
  z: number;
}

export interface WeaponFiredPayload {
  id: string;
  weaponId: string;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}

export interface VoiceChunkPayload {
  senderId: string;
  senderName: string;
  data: string;
  mimeType: string;
  position?: { x: number; y: number; z: number };
  channel: 'proximity' | 'radio';
}

import { animateHumanRig, buildDetailedHumanRig, type HumanRigHandles } from '../player/humanRig';

let _proxyBodyGeo: THREE.BoxGeometry | null = null;
let _proxyCabinGeo: THREE.BoxGeometry | null = null;
let _proxyWheelGeo: THREE.CylinderGeometry | null = null;
let _proxyBodyMat: THREE.MeshStandardMaterial | null = null;
let _proxyGlassMat: THREE.MeshStandardMaterial | null = null;
let _proxyWheelMat: THREE.MeshStandardMaterial | null = null;

function buildRemoteCarProxy(): THREE.Group {
  if (!_proxyBodyGeo) {
    _proxyBodyGeo = new THREE.BoxGeometry(1.9, 0.72, 4.1);
    _proxyCabinGeo = new THREE.BoxGeometry(1.65, 0.56, 2.0);
    _proxyWheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 12);
    _proxyWheelGeo.rotateZ(Math.PI / 2);
    _proxyBodyMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3, metalness: 0.45 });
    _proxyGlassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.5 });
    _proxyWheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(_proxyBodyGeo, _proxyBodyMat!);
  body.position.y = 0.62;
  body.userData.sharedAsset = true;
  g.add(body);

  const cabin = new THREE.Mesh(_proxyCabinGeo!, _proxyGlassMat!);
  cabin.position.set(0, 1.22, -0.1);
  cabin.userData.sharedAsset = true;
  g.add(cabin);

  for (const [wx, wz] of [[-0.92, 1.25], [0.92, 1.25], [-0.92, -1.25], [0.92, -1.25]]) {
    const w = new THREE.Mesh(_proxyWheelGeo!, _proxyWheelMat!);
    w.position.set(wx, 0.35, wz);
    w.userData.sharedAsset = true;
    g.add(w);
  }
  g.visible = false;
  return g;
}

export class RemotePlayer3D {
  public id: string;
  public characterId?: string;
  public name: string;
  public badge: string;
  public role?: AdminRole;
  public interiorId?: string | null;
  public vehicleName?: string;
  public vehicleId?: string;
  public seatIndex?: number;
  public mesh: THREE.Group;
  public targetPosition = new THREE.Vector3();
  public targetRotationY = 0;
  public animState = 'idle';
  public isDriving = false;

  private rig: HumanRigHandles;
  private carProxy: THREE.Group;
  private animTimer = 0;
  private namePlateMesh: THREE.Mesh;
  private rpBubbleMesh: THREE.Mesh | null = null;
  private rpBubbleExpires = 0;
  private speakingBadgeMesh: THREE.Mesh;
  private speakingExpires = 0;

  constructor(data: RemotePlayerData) {
    this.id = data.id;
    this.characterId = data.characterId;
    this.name = data.name;
    this.badge = data.badge || 'Cidadão';
    this.role = data.role;
    this.interiorId = data.interiorId ?? null;
    this.vehicleId = data.vehicleId;
    this.seatIndex = data.seatIndex;
    this.vehicleName = data.vehicleName;
    this.isDriving = !!data.isDriving;
    this.mesh = new THREE.Group();
    this.mesh.name = `RemotePlayer_${data.id}`;

    const cust = data.customization;
    this.rig = buildDetailedHumanRig({
      gender: cust.gender,
      skinColor: cust.skinTone || cust.skinColor || '#9e563f',
      shirtColor: cust.shirtColor || '#dc2626',
      pantsColor: cust.pantsColor || '#09090b',
      shoesColor: cust.shoesColor || '#ffffff',
      hairColor: cust.hairColor || '#d4d4d8',
      hairStyle: (cust.hairStyle as 'curto' | 'afro' | 'trancas' | 'bone') || 'curto',
      outfitStyle: cust.outfitStyle,
      hasCap: cust.hasCap,
      capColor: cust.capColor,
      hasMask: cust.hasMask,
      maskColor: cust.maskColor,
      hasSunglasses: cust.hasSunglasses,
      hasChain: cust.hasChain,
      hasBag: cust.hasBag,
      heightScale: cust.heightScale || 1.0,
      equippedWeapon: cust.equippedWeapon || 'none',
      castShadow: false,
    });
    this.rig.root.visible = !this.isDriving;
    this.mesh.add(this.rig.root);

    this.carProxy = buildRemoteCarProxy();
    this.carProxy.visible = this.isDriving;
    this.mesh.add(this.carProxy);

    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 440;
    plateCanvas.height = 112;
    const pctx = plateCanvas.getContext('2d')!;
    pctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
    pctx.fillRect(4, 4, 432, 104);
    pctx.strokeStyle = data.role && data.role !== 'player' ? '#ef4444' : '#facc15';
    pctx.lineWidth = 5;
    pctx.strokeRect(4, 4, 432, 104);

    pctx.font = 'bold 30px sans-serif';
    pctx.textAlign = 'center';
    pctx.lineWidth = 6;
    pctx.strokeStyle = '#000000';
    pctx.strokeText(`🇦🇴 ${data.name}`, 220, 44);
    pctx.fillStyle = '#ffffff';
    pctx.fillText(`🇦🇴 ${data.name}`, 220, 44);

    pctx.font = 'bold 22px sans-serif';
    pctx.strokeText(`[${data.badge || 'Cidadão'}]`, 220, 82);
    pctx.fillStyle = data.role && data.role !== 'player' ? '#fca5a5' : '#38bdf8';
    pctx.fillText(`[${data.badge || 'Cidadão'}]`, 220, 82);

    const plateTex = new THREE.CanvasTexture(plateCanvas);
    plateTex.colorSpace = THREE.SRGBColorSpace;
    this.namePlateMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 0.6),
      new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, side: THREE.DoubleSide })
    );
    this.namePlateMesh.position.set(0, 2.34, 0);
    this.mesh.add(this.namePlateMesh);

    const speakCanvas = document.createElement('canvas');
    speakCanvas.width = 256;
    speakCanvas.height = 56;
    const sctx = speakCanvas.getContext('2d')!;
    sctx.fillStyle = 'rgba(5, 150, 105, 0.94)';
    sctx.fillRect(2, 2, 252, 52);
    sctx.strokeStyle = '#6ee7b7';
    sctx.lineWidth = 4;
    sctx.strokeRect(2, 2, 252, 52);
    sctx.font = 'bold 24px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = '#ffffff';
    sctx.fillText('🎤 FALANDO', 128, 28);
    const speakTex = new THREE.CanvasTexture(speakCanvas);
    speakTex.colorSpace = THREE.SRGBColorSpace;
    this.speakingBadgeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 0.34),
      new THREE.MeshBasicMaterial({ map: speakTex, transparent: true, side: THREE.DoubleSide })
    );
    this.speakingBadgeMesh.position.set(0, 2.74, 0);
    this.speakingBadgeMesh.visible = false;
    this.mesh.add(this.speakingBadgeMesh);

    this.targetPosition.set(data.position.x, data.position.y, data.position.z);
    this.mesh.position.copy(this.targetPosition);
    this.targetRotationY = data.rotationY || 0;
    this.mesh.rotation.y = this.targetRotationY;
  }

  public updateMeta(name: string, badge: string, role?: AdminRole) {
    this.name = name || this.name;
    this.badge = badge || 'Cidadão';
    this.role = role;

    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 440;
    plateCanvas.height = 112;
    const pctx = plateCanvas.getContext('2d')!;
    pctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
    pctx.fillRect(4, 4, 432, 104);
    pctx.strokeStyle = this.role && this.role !== 'player' ? '#ef4444' : '#facc15';
    pctx.lineWidth = 5;
    pctx.strokeRect(4, 4, 432, 104);

    pctx.font = 'bold 30px sans-serif';
    pctx.textAlign = 'center';
    pctx.lineWidth = 6;
    pctx.strokeStyle = '#000000';
    pctx.strokeText(`🇦🇴 ${this.name}`, 220, 44);
    pctx.fillStyle = '#ffffff';
    pctx.fillText(`🇦🇴 ${this.name}`, 220, 44);

    pctx.font = 'bold 22px sans-serif';
    pctx.strokeText(`[${this.badge || 'Cidadão'}]`, 220, 82);
    pctx.fillStyle = this.role && this.role !== 'player' ? '#fca5a5' : '#38bdf8';
    pctx.fillText(`[${this.badge || 'Cidadão'}]`, 220, 82);

    const newTex = new THREE.CanvasTexture(plateCanvas);
    newTex.colorSpace = THREE.SRGBColorSpace;
    const mat = this.namePlateMesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = newTex;
    mat.needsUpdate = true;
  }

  public setSpeaking(active: boolean) {
    this.speakingExpires = active ? performance.now() + 1800 : 0;
    this.speakingBadgeMesh.visible = active;
  }

  public showRpBubble(text: string) {
    if (this.rpBubbleMesh) {
      this.mesh.remove(this.rpBubbleMesh);
      (this.rpBubbleMesh.material as THREE.MeshBasicMaterial).map?.dispose();
      (this.rpBubbleMesh.material as THREE.Material).dispose();
      this.rpBubbleMesh.geometry.dispose();
    }
    const c = document.createElement('canvas');
    c.width = 520;
    c.height = 88;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(59, 7, 100, 0.94)';
    ctx.fillRect(3, 3, 514, 82);
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 514, 82);
    ctx.font = 'italic bold 25px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text.slice(0, 38), 260, 44);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text.slice(0, 38), 260, 44);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.rpBubbleMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 0.48),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    this.rpBubbleMesh.position.set(0, 2.86, 0);
    this.mesh.add(this.rpBubbleMesh);
    this.rpBubbleExpires = performance.now() + 6500;
  }

  public update(delta: number, cameraPos: THREE.Vector3, isVisible = true) {
    this.mesh.visible = isVisible;
    if (!isVisible) return;
    this.mesh.position.lerp(this.targetPosition, Math.min(1, delta * 12));
    this.mesh.rotation.y = THREE.MathUtils.damp(this.mesh.rotation.y, this.targetRotationY, 14, delta);
    const inSharedVeh = Boolean(this.vehicleId);
    this.rig.root.visible = !this.isDriving && !inSharedVeh;
    this.carProxy.visible = this.isDriving && !inSharedVeh;
    this.namePlateMesh.position.y = this.isDriving ? 2.55 : 2.34;
    this.speakingBadgeMesh.position.y = this.isDriving ? 2.95 : 2.74;
    this.namePlateMesh.lookAt(cameraPos);

    if (this.rpBubbleMesh) {
      this.rpBubbleMesh.position.y = this.isDriving ? 3.08 : 2.86;
      this.rpBubbleMesh.lookAt(cameraPos);
      if (performance.now() > this.rpBubbleExpires) {
        this.mesh.remove(this.rpBubbleMesh);
        (this.rpBubbleMesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (this.rpBubbleMesh.material as THREE.Material).dispose();
        this.rpBubbleMesh.geometry.dispose();
        this.rpBubbleMesh = null;
      }
    }

    if (this.speakingBadgeMesh.visible) {
      this.speakingBadgeMesh.lookAt(cameraPos);
      if (performance.now() > this.speakingExpires) {
        this.speakingBadgeMesh.visible = false;
      }
    }

    const animRes = animateHumanRig(
      {
        poseRoot: this.rig.root,
        torsoGroup: this.rig.torsoGroup,
        headGroup: this.rig.headGroup,
        leftArmGroup: this.rig.leftArmGroup,
        rightArmGroup: this.rig.rightArmGroup,
        leftForearmGroup: this.rig.leftForearmGroup,
        rightForearmGroup: this.rig.rightForearmGroup,
        leftLegGroup: this.rig.leftLegGroup,
        rightLegGroup: this.rig.rightLegGroup,
        leftLowerLegGroup: this.rig.leftLowerLegGroup,
        rightLowerLegGroup: this.rig.rightLowerLegGroup,
      },
      {
        animState: this.animState || 'idle',
        delta,
        animTimer: this.animTimer,
        baseTorsoY: 0.94,
        speedRatio: this.animState === 'crouch' ? 0.5 : 1,
        hasWeapon: Boolean(this.rig.weaponMount && this.rig.weaponMount.children.length > 0),
      }
    );
    this.animTimer = animRes.nextAnimTimer;
    this.rig.root.position.y = THREE.MathUtils.damp(this.rig.root.position.y, animRes.targetLieOffsetY, 10, delta);
  }

  public dispose() {
    this.mesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.userData?.sharedAsset) return;
        mesh.geometry?.dispose();
        const disposeMat = (m: THREE.Material) => {
          const anyMat = m as THREE.MeshBasicMaterial;
          anyMat.map?.dispose();
          m.dispose();
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMat);
        else if (mesh.material) disposeMat(mesh.material);
      }
    });
  }
}

export class MultiplayerManager {
  private ws: WebSocket | null = null;
  private scene: THREE.Scene;
  public remotePlayers = new Map<string, RemotePlayer3D>();
  public sharedVehicles = new Map<string, SharedWorldVehicle>();
  public isConnected = false;
  public selfId = '';
  public sessionId = '';
  public activeCitizensCount = 1;
  private clientInstanceId = 'cli-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  private authToken = '';
  private characterId = '';
  private playerName = '';
  private badge = 'Cidadão';
  private role: AdminRole = 'player';
  private initialPosition: { x: number; y: number; z: number } = { x: -29, y: 0, z: 58 };
  private initialRotationY = Math.PI / 2;
  private customization: PlayerCustomization | null = null;
  private destroyed = false;

  private onChatReceived?: (msg: ChatMessage) => void;
  private onCitizenCountChange?: (count: number) => void;
  private onWorldSync?: (payload: WorldSyncPayload) => void;
  private onDynamicWorldSync?: (worldState: WorldDynamicState) => void;
  private onSharedVehicleUpdated?: (vehicle: SharedWorldVehicle) => void;
  private onSharedVehicleRemoved?: (vehicleId: string) => void;
  private onAdminEffect?: (payload: AdminEffectPayload) => void;
  private onEmergencyAlert?: (payload: EmergencyAlertPayload) => void;
  private onWeaponFired?: (payload: WeaponFiredPayload) => void;
  private onDjSync?: (djState: GlobalDjState, serverNow: number) => void;
  private onPoliticsSync?: (politics: PoliticsState) => void;
  private onAfkWarning?: (payload: { stage: number; remainingMinutes: number; message: string }) => void;
  private onAfkArrest?: (payload: {
    jailUntil: number;
    assignedCell: number;
    reason: string;
    position: { x: number; y: number; z: number };
  }) => void;
  private onVoiceChunk?: (payload: VoiceChunkPayload) => void;
  private onPositionCorrection?: (payload: { position: { x: number; y: number; z: number }; rotationY?: number; reason?: string }) => void;
  private onSessionConflict?: (reason: string) => void;
  private onVolleyballSync?: (volleyball: VolleyballState) => void;
  private updateThrottleTimer = 0;
  private vehicleThrottleTimer = 0;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;

  constructor(
    scene: THREE.Scene,
    callbacks?: {
      onChatReceived?: (msg: ChatMessage) => void;
      onCitizenCountChange?: (count: number) => void;
      onWorldSync?: (payload: WorldSyncPayload) => void;
      onDynamicWorldSync?: (worldState: WorldDynamicState) => void;
      onSharedVehicleUpdated?: (vehicle: SharedWorldVehicle) => void;
      onSharedVehicleRemoved?: (vehicleId: string) => void;
      onAdminEffect?: (payload: AdminEffectPayload) => void;
      onEmergencyAlert?: (payload: EmergencyAlertPayload) => void;
      onWeaponFired?: (payload: WeaponFiredPayload) => void;
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
      onPositionCorrection?: (payload: { position: { x: number; y: number; z: number }; rotationY?: number; reason?: string }) => void;
      onSessionConflict?: (reason: string) => void;
      onVolleyballSync?: (volleyball: VolleyballState) => void;
    }
  ) {
    this.scene = scene;
    this.onChatReceived = callbacks?.onChatReceived;
    this.onCitizenCountChange = callbacks?.onCitizenCountChange;
    this.onWorldSync = callbacks?.onWorldSync;
    this.onDynamicWorldSync = callbacks?.onDynamicWorldSync;
    this.onSharedVehicleUpdated = callbacks?.onSharedVehicleUpdated;
    this.onSharedVehicleRemoved = callbacks?.onSharedVehicleRemoved;
    this.onAdminEffect = callbacks?.onAdminEffect;
    this.onEmergencyAlert = callbacks?.onEmergencyAlert;
    this.onWeaponFired = callbacks?.onWeaponFired;
    this.onDjSync = callbacks?.onDjSync;
    this.onPoliticsSync = callbacks?.onPoliticsSync;
    this.onAfkWarning = callbacks?.onAfkWarning;
    this.onAfkArrest = callbacks?.onAfkArrest;
    this.onVoiceChunk = callbacks?.onVoiceChunk;
    this.onPositionCorrection = callbacks?.onPositionCorrection;
    this.onSessionConflict = callbacks?.onSessionConflict;
    this.onVolleyballSync = callbacks?.onVolleyballSync;
  }

  public connect(
    localPlayerName: string,
    customization: PlayerCustomization,
    options?: {
      token?: string;
      characterId?: string;
      badge?: string;
      role?: AdminRole;
      initialPosition?: { x: number; y: number; z: number };
      initialRotationY?: number;
    }
  ) {
    this.destroyed = false;
    this.playerName = localPlayerName;
    this.customization = customization;
    if (options?.token) this.authToken = options.token;
    if (options?.characterId) this.characterId = options.characterId;
    if (options?.badge) this.badge = options.badge;
    if (options?.role) this.role = options.role;
    if (options?.initialPosition) this.initialPosition = { ...options.initialPosition };
    if (typeof options?.initialRotationY === 'number') this.initialRotationY = options.initialRotationY;

    try {
      const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
      const explicitWs = (env.VITE_WS_URL || '').trim().replace(/\/+$/, '');
      const apiBase = (env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
      const tokenParam = this.authToken ? `?token=${encodeURIComponent(this.authToken)}` : '';
      let wsUrl = '';
      if (explicitWs) {
        wsUrl = explicitWs.endsWith('/ws') ? `${explicitWs}${tokenParam}` : `${explicitWs}/ws${tokenParam}`;
      } else if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
        wsUrl = `${apiBase.replace(/^http/, 'ws')}/ws${tokenParam}`;
      } else if (window.location.hostname.endsWith('.netlify.app')) {
        this.isConnected = false;
        this.destroyed = true;
        this.onSessionConflict?.(
          'Configura VITE_WS_URL e VITE_API_BASE_URL no Netlify para ligar ao servidor multiplayer.'
        );
        return;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws${tokenParam}`;
      }

      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.pingTimer !== null) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        try { this.ws.close(); } catch {}
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempt = 0;
        this.selfId = this.characterId || 'citizen-' + Math.random().toString(36).substring(2, 8);
        this.send({
          type: 'join',
          id: this.selfId,
          characterId: this.characterId,
          clientInstanceId: this.clientInstanceId,
          token: this.authToken,
          name: this.playerName || 'Cidadão Angolano',
          badge: this.badge || 'Cidadão de Luanda',
          role: this.role,
          position: this.initialPosition,
          rotationY: this.initialRotationY,
          animState: 'idle',
          customization: {
            ...customization,
            skinColor: customization.skinTone,
          },
        });
        this.pingTimer = window.setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({ type: 'ping' });
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.pingTimer !== null) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (!this.destroyed) {
          const delayMs = Math.min(15000, 2000 * Math.pow(1.5, this.reconnectAttempt));
          this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 6);
          this.reconnectTimer = window.setTimeout(() => {
            if (!this.isConnected && !this.destroyed && this.customization) {
              this.connect(this.playerName, this.customization, {
                token: this.authToken,
                characterId: this.characterId,
                badge: this.badge,
                role: this.role,
                initialPosition: this.initialPosition,
                initialRotationY: this.initialRotationY,
              });
            }
          }, delayMs);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
    }
  }

  private handleMessage(msg: any) {
    if (msg.type === 'pong') {
      return;
    }
    if (msg.type === 'init') {
      this.selfId = msg.selfId || this.selfId;
      this.sessionId = msg.sessionId || '';
      const incomingIds = new Set<string>(
        Array.isArray(msg.players) ? msg.players.map((p: RemotePlayerData) => p.id) : []
      );
      for (const existingId of Array.from(this.remotePlayers.keys())) {
        if (!incomingIds.has(existingId)) {
          this.removeRemotePlayer(existingId);
        }
      }
      if (Array.isArray(msg.players)) {
        for (const p of msg.players) {
          if (p.id !== this.selfId) this.addRemotePlayer(p);
        }
      }
      if (Array.isArray(msg.sharedVehicles)) {
        for (const sv of msg.sharedVehicles as SharedWorldVehicle[]) {
          this.sharedVehicles.set(sv.id, sv);
          this.onSharedVehicleUpdated?.(sv);
        }
      }
      const dynWorld = msg.dynamicWorldState ?? msg.dynamicWorld;
      if (dynWorld && this.onDynamicWorldSync) {
        this.onDynamicWorldSync(dynWorld);
      }
      this.updateCount();
      if (msg.worldState && this.onWorldSync) {
        this.onWorldSync(msg.worldState);
      }
      if (msg.djState && this.onDjSync) {
        this.onDjSync(msg.djState, msg.serverNow || Date.now());
      }
      if (Array.isArray(msg.recentChat) && this.onChatReceived) {
        msg.recentChat.forEach((c: ChatMessage) => this.onChatReceived!(c));
      }
    } else if (msg.type === 'player_joined') {
      if (msg.player && msg.player.id !== this.selfId) {
        this.addRemotePlayer(msg.player);
        this.updateCount();
      }
    } else if (msg.type === 'player_updated') {
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.targetPosition.set(msg.position.x, msg.position.y, msg.position.z);
        rp.targetRotationY = msg.rotationY;
        rp.animState = msg.animState;
        rp.isDriving = !!msg.isDriving;
        rp.interiorId = msg.interiorId ?? null;
        rp.vehicleId = msg.vehicleId;
        rp.seatIndex = msg.seatIndex;
        rp.vehicleName = msg.vehicleName;
      }
    } else if (msg.type === 'shared_vehicle_updated' && msg.vehicle) {
      const sv = msg.vehicle as SharedWorldVehicle;
      this.sharedVehicles.set(sv.id, sv);
      this.onSharedVehicleUpdated?.(sv);
    } else if (msg.type === 'shared_vehicle_removed' && msg.vehicleId) {
      this.sharedVehicles.delete(msg.vehicleId);
      this.onSharedVehicleRemoved?.(msg.vehicleId);
    } else if (msg.type === 'dynamic_world_sync' && msg.worldState) {
      this.onDynamicWorldSync?.(msg.worldState);
    } else if (msg.type === 'volleyball_sync' && msg.volleyball) {
      this.onVolleyballSync?.(msg.volleyball as VolleyballState);
    } else if (msg.type === 'player_customization') {
      const existing = this.remotePlayers.get(msg.id);
      if (existing && msg.customization) {
        this.addRemotePlayer({
          id: existing.id,
          characterId: existing.characterId,
          name: existing.name,
          badge: existing.badge,
          role: existing.role,
          interiorId: existing.interiorId,
          position: { x: existing.targetPosition.x, y: existing.targetPosition.y, z: existing.targetPosition.z },
          rotationY: existing.targetRotationY,
          animState: existing.animState,
          isDriving: existing.isDriving,
          vehicleId: existing.vehicleId,
          seatIndex: existing.seatIndex,
          vehicleName: existing.vehicleName,
          customization: msg.customization,
        });
      }
    } else if (msg.type === 'player_meta_updated') {
      const existing = this.remotePlayers.get(msg.id);
      if (existing) {
        existing.updateMeta(
          typeof msg.name === 'string' ? msg.name : existing.name,
          typeof msg.badge === 'string' ? msg.badge : existing.badge,
          msg.role
        );
      }
    } else if (msg.type === 'weapon_fired') {
      if (this.onWeaponFired && msg.from && msg.to) {
        this.onWeaponFired({ id: msg.id, weaponId: msg.weaponId, from: msg.from, to: msg.to });
      }
    } else if (msg.type === 'player_left') {
      this.removeRemotePlayer(msg.id);
      this.updateCount();
    } else if (msg.type === 'chat_received') {
      if (this.onChatReceived && msg.message) {
        this.onChatReceived(msg.message);
        if (msg.message.channel === 'rp' && msg.message.senderId !== this.selfId) {
          const rp = this.remotePlayers.get(msg.message.senderId);
          if (rp) rp.showRpBubble(msg.message.text);
        }
      }
    } else if (msg.type === 'world_sync') {
      if (this.onWorldSync && msg.worldState) {
        this.onWorldSync(msg.worldState);
      }
    } else if (msg.type === 'dj_sync') {
      if (this.onDjSync && msg.djState) {
        this.onDjSync(msg.djState, msg.serverNow || Date.now());
      }
    } else if (msg.type === 'politics_sync') {
      if (this.onPoliticsSync && msg.politics) {
        this.onPoliticsSync(msg.politics);
      }
    } else if (msg.type === 'afk_warning') {
      if (this.onAfkWarning) {
        this.onAfkWarning({
          stage: msg.stage || 1,
          remainingMinutes: msg.remainingMinutes || 1,
          message: msg.message || 'Aviso de inatividade PNA.',
        });
      }
    } else if (msg.type === 'afk_arrest') {
      if (this.onAfkArrest) {
        this.onAfkArrest({
          jailUntil: msg.jailUntil || Date.now() + 18000 * 1000,
          assignedCell: msg.assignedCell || 1,
          reason: msg.reason || 'Inatividade prolongada (+72 min AFK)',
          position: msg.position || { x: 891, y: 0, z: 626 },
        });
      }
    } else if (msg.type === 'session_conflict' || msg.type === 'auth_error') {
      this.destroyed = true;
      this.isConnected = false;
      this.onSessionConflict?.(msg.error || 'Ligação recusada pelo servidor multiplayer.');
    } else if (msg.type === 'position_correction' && msg.position) {
      this.onPositionCorrection?.({
        position: msg.position,
        rotationY: msg.rotationY,
        reason: msg.reason,
      });
    } else if (msg.type === 'admin_effect') {
      if (this.onAdminEffect && msg.effect) {
        this.onAdminEffect(msg.effect);
      }
    } else if (msg.type === 'emergency_alert') {
      if (this.onEmergencyAlert && msg.alert) {
        this.onEmergencyAlert(msg.alert);
      }
    } else if (msg.type === 'voice_chunk') {
      if (msg.senderId && msg.senderId !== this.selfId && typeof msg.data === 'string') {
        const rp = this.remotePlayers.get(msg.senderId);
        if (rp) rp.setSpeaking(true);
        if (this.onVoiceChunk) {
          this.onVoiceChunk({
            senderId: msg.senderId,
            senderName: msg.senderName || 'Cidadão',
            data: msg.data,
            mimeType: msg.mimeType || 'audio/webm',
            position: msg.position,
            channel: msg.channel === 'radio' ? 'radio' : 'proximity',
          });
        }
      }
    }
  }

  private addRemotePlayer(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.id)) {
      this.removeRemotePlayer(data.id);
    }
    const rp = new RemotePlayer3D(data);
    this.remotePlayers.set(data.id, rp);
    this.scene.add(rp.mesh);
  }

  private removeRemotePlayer(id: string) {
    const rp = this.remotePlayers.get(id);
    if (rp) {
      this.scene.remove(rp.mesh);
      rp.dispose();
      this.remotePlayers.delete(id);
    }
  }

  private updateCount() {
    this.activeCitizensCount = 1 + this.remotePlayers.size;
    if (this.onCitizenCountChange) {
      this.onCitizenCountChange(this.activeCitizensCount);
    }
  }

  public getRemotePlayersList(
    localInteriorId?: string | null
  ): { id: string; characterId?: string; name: string; position: THREE.Vector3; interiorId: string | null }[] {
    const list: { id: string; characterId?: string; name: string; position: THREE.Vector3; interiorId: string | null }[] = [];
    for (const rp of this.remotePlayers.values()) {
      const rpInt = rp.interiorId ?? null;
      if (localInteriorId !== undefined && rpInt !== (localInteriorId ?? null)) continue;
      list.push({ id: rp.id, characterId: rp.characterId, name: rp.name, position: rp.targetPosition, interiorId: rpInt });
    }
    return list;
  }

  public sendMovement(
    delta: number,
    position: THREE.Vector3,
    rotationY: number,
    animState: string,
    isDriving: boolean,
    vehicleName?: string,
    extra?: { interiorId?: string | null; vehicleId?: string; seatIndex?: number }
  ) {
    this.updateThrottleTimer += delta;
    if (this.updateThrottleTimer < 0.05) return;
    this.updateThrottleTimer = 0;
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.initialPosition = { x: position.x, y: position.y, z: position.z };
    this.initialRotationY = rotationY;
    this.send({
      type: 'update',
      position: { x: position.x, y: position.y, z: position.z },
      rotationY,
      animState,
      isDriving,
      vehicleName,
      interiorId: extra?.interiorId ?? null,
      vehicleId: extra?.vehicleId,
      seatIndex: extra?.seatIndex,
    });
  }

  public sendVehicleSync(
    delta: number,
    payload: Partial<SharedWorldVehicle> & { vehicleId: string }
  ) {
    this.vehicleThrottleTimer += delta;
    if (this.vehicleThrottleTimer < 0.06) return;
    this.vehicleThrottleTimer = 0;
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const { vehicleId, ...rest } = payload;
    this.send({
      type: 'vehicle_sync',
      vehicle: {
        ...rest,
        id: vehicleId,
      },
    });
  }

  public enterVehicleSeat(vehicleId: string, seatIndex = 0, vehicleMeta?: Partial<SharedWorldVehicle>) {
    this.send({ type: 'vehicle_enter_seat', vehicleId, seatIndex, ...(vehicleMeta ? { vehicleMeta } : {}) });
  }

  public exitVehicleSeat(vehicleId: string) {
    this.send({ type: 'vehicle_exit_seat', vehicleId });
  }

  public sendChat(
    senderName: string,
    text: string,
    channel: ChatMessage['channel'] = 'geral',
    pos?: { x: number; z: number }
  ) {
    if (!text.trim()) return;
    this.send({
      type: 'chat',
      senderName,
      text: text.trim(),
      channel,
      position: pos,
    });
  }

  public sendCustomizationUpdate(cust: PlayerCustomization) {
    this.customization = cust;
    this.send({ type: 'customization_updated', customization: cust });
  }

  public sendWeaponFired(weaponId: string, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
    this.send({ type: 'weapon_fired', weaponId, from, to });
  }

  public sendVolleyballHit(dirX: number, dirZ: number) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({ type: 'volleyball_hit', dirX, dirZ });
  }

  public sendVoiceChunk(
    data: string,
    mimeType: string,
    position: { x: number; y: number; z: number },
    channel: 'proximity' | 'radio' = 'proximity'
  ) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({
      type: 'voice_chunk',
      data,
      mimeType,
      position,
      channel,
    });
  }

  public update(delta: number, cameraPos: THREE.Vector3, localInteriorId?: string | null) {
    const targetInt = localInteriorId ?? null;
    for (const rp of this.remotePlayers.values()) {
      const rpInt = rp.interiorId ?? null;
      rp.update(delta, cameraPos, rpInt === targetInt);
    }
  }

  private send(data: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch {}
    }
  }

  public destroy() {
    this.destroyed = true;
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const rp of this.remotePlayers.values()) {
      this.scene.remove(rp.mesh);
      rp.dispose();
    }
    this.remotePlayers.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
