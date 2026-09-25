import * as THREE from 'three';
import { blockTexture, BLOCK_COLORS, makeRng } from './textures.js';

export const B = 2;                 // 方块边长
export const GRID = 30;             // 世界半径（格），实际 -30..29
const HALF = GRID;

export class World {
  constructor(seed = 20260919) {
    this.rng = makeRng(seed);
    this.solids = new Set();        // "x,y,z"
    this.types = new Map();         // "x,y,z" -> 类型名
    this.group = new THREE.Group();
    this.meshes = [];
    this.spawnPoints = [];
    this._box = new THREE.Box3();
    this.generate();
    this.build();
  }

  key(x, y, z) { return x + ',' + y + ',' + z; }

  set(x, y, z, type) {
    const key = this.key(x, y, z);
    if (this.solids.has(key)) return;
    this.solids.add(key);
    this.types.set(key, type);
  }

  remove(x, y, z) {
    const key = this.key(x, y, z);
    this.solids.delete(key);
    this.types.delete(key);
  }

  typeAt(x, y, z) { return this.types.get(this.key(x, y, z)); }
  isSolid(x, y, z) { return this.solids.has(this.key(x, y, z)); }

  /** 世界坐标 -> 该点是否为实心方块 */
  isSolidAtWorld(x, y, z) {
    return this.isSolid(Math.floor(x / B), Math.floor(y / B), Math.floor(z / B));
  }

