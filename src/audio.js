/** 纯 WebAudio 合成的像素风音效（无需外部资源） */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get t() { return this.ctx.currentTime; }

  _noise(dur, { gain = 0.5, type = 'lowpass', freq = 1200, q = 1, sweep = 0, delay = 0 } = {}) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const flt = this.ctx.createBiquadFilter();
    flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
    if (sweep) flt.frequency.exponentialRampToValueAtTime(Math.max(80, freq * sweep), t0 + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  _tone(freq, dur, { type = 'square', gain = 0.18, slideTo = 0, delay = 0 } = {}) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  shot(kind) {
    switch (kind) {
      case 'rifle':
        this._noise(0.13, { gain: 0.55, freq: 2600, sweep: 0.15 });
        this._tone(180, 0.09, { type: 'square', gain: 0.12, slideTo: 60 });
        break;
      case 'shotgun':
        this._noise(0.28, { gain: 0.7, freq: 1500, sweep: 0.08 });
        this._tone(90, 0.22, { type: 'sawtooth', gain: 0.16, slideTo: 40 });
        break;
      case 'sniper':
        this._noise(0.35, { gain: 0.75, freq: 3200, sweep: 0.05 });
        this._tone(140, 0.3, { type: 'sawtooth', gain: 0.14, slideTo: 35 });
        this._noise(0.2, { gain: 0.18, freq: 900, delay: 0.25 });
        break;
      case 'enemy':
        this._noise(0.1, { gain: 0.28, freq: 1800, sweep: 0.2 });
        break;
      default: // pistol
        this._noise(0.11, { gain: 0.45, freq: 2100, sweep: 0.18 });
        this._tone(220, 0.08, { type: 'square', gain: 0.1, slideTo: 80 });
    }
  }

  dry() { this._tone(1100, 0.05, { type: 'square', gain: 0.06, slideTo: 700 }); }
  reload() {
    this._tone(320, 0.06, { type: 'square', gain: 0.09 });
    this._tone(240, 0.07, { type: 'square', gain: 0.09, delay: 0.22 });
    this._tone(420, 0.05, { type: 'square', gain: 0.08, delay: 0.5 });
  }
  swap() { this._tone(660, 0.05, { type: 'square', gain: 0.07, slideTo: 880 }); }
  hit() { this._tone(1500, 0.045, { type: 'square', gain: 0.09, slideTo: 900 }); }
  headshot() {
    this._tone(1900, 0.05, { type: 'square', gain: 0.11, slideTo: 1200 });
    this._tone(2400, 0.05, { type: 'square', gain: 0.08, slideTo: 1500, delay: 0.05 });
  }
  kill() {
    this._tone(700, 0.08, { type: 'square', gain: 0.09 });
    this._tone(1000, 0.1, { type: 'square', gain: 0.09, delay: 0.07 });
  }
  hurt() {
    this._noise(0.16, { gain: 0.3, freq: 700, sweep: 0.3 });
    this._tone(160, 0.14, { type: 'sawtooth', gain: 0.1, slideTo: 90 });
  }
  explode() {
    this._noise(0.7, { gain: 0.85, freq: 900, sweep: 0.06 });
    this._tone(70, 0.5, { type: 'sawtooth', gain: 0.2, slideTo: 25 });
  }
  pin() { this._tone(1400, 0.04, { type: 'square', gain: 0.06 }); }
  waveStart() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.14, { type: 'square', gain: 0.1, delay: i * 0.11 }));
  }
  gameOver() {
    [523, 415, 330, 220].forEach((f, i) => this._tone(f, 0.3, { type: 'square', gain: 0.12, delay: i * 0.22 }));
  }
  pickup() {
    this._tone(880, 0.07, { type: 'square', gain: 0.09 });
    this._tone(1320, 0.09, { type: 'square', gain: 0.09, delay: 0.07 });
  }
  step() { this._noise(0.06, { gain: 0.12, freq: 500, sweep: 0.4 }); }
  coin() {
    this._tone(1180, 0.05, { type: 'square', gain: 0.05, slideTo: 1560 });
    this._tone(1760, 0.06, { type: 'square', gain: 0.04, delay: 0.045 });
  }
  melee() {
    this._noise(0.16, { gain: 0.4, freq: 900, sweep: 0.25 });
    this._tone(90, 0.16, { type: 'square', gain: 0.12, slideTo: 45 });
  }
  dash() {
    this._noise(0.35, { gain: 0.4, freq: 700, sweep: 0.18 });
    this._tone(150, 0.25, { type: 'sawtooth', gain: 0.1, slideTo: 300 });
  }
  flame() { this._noise(0.3, { gain: 0.22, freq: 1100, sweep: 0.55 }); }
  rocket() {
    this._noise(0.55, { gain: 0.5, freq: 1800, sweep: 0.35 });
    this._tone(120, 0.45, { type: 'sawtooth', gain: 0.16, slideTo: 320 });
  }
  hiss() {
    this._noise(0.9, { gain: 0.35, freq: 3200, sweep: 0.25 });
    this._tone(240, 0.5, { type: 'square', gain: 0.05, slideTo: 90 });
  }
}
