import * as THREE from 'three';
import type { Game } from '../core/Game';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = { dist: Infinity, nx: 0, ny: 0, nz: 0 };

/** 极简二叉堆（A* 开放列表） */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number { return this.keys.length; }
  clear(): void { this.keys.length = 0; this.vals.length = 0; }
  push(key: number, val: number): void {
    this.keys.push(key); this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(p, i); i = p;
    }
  }
  pop(): number {
    const top = this.vals[0];
    const lk = this.keys.pop()!;
    const lv = this.vals.pop()!;
    if (this.keys.length) {
      this.keys[0] = lk; this.vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(m, i); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    const k = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = k;
    const v = this.vals[a]; this.vals[a] = this.vals[b]; this.vals[b] = v;
  }
}

/**
 * 导航系统：2D NavGrid + A*（8 邻域）+ 路径平滑（String Pulling）
 *
 * - 网格在地图加载时构建一次；场景被破坏后只做 **局部失效重算**（invalidateArea），
 *   所以炸开的墙会立刻变成可通行区域，AI 能穿过新开的洞。
 * - 没有可行路径时退化为 Waypoint（随机漫游点）策略，保证 AI 不会卡死。
 */
export class Navigation {
  game: Game;
  cell = 1.75;
  minX = -72; minZ = -72;
  nx = 0; nz = 0;
  walkable!: Uint8Array;
  height!: Float32Array;
  /** 待重算区域队列 */
  private dirty: { x: number; z: number; r: number }[] = [];
  private gScore: Float32Array = new Float32Array(0);
  private fScore: Float32Array = new Float32Array(0);
  private came: Int32Array = new Int32Array(0);
  private closed: Uint8Array = new Uint8Array(0);
  private open: Uint8Array = new Uint8Array(0);
  private heap = new MinHeap();
  private stamp = 0;
  private visit: Int32Array = new Int32Array(0);

  constructor(game: Game) {
    this.game = game;
  }

  build(minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.minX = minX;
    this.minZ = minZ;
    this.nx = Math.ceil((maxX - minX) / this.cell);
    this.nz = Math.ceil((maxZ - minZ) / this.cell);
    const n = this.nx * this.nz;
    this.walkable = new Uint8Array(n);
    this.height = new Float32Array(n);
    this.gScore = new Float32Array(n);
    this.fScore = new Float32Array(n);
    this.came = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.open = new Uint8Array(n);
    this.visit = new Int32Array(n);
    for (let i = 0; i < n; i++) this.sampleCell(i);
  }

  idx(ix: number, iz: number): number { return ix + this.nx * iz; }
  inBounds(ix: number, iz: number): boolean { return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz; }

  worldX(ix: number): number { return this.minX + (ix + 0.5) * this.cell; }
  worldZ(iz: number): number { return this.minZ + (iz + 0.5) * this.cell; }
  gridX(x: number): number { return Math.floor((x - this.minX) / this.cell); }
  gridZ(z: number): number { return Math.floor((z - this.minZ) / this.cell); }

  /**
   * 采样单个格子：地面高度 + 净空高度。
   * 关键点：对格心与四个偏移点做 5 次采样（膨胀/腐蚀处理），
   * 只有当周围 INFLATE 范围内都通行的格子才算可走，
   * 避免"格子可走但角色贴着墙被碰撞挡住"的经典 NavGrid 与碰撞不一致问题。
   */
  private static INFLATE = 0.62;

  private sampleCell(i: number): void {
    const ix = i % this.nx;
    const iz = Math.floor(i / this.nx);
    const x = this.worldX(ix);
    const z = this.worldZ(iz);

    // 从 3.2m 向下找地面：忽略屋顶，让 AI 主要在城市地面层活动
    _o.set(x, 3.2, z);
    _d.set(0, -1, 0);
    if (!this.game.physics.raycast(_o, _d, 9, _hit)) {
      this.walkable[i] = 0;
      this.height[i] = 0;
      return;
    }
    const gy = 3.2 - _hit.dist;
    this.height[i] = gy;

    const inf = Navigation.INFLATE;
    const offs = [0, 0, -inf, 0, inf, 0, 0, -inf, 0, inf];
    for (let k = 0; k < 5; k++) {
      const sx = x + offs[k * 2];
      const sz = z + offs[k * 2 + 1];
      _o.set(sx, 3.2, sz);
      _d.set(0, -1, 0);
      if (!this.game.physics.raycast(_o, _d, 9, _hit)) { this.walkable[i] = 0; return; }
      const sy = 3.2 - _hit.dist;
      if (Math.abs(sy - gy) > 0.9) { this.walkable[i] = 0; return; }
      // 净空：2.1m 内不能有障碍
      _o.set(sx, sy + 0.35, sz);
      _d.set(0, 1, 0);
      if (this.game.physics.raycast(_o, _d, 2.1, _hit)) { this.walkable[i] = 0; return; }
    }
    this.walkable[i] = 1;
  }

