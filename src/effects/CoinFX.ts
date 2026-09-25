import * as THREE from 'three';
import { CFG } from '../core/Config';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * 金币特效池（THE FINALS 标志性反馈：命中洒金币 / 击杀爆金币）
 * 单个 InstancedMesh，全部预分配，飞散 + 旋转 + 闪烁 + 生命周期回收。
 */
export class CoinFX {
  mesh: THREE.InstancedMesh;
  private cap: number;
  private x: Float32Array; private y: Float32Array; private z: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private rx: Float32Array; private ry: Float32Array; private rz: Float32Array;
  private wx: Float32Array; private wy: Float32Array;
  private life: Float32Array; private maxLife: Float32Array;
  private size: Float32Array;
  private cursor = 0;
  private getGround: (x: number, z: number) => number;
  private colorA = new THREE.Color(0xffd24a);
  private colorB = new THREE.Color(0xfff0b0);
  private c = new THREE.Color();

  constructor(cap = CFG.budget.coins, getGround: (x: number, z: number) => number = () => 0) {
    this.cap = cap;
    this.getGround = getGround;
    // 体素金币：扁平方块
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ emissive: 0x4a3300 });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = cap;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.vz = new Float32Array(cap);
    this.rx = new Float32Array(cap); this.ry = new Float32Array(cap); this.rz = new Float32Array(cap);
    this.wx = new Float32Array(cap); this.wy = new Float32Array(cap);
    this.life = new Float32Array(cap); this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(x: number, y: number, z: number, count: number, scale = 1): void {
    for (let i = 0; i < count; i++) {
      const idx = this.alloc();
      const a = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 6;
      const sp = (1.5 + Math.random() * 5) * scale;
      this.x[idx] = x + (Math.random() - 0.5) * 0.3;
      this.y[idx] = y + (Math.random() - 0.5) * 0.3;
      this.z[idx] = z + (Math.random() - 0.5) * 0.3;
      this.vx[idx] = Math.cos(a) * sp;
      this.vy[idx] = up * scale;
      this.vz[idx] = Math.sin(a) * sp;
      this.rx[idx] = Math.random() * 6.28;
      this.ry[idx] = Math.random() * 6.28;
      this.rz[idx] = Math.random() * 6.28;
      this.wx[idx] = (Math.random() - 0.5) * 18;
      this.wy[idx] = (Math.random() - 0.5) * 18;
      this.life[idx] = 1.1 + Math.random() * 0.9;
      this.maxLife[idx] = this.life[idx];
      this.size[idx] = (0.10 + Math.random() * 0.06) * scale;
      this.c.copy(Math.random() < 0.3 ? this.colorB : this.colorA);
      this.mesh.setColorAt(idx, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private alloc(): number {
    for (let i = 0; i < this.cap; i++) {
      const j = (this.cursor + i) % this.cap;
      if (this.life[j] <= 0) { this.cursor = (j + 1) % this.cap; return j; }
    }
    const j = this.cursor;
    this.cursor = (j + 1) % this.cap;
    return j;
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, _zero); continue; }
      this.vy[i] += CFG.gravity * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      this.rx[i] += this.wx[i] * dt;
      this.ry[i] += this.wy[i] * dt;
      const g = this.getGround(this.x[i], this.z[i]);
      if (this.y[i] < g + this.size[i]) {
        this.y[i] = g + this.size[i];
        if (Math.abs(this.vy[i]) > 1.5) {
          this.vy[i] = -this.vy[i] * 0.42;
          this.vx[i] *= 0.6; this.vz[i] *= 0.6;
        } else this.vy[i] = 0;
      }
      const t = this.life[i] / this.maxLife[i];
      // 闪烁：末期高频明暗
      const flick = t < 0.35 ? (0.55 + 0.45 * Math.sin(time * 40 + i)) : 1;
      const s = this.size[i] * (t < 0.25 ? t / 0.25 : 1) * flick;
      _p.set(this.x[i], this.y[i], this.z[i]);
      _e.set(this.rx[i], this.ry[i], this.rz[i]);
      _q.setFromEuler(_e);
      _s.set(s, s * 0.28, s);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < this.cap; i++) this.mesh.setMatrixAt(i, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.life[i] > 0) n++;
    return n;
  }
}
