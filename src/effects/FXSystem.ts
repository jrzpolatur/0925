import * as THREE from 'three';
import { CFG } from '../core/Config';
import { CoinFX } from './CoinFX';
import { ElectricFX } from './ElectricFX';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();

type ParticleKind = 'spark' | 'smoke' | 'flame' | 'dust' | 'blood' | 'shock';

/**
 * 统一特效系统（全部对象池化，运行期零 new）
 *  - 粒子：1 个 InstancedMesh
 *  - 曳光弹：1 个 LineSegments
 *  - 枪焰：10 个 Billboard 平面 + 共享点光源池
 *  - 冲击波环：10 个 RingMesh
 *  - 金币 / 电弧：独立池
 */
export class FXSystem {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  coins: CoinFX;
  electric: ElectricFX;

  // ---- 粒子 ----
  private pMesh: THREE.InstancedMesh;
  private pCap: number;
  private px!: Float32Array; private py!: Float32Array; private pz!: Float32Array;
  private pvx!: Float32Array; private pvy!: Float32Array; private pvz!: Float32Array;
  private plife!: Float32Array; private pmax!: Float32Array;
  private psize!: Float32Array; private pgrav!: Float32Array;
  private pdrag!: Float32Array; private pgrow!: Float32Array;
  private pcursor = 0;

  // ---- 曳光 ----
  private tMesh: THREE.LineSegments;
  private tCap: number;
  private tlife!: Float32Array;
  private tmax!: Float32Array;
  private tcursor = 0;

  // ---- 枪焰 ----
  private flashes: THREE.Mesh[] = [];
  private flashLife: number[] = [];
  private flashCursor = 0;
  // ---- 点光源（固定数量，避免 shader 重编译） ----
  private lights: THREE.PointLight[] = [];
  private lightLife: number[] = [];
  private lightPower: number[] = [];
  private lightCursor = 0;

  // ---- 冲击环 ----
  private rings: THREE.Mesh[] = [];
  private ringLife: number[] = [];
  private ringMax: number[] = [];
  private ringScale: number[] = [];
  private ringCursor = 0;

  private getGround: (x: number, z: number) => number;
  private onShake: (amount: number) => void;