  /** 破坏发生后局部失效：只重算受影响区域 */
  invalidateArea(x: number, _y: number, z: number, r: number): void {
    this.dirty.push({ x, z, r: r + this.cell });
  }

  /** 每帧限次处理失效队列，避免一次性重算造成卡顿 */
  processDirty(maxCells = 220): void {
    let budget = maxCells;
    while (this.dirty.length && budget > 0) {
      const a = this.dirty.pop()!;
      const i0 = Math.max(0, this.gridX(a.x - a.r));
      const i1 = Math.min(this.nx - 1, this.gridX(a.x + a.r));
      const k0 = Math.max(0, this.gridZ(a.z - a.r));
      const k1 = Math.min(this.nz - 1, this.gridZ(a.z + a.r));
      for (let k = k0; k <= k1 && budget > 0; k++) {
        for (let i = i0; i <= i1; i++) {
          this.sampleCell(this.idx(i, k));
          budget--;
        }
      }
    }
  }

  /** 地面高度查询（供碎片/粒子使用，O(1)） */
  groundHeightAt(x: number, z: number): number {
    const ix = this.gridX(x);
    const iz = this.gridZ(z);
    if (!this.inBounds(ix, iz)) return 0;
    const i = this.idx(ix, iz);
    return this.walkable[i] || this.height[i] > 0 ? this.height[i] : 0;
  }

  isWalkable(x: number, z: number): boolean {
    const ix = this.gridX(x);
    const iz = this.gridZ(z);
    if (!this.inBounds(ix, iz)) return false;
    return this.walkable[this.idx(ix, iz)] === 1;
  }

  /** 找一个离目标最近的可行走点（目标在墙里时兜底） */
  nearestWalkable(x: number, z: number, out: THREE.Vector3): boolean {
    const ix = this.gridX(x);
    const iz = this.gridZ(z);
    for (let r = 0; r < 8; r++) {
      for (let dk = -r; dk <= r; dk++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dk), Math.abs(di)) !== r) continue;
          const cx = ix + di, cz = iz + dk;
          if (!this.inBounds(cx, cz)) continue;
          if (this.walkable[this.idx(cx, cz)]) {
            out.set(this.worldX(cx), this.height[this.idx(cx, cz)], this.worldZ(cz));
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 视线检测（AI 感知 / 路径平滑共用） */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    _o.set(ax, ay, az);
    _d.set(bx - ax, by - ay, bz - az);
    const dist = _d.length();
    if (dist < 0.001) return true;
    _d.multiplyScalar(1 / dist);
    if (this.game.physics.raycast(_o, _d, dist - 0.25, _hit)) return false;
    return true;
  }

