import * as THREE from 'three';

const MAX = 900;

/** 像素方块粒子系统（InstancedMesh + 简易物理） */
export class Particles {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX;
    scene.add(this.mesh);

    this.onCoin = null;       // 金币被吸取时回调（节流使用）
    this.attract = null;      // 默认吸附点（由外部每帧更新为玩家眼睛位置）
    this.p = [];
    for (let i = 0; i < MAX; i++) {
      this.p.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0, maxLife: 1, size: 0.1, grav: 1, drag: 0.98,
        color: new THREE.Color(), spin: 0, rot: 0, attract: null,
      });
    }
    this.cursor = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this._c = new THREE.Color();

    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this._hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _next() {
    for (let i = 0; i < MAX; i++) {
      const idx = (this.cursor + i) % MAX;
      if (!this.p[idx].alive) { this.cursor = (idx + 1) % MAX; return this.p[idx]; }
    }
    this.cursor = (this.cursor + 1) % MAX;
    return this.p[this.cursor];
  }

  spawn(pos, vel, opts = {}) {
    const p = this._next();
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = 0;
    p.maxLife = opts.life ?? 0.6 + Math.random() * 0.5;
    p.size = opts.size ?? (0.06 + Math.random() * 0.1);
    p.grav = opts.grav ?? 1;
    p.drag = opts.drag ?? 0.97;
    p.spin = (Math.random() - 0.5) * 8;
    p.rot = Math.random() * Math.PI;
    p.color.set(opts.color ?? 0xffffff);
    p.attract = opts.attract || null;
    if (p.attract) p.spin *= 2.4;
    return p;
  }

  /** 金币：命中敌人时爆出，会自动飞向 target（通常是玩家） */
  coin(pos, target = this.attract, n = 1, spread = 3.2) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.8 + 1.8,
        (Math.random() - 0.5) * spread
      );
      this.spawn(pos, v, {
        color: Math.random() < 0.35 ? 0xfff0a0 : 0xffd54a,
        life: 1.8, size: 0.11 + Math.random() * 0.07,
        grav: 0, drag: 0.995, attract: target,
      });
    }
  }

  /** 命中方块：碎屑 */
  impact(point, normal, color) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(
        normal.x + (Math.random() - 0.5) * 1.4,
        normal.y + (Math.random() - 0.5) * 1.4 + 0.6,
        normal.z + (Math.random() - 0.5) * 1.4
      ).normalize().multiplyScalar(2.5 + Math.random() * 5);
      this.spawn(point, v, { color, life: 0.5 + Math.random() * 0.5, size: 0.07 + Math.random() * 0.09, grav: 1 });
    }
    // 灰尘
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      this.spawn(point, v, { color: 0xcccccc, life: 0.35, size: 0.14 + Math.random() * 0.1, grav: -0.15, drag: 0.9 });
    }
  }

  /** 命中敌人：像素血 */
  blood(point, color = 0xd02b2b) {
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 7, Math.random() * 4 + 1, (Math.random() - 0.5) * 7
      );
      this.spawn(point, v, { color, life: 0.4 + Math.random() * 0.4, size: 0.07 + Math.random() * 0.08, grav: 1.2 });
    }
  }

  /** 敌人死亡：炸成方块 */
  gib(pos, color, amount = 34) {
    for (let i = 0; i < amount; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 10, Math.random() * 9 + 2, (Math.random() - 0.5) * 10
      );
      this.spawn(pos, v, {
        color: Math.random() < 0.6 ? color : 0xd02b2b,
        life: 0.9 + Math.random() * 0.8,
        size: 0.12 + Math.random() * 0.22,
        grav: 1.25, drag: 0.985,
      });
    }
  }

  /** 爆炸 */
  explosion(pos, radius = 6) {
    for (let i = 0; i < 60; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5), (Math.random() - 0.2), (Math.random() - 0.5)
      ).normalize().multiplyScalar(4 + Math.random() * radius * 2.4);
      this.spawn(pos, v, {
        color: [0xffcc33, 0xff7722, 0xff3311, 0x555555][(Math.random() * 4) | 0],
        life: 0.5 + Math.random() * 0.7, size: 0.18 + Math.random() * 0.3, grav: 0.7, drag: 0.94,
      });
    }
  }

  muzzle(point, dir) {
    for (let i = 0; i < 6; i++) {
      const v = dir.clone().multiplyScalar(4 + Math.random() * 8)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      this.spawn(point, v, {
        color: [0xffe066, 0xffa733, 0x999999][(Math.random() * 3) | 0],
        life: 0.12 + Math.random() * 0.14, size: 0.06 + Math.random() * 0.1, grav: 0.2, drag: 0.85,
      });
    }
  }

  update(dt) {
    const m = this._m, q = this._q, e = this._e, s = this._s, col = this._c;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this._hidden);
        continue;
      }
      // 金币：被 target 吸引，碰到就回收
      if (p.attract) {
        const dx = p.attract.x - p.pos.x;
        const dy = p.attract.y - p.pos.y;
        const dz = p.attract.z - p.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.55) {
          p.alive = false;
          this.mesh.setMatrixAt(i, this._hidden);
          this.onCoin?.();
          continue;
        }
        const inv = 1 / Math.sqrt(d2);
        const pull = 78;
        p.vel.x += dx * inv * pull * dt;
        p.vel.y += dy * inv * pull * dt;
        p.vel.z += dz * inv * pull * dt;
      }

      p.vel.y -= 22 * p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vel.multiplyScalar(d);
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.spin * dt;

      const k = 1 - p.life / p.maxLife;
      const size = p.size * (0.35 + k * 0.65);
      e.set(p.rot, p.rot * 0.7, p.rot * 1.3);
      q.setFromEuler(e);
      s.setScalar(size);
      m.compose(p.pos, q, s);
      this.mesh.setMatrixAt(i, m);
      col.copy(p.color);
      this.mesh.setColorAt(i, col);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return any;
  }
}
