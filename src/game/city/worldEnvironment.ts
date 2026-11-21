/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { WeatherType } from '../types';

const textureCache = new Map<string, THREE.CanvasTexture>();

function makeCachedCanvasTexture(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX = 1,
  repeatY = 1,
  isColor = true
): THREE.CanvasTexture {
  const fullKey = `${key}_${repeatX}_${repeatY}`;
  const existing = textureCache.get(fullKey);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(fullKey, tex);
  return tex;
}

export function getCachedRoadTexture(repeatY = 24): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'road_asphalt_v2',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#1f242d';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = (i * 73) % w;
        const y = (i * 137) % h;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.06)' : i % 2 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(148,163,184,0.05)';
        ctx.fillRect(x, y, 2, 2);
      }
      // Marcas subtis de pneus por faixa
      ctx.fillStyle = 'rgba(10, 12, 18, 0.34)';
      ctx.fillRect(36, 0, 20, h);
      ctx.fillRect(74, 0, 20, h);
      ctx.fillRect(162, 0, 20, h);
      ctx.fillRect(200, 0, 20, h);
      // Guias laterais brancas contínuas
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(7, 0, 6, h);
      ctx.fillRect(w - 13, 0, 6, h);
      // Linha dupla central amarela / tracejada
      ctx.fillStyle = '#facc15';
      ctx.fillRect(w / 2 - 5, 14, 4, 98);
      ctx.fillRect(w / 2 + 1, 14, 4, 98);
      ctx.fillRect(w / 2 - 5, 142, 4, 98);
      ctx.fillRect(w / 2 + 1, 142, 4, 98);
    },
    1,
    repeatY,
    true
  );
}

export function getCachedSidewalkTexture(repeatX = 16, repeatY = 16): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'sidewalk_paving',
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(55, 65, 81, 0.35)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        ctx.fillRect((i * 41) % w, (i * 89) % h, 2, 2);
      }
    },
    repeatX,
    repeatY,
    true
  );
}

export function getCachedGroundTexture(repeatX = 52, repeatY = 64): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'luanda_terrain',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#8b5a36'; // Laterite / urban Luanda soil base
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 650; i++) {
        const x = (i * 53) % w;
        const y = (i * 97) % h;
        const s = 2 + (i % 4);
        ctx.fillStyle =
          i % 5 === 0
            ? 'rgba(101, 133, 62, 0.25)'
            : i % 2 === 0
            ? 'rgba(194, 128, 72, 0.14)'
            : 'rgba(68, 42, 24, 0.16)';
        ctx.fillRect(x, y, s, s);
      }
    },
    repeatX,
    repeatY,
    true
  );
}

export function getCachedSandTexture(repeatX = 10, repeatY = 72): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'beach_sand_v2',
    256,
    256,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#967449'); // Areia molhada junto ao Atlântico (-x)
      grad.addColorStop(0.38, '#d4b27d'); // Zona de maré
      grad.addColorStop(1, '#f5dea9'); // Areia seca dourada da Ilha de Luanda (+x)
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Ondulações naturais de vento na areia
      ctx.strokeStyle = 'rgba(255, 248, 225, 0.16)';
      ctx.lineWidth = 2;
      for (let r = 8; r < h; r += 16) {
        ctx.beginPath();
        ctx.moveTo(0, r);
        ctx.bezierCurveTo(w * 0.35, r + 4, w * 0.65, r - 4, w, r);
        ctx.stroke();
      }

      for (let i = 0; i < 1200; i++) {
        const x = (i * 61) % w;
        const y = (i * 113) % h;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 250, 235, 0.18)' : 'rgba(110, 78, 40, 0.14)';
        ctx.fillRect(x, y, 2, 2);
      }
    },
    repeatX,
    repeatY,
    true
  );
}

export function getCachedGrassTexture(repeatX = 16, repeatY = 16): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'park_grass',
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#3f7d32';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 360; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(134, 239, 172, 0.14)' : 'rgba(20, 83, 45, 0.22)';
        ctx.fillRect((i * 29) % w, (i * 71) % h, 2, 4);
      }
    },
    repeatX,
    repeatY,
    true
  );
}

