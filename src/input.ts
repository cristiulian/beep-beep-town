/** Keyboard + on-screen touch buttons, merged into throttle/steer values. */
export class Input {
  private keys = new Set<string>();
  private touch = new Set<string>();
  onHorn: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'KeyH') {
        if (!e.repeat) this.onHorn();
        e.preventDefault();
        return;
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
    });

    document.querySelectorAll<HTMLElement>('[data-control]').forEach((el) => {
      const name = el.dataset.control!;
      const press = (e: PointerEvent) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('pressed');
        if (name === 'horn') this.onHorn();
        else this.touch.add(name);
      };
      const release = () => {
        el.classList.remove('pressed');
        this.touch.delete(name);
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    });
  }

  private any(...codes: string[]) {
    return codes.some((c) => this.keys.has(c) || this.touch.has(c));
  }

  get throttle() {
    return (this.any('ArrowUp', 'KeyW', 'gas') ? 1 : 0) - (this.any('ArrowDown', 'KeyS', 'reverse') ? 1 : 0);
  }

  get steer() {
    return (this.any('ArrowRight', 'KeyD', 'right') ? 1 : 0) - (this.any('ArrowLeft', 'KeyA', 'left') ? 1 : 0);
  }
}
