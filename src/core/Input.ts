/**
 * 输入管理器：键盘 / 鼠标 / 滚轮 / 指针锁。
 * 只负责采集原始输入，不参与任何游戏逻辑，保证玩家与 AI 的上层逻辑解耦。
 */
export class Input {
  private down = new Set<string>();
  private justDown = new Set<string>();
  private justUp = new Set<string>();

  /** 本帧鼠标位移（像素） */
  dx = 0;
  dy = 0;
  /** 滚轮累计（每帧消费） */
  wheel = 0;

  left = false;
  right = false;
  leftJust = false;
  rightJust = false;

  locked = false;
  sensitivity = 0.0021;
  invertY = false;

  private el: HTMLElement;
  private onLockChange: (locked: boolean) => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // 阻止空格滚动页面 / Tab 切焦点
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      this.down.add(e.code);
      this.justDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.justUp.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.left = this.right = false;
    });

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.left = true; this.leftJust = true; }
      if (e.button === 2) { this.right = true; this.rightJust = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    });

    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      this.onLockChange(this.locked);
    });
  }

  setLockHandler(fn: (locked: boolean) => void): void { this.onLockChange = fn; }

  requestLock(): void {
    if (!this.locked) (this.el as any).requestPointerLock?.();
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock?.();
  }

  isDown(code: string): boolean { return this.down.has(code); }
  wasPressed(code: string): boolean { return this.justDown.has(code); }
  wasReleased(code: string): boolean { return this.justUp.has(code); }

  /** 鼠标灵敏度换算后的角度增量 */
  get lookYaw(): number { return -this.dx * this.sensitivity; }
  get lookPitch(): number { return -this.dy * this.sensitivity * (this.invertY ? -1 : 1); }

  /** 每帧末尾调用，清理一次性状态 */
  endFrame(): void {
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.justDown.clear();
    this.justUp.clear();
    this.leftJust = false;
    this.rightJust = false;
  }
}
