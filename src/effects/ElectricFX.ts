import * as THREE from 'three';

/**
 * 电击特效：LineSegments 池 + 加色混合材质。
 * 电弧由若干折线段组成，每帧重新抖动顶点，形成"跳动"的电流感。
 */
export class ElectricFX {
  mesh: THREE.LineSegments;
  private cap: number;
  /** 每条弧：起点、终点、生命 */
  private ax: Float32Array; private ay: Float32Array; private az: Float32Array;
  private bx: Float32Array; private by: Float32Array; private bz: Float32Array;
  private life: Float32Array; private maxLife: Float32Array;
  private seed: Float32Array;
  private cursor = 0;
  /** 每条弧占用的线段数 */
  static SEGS = 7;

  constructor(cap = 14) {
    this.cap = cap;
    const segs = cap * ElectricFX.SEGS;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(segs * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.ax = new Float32Array(cap); this.ay = new Float32Array(cap); this.az = new Float32Array(cap);
    this.bx = new Float32Array(cap); this.by = new Float32Array(cap); this.bz = new Float32Array(cap);
    this.life = new Float32Array(cap); this.maxLife = new Float32Array(cap);
    this.seed = new Float32Array(cap);
  }

  /** 两点之间的电弧 */
  arc(ax: number, ay: number, az: number, bx: number, by: number, bz: number, life = 0.13): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.ax[i] = ax; this.ay[i] = ay; this.az[i] = az;
    this.bx[i] = bx; this.by[i] = by; this.bz[i] = bz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.seed[i] = Math.random() * 100;
  }

  /** 以点为中心的爆散电弧（被电击命中的角色） */
  burst(x: number, y: number, z: number, radius = 0.55): void {
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI;
      const r = radius * (0.5 + Math.random() * 0.8);
      this.arc(
        x, y, z,
        x + Math.cos(a) * Math.cos(b) * r,
        y + Math.sin(b) * r,
        z + Math.sin(a) * Math.cos(b) * r,
        0.18 + Math.random() * 0.12,
      );
    }
  }

  update(dt: number, time: number): void {
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const segs = ElectricFX.SEGS;
    for (let i = 0; i < this.cap; i++) {
      const base = i * segs * 2 * 3;
      if (this.life[i] <= 0) {
        // 收起：所有顶点重合（不可见）
        for (let k = 0; k < segs * 2; k++) {
          arr[base + k * 3] = 0;
          arr[base + k * 3 + 1] = -9999;
          arr[base + k * 3 + 2] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const ax = this.ax[i], ay = this.ay[i], az = this.az[i];
      const dx = this.bx[i] - ax, dy = this.by[i] - ay, dz = this.bz[i] - az;
      let px = ax, py = ay, pz = az;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs;
        const t1 = (s + 1) / segs;
        let nx = ax + dx * t1, ny = ay + dy * t1, nz = az + dz * t1;
        if (s < segs - 1) {
          // 抖动量与时间相关，形成跳动电弧
          const j = 0.16 * (1 - Math.abs(t1 - 0.5) * 2) * t;
          const p = this.seed[i] + time * 22 + s * 3.1;
          nx += Math.sin(p * 1.7) * j;
          ny += Math.cos(p * 2.3) * j;
          nz += Math.sin(p * 3.1) * j;
        }
        const o = base + s * 6;
        arr[o] = px; arr[o + 1] = py; arr[o + 2] = pz;
        arr[o + 3] = nx; arr[o + 4] = ny; arr[o + 5] = nz;
        px = nx; py = ny; pz = nz;
      }
    }
    pos.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }
}
