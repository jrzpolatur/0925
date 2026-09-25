import * as THREE from 'three';
import { CFG } from '../core/Config';
import { DebrisPool } from './DebrisPool';
import type { CellProvider } from '../physics/PhysicsWorld';

export interface VoxelStructOptions {
  /** 中心点 */
  center: THREE.Vector3;
  /** 尺寸 */
  size: THREE.Vector3;
  /** 体素单元边长 */
  cell?: number;
  color: number;
  /** 单元生命值（爆炸/子弹削减） */
  hp?: number;
  /** 材质分类：wall / wood / glass / metal / floor / prop */
  kind?: string;
  /** 碎片颜色（默认等于方块颜色） */
  debrisColor?: number;
  /** 颜色抖动 */
  jitter?: number;
}

/** 单个可破坏结构体（体素网格） */
export class VoxelStructure {
  origin = new THREE.Vector3();
  cell = 0.5;
  nx = 0; ny = 0; nz = 0;
  /** 每格当前生命 */
  hp!: Uint8Array;
  /** 每格是否存活 */
  alive!: Uint8Array;
  /** 每格对应的 InstancedMesh 槽位 */
  slot!: Int32Array;
  box = new THREE.Box3();
  baseColor = new THREE.Color();
  debrisColor = new THREE.Color();
  kind = 'wall';
  hpMax = 60;
  totalCells = 0;
  aliveCells = 0;

  index(i: number, j: number, k: number): number {
    return i + this.nx * (j + this.ny * k);
  }

  cellCenter(i: number, j: number, k: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.origin.x + (i + 0.5) * this.cell,
      this.origin.y + (j + 0.5) * this.cell,
      this.origin.z + (k + 0.5) * this.cell,
    );
  }
}

export interface VoxelHit {
  dist: number;
  nx: number; ny: number; nz: number;
  struct: VoxelStructure | null;
  cell: number;
}

