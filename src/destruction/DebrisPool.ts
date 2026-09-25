import * as THREE from 'three';
import { CFG } from '../core/Config';

interface Debris {
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  size: number;
  life: number;
  maxLife: number;
  settled: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * 碎片对象池：单个 InstancedMesh 承载全部碎块。
 * - 不使用 new Particle()，全部预分配，运行期零 GC
 * - 生命周期结束后缩放到 0 并回收
 * - 地面碰撞用外部提供的 getGround 高度函数（O(1) 查询），不做逐物体射线检测
 */
export class DebrisPool {
  mesh: THREE.InstancedMesh;
  private items: Debris[] = [];
  private capacity: number;
  private cursor = 0;
  private getGround: (x: number, z: number) => number;
  activeCount = 0;

  constructor(capacity: number = CFG.budget.debris, getGround: (x: number, z: number) => number = () => 0) {
    this.capacity = capacity;
    this.getGround = getGround;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = capacity;
    // 预分配实例颜色缓冲
    const colors = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, _zero);
      this.items.push({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0,
        size: 0.2, life: 0, maxLife: 1, settled: false,
      });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, color: THREE.Color, life = 3.2,
  ): void {
    // 环形游标：池满时覆盖最老的碎片，绝不无限增长
    let idx = -1;
    for (let i = 0; i < this.capacity; i++) {
      const j = (this.cursor + i) % this.capacity;
      if (!this.items[j].active) { idx = j; break; }
    }
    if (idx === -1) { idx = this.cursor; }
    this.cursor = (idx + 1) % this.capacity;

    const d = this.items[idx];
    d.active = true;
    d.settled = false;
    d.x = x; d.y = y; d.z = z;
    d.vx = vx; d.vy = vy; d.vz = vz;
    d.rx = Math.random() * 6.28; d.ry = Math.random() * 6.28; d.rz = Math.random() * 6.28;
    d.wx = (Math.random() - 0.5) * 14; d.wy = (Math.random() - 0.5) * 14; d.wz = (Math.random() - 0.5) * 14;
    d.size = size;
    d.life = life;
    d.maxLife = life;

    this.mesh.setColorAt(idx, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      const d = this.items[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        this.mesh.setMatrixAt(i, _zero);
        continue;
      }
      if (!d.settled) {
        d.vy += CFG.gravity * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
        const g = this.getGround(d.x, d.z);
        if (d.y <= g + d.size * 0.5) {
          d.y = g + d.size * 0.5;
          if (Math.abs(d.vy) > 2.2) {
            d.vy = -d.vy * 0.32;
            d.vx *= 0.55; d.vz *= 0.55;
            d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5;
          } else {
            d.settled = true;
          }
        }
      }
      // 生命末期缩小消失，避免突然 pop
      const t = d.life / d.maxLife;
      const scale = d.size * (t < 0.25 ? t / 0.25 : 1);
      _p.set(d.x, d.y, d.z);
      _e.set(d.rx, d.ry, d.rz);
      _q.setFromEuler(_e);
      _s.set(scale, scale, scale);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      active++;
    }
    this.activeCount = active;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.items[i].active = false;
      this.mesh.setMatrixAt(i, _zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.activeCount = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