export function getCachedFarmGrassTexture(repeatX = 12, repeatY = 10): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'farm_pasture_grass',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 640; i++) {
        const x = (i * 47) % w;
        const y = (i * 83) % h;
        ctx.fillStyle =
          i % 4 === 0
            ? 'rgba(163, 230, 53, 0.22)'
            : i % 2 === 0
              ? 'rgba(74, 222, 128, 0.16)'
              : 'rgba(20, 83, 45, 0.26)';
        ctx.fillRect(x, y, 3, 5);
      }
      // Subtle mowed pasture stripes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      for (let x = 0; x < w; x += 32) {
        ctx.fillRect(x, 0, 16, h);
      }
    },
    repeatX,
    repeatY,
    true
  );
}

export function getCachedCobbleTexture(repeatX = 8, repeatY = 8): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'praca_cobble',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, w, h);
      const tile = 32;
      for (let row = 0; row < h / tile; row++) {
        for (let col = 0; col < w / tile; col++) {
          const checker = (row + col) % 2 === 0;
          ctx.fillStyle = checker ? '#e2e8f0' : '#94a3b8';
          ctx.fillRect(col * tile + 2, row * tile + 2, tile - 4, tile - 4);
          ctx.fillStyle = 'rgba(30, 41, 59, 0.14)';
          ctx.fillRect(col * tile + 2, row * tile + tile - 5, tile - 4, 3);
        }
      }
    },
    repeatX,
    repeatY,
    true
  );
}

export function getCachedBuildingFacadeTexture(
  paletteKey: string,
  baseColor: string,
  trimColor: string,
  glassColor: string,
  rows = 6,
  cols = 4
): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    `facade_${paletteKey}_${rows}x${cols}`,
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, w, h);

      // Horizontal cornice bands per floor
      const rowH = h / rows;
      const colW = w / cols;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rowH;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, y0, w, 3);
        ctx.fillStyle = trimColor;
        ctx.fillRect(0, y0 + rowH - 5, w, 3);

        for (let c = 0; c < cols; c++) {
          const x0 = c * colW;
          const padX = colW * 0.18;
          const padY = rowH * 0.2;
          const winW = colW - padX * 2;
          const winH = rowH - padY * 2;

          // Recessed window frame
          ctx.fillStyle = 'rgba(15, 23, 42, 0.48)';
          ctx.fillRect(x0 + padX - 2, y0 + padY - 2, winW + 4, winH + 4);

          // Glass body
          const lit = ((r * 7 + c * 13) % 5) === 0;
          ctx.fillStyle = lit ? '#fde68a' : glassColor;
          ctx.fillRect(x0 + padX, y0 + padY, winW, winH);

          // Window mullion + specular diagonal
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(x0 + padX + 2, y0 + padY + 2, Math.max(2, winW * 0.25), winH - 4);
          ctx.fillStyle = trimColor;
          ctx.fillRect(x0 + padX + winW / 2 - 1, y0 + padY, 2, winH);
        }
      }
    },
    1,
    1,
    true
  );
}

