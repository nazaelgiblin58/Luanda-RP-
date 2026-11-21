/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DJ_TRACKS_CATALOG } from '../data/catalog';
import { GlobalDjState, VehicleCategory } from '../types';

export interface PersonalMusicSelection {
  trackId: string;
  title: string;
  artist: string;
  genre: string;
  paused: boolean;
}

export interface AudioPlaybackSnapshot {
  mode: 'global' | 'personal';
  djMuted: boolean;
  djVolume: number;
  djUnlocked: boolean;
  personalTrack: PersonalMusicSelection | null;
  globalTrackActive: boolean;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private djGain: GainNode | null = null;
  private isRadioPlaying = false;
  private radioInterval: number | null = null;
  private radioStep = 0;
  private djInterval: number | null = null;
  private activeDjTrackId: string | null = null;
  private djStartedAt = 0;
  private djEndsAt = 0;
  private djServerClockOffsetMs = 0;
  private djLastStepPlayed = -1;
  private djVol = 0.42;
  private djMuted = false;
  private djUnlocked = false;
  private volume = 0.5;
  private musicVol = 0.25;
  private muted = false;
  private audioMode: 'global' | 'personal' = 'global';
  private lastGlobalDjState: GlobalDjState | null = null;
  private personalTrack: PersonalMusicSelection | null = null;
  private personalInterval: number | null = null;
  private personalStep = 0;
  private audioListeners = new Set<(snap: AudioPlaybackSnapshot) => void>();

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVol;
        this.musicGain.connect(this.masterGain);