  constructor(
    scene: THREE.Scene, camera: THREE.PerspectiveCamera,
    getGround: (x: number, z: number) => number,
    onShake: (amount: number) => void,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.getGround = getGround;
    this.onShake = onShake;

    // ---------- 粒子 ----------
    this.pCap = CFG.budget.particles;
    this.pMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }),
      this.pCap,
    );
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = this.pCap;
    this.pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.pCap * 3).fill(1), 3);
    this.px = new Float32Array(this.pCap); this.py = new Float32Array(this.pCap); this.pz = new Float32Array(this.pCap);
    this.pvx = new Float32Array(this.pCap); this.pvy = new Float32Array(this.pCap); this.pvz = new Float32Array(this.pCap);
    this.plife = new Float32Array(this.pCap); this.pmax = new Float32Array(this.pCap);
    this.psize = new Float32Array(this.pCap); this.pgrav = new Float32Array(this.pCap);
    this.pdrag = new Float32Array(this.pCap); this.pgrow = new Float32Array(this.pCap);
    for (let i = 0; i < this.pCap; i++) this.pMesh.setMatrixAt(i, _zero);
    scene.add(this.pMesh);

    // ---------- 曳光 ----------
    this.tCap = CFG.budget.tracers;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.tCap * 6), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.tCap * 6), 3));
    this.tMesh = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tMesh.frustumCulled = false;
    this.tlife = new Float32Array(this.tCap);
    this.tmax = new Float32Array(this.tCap);
    scene.add(this.tMesh);

    // ---------- 枪焰 ----------
    const flashGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
        color: 0xffd08a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }));
      m.visible = false;
      m.renderOrder = 10;
      scene.add(m);
      this.flashes.push(m);
      this.flashLife.push(0);
    }

    // ---------- 点光源 ----------
    for (let i = 0; i < CFG.budget.lights; i++) {
      const l = new THREE.PointLight(0xffd08a, 0, 14, 2);
      l.visible = true;
      scene.add(l);
      this.lights.push(l);
      this.lightLife.push(0);
      this.lightPower.push(0);
    }

    // ---------- 冲击环 ----------
    const ringGeo = new THREE.RingGeometry(0.82, 1, 24);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push(m);
      this.ringLife.push(0);
      this.ringMax.push(1);
      this.ringScale.push(1);
    }

    this.coins = new CoinFX(CFG.budget.coins, getGround);
    scene.add(this.coins.mesh);
    this.electric = new ElectricFX(16);
    scene.add(this.electric.mesh);
  }

  // ------------------------------------------------------------ 粒子
  private allocParticle(): number {
    for (let i = 0; i < this.pCap; i++) {
      const j = (this.pcursor + i) % this.pCap;
      if (this.plife[j] <= 0) { this.pcursor = (j + 1) % this.pCap; return j; }
    }
    const j = this.pcursor;
    this.pcursor = (j + 1) % this.pCap;
    return j;
  }

  spawn(
    kind: ParticleKind, x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, color: number, life = 0.8,
  ): void {
    const i = this.allocParticle();
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.pvx[i] = vx; this.pvy[i] = vy; this.pvz[i] = vz;
    this.psize[i] = size;
    this.plife[i] = life;
    this.pmax[i] = life;
    switch (kind) {
      case 'smoke':
        this.pgrav[i] = 1.2; this.pdrag[i] = 1.8; this.pgrow[i] = 2.2; break;
      case 'flame':
        this.pgrav[i] = 2.4; this.pdrag[i] = 2.2; this.pgrow[i] = -0.8; break;
      case 'dust':
        this.pgrav[i] = -1.5; this.pdrag[i] = 2.6; this.pgrow[i] = 1.2; break;
      case 'shock':
        this.pgrav[i] = -0.4; this.pdrag[i] = 1.0; this.pgrow[i] = 0.6; break;
      default: // spark / blood
        this.pgrav[i] = -14; this.pdrag[i] = 1.4; this.pgrow[i] = -0.5; break;
    }
    _c.set(color);
    this.pMesh.setColorAt(i, _c);
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ 对外特效
  /** 子弹命中环境：火花 + 灰尘 + 小烟 */
  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, color = 0xffd08a): void {
    for (let i = 0; i < 6; i++) {
      this.spawn('spark', x, y, z,
        nx * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3,
        ny * (2 + Math.random() * 5) + Math.random() * 3,
        nz * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3,
        0.05 + Math.random() * 0.05, color, 0.25 + Math.random() * 0.2);
    }
    this.spawn('dust', x, y, z, nx * 0.6, 0.6, nz * 0.6, 0.18, 0xb0a48c, 0.5);
  }

  /** 命中角色：红色火花 + 金币（金币在 Character.applyDamage 里） */
  hitFlesh(x: number, y: number, z: number): void {
    for (let i = 0; i < 5; i++) {
      this.spawn('blood', x, y, z,
        (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5,
        0.06, 0xff4455, 0.3);
    }
  }

  flame(x: number, y: number, z: number, scale = 1): void {
    this.spawn('flame', x, y, z,
      (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8,
      0.22 * scale, 0xff8a2a, 0.4 + Math.random() * 0.25);
    if (Math.random() < 0.5) {
      this.spawn('smoke', x, y + 0.3, z, (Math.random() - 0.5) * 0.5, 1.2, (Math.random() - 0.5) * 0.5,
        0.30 * scale, 0x4a4442, 0.9);
    }
  }

  smoke(x: number, y: number, z: number, scale = 1): void {
    this.spawn('smoke', x, y, z,
      (Math.random() - 0.5) * 1.4, 0.8 + Math.random(), (Math.random() - 0.5) * 1.4,
      0.4 * scale, 0x555055, 1.1 + Math.random() * 0.6);
  }

  /** 枪口焰：Billboard + 点光源 + 火花（生命周期 0.05s 级别，绝不遮挡准星） */
  muzzle(x: number, y: number, z: number, color = 0xffd08a, scale = 1): void {
    const i = this.flashCursor;
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    const m = this.flashes[i];
    m.position.set(x, y, z);
    m.visible = true;
    m.scale.setScalar(0.34 * scale);
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
    this.flashLife[i] = 0.055;

    const li = this.lightCursor;
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    this.lights[li].position.set(x, y, z);
    this.lights[li].color.set(color);
    this.lightLife[li] = 0.07;
    this.lightPower[li] = 9 * scale;

    for (let k = 0; k < 2; k++) {
      this.spawn('spark', x, y, z,
        (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
        0.035, color, 0.09);
    }
  }

  /** 曳光弹 */
  tracer(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color = 0xffe0a0): void {
    const i = this.tcursor;
    this.tcursor = (this.tcursor + 1) % this.tCap;
    this.tlife[i] = 0.06;
    this.tmax[i] = 0.06;
    const pos = this.tMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.tMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    pa[i * 6] = x1; pa[i * 6 + 1] = y1; pa[i * 6 + 2] = z1;
    pa[i * 6 + 3] = x2; pa[i * 6 + 4] = y2; pa[i * 6 + 5] = z2;
    _c.set(color);
    for (let k = 0; k < 2; k++) {
      ca[i * 6 + k * 3] = _c.r;
      ca[i * 6 + k * 3 + 1] = _c.g;
      ca[i * 6 + k * 3 + 2] = _c.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** 冲击波环 */
  ring(x: number, y: number, z: number, radius: number, color = 0xffffff): void {
    const i = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    const m = this.rings[i];
    m.position.set(x, y, z);
    m.visible = true;
    m.scale.setScalar(0.2);
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
    this.ringLife[i] = 0.45;
    this.ringMax[i] = 0.45;
    this.ringScale[i] = radius;
  }

  /** 爆炸：闪光 + 火焰 + 烟雾 + 冲击波 + 屏幕反馈 */
  explosion(x: number, y: number, z: number, radius: number, color = 0xffa030, big = true): void {
    const li = this.lightCursor;
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    this.lights[li].position.set(x, y, z);
    this.lights[li].color.set(color);
    this.lightLife[li] = 0.35;
    this.lightPower[li] = big ? 46 : 18;

    this.ring(x, Math.max(0.1, y - 0.4), z, radius * 1.35, color);
    if (big) this.ring(x, y + 0.5, z, radius * 0.9, 0xffffff);

    const nFlame = big ? 26 : 8;
    const nSmoke = big ? 18 : 6;
    const nSpark = big ? 30 : 10;
    for (let i = 0; i < nFlame; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 9) * (big ? 1 : 0.6);
      this.spawn('flame', x, y, z,
        Math.cos(a) * sp, 2 + Math.random() * 7, Math.sin(a) * sp,
        0.3 + Math.random() * 0.35, Math.random() < 0.4 ? 0xffe08a : 0xff7a2a,
        0.35 + Math.random() * 0.35);
    }
    for (let i = 0; i < nSmoke; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1 + Math.random() * 4) * (big ? 1 : 0.6);
      this.spawn('smoke', x, y, z,
        Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp,
        0.5 + Math.random() * 0.5, 0x4a4642, 1.2 + Math.random() * 0.8);
    }
    for (let i = 0; i < nSpark; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.3) * 1.4;
      const sp = (6 + Math.random() * 16) * (big ? 1 : 0.7);
      this.spawn('spark', x, y, z,
        Math.cos(a) * sp, Math.sin(b) * sp, Math.sin(a) * sp,
        0.06 + Math.random() * 0.06, 0xffd070, 0.35 + Math.random() * 0.4);
    }
    if (big) {
      for (let i = 0; i < 10; i++) {
        this.spawn('shock', x, y, z,
          (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4,
          0.25, 0xfff0c0, 0.22);
      }
    }
  }

  dashTrail(x: number, y: number, z: number, color: number): void {
    this.spawn('smoke', x, y, z, 0, 0.4, 0, 0.22, color, 0.28);
  }

  dashBurst(x: number, y: number, z: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn('smoke', x, y, z, Math.cos(a) * 3, 0.8, Math.sin(a) * 3, 0.26, color, 0.35);
    }
    this.ring(x, y - 0.6, z, 1.6, color);
  }

  /** 金币爆散（命中少量 / 击杀大量） */
  coinBurst(x: number, y: number, z: number, count: number, scale = 1): void {
    this.coins.burst(x, y, z, count, scale);
  }

  electricBeam(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.electric.arc(ax, ay, az, bx, by, bz, 0.14);
  }

  electricBurst(x: number, y: number, z: number): void {
    this.electric.burst(x, y, z, 0.7);
  }

  shake(amount: number): void {
    this.onShake(amount);
  }

  // ------------------------------------------------------------ 更新
  update(dt: number, time: number): void {
    // 粒子
    let maxUsed = 0;
    for (let i = 0; i < this.pCap; i++) {
      if (this.plife[i] <= 0) continue;
      this.plife[i] -= dt;
      if (this.plife[i] <= 0) { this.pMesh.setMatrixAt(i, _zero); continue; }
      const t = this.plife[i] / this.pmax[i];
      this.pvy[i] += this.pgrav[i] * dt;
      const d = Math.max(0, 1 - this.pdrag[i] * dt);
      this.pvx[i] *= d; this.pvy[i] *= d; this.pvz[i] *= d;
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      this.pz[i] += this.pvz[i] * dt;
      const s = Math.max(0.001, this.psize[i] * (1 + this.pgrow[i] * (1 - t)));
      _p.set(this.px[i], this.py[i], this.pz[i]);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      this.pMesh.setMatrixAt(i, _m);
      if (i > maxUsed) maxUsed = i;
    }
    this.pMesh.count = Math.min(this.pCap, maxUsed + 1);
    this.pMesh.instanceMatrix.needsUpdate = true;

    // 曳光（消失时把线段压扁到远端，避免残留）
    const tpos = this.tMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tarr = tpos.array as Float32Array;
    for (let i = 0; i < this.tCap; i++) {
      if (this.tlife[i] <= 0) continue;
      this.tlife[i] -= dt;
      if (this.tlife[i] <= 0) {
        for (let k = 0; k < 6; k++) tarr[i * 6 + k] = 0;
      }
    }
    tpos.needsUpdate = true;

    // 枪焰
    for (let i = 0; i < this.flashes.length; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      const m = this.flashes[i];
      if (this.flashLife[i] <= 0) { m.visible = false; continue; }
      const t = this.flashLife[i] / 0.055;
      (m.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
      m.quaternion.copy(this.camera.quaternion);
    }

    // 点光源
    for (let i = 0; i < this.lights.length; i++) {
      if (this.lightLife[i] <= 0) { this.lights[i].intensity = 0; continue; }
      this.lightLife[i] -= dt;
      const t = Math.max(0, this.lightLife[i] / 0.35);
      this.lights[i].intensity = this.lightPower[i] * Math.min(1, t * 3);
      if (this.lightLife[i] <= 0) this.lights[i].intensity = 0;
    }

    // 冲击环
    for (let i = 0; i < this.rings.length; i++) {
      if (this.ringLife[i] <= 0) continue;
      this.ringLife[i] -= dt;
      const m = this.rings[i];
      if (this.ringLife[i] <= 0) { m.visible = false; continue; }
      const t = 1 - this.ringLife[i] / this.ringMax[i];
      m.scale.setScalar(0.2 + this.ringScale[i] * t);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
    }

    this.coins.update(dt, time);
    this.electric.update(dt, time);
  }

  clear(): void {
    this.plife.fill(0);
    for (let i = 0; i < this.pCap; i++) this.pMesh.setMatrixAt(i, _zero);
    this.pMesh.instanceMatrix.needsUpdate = true;
    this.tlife.fill(0);
    const tarr = (this.tMesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    tarr.fill(0);
    (this.tMesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    for (const m of this.flashes) m.visible = false;
    for (const l of this.lights) l.intensity = 0;
    for (const r of this.rings) r.visible = false;
    this.coins.clear();
    this.electric.clear();
  }
}
