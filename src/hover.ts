export class HoverGate {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inside = false;
  private activated = false;
  constructor(
    private delay: number,
    private start: () => void,
    private stop: () => void,
  ) {}
  enter(enabled = true) {
    if (this.inside) return;
    this.inside = true;
    if (!enabled) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.inside) {
        this.activated = true;
        this.start();
      }
    }, this.delay);
  }
  leave() {
    this.inside = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.activated) {
      this.activated = false;
      this.stop();
    }
  }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.activated = false;
  }
}
