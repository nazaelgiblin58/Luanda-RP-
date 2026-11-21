/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

// Vetores e objetos de módulo pré-alocados (Zero GC por frame)
const _targetLookAt = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _ray = new THREE.Ray();

export class ThirdPersonCamera {
  public camera: THREE.PerspectiveCamera;

  // Parâmetros orbitais esféricos estilo GTA RP (atrás e ligeiramente acima do ombro)
  public targetRadius = 4.6;
  public currentRadius = 4.6;
  public minRadius = 2.0;
  public maxRadius = 11.0;

  public yaw = 0;
  public pitch = 0.24; // Terceira pessoa firme atrás do personagem (nunca vista de topo!)
  public minPitch = -0.18;
  public maxPitch = 0.95; // Limite seguro para manter visão cinematográfica em terceira pessoa

  public shoulderOffsetX = 0.42; // Ligeiro desvio sobre o ombro direito estilo GTA V / RP
  public isAiming = false;
  private baseFov = 62;
  private manualOrbitCooldown = 0;

  private currentTarget = new THREE.Vector3();
  private desiredCameraPos = new THREE.Vector3();

  constructor(fov = 62, aspect = 1.6, near = 0.1, far = 520) {
    this.baseFov = fov;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  public setBaseDistance(dist: number) {
    this.targetRadius = Math.max(this.minRadius, Math.min(this.maxRadius, dist));
  }

  public setRenderDistance(far: number) {
    this.camera.far = Math.max(150, Math.min(700, far));
    this.camera.updateProjectionMatrix();
  }

  public rotate(deltaX: number, deltaY: number, sensitivity = 0.0024, invertY = false) {
    const clampedDx = Math.max(-80, Math.min(80, deltaX));
    const clampedDy = Math.max(-80, Math.min(80, deltaY));
    const aimScale = this.isAiming ? 0.55 : 1.0;
    const effSens = sensitivity * aimScale;
    this.yaw -= clampedDx * effSens;
    const ySign = invertY ? -1 : 1;
    this.pitch = Math.max(
      this.minPitch,
      Math.min(this.maxPitch, this.pitch + clampedDy * effSens * ySign)
    );
    this.manualOrbitCooldown = 1.8;
  }

  public rotateTouch(deltaX: number, deltaY: number, sensitivity = 0.0032, invertY = false) {
    // Escala adaptativa suave para ecrãs tácteis de telemóveis e tablets
    const viewportFactor =
      typeof window !== 'undefined'
        ? Math.max(0.8, Math.min(1.25, 420 / Math.max(360, window.innerWidth)))
        : 1;
    this.rotate(deltaX, deltaY, sensitivity * viewportFactor, invertY);
  }

  public zoom(deltaRadius: number) {
    this.targetRadius = Math.max(this.minRadius, Math.min(this.maxRadius, this.targetRadius + deltaRadius));
  }

  public resetBehind(rotationY: number) {
    this.yaw = rotationY + Math.PI;
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    colliders: THREE.Box3[],
    isVehicleMode = false,
    vehicleSpeedAbs = 0,
    vehicleRotationY = 0,
    isInterior = false
  ) {
    if (this.manualOrbitCooldown > 0) {
      this.manualOrbitCooldown = Math.max(0, this.manualOrbitCooldown - delta);
    }

    // 1. Alinhamento suave automático atrás do veículo ao acelerar sem arrastar o rato
    if (isVehicleMode && vehicleSpeedAbs > 3.5 && this.manualOrbitCooldown <= 0) {
      const targetBehindYaw = vehicleRotationY + Math.PI;
      let diff = targetBehindYaw - this.yaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.yaw += diff * Math.min(1, delta * 2.2);
    }

    // 2. Ajuste dinâmico do FOV com a velocidade do carro ou mira ADS
    const speedRatio = isVehicleMode ? Math.min(1, vehicleSpeedAbs / 34) : 0;
    const targetFov = isVehicleMode
      ? this.baseFov + speedRatio * 12
      : this.isAiming
      ? 48
      : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, delta);
      this.camera.updateProjectionMatrix();
    }

    // 3. Alvo do foco com compensação sobre o ombro
    const targetHeight = isVehicleMode ? 1.75 : this.isAiming ? 1.54 : 1.42;
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const sideOffset = isVehicleMode ? 0 : this.isAiming ? 0.68 : this.shoulderOffsetX;

    _targetLookAt.set(
      playerPos.x + cosYaw * sideOffset,
      playerPos.y + targetHeight,
      playerPos.z - sinYaw * sideOffset
    );

    this.currentTarget.lerp(_targetLookAt, Math.min(1, 18 * delta));

    // Distância em função do modo a pé / mira / interior / condução
    const effectiveRadius = isVehicleMode
      ? this.targetRadius + 2.8
      : this.isAiming
      ? 2.45
      : isInterior
      ? Math.min(this.targetRadius, 3.15)
      : this.targetRadius;
    this.currentRadius = THREE.MathUtils.damp(this.currentRadius, effectiveRadius, 12, delta);

    // 4. Coordenadas esféricas
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    const relX = this.currentRadius * cosPitch * sinYaw;
    const relY = this.currentRadius * sinPitch;
    const relZ = this.currentRadius * cosPitch * cosYaw;

    this.desiredCameraPos.set(
      this.currentTarget.x + relX,
      this.currentTarget.y + relY,
      this.currentTarget.z + relZ
    );

    const minCamY = playerPos.y + (isInterior ? 0.48 : 0.45);
    if (this.desiredCameraPos.y < minCamY) {
      this.desiredCameraPos.y = minCamY;
    }

    // 5. Colisão anti-clipping contra edifícios e paredes interiores sem alocação de objetos
    _rayOrigin.copy(this.currentTarget);
    _rayDir.subVectors(this.desiredCameraPos, _rayOrigin);
    const rayDist = _rayDir.length();
    if (rayDist > 0.01) {
      _rayDir.multiplyScalar(1 / rayDist);
      _ray.set(_rayOrigin, _rayDir);
      let nearestDist = rayDist;

      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        const pad = nearestDist + 0.5;
        if (
          _rayOrigin.x + pad < box.min.x ||
          _rayOrigin.x - pad > box.max.x ||
          _rayOrigin.y + pad < box.min.y ||
          _rayOrigin.y - pad > box.max.y ||
          _rayOrigin.z + pad < box.min.z ||
          _rayOrigin.z - pad > box.max.z
        ) {
          continue;
        }
        const hit = _ray.intersectBox(box, _hitPoint);
        if (hit) {
          const d = _rayOrigin.distanceTo(hit);
          if (d < nearestDist && d > 0.55) {
            nearestDist = Math.max(0.55, d - 0.28);
          }
        }
      }

      if (nearestDist < rayDist) {
        this.desiredCameraPos.copy(_rayOrigin).addScaledVector(_rayDir, nearestDist);
      }
    }

    // 6. Interpolação fluida da câmera
    this.camera.position.lerp(this.desiredCameraPos, Math.min(1, 20 * delta));
    this.camera.lookAt(this.currentTarget);
  }
}
