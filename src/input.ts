/** Keyboard + on-screen buttons, merged into throttle/steer values. */
export class Input {
  private keys = new Set<string>();
  /** Which on-screen button each finger (or mouse) is currently on. */
  private pointers = new Map<number, string>();
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
      this.pointers.clear();
      this.refreshPressed();
    });

    // Driving buttons: a finger can slide from one button to the next without lifting,
    // e.g. rocking between ◀ and ▶, so we track each pointer across the whole pad.
    const pad = document.getElementById('controls')!;
    const controlAt = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest('[data-control]') as HTMLElement | null)?.dataset.control;
    pad.addEventListener('pointerdown', (e) => {
      const name = controlAt(e.clientX, e.clientY);
      if (!name) return;
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, name);
      this.refreshPressed();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const name = controlAt(e.clientX, e.clientY);
      // Sliding off into empty space keeps the last button held: easier for small hands.
      if (name && name !== this.pointers.get(e.pointerId)) {
        this.pointers.set(e.pointerId, name);
        this.refreshPressed();
      }
    });
    const release = (e: PointerEvent) => {
      if (this.pointers.delete(e.pointerId)) this.refreshPressed();
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('lostpointercapture', release);

    // The horn is a single tap.
    document.querySelectorAll<HTMLElement>('[data-control="horn"]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.classList.add('pressed');
        this.onHorn();
      });
      const up = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    });

    // No long-press menus, text selection or pinch-zoom while playing.
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private refreshPressed() {
    const held = new Set(this.pointers.values());
    document.querySelectorAll<HTMLElement>('#controls [data-control]').forEach((el) => {
      el.classList.toggle('pressed', held.has(el.dataset.control!));
    });
  }

  private any(...codes: string[]) {
    const held = [...this.pointers.values()];
    return codes.some((c) => this.keys.has(c) || held.includes(c));
  }

  get throttle() {
    return (this.any('ArrowUp', 'KeyW', 'gas') ? 1 : 0) - (this.any('ArrowDown', 'KeyS', 'reverse') ? 1 : 0);
  }

  get steer() {
    return (this.any('ArrowRight', 'KeyD', 'right') ? 1 : 0) - (this.any('ArrowLeft', 'KeyA', 'left') ? 1 : 0);
  }
}