  /** 从 (x,y,z) 向下投射，返回脚下第一个实心方块的顶面高度 */
  groundBelow(x, y, z, maxDrop = 80) {
    const hit = this.raycast(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0), maxDrop);
    if (!hit) return -50;
    if (hit.dist === 0) return y;
    return hit.point.y;
  }

  /** 地面高度（世界坐标）：从 maxY 往下找第一个实心方块的顶面 */
  groundHeight(x, z, maxY = 40) {
    const gx = Math.floor(x / B), gz = Math.floor(z / B);
    for (let gy = maxY; gy >= -2; gy--) {
      if (this.isSolid(gx, gy, gz)) return (gy + 1) * B;
    }
    return B;
  }

  // ---------------------------------------------------------------- 生成
  generate() {
    const rng = this.rng;
    const R = HALF;

    // 地面：两层，表层按区域用不同材质
    for (let x = -R; x < R; x++) {
      for (let z = -R; z < R; z++) {
        this.set(x, -2, z, 'stone');
        this.set(x, -1, z, 'dirt');
        const d = Math.hypot(x, z);
        let t = 'grass';
        if (d < 7) t = 'concrete';
        else if (rng() < 0.06) t = 'sand';
        this.set(x, 0, z, t);
      }
    }

    // 十字主干道
    for (let x = -R; x < R; x++) {
      for (const z of [-1, 0]) this.set(x, 0, z, 'road');
    }
    for (let z = -R; z < R; z++) {
      for (const x of [-1, 0]) this.set(x, 0, z, 'road');
    }

    // 外围高墙
    for (let i = -R - 1; i <= R; i++) {
      for (let y = 0; y < 7; y++) {
        const t = y % 3 === 2 ? 'concrete' : 'stone';
        this.set(i, y, -R - 1, t);
        this.set(i, y, R, t);
        this.set(-R - 1, y, i, t);
        this.set(R, y, i, t);
      }
    }

    // 建筑
    const buildings = 11;
    for (let i = 0; i < buildings; i++) this._building();

    // 集装箱 / 掩体
    for (let i = 0; i < 34; i++) this._crate();

    // 高台 + 阶梯
    for (let i = 0; i < 4; i++) this._platform();

    // 随机柱子
    for (let i = 0; i < 18; i++) {
      const x = ((rng() * 2 - 1) * (R - 6)) | 0;
      const z = ((rng() * 2 - 1) * (R - 6)) | 0;
      const h = 1 + ((rng() * 3) | 0);
      const t = rng() < 0.5 ? 'stone' : 'brick';
      for (let y = 1; y <= h; y++) this.set(x, y, z, t);
    }

    // 出生点：中心广场 + 四角
    this.spawnPoints.push(new THREE.Vector3(0, B, 0));
    const corners = [[-R + 4, -R + 4], [R - 5, R - 5], [-R + 4, R - 5], [R - 5, -R + 4]];
    for (const [x, z] of corners) {
      this.spawnPoints.push(new THREE.Vector3(x * B + B / 2, B, z * B + B / 2));
    }
  }

  _building() {
    const rng = this.rng;
    const R = HALF - 4;
    const w = 5 + ((rng() * 5) | 0);
    const d = 5 + ((rng() * 5) | 0);
    const h = 4 + ((rng() * 3) | 0);
    const ox = ((rng() * 2 - 1) * R) | 0;
    const oz = ((rng() * 2 - 1) * R) | 0;

    // 不要压住中心广场
    if (Math.abs(ox) < 8 && Math.abs(oz) < 8) return;

    const wallT = ['brick', 'concrete', 'wood', 'rust'][(rng() * 4) | 0];
    const floorT = 'wood';

    for (let x = ox; x < ox + w; x++) {
      for (let z = oz; z < oz + d; z++) {
        this.set(x, 0, z, floorT);
        if (x === ox || x === ox + w - 1 || z === oz || z === oz + d - 1) {
          for (let y = 1; y <= h; y++) {
            // 门洞
            const onX = x === ox || x === ox + w - 1;
            const onZ = z === oz || z === oz + d - 1;
            const midX = Math.abs(z - (oz + (d >> 1))) <= 1;
            const midZ = Math.abs(x - (ox + (w >> 1))) <= 1;
            if (y <= 2 && ((onX && midX) || (onZ && midZ))) continue;
            // 窗户
            if (y >= 2 && y <= 3 && (((x - ox) % 3 === 1) || ((z - oz) % 4 === 2)) && rng() < 0.55) continue;
            this.set(x, y, z, wallT);
          }
        }
      }
    }

    // 屋顶（部分加盖，留出可上人的平台）
    if (rng() < 0.5) {
      for (let x = ox; x < ox + w; x++) {
        for (let z = oz; z < oz + d; z++) {
          if (rng() < 0.25) continue;
          this.set(x, h + 1, z, 'metal');
        }
      }
    }
  }

  _crate() {
    const rng = this.rng;
    const R = HALF - 5;
    const x = ((rng() * 2 - 1) * R) | 0;
    const z = ((rng() * 2 - 1) * R) | 0;
    const stack = 1 + ((rng() * 3) | 0);
    const t = rng() < 0.35 ? 'metal' : 'crate';
    for (let y = 1; y <= stack; y++) this.set(x, y, z, t);
    // 顺带塞几个相邻箱子形成掩体群
    if (rng() < 0.5) this.set(x + 1, 1, z, t);
    if (rng() < 0.4) this.set(x, 1, z + 1, t);
  }

  _platform() {
    const rng = this.rng;
    const R = HALF - 8;
    const x = ((rng() * 2 - 1) * R) | 0;
    const z = ((rng() * 2 - 1) * R) | 0;
    const w = 4 + ((rng() * 3) | 0);
    const d = 4 + ((rng() * 3) | 0);
    const h = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) this.set(x + i, h, z + j, 'metal');
    }
    // 阶梯
    const dir = (rng() * 4) | 0;
    for (let s = 0; s < h; s++) {
      for (let k = 0; k < 2; k++) {
        const px = dir === 0 ? x - 1 - s : dir === 1 ? x + w + s : x + ((rng() * w) | 0);
        const pz = dir === 2 ? z - 1 - s : dir === 3 ? z + d + s : z + ((rng() * d) | 0);
        this.set(px, s + 1, pz, 'concrete');
      }
    }
  }

  // ---------------------------------------------------------------- 渲染
  build() {
    const byType = new Map();
    for (const [key, type] of this.types) {
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(key);
    }

    const geo = new THREE.BoxGeometry(B, B, B);
    const mat4 = new THREE.Matrix4();

    for (const [type, keys] of byType) {
      const mat = new THREE.MeshLambertMaterial({ map: blockTexture(type) });
      const mesh = new THREE.InstancedMesh(geo, mat, keys.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      keys.forEach((key, i) => {
        const [x, y, z] = key.split(',').map(Number);
        mat4.makeTranslation(x * B + B / 2, y * B + B / 2, z * B + B / 2);
        mesh.setMatrixAt(i, mat4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.blockType = type;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** 供小地图使用：返回 y=1 层的占用网格 */
  occupancyGrid() {
    const n = HALF * 2;
    const grid = new Uint8Array(n * n);
    for (let x = -HALF; x < HALF; x++) {
      for (let z = -HALF; z < HALF; z++) {
        const t = this.isSolid(x, 1, z) ? 2 : (this.isSolid(x, 2, z) ? 1 : 0);
        grid[(z + HALF) * n + (x + HALF)] = t;
      }
    }
    return { grid, n };
  }

  // ---------------------------------------------------------------- 射线
  /**
   * 体素 DDA 射线检测
   * @returns {null|{dist:number,point:THREE.Vector3,normal:THREE.Vector3,type:string,gx:number,gy:number,gz:number}}
   */
  raycast(origin, dir, maxDist = 200) {
    let gx = Math.floor(origin.x / B);
    let gy = Math.floor(origin.y / B);
    let gz = Math.floor(origin.z / B);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const invX = dir.x !== 0 ? 1 / Math.abs(dir.x) : Infinity;
    const invY = dir.y !== 0 ? 1 / Math.abs(dir.y) : Infinity;
    const invZ = dir.z !== 0 ? 1 / Math.abs(dir.z) : Infinity;

    const nextBoundary = (o, g, step) => (step > 0 ? (g + 1) * B - o : o - g * B);

    let tMaxX = dir.x !== 0 ? nextBoundary(origin.x, gx, stepX) * invX : Infinity;
    let tMaxY = dir.y !== 0 ? nextBoundary(origin.y, gy, stepY) * invY : Infinity;
    let tMaxZ = dir.z !== 0 ? nextBoundary(origin.z, gz, stepZ) * invZ : Infinity;
    const tDeltaX = B * invX, tDeltaY = B * invY, tDeltaZ = B * invZ;

    let t = 0;
    let normal = new THREE.Vector3();
    // 起点已在方块内
    if (this.isSolid(gx, gy, gz)) {
      return { dist: 0, point: origin.clone(), normal: new THREE.Vector3(0, 1, 0), type: this.typeAt(gx, gy, gz), gx, gy, gz };
    }

    for (let i = 0; i < 512; i++) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        gx += stepX; t = tMaxX; tMaxX += tDeltaX;
        normal.set(-stepX, 0, 0);
      } else if (tMaxY < tMaxZ) {
        gy += stepY; t = tMaxY; tMaxY += tDeltaY;
        normal.set(0, -stepY, 0);
      } else {
        gz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
        normal.set(0, 0, -stepZ);
      }
      if (t > maxDist) return null;
      if (Math.abs(gx) > HALF + 3 || gy < -4 || gy > 60 || Math.abs(gz) > HALF + 3) return null;
      if (this.isSolid(gx, gy, gz)) {
        const point = origin.clone().addScaledVector(dir, t);
        return { dist: t, point, normal, type: this.typeAt(gx, gy, gz) || 'stone', gx, gy, gz };
      }
    }
    return null;
  }

  /** AABB（以脚底中心为原点）是否与实心方块相交 */
  boxOverlaps(px, py, pz, halfW, height) {
    const x0 = Math.floor((px - halfW) / B), x1 = Math.floor((px + halfW) / B);
    const z0 = Math.floor((pz - halfW) / B), z1 = Math.floor((pz + halfW) / B);
    const y0 = Math.floor(py / B), y1 = Math.floor((py + height - 0.001) / B);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (let y = y0; y <= y1; y++)
          if (this.isSolid(x, y, z)) return true;
    return false;
  }

  /** 找到 (px,pz) 附近一个安全的落地点（用于敌人生成 / 传送） */
  safeSpawn(rng = Math.random) {
    const R = HALF - 5;
    for (let i = 0; i < 60; i++) {
      const x = ((rng() * 2 - 1) * R) | 0;
      const z = ((rng() * 2 - 1) * R) | 0;
      const y = this.groundHeight(x * B + B / 2, z * B + B / 2, 40);
      if (y > B * 12) continue;                      // 太高不要
      if (this.boxOverlaps(x * B + B / 2, y, z * B + B / 2, 0.6, 2.2)) continue;
      return new THREE.Vector3(x * B + B / 2, y, z * B + B / 2);
    }
    return new THREE.Vector3(0, B, 0);
  }
}

export function blockColor(name) {
  return BLOCK_COLORS[name] ?? 0x8b8b8b;
}
