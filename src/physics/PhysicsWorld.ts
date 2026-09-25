import * as THREE from 'three';

/** 体素可破坏世界提供给物理系统的接口（由 DestructionSystem 实现） */
export interface CellProvider {
  /** 把与 box 重叠的存活体素单元 AABB 写入 out（内部池化，结果仅在下次查询前有效） */
  collectOverlapCells(box: THREE.Box3, out: THREE.Box3[]): void;
  /** 射线检测，命中写入 out 并返回 true（out.dist / out.nx/ny/nz） */
  raycast(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; nx: number; ny: number; nz: number },
  ): boolean;
}

export interface MoveResult {
  grounded: boolean;
  wall: boolean;
  ceiling: boolean;
  /** 本次移动是否踩上了台阶 */
  stepped: boolean;
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

/**
 * 轻量 AABB 物理世界。
 * 角色使用「竖直圆柱近似 AABB」做逐轴分离式移动（move-and-slide），
 * 体素可破坏单元通过 CellProvider 动态注入，因此炸开的墙会自动打通碰撞。
 */
export class PhysicsWorld {
  boxes: THREE.Box3[] = [];
  provider: CellProvider | null = null;
  stepHeight = 0.62;

  private pool: THREE.Box3[] = [];
  private poolUsed = 0;
  private out: THREE.Box3[] = [];

  constructor() {
    for (let i = 0; i < 256; i++) this.pool.push(new THREE.Box3());
  }

  /** 以 min/max 添加静态碰撞盒 */
  addBox(minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number): void {
    this.boxes.push(new THREE.Box3(
      new THREE.Vector3(minx, miny, minz),
      new THREE.Vector3(maxx, maxy, maxz),
    ));
  }

  /** 以中心 + 尺寸添加静态碰撞盒 */
  addBoxC(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2);
  }

  // ---------------- XZ 均匀网格宽相索引 ----------------
  private lookup = new Map<number, number[]>();
  private lookupReady = false;
  private cellSize = 4;
  private cand: number[] = [];
  private stamp: Int32Array = new Int32Array(0);
  private stampId = 0;