export function getCachedContactShadowTexture(): THREE.CanvasTexture {
  return makeCachedCanvasTexture(
    'contact_ao_radial',
    128,
    128,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
      g.addColorStop(0.65, 'rgba(0, 0, 0, 0.14)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    1,
    1,
    false
  );
}

export function disposeCachedEnvironmentTextures() {
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();
}

export interface OceanWaterSystem {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  update: (
    time: number,
    waveAmp: number,
    rainIntensity: number,
    skyColor: THREE.Color,
    sunColor: THREE.Color,
    sunDir: THREE.Vector3
  ) => void;
}

export function getWaveHeightAt(x: number, z: number, time: number, amp = 1.0): number {
  const shoreDist = Math.max(0, -49 - x);
  const shoreFade = Math.min(1, shoreDist / 16);
  const w1 = Math.sin(x * 0.11 + time * 1.65) * 0.14;
  const w2 = Math.cos(z * 0.085 - time * 1.35) * 0.11;
  const w3 = Math.sin((x + z) * 0.19 + time * 2.2) * 0.06;
  return -0.22 + (w1 + w2 + w3) * shoreFade * amp;
}

export function createOceanWaterSystem(isSoftwareGl: boolean): OceanWaterSystem {
  // Cobrimos x = -780 .. -42 (largura 738m, centro x = -411) e z = -740 .. +740
  const segX = isSoftwareGl ? 24 : 48;
  const segZ = isSoftwareGl ? 32 : 64;
  const geo = new THREE.PlaneGeometry(738, 1480, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uWaveAmp: { value: 1.0 },
    uRainIntensity: { value: 0.0 },
    uSkyColor: { value: new THREE.Color(0x38bdf8) },
    uSunColor: { value: new THREE.Color(0xfff7ed) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
  };

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0284c7),
    roughness: 0.14,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
    side: THREE.FrontSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWaveAmp = uniforms.uWaveAmp;
    shader.uniforms.uRainIntensity = uniforms.uRainIntensity;
    shader.uniforms.uSkyColor = uniforms.uSkyColor;
    shader.uniforms.uSunColor = uniforms.uSunColor;
    shader.uniforms.uSunDir = uniforms.uSunDir;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWaveAmp;
        varying vec3 vWorldPosOcean;
        varying float vWaveCrest;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wpTmp = modelMatrix * vec4(transformed, 1.0);
        float shoreDist = max(0.0, -49.0 - wpTmp.x);
        float shoreFade = clamp(shoreDist / 16.0, 0.0, 1.0);
        float w1 = sin(wpTmp.x * 0.11 + uTime * 1.65) * 0.14;
        float w2 = cos(wpTmp.z * 0.085 - uTime * 1.35) * 0.11;
        float w3 = sin((wpTmp.x + wpTmp.z) * 0.19 + uTime * 2.2) * 0.06;
        float waveY = (w1 + w2 + w3) * shoreFade * uWaveAmp;
        transformed.y += waveY;
        vWaveCrest = waveY;
        vWorldPosOcean = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uRainIntensity;
        uniform vec3 uSkyColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying vec3 vWorldPosOcean;
        varying float vWaveCrest;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Profundidade visual: azul turquesa raso junto à praia -> azul atlântico profundo mar adentro
        float depthT = clamp((-49.0 - vWorldPosOcean.x) / 115.0, 0.0, 1.0);
        vec3 shallowCol = vec3(0.06, 0.72, 0.84);
        vec3 midCol = vec3(0.02, 0.44, 0.68);
        vec3 deepCol = vec3(0.02, 0.16, 0.34);
        vec3 baseWater = depthT < 0.35
          ? mix(shallowCol, midCol, depthT / 0.35)
          : mix(midCol, deepCol, (depthT - 0.35) / 0.65);

        // Espuma animada nas margens (entre x=-58 e x=-46)
        float foamEdge = 1.0 - smoothstep(0.0, 9.5, abs(vWorldPosOcean.x + 50.0 + sin(vWorldPosOcean.z * 0.07 + uTime * 1.4) * 1.6));
        float foamNoise = 0.5 + 0.5 * sin(vWorldPosOcean.z * 0.35 + uTime * 2.8) * cos(vWorldPosOcean.x * 0.45 - uTime * 2.0);
        float shoreFoam = foamEdge * smoothstep(0.28, 0.85, foamNoise + 0.35);

        // Reflexo Fresnel do céu e brilho solar especular
        vec3 viewVec = normalize(cameraPosition - vWorldPosOcean);
        float fresnel = pow(1.0 - max(dot(viewVec, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
        vec3 rippleN = normalize(vec3(
          cos(vWorldPosOcean.x * 0.24 + uTime * 1.9) * 0.08,
          1.0,
          sin(vWorldPosOcean.z * 0.21 - uTime * 1.6) * 0.08
        ));
        vec3 reflDir = reflect(-uSunDir, rippleN);
        float sunSpec = pow(max(dot(viewVec, reflDir), 0.0), 42.0) * 0.75;

        // Ondulações de chuva na superfície
        float rainRing = 0.0;
        if (uRainIntensity > 0.05) {
          float rx = fract(vWorldPosOcean.x * 0.35) - 0.5;
          float rz = fract(vWorldPosOcean.z * 0.35) - 0.5;
          float rd = length(vec2(rx, rz));
          rainRing = smoothstep(0.06, 0.0, abs(rd - fract(uTime * 1.8 + sin(vWorldPosOcean.x + vWorldPosOcean.z)))) * 0.35 * uRainIntensity;
        }

        vec3 crestTint = vec3(0.12, 0.55, 0.72) * max(0.0, vWaveCrest * 2.2);
        vec3 finalWater = mix(baseWater + crestTint, uSkyColor * 0.85, fresnel * 0.52);
        finalWater += uSunColor * sunSpec;
        finalWater = mix(finalWater, vec3(0.92, 0.98, 1.0), clamp(shoreFoam * 0.88 + rainRing, 0.0, 0.95));

        diffuseColor.rgb = finalWater;
        diffuseColor.a = clamp(mix(0.62, 0.94, depthT) + shoreFoam * 0.3, 0.58, 0.96);`
      );
  };
  mat.customProgramCacheKey = () => 'luanda_ocean_water_v2';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'OceanoAtlantico';
  mesh.position.set(-411, -0.22, 0);
  mesh.receiveShadow = false;

  return {
    mesh,
    material: mat,
    update: (time, waveAmp, rainIntensity, skyColor, sunColor, sunDir) => {
      uniforms.uTime.value = time;
      uniforms.uWaveAmp.value = waveAmp;
      uniforms.uRainIntensity.value = rainIntensity;
      uniforms.uSkyColor.value.copy(skyColor);
      uniforms.uSunColor.value.copy(sunColor);
      uniforms.uSunDir.value.copy(sunDir).normalize();
    },
  };
}

export interface SkyEnvironment {
  group: THREE.Group;
  skyMesh: THREE.Mesh;
  sunDisc: THREE.Mesh;
  moonDisc: THREE.Mesh;
  stars: THREE.Points;
  cloudsGroup: THREE.Group;
  update: (
    delta: number,
    playerPos: THREE.Vector3,
    timeOfDay: number,
    weather: WeatherType,
    zenithColor: THREE.Color,
    horizonColor: THREE.Color,
    showClouds: boolean,
    weatherMeta?: { cloudCover?: number; lightningFlash?: number }
  ) => void;
  dispose: () => void;
}

export function createSkyEnvironment(): SkyEnvironment {
  const group = new THREE.Group();
  group.name = 'SkyEnvironment';

  const skyUniforms = {
    uZenithColor: { value: new THREE.Color(0x0284c7) },
    uHorizonColor: { value: new THREE.Color(0x7dd3fc) },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      varying vec3 vLocalPos;
      void main() {
        float h = clamp(vLocalPos.y * 1.35 + 0.05, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uZenithColor, pow(h, 0.65));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(920, 24, 16), skyMat);
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, fog: false });
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(24, 16, 12), sunDiscMat);
  group.add(sunDisc);

  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(16, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xe2e8f0, fog: false })
  );
  group.add(moonDisc);

  // Estrelas noturnas
  const starCount = 320;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.44;
    const r = 820;
    starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    starPositions[i * 3 + 1] = Math.cos(phi) * r;
    starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xf8fafc, size: 2.2, transparent: true, opacity: 0, fog: false });
  const stars = new THREE.Points(starsGeo, starsMat);
  group.add(stars);

  // Nuvens estilizadas dinâmicas conforme nebulosidade da API e clima
  const cloudsGroup = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, fog: true });
  const puffGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 24; i++) {
    const cluster = new THREE.Group();
    const angle = (i / 24) * Math.PI * 2;
    const dist = 145 + (i % 4) * 90;
    cluster.position.set(Math.cos(angle) * dist, 108 + (i % 3) * 18, Math.sin(angle) * dist);
    const puffs = 3 + (i % 2);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      m.scale.set(22 + p * 6, 7 + (p % 2) * 3, 14 + p * 4);
      m.position.set((p - 1) * 12, (p % 2) * 2.5, (p - 1) * 4);
      cluster.add(m);
    }
    cluster.userData.speed = 1.6 + (i % 5) * 0.55;
    cluster.userData.index = i;
    cloudsGroup.add(cluster);
  }
  group.add(cloudsGroup);

  const cloudTargetColor = new THREE.Color(0xffffff);

  return {
    group,
    skyMesh,
    sunDisc,
    moonDisc,
    stars,
    cloudsGroup,
    update: (delta, playerPos, timeOfDay, weather, zenithColor, horizonColor, showClouds, weatherMeta) => {
      group.position.set(playerPos.x, 0, playerPos.z);
      skyUniforms.uZenithColor.value.copy(zenithColor);
      skyUniforms.uHorizonColor.value.copy(horizonColor);

      const cloudCover = Math.max(
        0,
        Math.min(
          100,
          typeof weatherMeta?.cloudCover === 'number'
            ? weatherMeta.cloudCover
            : weather === 'chuva'
              ? 92
              : weather === 'nublado'
                ? 78
                : weather === 'cacimbo'
                  ? 55
                  : weather === 'calor_extremo'
                    ? 12
                    : 26
        )
      );
      const lightningFlash = weatherMeta?.lightningFlash || 0;

      const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
      const sx = Math.cos(sunAngle) * 650;
      const sy = Math.sin(sunAngle) * 650;
      sunDisc.position.set(sx, sy, 120);
      sunDisc.visible = sy > -40 && weather !== 'chuva' && cloudCover < 88;
      if (weather === 'calor_extremo') {
        sunDisc.scale.setScalar(1.38);
        sunDiscMat.color.setHex(0xfbbf24);
      } else if (weather === 'pordosol' || timeOfDay >= 17) {
        sunDisc.scale.setScalar(1.18);
        sunDiscMat.color.setHex(0xfb923c);
      } else {
        sunDisc.scale.setScalar(1.0);
        sunDiscMat.color.setHex(0xfef08a);
      }

      moonDisc.position.set(-sx, -sy, -120);
      moonDisc.visible = -sy > -30 && weather !== 'chuva';

      const isNight = weather === 'noite' || timeOfDay >= 19.2 || timeOfDay < 5.6;
      const starFade = Math.max(0, 1 - cloudCover / 80);
      starsMat.opacity = isNight && weather !== 'chuva' ? 0.85 * starFade : 0;
      stars.visible = starsMat.opacity > 0.02;

      cloudsGroup.visible = showClouds;
      if (showClouds) {
        if (weather === 'chuva') {
          cloudTargetColor.setHex(lightningFlash > 0.1 ? 0xcbd5e1 : 0x475569);
        } else if (weather === 'nublado') {
          cloudTargetColor.setHex(isNight ? 0x334155 : 0x94a3b8);
        } else if (weather === 'pordosol' || (timeOfDay >= 17 && timeOfDay < 19.4)) {
          cloudTargetColor.setHex(0xfdba74);
        } else if (weather === 'calor_extremo') {
          cloudTargetColor.setHex(0xfef3c7);
        } else if (isNight) {
          cloudTargetColor.setHex(0x334155);
        } else {
          cloudTargetColor.setHex(0xffffff);
        }
        cloudMat.color.copy(cloudTargetColor);

        const baseOpacity =
          weather === 'chuva'
            ? 0.92
            : weather === 'nublado'
              ? 0.86
              : weather === 'cacimbo'
                ? 0.52
                : weather === 'calor_extremo'
                  ? 0.36
                  : 0.48 + (cloudCover / 100) * 0.4;
        cloudMat.opacity = Math.min(0.95, baseOpacity);

        const cloudScale =
          weather === 'chuva' || weather === 'nublado'
            ? 1.28
            : 0.72 + (cloudCover / 100) * 0.55;
        const speedMult = weather === 'chuva' ? 2.4 : weather === 'nublado' ? 1.45 : 1.0;

        for (let i = 0; i < cloudsGroup.children.length; i++) {
          const cl = cloudsGroup.children[i];
          const activeRatio = (i + 1) / cloudsGroup.children.length;
          cl.visible =
            weather === 'chuva' ||
            weather === 'nublado' ||
            activeRatio <= Math.max(0.28, cloudCover / 100);
          cl.scale.setScalar(cloudScale);
          cl.position.z += (cl.userData.speed || 2) * speedMult * delta;
          if (cl.position.z > 480) cl.position.z = -480;
        }
      }
    },
    dispose: () => {
      skyMesh.geometry.dispose();
      skyMat.dispose();
      sunDisc.geometry.dispose();
      (sunDisc.material as THREE.Material).dispose();
      moonDisc.geometry.dispose();
      (moonDisc.material as THREE.Material).dispose();
      starsGeo.dispose();
      starsMat.dispose();
      puffGeo.dispose();
      cloudMat.dispose();
    },
  };
}
