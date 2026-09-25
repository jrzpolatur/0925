import * as THREE from 'three';

/**
 * 音频管理器（程序化合成，无需外部音频资源）
 * 所有音效通过统一入口播放，并支持按距离衰减；
 * 后期接入真实音频资源时只需替换 play() 内部的采样选择逻辑。
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;
  volume = 0.55;
  private listener = new THREE.Vector3();

  /** 需在用户手势后调用 */
  init(): void {
    if (this.ctx) return;
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // 预生成 1 秒白噪声
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  setListener(p: THREE.Vector3): void {
    this.listener.copy(p);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private gainFor(pos?: THREE.Vector3, vol = 1): number {
    let g = vol;
    if (pos) {
      const d = pos.distanceTo(this.listener);
      g *= Math.max(0, 1 - d / 70) ** 1.6;
    }
    return g;
  }

  /** 播放音效 */
  play(name: string, pos?: THREE.Vector3, vol = 1): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const g = this.gainFor(pos, vol);
    if (g <= 0.002) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'smg': this.burst(t, g, 0.055, 2600, 0.55, 'highpass'); break;
      case 'rifle': this.burst(t, g, 0.10, 1600, 0.9, 'lowpass'); break;
      case 'shotgun': this.burst(t, g, 0.20, 900, 1.0, 'lowpass'); break;
      case 'rpg': this.burst(t, g, 0.32, 420, 1.0, 'lowpass'); break;
      case 'explosion': this.burst(t, g * 1.2, 0.75, 260, 1.0, 'lowpass'); this.tone(t, g * 0.5, 60, 90, 0.5, 'sine'); break;
      case 'electric': this.zap(t, g); break;
      case 'dash': this.sweep(t, g, 1800, 300, 0.28); break;
      case 'shield': this.tone(t, g * 0.4, 320, 620, 0.35, 'sine'); break;
      case 'hit': this.tone(t, g * 0.5, 900, 1400, 0.05, 'square'); break;
      case 'hurt': this.tone(t, g * 0.6, 260, 150, 0.18, 'sawtooth'); break;
      case 'kill': this.arp(t, g * 0.7, [660, 880, 1320]); break;
      case 'death': this.arp(t, g * 0.7, [440, 330, 220], 0.16, 'sawtooth'); break;
      case 'reload': this.click(t, g * 0.5); this.click(t + 0.35, g * 0.5); break;
      case 'switch': this.click(t, g * 0.35); break;
      case 'dryfire': this.click(t, g * 0.3); break;
      case 'jump': this.sweep(t, g * 0.25, 400, 800, 0.12); break;
      case 'deploy': this.tone(t, g * 0.4, 520, 300, 0.14, 'triangle'); break;
      case 'throw': this.sweep(t, g * 0.3, 700, 220, 0.22); break;
      case 'jumppad': this.sweep(t, g * 0.6, 300, 1400, 0.3); break;
      case 'portal': this.sweep(t, g * 0.5, 220, 1500, 0.4); break;
      case 'zipline': this.sweep(t, g * 0.3, 900, 500, 0.6); break;
      case 'cloak': this.sweep(t, g * 0.5, 1200, 200, 0.5); break;
      case 'ability': this.tone(t, g * 0.35, 420, 720, 0.2, 'triangle'); break;
      case 'ui': this.tone(t, g * 0.3, 720, 900, 0.06, 'square'); break;
      case 'coin': this.tone(t, g * 0.25, 1200, 1600, 0.07, 'square'); break;
      case 'matchwin': this.arp(t, g, [523, 659, 784, 1046], 0.18); break;
      default: break;
    }
  }

  // ---------------- 合成基元 ----------------
  private burst(t: number, g: number, dur: number, cutoff: number, peak: number, type: 'lowpass' | 'highpass'): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(g * peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt); filt.connect(gain); gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(t: number, g: number, f0: number, f1: number, dur: number, type: OscillatorType): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, g), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gain); gain.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private sweep(t: number, g: number, f0: number, f1: number, dur: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = 4;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(g * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt); filt.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  private click(t: number, g: number): void {
    this.burst(t, g, 0.03, 3000, 0.35, 'highpass');
  }

  private zap(t: number, g: number): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400, t);
    for (let i = 0; i < 8; i++) {
      o.frequency.setValueAtTime(600 + Math.random() * 2400, t + i * 0.02);
    }
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(g * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 700;
    o.connect(filt); filt.connect(gain); gain.connect(this.master);
    o.start(t); o.stop(t + 0.24);
  }

  private arp(t: number, g: number, freqs: number[], step = 0.09, type: OscillatorType = 'square'): void {
    freqs.forEach((f, i) => this.tone(t + i * step, g * 0.5, f, f, step * 1.2, type));
  }
}
