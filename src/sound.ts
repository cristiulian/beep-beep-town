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
}