  /** 地图构建完成后调用一次，建立宽相索引（大幅减少射线/碰撞的候选盒数量） */
  buildLookup(): void {
    this.lookup.clear();
    const cs = this.cellSize;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const gx0 = Math.floor(b.min.x / cs), gx1 = Math.floor(b.max.x / cs);
      const gz0 = Math.floor(b.min.z / cs), gz1 = Math.floor(b.max.z / cs);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const key = (gx + 4096) * 8192 + (gz + 4096);
          let arr = this.lookup.get(key);
          if (!arr) { arr = []; this.lookup.set(key, arr); }
          arr.push(i);
        }
      }
    }
    this.stamp = new Int32Array(this.boxes.length);
    this.lookupReady = true;
  }

  /** 收集 XZ 范围内可能相交的盒子索引（去重） */
  private gather(minX: number, minZ: number, maxX: number, maxZ: number): number[] {
    const out = this.cand;
    out.length = 0;
    if (!this.lookupReady || this.boxes.length === 0) {
      for (let i = 0; i < this.boxes.length; i++) out.push(i);
      return out;
    }
    const cs = this.cellSize;
    const gx0 = Math.floor(minX / cs), gx1 = Math.floor(maxX / cs);
    const gz0 = Math.floor(minZ / cs), gz1 = Math.floor(maxZ / cs);
    // 范围过大时退化为全遍历
    if ((gx1 - gx0 + 1) * (gz1 - gz0 + 1) > 900) {
      for (let i = 0; i < this.boxes.length; i++) out.push(i);
      return out;
    }
    this.stampId++;
    const sid = this.stampId;
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const arr = this.lookup.get((gx + 4096) * 8192 + (gz + 4096));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k];
          if (this.stamp[i] === sid) continue;
          this.stamp[i] = sid;
          out.push(i);
        }
      }
    }
    return out;
  }

  /** 查询与 box 重叠的所有碰撞盒（含体素单元）；结果仅在下一次 query 前有效 */
  query(box: THREE.Box3, out: THREE.Box3[]): number {
    this.poolUsed = 0;
    out.length = 0;
    const cand = this.gather(box.min.x, box.min.z, box.max.x, box.max.z);
    for (let k = 0; k < cand.length; k++) {
      const b = this.boxes[cand[k]];
      if (b.intersectsBox(box)) out.push(b);
    }
    if (this.provider) this.provider.collectOverlapCells(box, out);
    return out.length;
  }

  private take(): THREE.Box3 {
    if (this.poolUsed < this.pool.length) return this.pool[this.poolUsed++];
    const b = new THREE.Box3();
    this.pool.push(b);
    this.poolUsed++;
    return b;
  }

  /** 指定位置是否无碰撞（用于台阶判定 / 出生点检测） */
  freeAt(x: number, y: number, z: number, r: number, h: number): boolean {
    _box.min.set(x - r, y + 0.02, z - r);
    _box.max.set(x + r, y + h, z + r);
    return this.query(_box, this.freeOut) === 0;
  }

  private freeOut: THREE.Box3[] = [];

  moveCharacter(
    pos: THREE.Vector3, vel: THREE.Vector3,
    radius: number, height: number, dt: number, res: MoveResult,
  ): void {
    res.grounded = false;
    res.wall = false;
    res.ceiling = false;
    res.stepped = false;

    // 逐轴推进 + 分离，稳定性好且实现简单
    pos.x += vel.x * dt;
    this.resolveH(pos, vel, radius, height, 0, res);
    pos.z += vel.z * dt;
    this.resolveH(pos, vel, radius, height, 2, res);
    pos.y += vel.y * dt;
    this.resolveV(pos, vel, radius, height, res);

    if (pos.y < -30) { pos.y = 3; vel.set(0, 0, 0); } // 兜底：掉出地图
  }

  private resolveH(
    pos: THREE.Vector3, vel: THREE.Vector3, r: number, h: number,
    axis: 0 | 2, res: MoveResult,
  ): void {
    const key = axis === 0 ? 'x' : 'z';
    _box.min.set(pos.x - r, pos.y + 0.06, pos.z - r);
    _box.max.set(pos.x + r, pos.y + h, pos.z + r);
    const n = this.query(_box, this.out);
    if (n === 0) return;

    let limit = (vel as any)[key] > 0 ? Infinity : -Infinity;
    let stepTop = -Infinity;
    const v = (vel as any)[key] as number;

    for (let i = 0; i < n; i++) {
      const b = this.out[i];
      stepTop = Math.max(stepTop, b.max.y);
      if (v > 0) limit = Math.min(limit, b.min[key] - r);
      else if (v < 0) limit = Math.max(limit, b.max[key] + r);
      else {
        // 速度为 0 但仍然重叠：按最小平移推出
        const toMin = b.min[key] - r - pos[key];
        const toMax = b.max[key] + r - pos[key];
        const t = Math.abs(toMin) < Math.abs(toMax) ? toMin : toMax;
        limit = (pos as any)[key] + t;
        (vel as any)[key] = t > 0 ? 1 : -1;
      }
    }
    const v2 = (vel as any)[key] as number;

    // 台阶：能抬腿就抬，不要产生空气墙
    const rise = stepTop - pos.y;
    if (rise > 0.02 && rise <= this.stepHeight && v2 !== 0) {
      if (this.freeAt(pos.x, pos.y + rise + 0.04, pos.z, r, h)) {
        pos.y += rise + 0.04;
        if (vel.y < 0) vel.y = 0;
        res.grounded = true;
        res.stepped = true;
        return;
      }
    }

    if (v2 > 0 && pos[key] > limit) pos[key] = limit;
    else if (v2 < 0 && pos[key] < limit) pos[key] = limit;
    (vel as any)[key] = 0;
    res.wall = true;
  }

  private resolveV(
    pos: THREE.Vector3, vel: THREE.Vector3, r: number, h: number, res: MoveResult,
  ): void {
    _box.min.set(pos.x - r, pos.y, pos.z - r);
    _box.max.set(pos.x + r, pos.y + h, pos.z + r);
    const n = this.query(_box, this.out);
    if (n === 0) return;

    if (vel.y <= 0) {
      let top = -Infinity;
      for (let i = 0; i < n; i++) {
        const b = this.out[i];
        const pen = b.max.y - pos.y;
        if (pen > 0 && pen <= 1.4) top = Math.max(top, b.max.y);
      }
      if (top > -Infinity) { pos.y = top; vel.y = 0; res.grounded = true; }
    } else {
      let bottom = Infinity;
      for (let i = 0; i < n; i++) {
        const b = this.out[i];
        const pen = (pos.y + h) - b.min.y;
        if (pen > 0 && pen <= 1.4) bottom = Math.min(bottom, b.min.y - h);
      }
      if (bottom < Infinity) { pos.y = bottom; vel.y = 0; res.ceiling = true; }
    }
  }

  /** 静态几何射线检测（体素部分由 provider 负责） */
  raycastBoxes(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; nx: number; ny: number; nz: number },
  ): boolean {
    let best = maxDist;
    let found = false;
    let bnx = 0, bny = 0, bnz = 0;
    // 宽相：取射线 XZ 包围盒覆盖的网格单元中的候选盒
    const ex = o.x + d.x * maxDist;
    const ez = o.z + d.z * maxDist;
    const cand = this.gather(
      Math.min(o.x, ex), Math.min(o.z, ez),
      Math.max(o.x, ex), Math.max(o.z, ez),
    );
    for (let ci = 0; ci < cand.length; ci++) {
      const b = this.boxes[cand[ci]];
      let tmin = 0;
      let tmax = best;
      let axis = -1;
      let sign = 1;
      for (let a = 0; a < 3; a++) {
        const key = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
        const od = (d as any)[key];
        const oo = (o as any)[key];
        if (Math.abs(od) < 1e-8) {
          if (oo < (b.min as any)[key] || oo > (b.max as any)[key]) { tmin = 1e9; break; }
          continue;
        }
        const inv = 1 / od;
        let t1 = ((b.min as any)[key] - oo) * inv;
        let t2 = ((b.max as any)[key] - oo) * inv;
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { tmin = 1e9; break; }
      }
      if (tmin <= tmax && tmin < best && tmin >= 0) {
        best = tmin;
        found = true;
        bnx = axis === 0 ? sign : 0;
        bny = axis === 1 ? sign : 0;
        bnz = axis === 2 ? sign : 0;
      }
    }
    if (found) {
      out.dist = best;
      out.nx = bnx; out.ny = bny; out.nz = bnz;
      return true;
    }
    return false;
  }

  /** 射线检测（静态 + 体素） */
  raycast(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; nx: number; ny: number; nz: number },
  ): boolean {
    let best = maxDist;
    let found = false;
    const tmp = { dist: 0, nx: 0, ny: 0, nz: 0 };
    if (this.raycastBoxes(o, d, maxDist, tmp)) {
      best = tmp.dist; out.nx = tmp.nx; out.ny = tmp.ny; out.nz = tmp.nz; found = true;
    }
    if (this.provider && this.provider.raycast(o, d, best, tmp)) {
      best = tmp.dist; out.nx = tmp.nx; out.ny = tmp.ny; out.nz = tmp.nz; found = true;
    }
    if (found) out.dist = best;
    return found;
  }

  /** 求某点的地面高度（向下射线）；无地面返回 -Infinity */
  groundAt(x: number, z: number, fromY = 60): number {
    _v.set(x, fromY, z);
    const d = new THREE.Vector3(0, -1, 0);
    const out = { dist: 0, nx: 0, ny: 0, nz: 0 };
    if (this.raycast(_v, d, fromY + 40, out)) return fromY - out.dist;
    return -Infinity;
  }
}
