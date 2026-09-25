export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 帧率无关的指数平滑 */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function moveTowards(a: number, b: number, maxDelta: number): number {
  const d = b - a;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

/** 角度归一化到 [-PI, PI] */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function randRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function randInt(a: number, b: number): number {
  return Math.floor(randRange(a, b + 1));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 确定性伪随机（用于地图装饰，保证每次生成一致） */
export class Rng {
  private s: number;
  constructor(seed = 1337) { this.s = seed >>> 0; }
  next(): number {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  chance(p: number): boolean { return this.next() < p; }
}

/** 简易对象池：避免运行时 new 造成 GC 抖动 */
export class Pool<T> {
  private items: T[] = [];
  private factory: () => T;
  constructor(factory: () => T, preload = 0) {
    this.factory = factory;
    for (let i = 0; i < preload; i++) this.items.push(factory());
  }
  get(): T {
    return this.items.length ? this.items.pop()! : this.factory();
  }
  release(o: T): void {
    this.items.push(o);
  }
  get size(): number { return this.items.length; }
}

/** 数值格式化：1234 -> 1.2k */
export function shortNum(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n));
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
