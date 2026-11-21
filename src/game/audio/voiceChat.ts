/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoiceChunkPayload } from '../multiplayer/multiplayerManager';

const TARGET_SAMPLE_RATE = 16000;

function floatToInt16Base64(input: Float32Array, sourceRate: number): string {
  const ratio = Math.max(1, sourceRate / TARGET_SAMPLE_RATE);
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIdx = Math.min(input.length - 1, Math.floor(i * ratio));
    const sample = Math.max(-1, Math.min(1, input[srcIdx]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function int16Base64ToFloat(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm = new Int16Array(bytes.buffer);
  const floats = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    floats[i] = pcm[i] / 0x8000;
  }
  return floats;
}

export class VoiceChatManager {
  private stream: MediaStream | null = null;
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sampleAccum: number[] = [];
  private isTalking = false;
  private muted = false;
  private volume = 1.0;
  private nextPlayTimeBySender = new Map<string, number>();

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  private getPlaybackContext(): AudioContext | null {
    if (!this.playbackCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.playbackCtx = new AudioCtx();
      }
    }
    if (this.playbackCtx && this.playbackCtx.state === 'suspended') {
      void this.playbackCtx.resume().catch(() => {});
    }
    return this.playbackCtx;
  }

  public getTalking(): boolean {
    return this.isTalking;
  }

  public async startTalking(
    onChunk: (base64: string, mimeType: string) => void
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.isTalking) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, error: 'Microfone não suportado neste navegador.' };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        this.stopTalking();
        return { ok: false, error: 'AudioContext indisponível.' };
      }

      this.captureCtx = new AudioCtx();
      if (this.captureCtx.state === 'suspended') {
        await this.captureCtx.resume();
      }

      this.sourceNode = this.captureCtx.createMediaStreamSource(this.stream);
      this.processorNode = this.captureCtx.createScriptProcessor(4096, 1, 1);
      this.sampleAccum = [];
      const flushThreshold = Math.floor(this.captureCtx.sampleRate * 0.28);

      this.processorNode.onaudioprocess = (ev) => {
        if (!this.isTalking) return;
        const input = ev.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) {
          this.sampleAccum.push(input[i]);
        }
        if (this.sampleAccum.length >= flushThreshold) {
          const chunk = new Float32Array(this.sampleAccum);
          this.sampleAccum = [];
          const encoded = floatToInt16Base64(chunk, this.captureCtx?.sampleRate || 44100);
          onChunk(encoded, `audio/pcm;rate=${TARGET_SAMPLE_RATE}`);
        }
      };

      const silentGain = this.captureCtx.createGain();
      silentGain.gain.value = 0;
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(silentGain);
      silentGain.connect(this.captureCtx.destination);

      this.isTalking = true;
      return { ok: true };
    } catch (err: unknown) {
      this.stopTalking();
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de microfone recusada no navegador.'
          : 'Não foi possível ligar o microfone.';
      return { ok: false, error: msg };
    }
  }

  public stopTalking() {
    this.isTalking = false;
    this.sampleAccum = [];
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.captureCtx) {
      try {
        void this.captureCtx.close();
      } catch {}
      this.captureCtx = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.stream = null;
    }
  }

  public playRemoteChunk(
    payload: VoiceChunkPayload,
    listenerPos: { x: number; y: number; z: number }
  ) {
    if (!payload.data || this.muted || this.volume <= 0.01) return;
    let vol = 0.85 * this.volume;
    if (payload.channel !== 'radio' && payload.position) {
      const dist = Math.hypot(
        payload.position.x - listenerPos.x,
        payload.position.y - listenerPos.y,
        payload.position.z - listenerPos.z
      );
      if (dist > 55) return;
      vol = Math.max(0.08, 1 - dist / 55) * 0.9 * this.volume;
    }

    const ctx = this.getPlaybackContext();
    if (!ctx || ctx.state !== 'running') return;

    try {
      const floats = int16Base64ToFloat(payload.data);
      if (floats.length === 0) return;

      const buffer = ctx.createBuffer(1, floats.length, TARGET_SAMPLE_RATE);
      buffer.getChannelData(0).set(floats);

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (this.nextPlayTimeBySender.size > 40) {
        for (const [k, t] of this.nextPlayTimeBySender.entries()) {
          if (t < now - 5) this.nextPlayTimeBySender.delete(k);
        }
      }
      const scheduled = Math.max(now, this.nextPlayTimeBySender.get(payload.senderId) || now);
      src.start(scheduled);
      this.nextPlayTimeBySender.set(payload.senderId, scheduled + buffer.duration);
    } catch {}
  }

  public destroy() {
    this.stopTalking();
    if (this.playbackCtx) {
      try {
        void this.playbackCtx.close();
      } catch {}
      this.playbackCtx = null;
    }
  }
}