export function makeVoxelHit(): VoxelHit {
  return { dist: Infinity, nx: 0, ny: 1, nz: 0, struct: null, cell: -1 };
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _p = new THREE.Vector3();
const _sphereBox = new THREE.Box3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * 场景破坏系统（高优先级核心）
 *
 * 设计要点：
 * 1. 所有可破坏物由体素单元（cell）组成，全部塞进 **一个 InstancedMesh**，
 *    无论多少可破坏物都只有 1 个 Draw Call。
 * 2. 单元格被摧毁 → 该实例矩阵置零缩放 → 碰撞不再提供该格 → 玩家可以真正穿过去。
 * 3. 射线用 DDA（Amanatides-Woo）网格步进，避免为每格做一次 ray-box 测试。
 * 4. 碰撞通过 CellProvider 注入 PhysicsWorld，因此炸开的洞立刻改变寻路与移动。
 */
export class DestructionSystem implements CellProvider {
  structures: VoxelStructure[] = [];
  debris: DebrisPool;
  /** 破坏回调（用于导航网格失效） */
  onChange: ((x: number, y: number, z: number, r: number) => void) | null = null;

  private mesh: THREE.InstancedMesh;
  private capacity: number;
  private used = 0;
  private cellPool: THREE.Box3[] = [];
  private cellPoolUsed = 0;
  private material: THREE.MeshLambertMaterial;

  stats = { cells: 0, destroyed: 0 };

  constructor(scene: THREE.Scene, capacity = 16000, debrisCapacity: number = CFG.budget.debris,
              getGround: (x: number, z: number) => number = () => 0) {
    this.capacity = capacity;
    this.material = new THREE.MeshLambertMaterial({});
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    scene.add(this.mesh);

    this.debris = new DebrisPool(debrisCapacity, getGround);
    scene.add(this.debris.mesh);
    for (let i = 0; i < 512; i++) this.cellPool.push(new THREE.Box3());
  }

  private ensureCapacity(n: number): void {
    if (n <= this.capacity) return;
    const old = this.mesh;
    const newCap = Math.max(n, Math.ceil(this.capacity * 1.6));
    const nm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, newCap);
    nm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nm.frustumCulled = false;
    (nm.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    nm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(newCap * 3).fill(1), 3);
    (nm.instanceColor.array as Float32Array).set(old.instanceColor!.array as Float32Array);
    nm.count = old.count;
    old.parent?.remove(old);
    old.dispose();
    this.mesh = nm;
    this.capacity = newCap;
  }

  /** 添加一个可破坏结构体 */
  addStructure(o: VoxelStructOptions): VoxelStructure {
    const cell = o.cell ?? 0.5;
    const nx = Math.max(1, Math.round(o.size.x / cell));
    const ny = Math.max(1, Math.round(o.size.y / cell));
    const nz = Math.max(1, Math.round(o.size.z / cell));
    const total = nx * ny * nz;
    this.ensureCapacity(this.used + total);

    const s = new VoxelStructure();
    s.cell = cell;
    s.nx = nx; s.ny = ny; s.nz = nz;
    s.origin.set(
      o.center.x - (nx * cell) / 2,
      o.center.y - (ny * cell) / 2,
      o.center.z - (nz * cell) / 2,
    );
    s.box.min.copy(s.origin);
    s.box.max.set(s.origin.x + nx * cell, s.origin.y + ny * cell, s.origin.z + nz * cell);
    s.hp = new Uint8Array(total);
    s.alive = new Uint8Array(total);
    s.slot = new Int32Array(total);
    s.baseColor = new THREE.Color(o.color);
    s.debrisColor = new THREE.Color(o.debrisColor ?? o.color);
    s.kind = o.kind ?? 'wall';
    s.hpMax = o.hp ?? 60;
    s.totalCells = total;
    s.aliveCells = total;

    const jitter = o.jitter ?? 0.14;
    const half = cell * 0.5;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const idx = s.index(i, j, k);
          s.hp[idx] = s.hpMax;
          s.alive[idx] = 1;
          const slot = this.used++;
          s.slot[idx] = slot;
          _m.makeScale(cell, cell, cell);
          _m.setPosition(s.origin.x + i * cell + half, s.origin.y + j * cell + half, s.origin.z + k * cell + half);
          this.mesh.setMatrixAt(slot, _m);
          // 体素噪点：同色系轻微色差，制造像素块质感
          const jt = 1 + (Math.random() - 0.5) * jitter;
          _c.copy(s.baseColor).multiplyScalar(jt);
          this.mesh.setColorAt(slot, _c);
        }
      }
    }
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.stats.cells += total;
    this.structures.push(s);
    return s;
  }

  private hideCell(s: VoxelStructure, idx: number): void {
    const slot = s.slot[idx];
    if (slot < 0) return;
    this.mesh.setMatrixAt(slot, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    // 注意：slot 保持不变，只把 alive 置 0，便于 reset() 时原地恢复
  }

  /** 对指定单元造成伤害 */
  damageCell(s: VoxelStructure, idx: number, dmg: number, fromX = 0, fromY = 0, fromZ = 0): boolean {
    if (!s.alive[idx]) return false;
    s.hp[idx] = Math.max(0, s.hp[idx] - dmg);
    if (s.hp[idx] > 0) {
      // 受损变暗（打凹痕的视觉反馈）
      const slot = s.slot[idx];
      if (slot >= 0) {
        const t = s.hp[idx] / s.hpMax;
        _c.copy(s.baseColor).multiplyScalar(0.45 + 0.55 * t);
        this.mesh.setColorAt(slot, _c);
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      }
      return false;
    }
    s.alive[idx] = 0;
    s.aliveCells--;
    this.hideCell(s, idx);
    this.stats.destroyed++;

    // 碎块：沿伤害来源反方向抛射
    const i = idx % s.nx;
    const j = Math.floor(idx / s.nx) % s.ny;
    const k = Math.floor(idx / (s.nx * s.ny));
    s.cellCenter(i, j, k, _p);
    let dx = _p.x - fromX, dy = _p.y - fromY, dz = _p.z - fromZ;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const sp = 3 + Math.random() * 6;
    this.debris.spawn(
      _p.x, _p.y, _p.z,
      dx * sp + (Math.random() - 0.5) * 2,
      Math.abs(dy) * sp + 2 + Math.random() * 3,
      dz * sp + (Math.random() - 0.5) * 2,
      s.cell * (0.6 + Math.random() * 0.5),
      s.debrisColor,
      2.6 + Math.random() * 1.6,
    );
    this.onChange?.(_p.x, _p.y, _p.z, s.cell * 2.2);
    return true;
  }

  /**
   * 球形范围破坏（爆炸 / 震荡波）。
   * 返回被摧毁的单元数量。
   */
  damageSphere(cx: number, cy: number, cz: number, radius: number, damage: number): number {
    let destroyed = 0;
    const r2 = radius * radius;
    for (let si = 0; si < this.structures.length; si++) {
      const s = this.structures[si];
      if (s.aliveCells === 0) continue;
      _sphereBox.min.set(cx - radius, cy - radius, cz - radius);
      _sphereBox.max.set(cx + radius, cy + radius, cz + radius);
      if (!s.box.intersectsBox(_sphereBox)) continue;

      const i0 = Math.max(0, Math.floor((cx - radius - s.origin.x) / s.cell));
      const i1 = Math.min(s.nx - 1, Math.ceil((cx + radius - s.origin.x) / s.cell));
      const j0 = Math.max(0, Math.floor((cy - radius - s.origin.y) / s.cell));
      const j1 = Math.min(s.ny - 1, Math.ceil((cy + radius - s.origin.y) / s.cell));
      const k0 = Math.max(0, Math.floor((cz - radius - s.origin.z) / s.cell));
      const k1 = Math.min(s.nz - 1, Math.ceil((cz + radius - s.origin.z) / s.cell));
      const half = s.cell * 0.5;

      for (let k = k0; k <= k1; k++) {
        const pz = s.origin.z + k * s.cell + half;
        for (let j = j0; j <= j1; j++) {
          const py = s.origin.y + j * s.cell + half;
          for (let i = i0; i <= i1; i++) {
            const idx = s.index(i, j, k);
            if (!s.alive[idx]) continue;
            const px = s.origin.x + i * s.cell + half;
            const dx = px - cx, dy = py - cy, dz = pz - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > r2) continue;
            // 线性衰减：中心全额，边缘 30%
            const falloff = 1 - 0.7 * (Math.sqrt(d2) / radius);
            if (this.damageCell(s, idx, damage * falloff, cx, cy, cz)) destroyed++;
          }
        }
      }
    }
    return destroyed;
  }

  /** CellProvider：收集与 AABB 重叠的存活单元（供角色碰撞使用） */
  collectOverlapCells(box: THREE.Box3, out: THREE.Box3[]): void {
    this.cellPoolUsed = 0;
    for (let si = 0; si < this.structures.length; si++) {
      const s = this.structures[si];
      if (s.aliveCells === 0) continue;
      if (!s.box.intersectsBox(box)) continue;
      const i0 = Math.max(0, Math.floor((box.min.x - s.origin.x) / s.cell));
      const i1 = Math.min(s.nx - 1, Math.floor((box.max.x - s.origin.x) / s.cell));
      const j0 = Math.max(0, Math.floor((box.min.y - s.origin.y) / s.cell));
      const j1 = Math.min(s.ny - 1, Math.floor((box.max.y - s.origin.y) / s.cell));
      const k0 = Math.max(0, Math.floor((box.min.z - s.origin.z) / s.cell));
      const k1 = Math.min(s.nz - 1, Math.floor((box.max.z - s.origin.z) / s.cell));
      for (let k = k0; k <= k1; k++) {
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const idx = s.index(i, j, k);
            if (!s.alive[idx]) continue;
            const b = this.take();
            b.min.set(s.origin.x + i * s.cell, s.origin.y + j * s.cell, s.origin.z + k * s.cell);
            b.max.set(b.min.x + s.cell, b.min.y + s.cell, b.min.z + s.cell);
            out.push(b);
          }
        }
      }
    }
  }

  private take(): THREE.Box3 {
    if (this.cellPoolUsed < this.cellPool.length) return this.cellPool[this.cellPoolUsed++];
    const b = new THREE.Box3();
    this.cellPool.push(b);
    this.cellPoolUsed++;
    return b;
  }

  /** CellProvider 接口实现 */
  raycast(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; nx: number; ny: number; nz: number },
  ): boolean {
    const h = this._hit;
    if (this.raycastVoxel(o, d, maxDist, h)) {
      out.dist = h.dist; out.nx = h.nx; out.ny = h.ny; out.nz = h.nz;
      return true;
    }
    return false;
  }

  private _hit = makeVoxelHit();

  /** 完整体素射线检测（带结构体/单元信息，供伤害判定） */
  raycastVoxel(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, out: VoxelHit): boolean {
    out.dist = Infinity;
    out.struct = null;
    out.cell = -1;
    let best = maxDist;
    let found = false;

    for (let si = 0; si < this.structures.length; si++) {
      const s = this.structures[si];
      if (s.aliveCells === 0) continue;

      // 1) 射线 vs 结构体 AABB，求进入参数 t0
      let t0 = 0;
      let t1 = best;
      let ok = true;
      let entryAxis = 0;
      for (let a = 0; a < 3; a++) {
        const key = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
        const dv = (d as any)[key] as number;
        const ov = (o as any)[key] as number;
        const mn = (s.box.min as any)[key] as number;
        const mx = (s.box.max as any)[key] as number;
        if (Math.abs(dv) < 1e-9) {
          if (ov < mn || ov > mx) { ok = false; break; }
          continue;
        }
        const inv = 1 / dv;
        let ta = (mn - ov) * inv;
        let tb = (mx - ov) * inv;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        if (ta > t0) { t0 = ta; entryAxis = a; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (!ok || t0 > best) continue;
      if (t0 < 0) t0 = 0;

      // 2) DDA 网格步进
      const eps = 1e-4;
      let t = t0 + eps;
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      let ix = Math.floor((px - s.origin.x) / s.cell);
      let iy = Math.floor((py - s.origin.y) / s.cell);
      let iz = Math.floor((pz - s.origin.z) / s.cell);
      ix = Math.min(s.nx - 1, Math.max(0, ix));
      iy = Math.min(s.ny - 1, Math.max(0, iy));
      iz = Math.min(s.nz - 1, Math.max(0, iz));

      const sx = d.x > 0 ? 1 : d.x < 0 ? -1 : 0;
      const sy = d.y > 0 ? 1 : d.y < 0 ? -1 : 0;
      const sz = d.z > 0 ? 1 : d.z < 0 ? -1 : 0;
      const tdx = d.x !== 0 ? Math.abs(s.cell / d.x) : Infinity;
      const tdy = d.y !== 0 ? Math.abs(s.cell / d.y) : Infinity;
      const tdz = d.z !== 0 ? Math.abs(s.cell / d.z) : Infinity;
      let tx = d.x > 0 ? (s.origin.x + (ix + 1) * s.cell - o.x) / d.x
        : d.x < 0 ? (s.origin.x + ix * s.cell - o.x) / d.x : Infinity;
      let ty = d.y > 0 ? (s.origin.y + (iy + 1) * s.cell - o.y) / d.y
        : d.y < 0 ? (s.origin.y + iy * s.cell - o.y) / d.y : Infinity;
      let tz = d.z > 0 ? (s.origin.z + (iz + 1) * s.cell - o.z) / d.z
        : d.z < 0 ? (s.origin.z + iz * s.cell - o.z) / d.z : Infinity;
      if (tx < t) tx = t + tdx;
      if (ty < t) ty = t + tdy;
      if (tz < t) tz = t + tdz;

      let axis = entryAxis;
      const maxSteps = s.nx + s.ny + s.nz + 4;
      for (let step = 0; step < maxSteps; step++) {
        if (ix < 0 || ix >= s.nx || iy < 0 || iy >= s.ny || iz < 0 || iz >= s.nz) break;
        if (t > best) break;
        const idx = s.index(ix, iy, iz);
        if (s.alive[idx]) {
          best = t;
          found = true;
          out.dist = t;
          out.struct = s;
          out.cell = idx;
          out.nx = axis === 0 ? -sx : 0;
          out.ny = axis === 1 ? -sy : 0;
          out.nz = axis === 2 ? -sz : 0;
          break;
        }
        const nxt = Math.min(tx, ty, tz);
        if (nxt === tx) { axis = 0; ix += sx; tx += tdx; }
        else if (nxt === ty) { axis = 1; iy += sy; ty += tdy; }
        else { axis = 2; iz += sz; tz += tdz; }
        t = nxt;
      }
    }
    return found;
  }

  update(dt: number): void {
    this.debris.update(dt);
  }

  /** 比赛重置：恢复所有被破坏的单元 */
  reset(): void {
    this.debris.clear();
    this.stats.destroyed = 0;
    // 重建所有结构（简单可靠：地图规模可控）
    for (const s of this.structures) {
      s.alive.fill(1);
      s.hp.fill(s.hpMax);
      s.aliveCells = s.totalCells;
      const half = s.cell * 0.5;
      for (let k = 0; k < s.nz; k++) {
        for (let j = 0; j < s.ny; j++) {
          for (let i = 0; i < s.nx; i++) {
            const idx = s.index(i, j, k);
            const slot = s.slot[idx];
            if (slot < 0) continue;
            _m.makeScale(s.cell, s.cell, s.cell);
            _m.setPosition(s.origin.x + i * s.cell + half, s.origin.y + j * s.cell + half, s.origin.z + k * s.cell + half);
            this.mesh.setMatrixAt(slot, _m);
            _c.copy(s.baseColor).multiplyScalar(1 + (Math.random() - 0.5) * 0.14);
            this.mesh.setColorAt(slot, _c);
          }
        }
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