        this.djGain = this.ctx.createGain();
        this.djGain.gain.value = this.djMuted ? 0 : this.djVol;
        this.djGain.connect(this.masterGain);
      }
    }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.djUnlocked = this.ctx?.state === 'running';
        }).catch(() => {});
      } else if (this.ctx.state === 'running') {
        this.djUnlocked = true;
      }
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
  }

  public setMusicVolume(vol: number) {
    this.musicVol = Math.max(0, Math.min(1, vol));
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVol;
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
  }

  public playFootstep(isRunning: boolean) {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isRunning ? 320 : 240, this.ctx.currentTime);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isRunning ? 90 : 70, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(isRunning ? 0.12 : 0.07, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.09);
    } catch {}
  }

  public playJump() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.16);
    } catch {}
  }

  public playLand() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.13);
    } catch {}
  }

  public playPunch() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.13);
    } catch {}
  }

  public playCrash() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.25);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.27);
    } catch {}
  }

  public playLock(locked: boolean) {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      const playBeep = (delay: number, freq: number) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        gain.gain.setValueAtTime(0.14, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.07);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + delay);
        osc.stop(t + delay + 0.08);
      };
      playBeep(0, locked ? 780 : 620);
      if (!locked) playBeep(0.09, 920);
    } catch {}
  }

  private sirenLoopInterval: number | null = null;
  private sirenLoopMode: 'pna' | 'inema' | null = null;
  private sirenStep = 0;

  public startSirenLoop(mode: 'pna' | 'inema' = 'pna') {
    if (this.sirenLoopMode === mode && this.sirenLoopInterval !== null) return;
    this.stopSirenLoop();
    this.initContext();
    this.sirenLoopMode = mode;
    this.sirenStep = 0;

    const triggerTone = () => {
      if (this.muted || !this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        if (mode === 'pna') {
          osc.type = 'sawtooth';
          const high = this.sirenStep % 2 === 0;
          osc.frequency.setValueAtTime(high ? 940 : 680, t);
          osc.frequency.linearRampToValueAtTime(high ? 720 : 920, t + 0.34);
          gain.gain.setValueAtTime(0.055, t);
          gain.gain.exponentialRampToValueAtTime(0.002, t + 0.36);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(t);
          osc.stop(t + 0.37);
        } else {
          // Ambulância INEMA: bitonal rápido agudo-grave
          osc.type = 'triangle';
          const f = this.sirenStep % 2 === 0 ? 880 : 660;
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.075, t);
          gain.gain.exponentialRampToValueAtTime(0.002, t + 0.4);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(t);
          osc.stop(t + 0.42);
        }
        this.sirenStep += 1;
      } catch {}
    };

    triggerTone();
    this.sirenLoopInterval = window.setInterval(triggerTone, mode === 'pna' ? 380 : 440);
  }

  public stopSirenLoop() {
    if (this.sirenLoopInterval !== null) {
      clearInterval(this.sirenLoopInterval);
      this.sirenLoopInterval = null;
    }
    this.sirenLoopMode = null;
  }

  public isSirenLoopActive(): boolean {
    return this.sirenLoopInterval !== null;
  }

  public playSiren() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.linearRampToValueAtTime(980, t + 0.25);
      osc.frequency.linearRampToValueAtTime(650, t + 0.5);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.53);
    } catch {}
  }

  public playPhoneRing() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      [0, 0.14].forEach((d, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(idx === 0 ? 880 : 1175, t + d);
        gain.gain.setValueAtTime(0.1, t + d);
        gain.gain.exponentialRampToValueAtTime(0.001, t + d + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + d);
        osc.stop(t + d + 0.11);
      });
    } catch {}
  }

  public playCandongueiroHorn() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const playChirp = (delayMs: number, freq1: number, freq2: number, duration: number) => {
        setTimeout(() => {
          if (!this.ctx || !this.masterGain) return;
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc1.type = 'sawtooth';
          osc2.type = 'triangle';
          osc1.frequency.setValueAtTime(freq1, this.ctx.currentTime);
          osc2.frequency.setValueAtTime(freq2, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.masterGain);
          osc1.start();
          osc2.start();
          osc1.stop(this.ctx.currentTime + duration);
          osc2.stop(this.ctx.currentTime + duration);
        }, delayMs);
      };
      playChirp(0, 440, 554, 0.12);
      playChirp(160, 440, 554, 0.16);
    } catch {}
  }

  public playAtmCash() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 + i * 150, now + i * 0.08);
        gain.gain.setValueAtTime(0.1, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.06);
      }
    } catch {}
  }

  public playCashRegister() {
    this.playAtmCash();
  }

  public playInteract() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.11);
    } catch {}
  }

  public toggleRadio(): boolean {
    this.initContext();
    if (this.isRadioPlaying) {
      this.stopRadio();
      return false;
    } else {
      this.startRadio();
      return true;
    }
  }

  public getRadioPlaying(): boolean {
    return this.isRadioPlaying;
  }

  private startRadio() {
    if (!this.ctx || !this.musicGain) return;
    this.isRadioPlaying = true;
    this.radioStep = 0;
    const stepTime = 158;
    this.radioInterval = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || !this.isRadioPlaying || this.muted) return;
      const t = this.ctx.currentTime;
      const s = this.radioStep % 16;
      if (s === 0 || s === 6 || s === 8 || s === 14) {
        const kick = this.ctx.createOscillator();
        const kgain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(140, t);
        kick.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        kgain.gain.setValueAtTime(0.25, t);
        kgain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        kick.connect(kgain);
        kgain.connect(this.musicGain);
        kick.start(t);
        kick.stop(t + 0.14);
      }
      if (s % 2 === 0 || s % 3 === 0) {
        const shkOsc = this.ctx.createOscillator();
        const shkGain = this.ctx.createGain();
        shkOsc.type = 'triangle';
        shkOsc.frequency.setValueAtTime(800 + s * 30, t);
        shkGain.gain.setValueAtTime(0.03, t);
        shkGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        shkOsc.connect(shkGain);
        shkGain.connect(this.musicGain);
        shkOsc.start(t);
        shkOsc.stop(t + 0.05);
      }
      const bassNotes = [110, 110, 130.8, 146.8, 164.8, 146.8, 130.8, 110];
      if (s === 2 || s === 4 || s === 10 || s === 12) {
        const bass = this.ctx.createOscillator();
        const bgain = this.ctx.createGain();
        const bfilter = this.ctx.createBiquadFilter();
        bfilter.type = 'lowpass';
        bfilter.frequency.value = 350;
        bass.type = 'sawtooth';
        const note = bassNotes[Math.floor(this.radioStep / 4) % bassNotes.length];
        bass.frequency.setValueAtTime(note, t);
        bgain.gain.setValueAtTime(0.08, t);
        bgain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        bass.connect(bfilter);
        bfilter.connect(bgain);
        bgain.connect(this.musicGain);
        bass.start(t);
        bass.stop(t + 0.23);
      }
      this.radioStep++;
    }, stepTime);
  }

  private rainNode: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;

  public startRain() {
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain || this.rainNode) return;
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      }
      this.rainNode = this.ctx.createBufferSource();
      this.rainNode.buffer = buffer;
      this.rainNode.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.rainGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 1.2);
      this.rainNode.connect(filter);
      filter.connect(this.rainGain);
      this.rainGain.connect(this.masterGain);
      this.rainNode.start();
    } catch {}
  }

  public stopRain() {
    if (this.rainGain && this.ctx) {
      try {
        this.rainGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
        setTimeout(() => {
          if (this.rainNode) {
            this.rainNode.stop();
            this.rainNode.disconnect();
            this.rainNode = null;
          }
          this.rainGain = null;
        }, 700);
      } catch {
        this.rainNode = null;
        this.rainGain = null;
      }
    }
  }

  public playEngineRev(pitchMultiplier = 1.0) {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450 * pitchMultiplier, this.ctx.currentTime);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65 * pitchMultiplier, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(140 * pitchMultiplier, this.ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.14, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.36);
    } catch {}
  }

  public playGunshot(weaponId = 'pistola_9mm') {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;

      // White noise crack
      const len = Math.floor(this.ctx.sampleRate * (weaponId === 'espingarda_12' ? 0.24 : 0.14));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.26));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = weaponId === 'espingarda_12' ? 680 : weaponId === 'ak47_tatica' ? 1150 : 1450;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(weaponId === 'espingarda_12' ? 0.55 : 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (weaponId === 'espingarda_12' ? 0.22 : 0.13));

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);

      // Low punch thump
      const osc = this.ctx.createOscillator();
      const ogain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(weaponId === 'espingarda_12' ? 130 : 190, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
      ogain.gain.setValueAtTime(0.38, now);
      ogain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(ogain);
      ogain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {}
  }

  public playReload() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      [0, 0.22].forEach((offset, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(idx === 0 ? 480 : 720, now + offset);
        osc.frequency.exponentialRampToValueAtTime(220, now + offset + 0.06);
        gain.gain.setValueAtTime(0.14, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + offset);
        osc.stop(now + offset + 0.08);
      });
    } catch {}
  }

  public playEmptyClick() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1100, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  public playHitMarker() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {}
  }

  private oceanNode: AudioBufferSourceNode | null = null;
  private oceanGain: GainNode | null = null;
  private oceanFilter: BiquadFilterNode | null = null;

  public startOceanAmbience() {
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain || this.oceanNode) return;
      const bufferSize = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        const surfEnv = 0.55 + 0.45 * Math.sin((i / this.ctx.sampleRate) * Math.PI * 0.45);
        lastOut = (lastOut + 0.015 * white) / 1.015;
        data[i] = lastOut * 2.8 * surfEnv;
      }
      this.oceanNode = this.ctx.createBufferSource();
      this.oceanNode.buffer = buffer;
      this.oceanNode.loop = true;

      this.oceanFilter = this.ctx.createBiquadFilter();
      this.oceanFilter.type = 'lowpass';
      this.oceanFilter.frequency.value = 480;

      this.oceanGain = this.ctx.createGain();
      this.oceanGain.gain.value = 0.0001;

      this.oceanNode.connect(this.oceanFilter);
      this.oceanFilter.connect(this.oceanGain);
      this.oceanGain.connect(this.masterGain);
      this.oceanNode.start();
    } catch {}
  }

  public setOceanProximity(factor: number) {
    const clamped = Math.max(0, Math.min(1, factor));
    if (clamped > 0.04 && !this.oceanNode && !this.muted && this.ctx) {
      this.startOceanAmbience();
    }
    if (this.oceanGain && this.ctx) {
      try {
        const target = this.muted ? 0.0001 : 0.001 + clamped * 0.14;
        this.oceanGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
        if (this.oceanFilter) {
          this.oceanFilter.frequency.setTargetAtTime(340 + clamped * 520, this.ctx.currentTime, 0.25);
        }
      } catch {}
    }
  }

  public stopOceanAmbience() {
    if (this.oceanNode) {
      try {
        this.oceanNode.stop();
        this.oceanNode.disconnect();
      } catch {}
      this.oceanNode = null;
      this.oceanGain = null;
      this.oceanFilter = null;
    }
  }

  public playWaterSplash(entering = true) {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * 0.36);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(entering ? 760 : 540, now);
      filter.frequency.exponentialRampToValueAtTime(280, now + 0.34);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
    } catch {}
  }

  public playBlinkerTick(on: boolean) {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(on ? 920 : 680, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch {}
  }

  public playDoorOpen() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {}
  }

  public async unlockDjAudio(): Promise<boolean> {
    try {
      this.initContext();
      if (this.ctx && this.ctx.state !== 'running') {
        await this.ctx.resume();
      }
      this.djUnlocked = this.ctx?.state === 'running';
      return this.djUnlocked;
    } catch {
      return false;
    }
  }

  public isDjAudioUnlocked(): boolean {
    return this.djUnlocked && this.ctx?.state === 'running';
  }

  public setDjVolume(vol: number) {
    this.djVol = Math.max(0, Math.min(1, vol));
    if (this.djGain) {
      this.djGain.gain.value = this.djMuted ? 0 : this.djVol;
    }
    this.emitAudioSnapshot();
  }

  public setDjMuted(muted: boolean) {
    this.djMuted = muted;
    if (this.djGain) {
      this.djGain.gain.value = this.djMuted ? 0 : this.djVol;
    }
    this.emitAudioSnapshot();
  }

  public getDjMuted(): boolean {
    return this.djMuted;
  }

  public getDjVolume(): number {
    return this.djVol;
  }

  public getAudioMode(): 'global' | 'personal' {
    return this.audioMode;
  }

  public getPersonalTrack(): PersonalMusicSelection | null {
    return this.personalTrack;
  }

  public getAudioSnapshot(): AudioPlaybackSnapshot {
    const syncedNow = Date.now() + this.djServerClockOffsetMs;
    const globalTrackActive = Boolean(
      this.lastGlobalDjState?.currentTrack && this.lastGlobalDjState.currentTrack.endsAt > syncedNow
    );
    return {
      mode: this.audioMode,
      djMuted: this.djMuted,
      djVolume: this.djVol,
      djUnlocked: this.isDjAudioUnlocked(),
      personalTrack: this.personalTrack ? { ...this.personalTrack } : null,
      globalTrackActive,
    };
  }

  public subscribeAudioSnapshot(cb: (snap: AudioPlaybackSnapshot) => void): () => void {
    this.audioListeners.add(cb);
    cb(this.getAudioSnapshot());
    return () => {
      this.audioListeners.delete(cb);
    };
  }

  private emitAudioSnapshot() {
    const snap = this.getAudioSnapshot();
    for (const cb of this.audioListeners) {
      try {
        cb(snap);
      } catch {}
    }
  }

  public async playPaidPersonalTrack(trackId: string) {
    await this.unlockDjAudio();
    const cat = DJ_TRACKS_CATALOG.find((t) => t.id === trackId) || DJ_TRACKS_CATALOG[0];
    this.audioMode = 'personal';
    this.stopGlobalSynthOnly();
    this.stopPersonalSynthOnly();

    this.personalTrack = {
      trackId: cat.id,
      title: cat.title,
      artist: cat.artist,
      genre: cat.genre,
      paused: false,
    };

    const stepMs = (60 / Math.max(85, cat.bpm) / 4) * 1000;
    this.personalStep = 0;
    this.personalInterval = window.setInterval(() => {
      if (this.audioMode !== 'personal' || !this.personalTrack || this.personalTrack.paused) return;
      if (this.muted || this.djMuted) return;
      if (!this.ctx || this.ctx.state !== 'running' || !this.djGain) return;
      this.triggerSynthStep(cat, this.personalStep);
      this.personalStep++;
    }, stepMs);

    this.emitAudioSnapshot();
  }

  public togglePersonalPause(): boolean {
    if (!this.personalTrack) return false;
    this.personalTrack = { ...this.personalTrack, paused: !this.personalTrack.paused };
    this.emitAudioSnapshot();
    return !this.personalTrack.paused;
  }

  public switchToGlobalDjMode() {
    this.audioMode = 'global';
    this.stopPersonalSynthOnly();
    this.personalTrack = null;
    if (this.lastGlobalDjState) {
      this.syncGlobalDjTrack(this.lastGlobalDjState);
    }
    this.emitAudioSnapshot();
  }

  private stopPersonalSynthOnly() {
    if (this.personalInterval !== null) {
      clearInterval(this.personalInterval);
      this.personalInterval = null;
    }
  }

  private stopGlobalSynthOnly() {
    if (this.djInterval !== null) {
      clearInterval(this.djInterval);
      this.djInterval = null;
    }
    this.activeDjTrackId = null;
    this.djStartedAt = 0;
    this.djEndsAt = 0;
  }

  private triggerSynthStep(catalogTrack: (typeof DJ_TRACKS_CATALOG)[number], stepIdx: number) {
    if (!this.ctx || !this.djGain) return;
    const barStep = stepIdx % 16;
    const t = this.ctx.currentTime;

    if (barStep === 0 || barStep === 4 || barStep === 8 || barStep === 12 || (catalogTrack.bpm >= 130 && barStep === 14)) {
      const kick = this.ctx.createOscillator();
      const kg = this.ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(145, t);
      kick.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      kg.gain.setValueAtTime(0.32, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      kick.connect(kg);
      kg.connect(this.djGain);
      kick.start(t);
      kick.stop(t + 0.15);
    }

    if (barStep === 4 || barStep === 12 || barStep === 6) {
      const clap = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      clap.type = 'triangle';
      clap.frequency.setValueAtTime(barStep === 6 ? 420 : 320, t);
      clap.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      cg.gain.setValueAtTime(barStep === 6 ? 0.09 : 0.14, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      clap.connect(cg);
      cg.connect(this.djGain);
      clap.start(t);
      clap.stop(t + 0.1);
    }

    const bassNote = catalogTrack.bassPattern[stepIdx % catalogTrack.bassPattern.length];
    const isAmapiano = catalogTrack.genre === 'Amapiano';
    if (bassNote > 0 && (barStep % 2 === 0 || barStep === 7 || (isAmapiano && barStep === 11))) {
      const bass = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      const bf = this.ctx.createBiquadFilter();
      bf.type = 'lowpass';
      bf.frequency.value = isAmapiano ? 280 : 390;
      bass.type = isAmapiano ? 'triangle' : 'sawtooth';
      bass.frequency.setValueAtTime(isAmapiano ? bassNote * 1.15 : bassNote, t);
      if (isAmapiano) {
        bass.frequency.exponentialRampToValueAtTime(Math.max(42, bassNote * 0.72), t + 0.14);
      }
      bg.gain.setValueAtTime(isAmapiano ? 0.22 : 0.14, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      bass.connect(bf);
      bf.connect(bg);
      bg.connect(this.djGain);
      bass.start(t);
      bass.stop(t + 0.19);
    }

    const leadNote = catalogTrack.leadPattern[stepIdx % catalogTrack.leadPattern.length];
    if (leadNote > 0 && (barStep === 0 || barStep === 3 || barStep === 8 || barStep === 11)) {
      const lead = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lead.type = catalogTrack.bpm >= 125 ? 'square' : 'sine';
      lead.frequency.setValueAtTime(leadNote, t);
      lg.gain.setValueAtTime(0.075, t);
      lg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      lead.connect(lg);
      lg.connect(this.djGain);
      lead.start(t);
      lead.stop(t + 0.23);
    }
  }

  public syncGlobalDjTrack(djState: GlobalDjState | null | undefined, serverNow?: number) {
    if (typeof serverNow === 'number' && serverNow > 0) {
      this.djServerClockOffsetMs = serverNow - Date.now();
    }
    this.lastGlobalDjState = djState || null;
    const track = djState?.currentTrack || null;
    const syncedNow = Date.now() + this.djServerClockOffsetMs;

    // Se o jogador escolheu ouvir música pessoal, não sobrepor áudio do DJ Global
    if (this.audioMode === 'personal') {
      this.stopGlobalSynthOnly();
      this.emitAudioSnapshot();
      return;
    }

    if (!track || syncedNow >= track.endsAt) {
      this.stopGlobalDjTrack();
      return;
    }

    if (this.activeDjTrackId === track.trackId && this.djStartedAt === track.startedAt && this.djInterval !== null) {
      return;
    }

    this.stopGlobalSynthOnly();
    this.activeDjTrackId = track.trackId;
    this.djStartedAt = track.startedAt;
    this.djEndsAt = track.endsAt;
    this.djLastStepPlayed = -1;

    const catalogTrack = DJ_TRACKS_CATALOG.find((t) => t.id === track.trackId) || DJ_TRACKS_CATALOG[0];
    const stepMs = (60 / Math.max(85, catalogTrack.bpm) / 4) * 1000;

    this.djInterval = window.setInterval(() => {
      const nowServer = Date.now() + this.djServerClockOffsetMs;
      if (nowServer >= this.djEndsAt) {
        this.stopGlobalDjTrack();
        return;
      }
      if (this.audioMode !== 'global' || this.muted || this.djMuted) return;
      if (!this.ctx || this.ctx.state !== 'running' || !this.djGain) return;

      const elapsedMs = Math.max(0, nowServer - this.djStartedAt);
      const stepIdx = Math.floor(elapsedMs / stepMs);
      if (stepIdx <= this.djLastStepPlayed) return;
      this.djLastStepPlayed = stepIdx;
      this.triggerSynthStep(catalogTrack, stepIdx);
    }, 35);
    this.emitAudioSnapshot();
  }

  public stopGlobalDjTrack() {
    this.stopGlobalSynthOnly();
    this.emitAudioSnapshot();
  }

  public playBedSleepSound() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      [261.6, 329.6, 392.0].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        g.gain.setValueAtTime(0.08, now + idx * 0.14);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
        osc.connect(g);
        g.connect(this.masterGain!);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.38);
      });
    } catch {}
  }

  private engineOscMain: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private tireNoiseNode: AudioBufferSourceNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;
  private lastEngineGear = 1;
  private lastEngineCategory: string = '';

  private getVehicleAcousticProfile(category: VehicleCategory | 'default') {
    switch (category) {
      case 'moto':
        return { baseHz: 62, spanHz: 176, mainType: 'sawtooth' as OscillatorType, subType: 'square' as OscillatorType, filterBase: 260, filterSpan: 1120, gainScale: 0.92 };
      case 'supercar':
        return { baseHz: 52, spanHz: 188, mainType: 'sawtooth' as OscillatorType, subType: 'sawtooth' as OscillatorType, filterBase: 240, filterSpan: 1280, gainScale: 1.05 };
      case 'sport':
        return { baseHz: 46, spanHz: 162, mainType: 'sawtooth' as OscillatorType, subType: 'triangle' as OscillatorType, filterBase: 220, filterSpan: 1100, gainScale: 1.0 };
      case 'muscle':
        return { baseHz: 32, spanHz: 118, mainType: 'sawtooth' as OscillatorType, subType: 'square' as OscillatorType, filterBase: 160, filterSpan: 860, gainScale: 1.08 };
      case 'truck':
      case 'bus':
      case 'military':
        return { baseHz: 26, spanHz: 74, mainType: 'sawtooth' as OscillatorType, subType: 'triangle' as OscillatorType, filterBase: 130, filterSpan: 510, gainScale: 1.04 };
      case 'pickup':
      case 'suv':
      case 'ambulance':
        return { baseHz: 34, spanHz: 96, mainType: 'sawtooth' as OscillatorType, subType: 'triangle' as OscillatorType, filterBase: 165, filterSpan: 670, gainScale: 0.96 };
      case 'candongueiro':
        return { baseHz: 35, spanHz: 94, mainType: 'sawtooth' as OscillatorType, subType: 'triangle' as OscillatorType, filterBase: 175, filterSpan: 640, gainScale: 0.95 };
      default:
        return { baseHz: 38, spanHz: 114, mainType: 'sawtooth' as OscillatorType, subType: 'triangle' as OscillatorType, filterBase: 185, filterSpan: 760, gainScale: 0.92 };
    }
  }

  public playVehicleIgnition(category: VehicleCategory = 'taxi') {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const prof = this.getVehicleAcousticProfile(category);

      // Starter crank pulses
      const pulses = category === 'moto' || category === 'supercar' ? 2 : 3;
      for (let i = 0; i < pulses; i++) {
        const t = now + i * 0.085;
        const starter = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        starter.type = 'triangle';
        starter.frequency.setValueAtTime(category === 'moto' ? 240 : 145, t);
        starter.frequency.linearRampToValueAtTime(category === 'moto' ? 310 : 185, t + 0.06);
        sg.gain.setValueAtTime(0.08, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
        starter.connect(sg);
        sg.connect(this.masterGain);
        starter.start(t);
        starter.stop(t + 0.08);
      }

      // Catch bark
      const catchAt = now + pulses * 0.085;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = prof.mainType;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(prof.filterBase * 1.4, catchAt);
      filter.frequency.exponentialRampToValueAtTime(prof.filterBase + prof.filterSpan * 0.55, catchAt + 0.14);
      filter.frequency.exponentialRampToValueAtTime(prof.filterBase, catchAt + 0.42);
      osc.frequency.setValueAtTime(prof.baseHz * 1.4, catchAt);
      osc.frequency.exponentialRampToValueAtTime(prof.baseHz + prof.spanHz * 0.48, catchAt + 0.12);
      osc.frequency.exponentialRampToValueAtTime(prof.baseHz * 1.1, catchAt + 0.42);
      gain.gain.setValueAtTime(0.001, catchAt);
      gain.gain.linearRampToValueAtTime(0.14 * prof.gainScale, catchAt + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, catchAt + 0.45);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(catchAt);
      osc.stop(catchAt + 0.46);
    } catch {}
  }

  public updateContinuousVehicleAudio(
    active: boolean,
    speedKmh: number,
    rpmNormalized: number,
    gear: number,
    throttle: boolean,
    braking: boolean,
    driftIntensity: number,
    categoryOrMoto: VehicleCategory | boolean = false,
    inCabin = false,
    spatialAttenuation = 1
  ) {
    if (!active || this.muted || spatialAttenuation <= 0.02) {
      this.stopContinuousVehicleAudio();
      return;
    }
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const category: VehicleCategory | 'default' =
        typeof categoryOrMoto === 'boolean' ? (categoryOrMoto ? 'moto' : 'default') : categoryOrMoto;
      const prof = this.getVehicleAcousticProfile(category);

      if (!this.engineOscMain) {
        this.engineOscMain = this.ctx.createOscillator();
        this.engineOscSub = this.ctx.createOscillator();
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineGain = this.ctx.createGain();

        this.engineOscMain.type = prof.mainType;
        this.engineOscSub.type = prof.subType;
        this.lastEngineCategory = category;
        this.engineFilter.type = 'lowpass';
        this.engineFilter.Q.value = 2.4;
        this.engineGain.gain.value = 0.001;

        this.engineOscMain.connect(this.engineFilter);
        this.engineOscSub.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);

        this.engineOscMain.start();
        this.engineOscSub.start();

        // Camada contínua de chiadeira de pneus para derrapagem/travagem forte
        const len = Math.floor(this.ctx.sampleRate * 1.5);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          d[i] = Math.random() * 2 - 1;
        }
        this.tireNoiseNode = this.ctx.createBufferSource();
        this.tireNoiseNode.buffer = buf;
        this.tireNoiseNode.loop = true;
        this.tireFilter = this.ctx.createBiquadFilter();
        this.tireFilter.type = 'bandpass';
        this.tireFilter.frequency.value = 1450;
        this.tireFilter.Q.value = 3.2;
        this.tireGain = this.ctx.createGain();
        this.tireGain.gain.value = 0.0001;

        this.tireNoiseNode.connect(this.tireFilter);
        this.tireFilter.connect(this.tireGain);
        this.tireGain.connect(this.masterGain);
        this.tireNoiseNode.start();
      } else if (this.lastEngineCategory !== category) {
        this.engineOscMain.type = prof.mainType;
        if (this.engineOscSub) this.engineOscSub.type = prof.subType;
        this.lastEngineCategory = category;
      }

      const rpm = Math.max(0.08, Math.min(1, rpmNormalized));
      const targetFreq = prof.baseHz + rpm * prof.spanHz;
      const cabinFilterMult = inCabin ? 0.58 : 1.0;
      const cabinGainMult = inCabin ? 0.78 : 1.0;
      const spatial = Math.max(0, Math.min(1, spatialAttenuation));

      this.engineOscMain?.frequency.setTargetAtTime(targetFreq, now, 0.06);
      this.engineOscSub?.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.06);
      this.engineFilter?.frequency.setTargetAtTime(
        (prof.filterBase + rpm * (throttle ? prof.filterSpan : prof.filterSpan * 0.55)) * cabinFilterMult,
        now,
        0.07
      );
      const rawGain = throttle ? 0.045 + rpm * 0.065 : 0.022 + rpm * 0.025;
      const targetGain = rawGain * prof.gainScale * cabinGainMult * spatial;
      this.engineGain?.gain.setTargetAtTime(targetGain, now, 0.07);

      if (gear !== this.lastEngineGear && speedKmh > 12) {
        this.lastEngineGear = gear;
        this.engineGain?.gain.setValueAtTime(targetGain * 0.42, now);
        this.engineGain?.gain.linearRampToValueAtTime(targetGain, now + 0.09);
      }

      const screech = Math.max(
        driftIntensity,
        braking && speedKmh > 45 ? Math.min(1, (speedKmh - 40) / 80) : 0
      );
      if (this.tireGain) {
        this.tireGain.gain.setTargetAtTime(
          screech > 0.08 ? screech * 0.08 * cabinGainMult * spatial : 0.0001,
          now,
          0.06
        );
      }
    } catch {}
  }

  public stopContinuousVehicleAudio() {
    try {
      if (this.engineOscMain) {
        this.engineOscMain.stop();
        this.engineOscMain.disconnect();
      }
      if (this.engineOscSub) {
        this.engineOscSub.stop();
        this.engineOscSub.disconnect();
      }
      this.engineFilter?.disconnect();
      this.engineGain?.disconnect();
    } catch {}
    this.engineOscMain = null;
    this.engineOscSub = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.lastEngineCategory = '';

    try {
      if (this.tireNoiseNode) {
        this.tireNoiseNode.stop();
        this.tireNoiseNode.disconnect();
      }
      this.tireFilter?.disconnect();
      this.tireGain?.disconnect();
    } catch {}
    this.tireNoiseNode = null;
    this.tireFilter = null;
    this.tireGain = null;
  }

  public dispose() {
    this.stopRadio();
    this.stopGlobalSynthOnly();
    this.stopPersonalSynthOnly();
    this.stopRain();
    this.stopOceanAmbience();
    this.stopContinuousVehicleAudio();
    this.stopSirenLoop();
  }

  private stopRadio() {
    this.isRadioPlaying = false;
    if (this.radioInterval !== null) {
      clearInterval(this.radioInterval);
      this.radioInterval = null;
    }
  }
}

export const soundFx = new SoundManager();
