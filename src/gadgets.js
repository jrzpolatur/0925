import * as THREE from 'three';

/** 点到线段的最短距离 */
export function distPointSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const len2 = ab.lengthSq() || 1;
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / len2, 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/** 线段是否穿过球体（射击方在球外才算被挡） */
export function segmentHitsSphere(a, b, center, radius) {
  if (a.distanceTo(center) <= radius) return false;
  // 先做包围盒快速排除
  const minX = Math.min(a.x, b.x) - radius, maxX = Math.max(a.x, b.x) + radius;
  const minY = Math.min(a.y, b.y) - radius, maxY = Math.max(a.y, b.y) + radius;
  const minZ = Math.min(a.z, b.z) - radius, maxZ = Math.max(a.z, b.z) + radius;
  if (center.x < minX || center.x > maxX || center.y < minY || center.y > maxY || center.z < minZ || center.z > maxZ) return false;
  return distPointSegment(center, a, b) < radius;
}

// ---------------------------------------------------------------- 球形护盾
export class DomeShields {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.list = [];
    this.geo = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  }

  deploy(pos, opts = {}) {
    const radius = opts.radius ?? 4.5;
    const life = opts.life ?? 16;
    const hp = opts.hp ?? 260;

    const g = new THREE.Group();
    g.position.copy(pos);

    const shellMat = new THREE.MeshLambertMaterial({
      color: 0x63b8ff, transparent: true, opacity: 0.0,
      side: THREE.DoubleSide, depthWrite: false, emissive: 0x1a4a7a, emissiveIntensity: 0.5,
    });
    const shell = new THREE.Mesh(this.geo, shellMat);
    shell.scale.setScalar(radius);
    g.add(shell);

    const gridMat = new THREE.MeshBasicMaterial({
      color: 0xa8e0ff, wireframe: true, transparent: true, opacity: 0.0, depthWrite: false,
    });
    const grid = new THREE.Mesh(this.geo, gridMat);
    grid.scale.setScalar(radius * 0.995);
    g.add(grid);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7fd0ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 6, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);

    // 中央发生器
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2a3a4a, emissive: 0x1a4a7a, emissiveIntensity: 0.7 })
    );
    core.position.y = 0.35;
    g.add(core);

    this.scene.add(g);
    const d = { group: g, shellMat, gridMat, ringMat, pos: pos.clone(), radius, life, t: 0, hp, maxHp: hp, core };
    this.list.push(d);
    return d;
  }

  /** 这条射线是否被某个护盾挡下 */
  blocks(a, b, hitPointOut) {
    for (const d of this.list) {
      if (d.t < 0.35) continue;
      if (!segmentHitsSphere(a, b, d.pos, d.radius)) continue;
      if (hitPointOut) {
        // 近似命中点：球面上最靠近线段的点朝射手方向
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        hitPointOut.copy(d.pos).add(
          mid.sub(d.pos).normalize().multiplyScalar(d.radius)
        );
      }
      return d;
    }
    return null;
  }

  /** 护盾吃伤害 */
  absorb(d, amount) {
    d.hp -= amount;
    if (d.hp <= 0) d.life = Math.min(d.life, 0.25);
  }

  clear() {
    for (const d of this.list) { this.scene.remove(d.group); d.shellMat.dispose(); d.gridMat.dispose(); d.ringMat.dispose(); }
    this.list.length = 0;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.group);
        d.shellMat.dispose(); d.gridMat.dispose(); d.ringMat.dispose();
        this.list.splice(i, 1);
        continue;
      }
      const grow = Math.min(1, d.t / 0.45);
      const k = 1 - Math.pow(1 - grow, 3);
      d.group.scale.setScalar(0.25 + 0.75 * k);
      const fade = Math.min(1, d.life / 1.6);
      const dmgK = Math.max(0.25, d.hp / d.maxHp);
      const base = d.t < 0.45 ? k : 1;
      d.shellMat.opacity = 0.26 * base * fade * dmgK;
      d.gridMat.opacity = 0.22 * base * fade;
      d.ringMat.opacity = 0.75 * base * fade;
      d.core.rotation.y += dt * 1.6;
      d.core.position.y = 0.35 + Math.sin(d.t * 3) * 0.05;
    }
  }
}

// ---------------------------------------------------------------- 火箭弹
export class Rockets {
  constructor(scene, world, particles, sfx, opts = {}) {
    this.scene = scene; this.world = world; this.particles = particles; this.sfx = sfx;
    this.opts = opts;
    this.list = [];
    this.blockTest = null;   // (from,to) => dome|null
  }

  spawn(origin, dir, def, owner) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a5a3a });
    const warMat = new THREE.MeshLambertMaterial({ color: 0x9a3a2a });
    const finMat = new THREE.MeshLambertMaterial({ color: 0x2a3038 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.44), bodyMat);
    g.add(body);
    const war = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.16), warMat);
    war.position.z = -0.28;
    g.add(war);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.10), finMat);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.20);
      fin.rotation.z = a;
      g.add(fin);
    }
    g.position.copy(origin);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
    this.scene.add(g);

    this.list.push({
      mesh: g,
      vel: dir.clone().normalize().multiplyScalar(def.speed),
      def, owner, life: 6, t: 0, spin: Math.random() * 6,
    });
    this.sfx.rocket();
  }

  clear() {
    for (const r of this.list) this.scene.remove(r.mesh);
    this.list.length = 0;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt; r.life -= dt;
      const speed = r.vel.length();
      const step = r.vel.clone().multiplyScalar(dt);
      const next = r.mesh.position.clone().add(step);

      // 尾迹
      if (Math.random() < 0.9) {
        const back = r.mesh.position.clone().addScaledVector(r.vel.clone().normalize(), -0.3);
        this.particles.spawn(back, new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2 + 0.4, (Math.random() - 0.5) * 1.2), {
          color: Math.random() < 0.5 ? 0x9a9a9a : 0xd8d8d8,
          life: 0.55 + Math.random() * 0.5, size: 0.12 + Math.random() * 0.2, grav: -0.15, drag: 0.92,
        });
      }

      let hit = null;
      // 世界
      if (this.world.isSolidAtWorld(next.x, next.y, next.z)) hit = { point: next.clone() };
      // 敌人（敌方 AI 用 cls 缩放，生存模式敌人用 type.scale）
      if (!hit) {
        for (const e of this.opts.getEnemies?.() ?? []) {
          if (e.dead) continue;
          const s = e.type?.scale ?? (e.cls?.id === 'heavy' ? 1.18 : 1);
          const d = distPointSegment(e.pos.clone().setY(e.pos.y + 0.9), r.mesh.position, next);
          if (d < 1.1 * s) { hit = { point: next.clone(), enemy: e }; break; }
        }
      }
      // 护盾
      if (!hit && this.blockTest) {
        const dome = this.blockTest(r.mesh.position, next);
        if (dome) { hit = { point: next.clone(), dome }; }
      }

      r.mesh.position.copy(next);
      r.mesh.rotateZ(r.spin * dt);

      if (hit || r.life <= 0 || r.mesh.position.y < -20) {
        const p = hit ? hit.point : r.mesh.position.clone();
        if (hit?.dome) this.opts.onDomeHit?.(hit.dome, p);
        else {
          this.particles.explosion(p, r.def.radius * 0.8);
          this.sfx.explode();
          this.opts.onExplode?.(p, r.def);
        }
        this.scene.remove(r.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}