  /**
   * A* 寻路。out 为世界坐标航点数组（已做路径平滑）。
   * 失败时返回 false，调用方退化为随机漫游。
   */
  findPath(sx: number, sz: number, tx: number, tz: number, out: THREE.Vector3[]): boolean {
    out.length = 0;
    const s = this.toWalkableIndex(sx, sz);
    const t = this.toWalkableIndex(tx, tz);
    if (s < 0 || t < 0) return false;
    if (s === t) { out.push(new THREE.Vector3(tx, this.height[t], tz)); return true; }

    this.stamp++;
    this.heap.clear();
    const n = this.nx * this.nz;
    if (this.visit.length !== n) this.visit = new Int32Array(n);

    this.visit[s] = this.stamp;
    this.gScore[s] = 0;
    this.came[s] = -1;
    this.open[s] = 1;
    this.closed[s] = 0;
    const h0 = this.heuristic(s, t);
    this.fScore[s] = h0;
    this.heap.push(h0, s);

    let found = false;
    let guard = 0;
    const maxExpand = 2600;

    while (this.heap.size > 0 && guard++ < maxExpand) {
      const cur = this.heap.pop();
      if (this.visit[cur] !== this.stamp) continue;
      if (this.closed[cur] === 1 && this.visit[cur] === this.stamp) continue;
      this.closed[cur] = 1;
      this.open[cur] = 0;
      if (cur === t) { found = true; break; }

      const cx = cur % this.nx;
      const cz = Math.floor(cur / this.nx);
      for (let dk = -1; dk <= 1; dk++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dk === 0) continue;
          const ix = cx + di, iz = cz + dk;
          if (!this.inBounds(ix, iz)) continue;
          const ni = this.idx(ix, iz);
          if (!this.walkable[ni]) continue;
          // 斜向需要两侧都通行，避免穿墙角
          if (di !== 0 && dk !== 0) {
            if (!this.walkable[this.idx(cx + di, cz)] || !this.walkable[this.idx(cx, cz + dk)]) continue;
          }
          if (this.visit[ni] !== this.stamp) {
            this.visit[ni] = this.stamp;
            this.closed[ni] = 0;
            this.open[ni] = 0;
            this.gScore[ni] = Infinity;
          }
          if (this.closed[ni] === 1) continue;
          // 代价 = 距离 + 高度差惩罚（鼓励走平路）
          const step = (di !== 0 && dk !== 0) ? 1.4142 : 1;
          const dh = Math.abs(this.height[ni] - this.height[cur]);
          const cost = step + dh * 1.6 + (dh > 0.7 ? 6 : 0);
          const tentative = this.gScore[cur] + cost;
          if (tentative < this.gScore[ni]) {
            this.came[ni] = cur;
            this.gScore[ni] = tentative;
            const f = tentative + this.heuristic(ni, t);
            this.fScore[ni] = f;
            this.open[ni] = 1;
            this.heap.push(f, ni);
          }
        }
      }
    }
    if (!found) return false;

    // 回溯
    const raw: number[] = [];
    let c = t;
    let guard2 = 0;
    while (c >= 0 && guard2++ < 4000) {
      raw.push(c);
      if (c === s) break;
      c = this.came[c];
    }
    raw.reverse();

    // 路径平滑：能直达就跳过中间点
    const pts: THREE.Vector3[] = raw.map((i) => new THREE.Vector3(
      this.worldX(i % this.nx), this.height[i], this.worldZ(Math.floor(i / this.nx)),
    ));
    let anchor = 0;
    out.push(pts[0]);
    for (let i = 2; i < pts.length; i++) {
      const a = pts[anchor];
      const b = pts[i];
      if (!this.lineOfSight(a.x, a.y + 0.9, a.z, b.x, b.y + 0.9, b.z)) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    // 起点通常是角色脚下，丢弃第一个点避免原地打转
    if (out.length > 1) out.shift();
    return out.length > 0;
  }

  private toWalkableIndex(x: number, z: number): number {
    const ix = this.gridX(x);
    const iz = this.gridZ(z);
    if (this.inBounds(ix, iz) && this.walkable[this.idx(ix, iz)]) return this.idx(ix, iz);
    const v = new THREE.Vector3();
    if (!this.nearestWalkable(x, z, v)) return -1;
    return this.idx(this.gridX(v.x), this.gridZ(v.z));
  }

  private heuristic(a: number, b: number): number {
    const ax = a % this.nx, az = Math.floor(a / this.nx);
    const bx = b % this.nx, bz = Math.floor(b / this.nx);
    const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
    // 八方向距离（octile）
    return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
  }

  /** 随机漫游点（无路径时的 Waypoint fallback） */
  randomWander(out: THREE.Vector3): boolean {
    for (let i = 0; i < 24; i++) {
      const ix = Math.floor(Math.random() * this.nx);
      const iz = Math.floor(Math.random() * this.nz);
      if (this.walkable[this.idx(ix, iz)]) {
        out.set(this.worldX(ix), this.height[this.idx(ix, iz)], this.worldZ(iz));
        return true;
      }
    }
    return false;
  }

  /** 找附近掩体点：目标视线被挡的位置 */
  findCover(fromX: number, fromZ: number, threatX: number, threatZ: number, out: THREE.Vector3): boolean {
    let bestScore = -Infinity;
    let best = null as THREE.Vector3 | null;
    const ix0 = this.gridX(fromX), iz0 = this.gridZ(fromZ);
    for (let i = 0; i < 40; i++) {
      const ix = ix0 + Math.floor(Math.random() * 13) - 6;
      const iz = iz0 + Math.floor(Math.random() * 13) - 6;
      if (!this.inBounds(ix, iz)) continue;
      const id = this.idx(ix, iz);
      if (!this.walkable[id]) continue;
      const x = this.worldX(ix), y = this.height[id], z = this.worldZ(iz);
      const blocked = this.lineOfSight(x, y + 1.4, z, threatX, 1.4, threatZ) ? 0 : 1;
      const d = Math.hypot(x - fromX, z - fromZ);
      const score = blocked * 10 - d * 0.25;
      if (score > bestScore) { bestScore = score; best = new THREE.Vector3(x, y, z); }
    }
    if (best) { out.copy(best); return true; }
    return false;
  }

  setTickBudget(_hz: number): void {
    // 预留接口：可动态调整 A* 每帧预算
  }
}
