/** Tiny synthesized sound effects, no audio files needed. */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engineOsc?: OscillatorNode;
  private engineGain?: GainNode;
  muted = false;

  /** Browsers only allow audio after a user gesture, so call this from one. */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  engine(speed01: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 90, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.04 + speed01 * 0.08, t, 0.1);
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + start;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  horn() {
    this.tone(392, 0, 0.35, 'square', 0.12);
    this.tone(494, 0, 0.35, 'square', 0.1);
    this.tone(392, 0.4, 0.35, 'square', 0.12);
    this.tone(494, 0.4, 0.35, 'square', 0.1);
  }

  star() {
    [880, 1109, 1319].forEach((f, i) => this.tone(f, i * 0.07, 0.25, 'sine', 0.25));
  }

  fanfare() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i * 0.13, 0.3, 'triangle', 0.25));
  }

  boing() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  splash() {
    [660, 780, 990, 1170, 880].forEach((f, i) => this.tone(f, i * 0.06, 0.15, 'sine', 0.15));
  }

  click() {
    this.tone(1200, 0, 0.06, 'sine', 0.15);
  }

  /** An oscillator whose pitch glides from f0 to f1, through an optional low-pass filter. */
  private glide(f0: number, f1: number, start: number, dur: number, type: OscillatorType, vol: number, opts: { lp?: number; vibrato?: number } = {}) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + start;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (opts.vibrato) {
      const lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      lfo.frequency.value = opts.vibrato;
      depth.gain.value = f0 * 0.08;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node: AudioNode = o;
    if (opts.lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lp;
      node = o.connect(f);
    }
    node.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(start: number, dur: number, vol: number, freq: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(ctx.currentTime + start);
  }

  animal(kind: 'cow' | 'sheep' | 'pig' | 'duck') {
    if (kind === 'cow') {
      this.glide(150, 105, 0, 1.1, 'sawtooth', 0.2, { lp: 700, vibrato: 5 });
    } else if (kind === 'sheep') {
      this.glide(420, 380, 0, 0.7, 'sawtooth', 0.12, { lp: 1800, vibrato: 14 });
    } else if (kind === 'pig') {
      this.glide(260, 160, 0, 0.18, 'square', 0.1, { lp: 900 });
      this.glide(240, 150, 0.25, 0.2, 'square', 0.1, { lp: 900 });
    } else {
      this.glide(620, 400, 0, 0.14, 'sawtooth', 0.1, { lp: 1500 });
      this.glide(620, 400, 0.2, 0.14, 'sawtooth', 0.1, { lp: 1500 });
    }
  }

  land(strength: number) {
    this.noise(0, 0.25, Math.min(0.6, 0.15 + strength * 0.15), 300);
  }

  woosh() {
    this.noise(0, 0.5, 0.15, 1200);
  }

  glug() {
    for (let i = 0; i < 6; i++) this.glide(300 + i * 60, 600 + i * 80, i * 0.15, 0.1, 'sine', 0.12);
  }

  sputter() {
    for (let i = 0; i < 4; i++) this.noise(i * 0.18, 0.1, 0.3, 200);
  }

  goodDriving() {
    [659, 880, 1175].forEach((f, i) => this.tone(f, i * 0.1, 0.35, 'triangle', 0.22));
  }

  /** Another car's horn; quieter the further away it is. */
  carHorn(distance: number) {
    const v = Math.max(0, 1 - distance / 40) * 0.09;
    if (v <= 0.005) return;
    this.tone(523, 0, 0.16, 'square', v);
    this.tone(659, 0, 0.16, 'square', v * 0.8);
    this.tone(523, 0.22, 0.2, 'square', v);
    this.tone(659, 0.22, 0.2, 'square', v * 0.8);
  }

  /** A long, cross double honk from a car you cut off. */
  angryHorn(distance: number) {
    const v = Math.max(0.03, 1 - distance / 50) * 0.14;
    for (const [start, dur] of [[0, 0.25], [0.32, 0.7]]) {
      this.tone(415, start, dur, 'square', v);
      this.tone(466, start, dur, 'square', v * 0.8);
    }
  }

  oops() {
    this.tone(700, 0, 0.18, 'square', 0.08);
    this.tone(520, 0.2, 0.25, 'square', 0.08);
  }
}
