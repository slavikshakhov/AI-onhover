// Pointer dwell is driven by real pointer movement, not layout-generated enter events.
export class DetailHover {
  private dwell?: ReturnType<typeof setTimeout>;
  private collapse?: ReturnType<typeof setTimeout>;
  private candidate?: number;
  active?: number;
  constructor(
    private change: (index: number | undefined) => void,
    private canActivate: (index: number) => boolean = () => true,
  ) {}
  enter(index: number) {
    if (this.active === index) {
      clearTimeout(this.collapse);
      return;
    }
    if (this.candidate === index) return;
    clearTimeout(this.dwell);
    this.candidate = index;
    this.dwell = setTimeout(() => {
      this.candidate = undefined;
      if (!this.canActivate(index)) return;
      this.active = index;
      this.change(index);
    }, 600);
  }
  leave() {
    clearTimeout(this.dwell);
    this.candidate = undefined;
    clearTimeout(this.collapse);
    this.collapse = setTimeout(() => {
      this.active = undefined;
      this.change(undefined);
    }, 300);
  }
  stay() {
    clearTimeout(this.collapse);
  }
  close() {
    clearTimeout(this.dwell);
    clearTimeout(this.collapse);
    this.candidate = undefined;
    this.active = undefined;
    this.change(undefined);
  }
  dispose() {
    clearTimeout(this.dwell);
    clearTimeout(this.collapse);
  }
}
