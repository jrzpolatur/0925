import * as THREE from 'three';
import { B } from './world.js';

export const ENEMY_TYPES = {
  grunt: {
    id: 'grunt', name: '暴徒', hp: 100, speed: 5.2, scale: 1,
    color: 0xb03a3a, headColor: 0xd9a274, hairColor: 0x30251a, eyeColor: 0x1b1f24, damage: 9, interval: 1.15,
    range: 38, spread: 0.045, prefer: 12, score: 100, melee: false, weapon: 'pistol',
  },
  runner: {
    id: 'runner', name: '狂奔者', hp: 70, speed: 9.2, scale: 0.92,
    color: 0x2f86c9, headColor: 0xe0b48a, hairColor: 0x3d2c18, eyeColor: 0x2b3a5a, damage: 17, interval: 0.9,
    range: 2.4, spread: 0, prefer: 1.6, score: 160, melee: true, weapon: 'melee',
  },
  brute: {
    id: 'brute', name: '重装兵', hp: 320, speed: 3.6, scale: 1.38,
    color: 0x5c6b3a, headColor: 0x9c7a4a, hairColor: 0x1c1c1c, eyeColor: 0xa02a2a, damage: 24, interval: 1.7,
    range: 18, spread: 0.13, prefer: 8, score: 300, melee: false, weapon: 'shotgun',
  },
  sniper: {
    id: 'sniper', name: '狙击手', hp: 85, speed: 3.4, scale: 1.02,
    color: 0x7a4a9c, headColor: 0xdcae82, hairColor: 0x241a2a, eyeColor: 0x1b1f24, damage: 32, interval: 2.5,
    range: 90, spread: 0.012, prefer: 46, score: 240, melee: false, weapon: 'sniper',
  },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * Minecraft 风格的体素小人（史蒂夫比例：总高 32px = 1.8m）
 * 头 8px / 身 8×12×4px / 手臂 4×12×4px / 腿 4×12×4px
 */
const PX = 0.05625;         // 1 像素 = 0.05625 米
const HEAD = 8 * PX;        // 0.45
const TORSO_H = 12 * PX;    // 0.675
const TORSO_W = 8 * PX;     // 0.45
const TORSO_D = 4 * PX;     // 0.225
const LIMB = 4 * PX;        // 0.225

export function buildBody(type) {
  const g = new THREE.Group();

  const shirt = new THREE.Color(type.color);
  const pants = shirt.clone().multiplyScalar(0.52);
  const sleeve = shirt.clone().multiplyScalar(0.92);
  const shoe = new THREE.Color(0x24282c);
  const hair = new THREE.Color(type.hairColor ?? 0x2b2118);
  const eye = new THREE.Color(type.eyeColor ?? 0x1b1f24);

  const bodyMat = new THREE.MeshLambertMaterial({ color: shirt });
  const headMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(type.headColor) });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const sleeveMat = new THREE.MeshLambertMaterial({ color: sleeve });
  const shoeMat = new THREE.MeshLambertMaterial({ color: shoe });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });
  const eyeMat = new THREE.MeshLambertMaterial({ color: eye });

  const part = (w, h, d, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ---- 腿（ pivot 在髋部 y = 0.675 ）
  const legL = new THREE.Group(); legL.position.set(-LIMB / 2, TORSO_H, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(LIMB / 2, TORSO_H, 0); g.add(legR);
  for (const leg of [legL, legR]) {
    part(LIMB, TORSO_H - 0.09, LIMB, pantsMat, 0, -(TORSO_H - 0.09) / 2, 0, leg);
    part(LIMB * 1.06, 0.09, LIMB * 1.12, shoeMat, 0, -TORSO_H + 0.045, -0.01, leg);  // 鞋
  }

  // ---- 躯干 0.675 → 1.35
  part(TORSO_W, TORSO_H, TORSO_D, bodyMat, 0, TORSO_H + TORSO_H / 2, 0);
  // 领口 / 腰带
  part(TORSO_W * 1.02, 0.06, TORSO_D * 1.03, pantsMat, 0, TORSO_H + 0.03, 0);
  // 胸前口袋
  part(TORSO_W * 0.42, TORSO_H * 0.26, 0.02, pantsMat, -TORSO_W * 0.22, TORSO_H + TORSO_H * 0.68, -TORSO_D / 2 - 0.01);

  // ---- 手臂（ pivot 在肩 y = 1.35 ）
  const shoulderX = TORSO_W / 2 + LIMB / 2;
  const armL = new THREE.Group(); armL.position.set(-shoulderX, TORSO_H * 2, 0); g.add(armL);
  const armR = new THREE.Group(); armR.position.set(shoulderX, TORSO_H * 2, 0); g.add(armR);
  for (const arm of [armL, armR]) {
    part(LIMB, TORSO_H - 0.11, LIMB, sleeveMat, 0, -(TORSO_H - 0.11) / 2, 0, arm);
    part(LIMB, 0.11, LIMB, headMat, 0, -TORSO_H + 0.055, 0, arm);   // 手
  }

  // ---- 头（ pivot 在脖子 y = 1.35，头中心 +0.225 ）
  const head = new THREE.Group(); head.position.set(0, TORSO_H * 2, 0); g.add(head);
  part(HEAD, HEAD, HEAD, headMat, 0, HEAD / 2, 0, head);
  // 头发：顶部 + 后脑 + 两侧
  part(HEAD * 1.02, HEAD * 0.30, HEAD * 1.02, hairMat, 0, HEAD - HEAD * 0.15, 0, head);
  part(HEAD * 1.02, HEAD * 0.62, HEAD * 0.16, hairMat, 0, HEAD * 0.62, HEAD / 2 - HEAD * 0.06, head);
  part(HEAD * 0.14, HEAD * 0.62, HEAD * 1.02, hairMat, -HEAD / 2 + HEAD * 0.05, HEAD * 0.62, 0, head);
  part(HEAD * 0.14, HEAD * 0.62, HEAD * 1.02, hairMat, HEAD / 2 - HEAD * 0.05, HEAD * 0.62, 0, head);
  // 眼睛 + 嘴（正面 = -Z）
  const fz = -HEAD / 2 - 0.006;
  part(HEAD * 0.16, HEAD * 0.18, 0.02, eyeMat, -HEAD * 0.22, HEAD * 0.56, fz, head);
  part(HEAD * 0.16, HEAD * 0.18, 0.02, eyeMat, HEAD * 0.22, HEAD * 0.56, fz, head);
  part(HEAD * 0.40, HEAD * 0.10, 0.02, eyeMat, 0, HEAD * 0.26, fz, head);

  // ---- 手中的武器
  const muzzle = new THREE.Object3D();
  const hand = -TORSO_H + 0.10;
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x2b3036 });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });

  if (type.weapon === 'melee') {
    const blade = new THREE.Group();
    blade.position.set(0, hand, -0.08);
    blade.rotation.x = -Math.PI / 2;   // 刀身顺着手臂方向
    armR.add(blade);
    part(0.05, 0.05, 0.30, woodMat, 0, 0, -0.10, blade);
    part(0.09, 0.04, 0.14, new THREE.MeshLambertMaterial({ color: 0xbfc7cf }), 0, 0.02, -0.32, blade);
    muzzle.position.set(0, hand, -0.42);
    armR.add(muzzle);
  } else {
    const gun = new THREE.Group();
    gun.position.set(0, hand, -0.10);
    // 枪身顺着手臂（手臂局部 -Y）延伸：手臂抬起指向前方时枪口也朝前，
    // 之前枪身沿 -Z，举枪后枪口是垂直于手臂朝下的
    gun.rotation.x = -Math.PI / 2;
    armR.add(gun);
    if (type.weapon === 'sniper') {
      part(0.07, 0.08, 0.46, gunMat, 0, 0, -0.12, gun);
      part(0.045, 0.045, 0.30, gunMat, 0, 0.01, -0.42, gun);
      part(0.06, 0.06, 0.16, woodMat, 0, -0.02, 0.10, gun);
      part(0.05, 0.05, 0.16, gunMat, 0, 0.07, -0.06, gun);
      muzzle.position.set(0, 0.01, -0.60);
    } else if (type.weapon === 'shotgun') {
      part(0.09, 0.09, 0.40, woodMat, 0, 0, -0.10, gun);
      part(0.04, 0.04, 0.34, gunMat, -0.025, 0.02, -0.36, gun);
      part(0.04, 0.04, 0.34, gunMat, 0.025, 0.02, -0.36, gun);
      muzzle.position.set(0, 0.02, -0.56);
    } else if (type.weapon === 'rifle') {
      part(0.08, 0.09, 0.40, gunMat, 0, 0, -0.10, gun);
      part(0.05, 0.05, 0.22, gunMat, 0, 0.02, -0.38, gun);
      part(0.06, 0.10, 0.08, woodMat, 0, -0.06, 0.08, gun);
      muzzle.position.set(0, 0.02, -0.52);
    } else { // pistol
      part(0.07, 0.09, 0.26, gunMat, 0, 0, -0.06, gun);
      part(0.06, 0.10, 0.07, woodMat, 0, -0.07, 0.06, gun);
      muzzle.position.set(0, 0.01, -0.26);
    }
    gun.add(muzzle);
  }

  return { group: g, armL, armR, legL, legR, head, bodyMat, headMat, muzzle };
}

export class Enemy {
  constructor(type, world, pos) {
    this.type = type;
    this.world = world;
    this.hp = type.hp;
    this.maxHp = type.hp;
    this.dead = false;
    this.removeMe = false;

    const built = buildBody(type);
    this.parts = built;
    this.obj = built.group;
    this.obj.scale.setScalar(type.scale);
    this.obj.position.copy(pos);

    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.radius = 0.5 * type.scale;
    this.height = 1.85 * type.scale;
    this.onGround = false;
    this.face = 0;
    this.walkPhase = Math.random() * 10;
    this.fireTimer = 0.6 + Math.random() * 0.8;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.blockedTimer = 0;
    this.flash = 0;
    this.spawnT = 0;
    this.deathT = 0;
    this.stagger = 0;
    this.burnT = 0;
    this.burnDps = 0;

    this.bodyBox = new THREE.Box3();
    this.headBox = new THREE.Box3();

    this._mats = [built.bodyMat, built.headMat];
    this._baseColors = this._mats.map(m => m.color.clone());
    this._baseEmissive = this._mats.map(m => m.emissive.clone());

    this.obj.scale.setScalar(0.01);
    this.updateBoxes();
  }

  updateBoxes() {
    const s = this.type.scale;
    const p = this.pos;
    this.bodyBox.min.set(p.x - 0.44 * s, p.y + 0.02, p.z - 0.40 * s);
    this.bodyBox.max.set(p.x + 0.44 * s, p.y + 1.36 * s, p.z + 0.40 * s);
    this.headBox.min.set(p.x - 0.25 * s, p.y + 1.34 * s, p.z - 0.25 * s);
    this.headBox.max.set(p.x + 0.25 * s, p.y + 1.82 * s, p.z + 0.25 * s);
  }

  muzzlePos(out = new THREE.Vector3()) {
    this.parts.muzzle.getWorldPosition(out);
    return out;
  }

  damage(amount, point, dir, head, particles) {
    if (this.dead) return false;
    this.hp -= amount;
    this.flash = 1;
    this.stagger = Math.min(0.35, this.stagger + amount * 0.004);
    if (dir) {
      this.vel.x += dir.x * Math.min(6, amount * 0.16);
      this.vel.z += dir.z * Math.min(6, amount * 0.16);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathT = 0;
      return true;
    }
    return false;
  }

  update(dt, player, ctx) {
    // 死亡处理
    if (this.dead) {
      this.deathT += dt;
      const k = 1 - Math.min(1, this.deathT / 0.35);
      this.obj.scale.setScalar(this.type.scale * k);
      this.obj.rotation.z += dt * 6;
      this.obj.position.y -= dt * 0.4;
      if (this.deathT > 0.4) this.removeMe = true;
      return;
    }

    // 燃烧持续伤害
    if (this.burnT > 0) {
      this.burnT -= dt;
      ctx.onBurn?.(this, this.burnDps * dt);
      if (Math.random() < dt * 22) {
        this.particles.spawn(
          this.pos.clone().setY(this.pos.y + 0.6 + Math.random() * 0.9)
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)),
          new THREE.Vector3(0, 1.4, 0),
          { color: [0xffdd44, 0xff9922, 0xff5511][(Math.random() * 3) | 0], life: 0.3, size: 0.16, grav: -0.5 }
        );
      }
    }

    // 出场动画
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
      const k = this.spawnT;
      this.obj.scale.setScalar(this.type.scale * (0.2 + 0.8 * k));
      if (this.spawnT < 1) {
        this.updateBoxes();
        return;
      }
    }

    this.flash = Math.max(0, this.flash - dt * 5);
    this.stagger = Math.max(0, this.stagger - dt * 2.2);
    for (let i = 0; i < this._mats.length; i++) {
      const m = this._mats[i];
      m.emissive.copy(this._baseEmissive[i]);
      if (this.flash > 0) {
        m.emissive.r = Math.min(1, m.emissive.r + this.flash * 0.9);
        m.emissive.g = Math.min(1, m.emissive.g + this.flash * 0.15);
        m.emissive.b = Math.min(1, m.emissive.b + this.flash * 0.15);
      }
    }

    const toPlayer = _v1.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const distFlat = toPlayer.length();
    const dist3 = this.pos.distanceTo(player.pos);

    // 视线
    const eye = _v2.set(this.pos.x, this.pos.y + 1.5 * this.type.scale, this.pos.z);
    const target = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeHeight * 0.8, player.pos.z);
    const dirToPlayer = target.clone().sub(eye);
    const distToPlayer = dirToPlayer.length();
    dirToPlayer.normalize();
    const blocked =
      !!this.world.raycast(eye, dirToPlayer, distToPlayer - 0.4) ||
      ctx.losBlock(eye, target);

    // 朝向
    const wantFace = Math.atan2(toPlayer.x, toPlayer.z);
    let diff = wantFace - this.face;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.face += diff * Math.min(1, dt * 7);

    // 移动意图
    let moveX = 0, moveZ = 0;
    const t = this.type;
    const slowed = this.stagger > 0 ? 0.45 : 1;

    if (distFlat > t.prefer * 1.15) {
      moveX += (toPlayer.x / (distFlat || 1));
      moveZ += (toPlayer.z / (distFlat || 1));
    } else if (distFlat < t.prefer * 0.7 && !t.melee) {
      moveX -= (toPlayer.x / (distFlat || 1)) * 0.8;
      moveZ -= (toPlayer.z / (distFlat || 1)) * 0.8;
    }

    // 视线被挡就绕行
    if (blocked) {
      this.blockedTimer += dt;
      const sx = Math.cos(this.face), sz = -Math.sin(this.face);
      moveX += sz * this.strafeDir * 1.3;
      moveZ += sx * this.strafeDir * 1.3;
      if (this.blockedTimer > 1.6) { this.strafeDir *= -1; this.blockedTimer = 0; }
    } else {
      this.blockedTimer = 0;
      // 侧向游走
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1.4 + Math.random() * 2.4; }
      if (distFlat > 4 && distFlat < t.prefer * 1.6 && !t.melee) {
        const sx = Math.cos(this.face), sz = -Math.sin(this.face);
        moveX += sz * this.strafeDir * 0.75;
        moveZ += sx * this.strafeDir * 0.75;
      }
    }

    // 与同伴分离
    for (const other of ctx.enemies) {
      if (other === this || other.dead) continue;
      const dx = this.pos.x - other.pos.x, dz = this.pos.z - other.pos.z;
      const d2 = dx * dx + dz * dz;
      const minD = (this.radius + other.radius) * 2.0;
      if (d2 > 0.0001 && d2 < minD * minD) {
        const d = Math.sqrt(d2);
        moveX += (dx / d) * (1 - d / minD) * 1.6;
        moveZ += (dz / d) * (1 - d / minD) * 1.6;
      }
    }

    const len = Math.hypot(moveX, moveZ);
    const moving = len > 0.05;
    if (moving) { moveX /= len; moveZ /= len; }

    const speed = t.speed * slowed * (moving ? 1 : 0);
    this.vel.x = THREE.MathUtils.damp(this.vel.x, moveX * speed, 9, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, moveZ * speed, 9, dt);

    // 水平移动 + 碰撞
    const oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    if (this.world.boxOverlaps(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius, this.height)) {
      this.pos.x = oldX;
      if (this.onGround) this.vel.y = 11.6;  // 尝试翻越一个方块
      this.vel.x = 0;
    }
    this.pos.z += this.vel.z * dt;
    if (this.world.boxOverlaps(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius, this.height)) {
      this.pos.z = oldZ;
      if (this.onGround) this.vel.y = 11.6;
      this.vel.z = 0;
    }

    // 垂直
    // 用 AABB 解析：会撞头、会正确落地，不会从方块内部"电梯"穿出去
    this.onGround = this.world.stepVertical(this.pos, this.vel, this.radius, this.height, dt);
    if (this.pos.y < -20) { this.pos.set(0, B + 3, 0); }

    // 动画
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * (2 + hSpeed * 1.5);
    const sw = Math.sin(this.walkPhase * 2.2) * Math.min(1, hSpeed / 4);
    this.parts.legL.rotation.x = sw * 0.85;
    this.parts.legR.rotation.x = -sw * 0.85;
    this.parts.armL.rotation.x = -sw * 0.6;
    // 正角度 = 手臂向身体正面（-Z）抬起
    if (t.melee) {
      this.parts.armR.rotation.x = 1.1 + Math.sin(this.walkPhase * 4) * 0.5 * Math.min(1, hSpeed / 4);
    } else {
      this.parts.armR.rotation.x = 1.32 + Math.sin(this.walkPhase * 2.2) * 0.06;
    }
    this.parts.head.rotation.y = Math.sin(this.walkPhase * 0.6) * 0.12;

    // 攻击
    this.fireTimer -= dt;
    const inRange = t.melee ? dist3 <= t.range + 0.6 : (dist3 <= t.range && !blocked);
    if (inRange && this.fireTimer <= 0 && dist3 < t.range + 1) {
      this.fireTimer = t.interval * (0.75 + Math.random() * 0.5);
      ctx.onEnemyAttack(this, target);
    }

    this.obj.position.copy(this.pos);
    // face 是朝向目标的方位角（atan2(dx, dz)，即 +Z 基准），模型正面是 -Z，需再转 180°
    this.obj.rotation.y = this.face + Math.PI;
    this.updateBoxes();
  }
}

// ---------------------------------------------------------------- 管理器
class TracerPool {
  constructor(scene) {
    this.scene = scene; this.pool = []; this.active = [];
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff8a4a, transparent: true }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line); this.pool.push(line);
    }
  }
  add(a, b, color = 0xff8a4a) {
    const l = this.pool.pop(); if (!l) return;
    const p = l.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    l.material.color.set(color); l.material.opacity = 1; l.visible = true;
    this.active.push({ line: l, t: 0 });
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i]; a.t += dt;
      a.line.material.opacity = Math.max(0, 1 - a.t / 0.09);
      if (a.t > 0.09) { a.line.visible = false; this.pool.push(a.line); this.active.splice(i, 1); }
    }
  }
}

export class EnemyManager {
  constructor({ scene, world, particles, sfx, player, onKill, onPlayerDamage }) {
    this.scene = scene; this.world = world; this.particles = particles;
    this.sfx = sfx; this.player = player;
    this.onKill = onKill; this.onPlayerDamage = onPlayerDamage;
    this.enemies = [];
    this.tracers = new TracerPool(scene);
    this.losBlock = null;   // 由外部注入（例如烟雾弹）
    this._ctx = {
      enemies: this.enemies,
      onEnemyAttack: (e, target) => this._attack(e, target),
      losBlock: (a, b) => (this.losBlock ? this.losBlock(a, b) : false),
      onBurn: (e, dmg) => {
        const killed = e.damage(dmg, e.pos, null, false, this.particles);
        if (killed) this.onKill?.(e, false);
      },
    };
  }

  get alive() { return this.enemies.filter(e => !e.dead).length; }

  spawn(typeId, pos) {
    const t = ENEMY_TYPES[typeId];
    const e = new Enemy(t, this.world, pos);
    this.scene.add(e.obj);
    this.enemies.push(e);
    this.particles.spawn(pos.clone().setY(pos.y + 0.9), new THREE.Vector3(0, 3, 0), { color: t.color, life: 0.5, size: 0.2, grav: 0.2 });
    return e;
  }

  /** 按波次生成 */
  spawnWave(wave, count) {
    const pool = ['grunt'];
    if (wave >= 2) pool.push('runner');
    if (wave >= 3) pool.push('sniper');
    if (wave >= 4) pool.push('brute');
    const weights = { grunt: 5, runner: wave >= 2 ? 3 : 0, sniper: wave >= 3 ? 2 : 0, brute: wave >= 4 ? 2 : 0 };

    let spawned = 0, guard = 0;
    while (spawned < count && guard++ < count * 30) {
      const total = pool.reduce((s, id) => s + weights[id], 0);
      let r = Math.random() * total, pick = pool[0];
      for (const id of pool) { r -= weights[id]; if (r <= 0) { pick = id; break; } }
      // 距玩家至少 22 米
      const p = this.world.safeSpawn();
      if (p.distanceTo(this.player.pos) < 22) continue;
      this.spawn(pick, p);
      spawned++;
    }
    // 兜底
    while (spawned < count) {
      const p = this.world.safeSpawn();
      this.spawn('grunt', p);
      spawned++;
    }
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.obj);
    this.enemies.length = 0;
  }

  _attack(e, target) {
    const t = e.type;
    const muzzle = e.muzzlePos();

    // 球形护盾挡下这一发
    const shield = this.domeBlock?.(muzzle, target);
    if (shield) {
      const n = target.clone().sub(muzzle).normalize().negate();
      this.particles.impact(shield.point, n, 0x7fd0ff);
      this.tracers.add(muzzle, shield.point, 0x7fd0ff);
      this.sfx.shot('enemy');
      this.onDomeAbsorb?.(shield.dome, t.damage);
      return;
    }

    if (t.melee) {
      // 命中特效：从玩家身上抖落金币
      for (let i = 0; i < 3; i++) {
        this.particles.spawn(
          target.clone(),
          new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5),
          { color: 0xffd54a, life: 1.0, size: 0.11, grav: 1.2, drag: 0.99 }
        );
      }
      this.onPlayerDamage(t.damage, e);
      this.sfx.hit();
      return;
    }
    const dir = target.clone().sub(muzzle).normalize();
    if (t.spread > 0) {
      dir.x += (Math.random() - 0.5) * t.spread * 2;
      dir.y += (Math.random() - 0.5) * t.spread * 2;
      dir.z += (Math.random() - 0.5) * t.spread * 2;
      dir.normalize();
    }
    const hit = this.world.raycast(muzzle, dir, t.range + 10);
    const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, t.range);
    this.tracers.add(muzzle, end, t.id === 'sniper' ? 0xff5a5a : 0xffa04a);
    this.particles.muzzle(muzzle, dir);
    this.sfx.shot('enemy');

    // 命中玩家判定
    const toPlayer = target.clone().sub(muzzle);
    const distP = toPlayer.length();
    toPlayer.normalize();
    const dot = toPlayer.dot(dir);
    if (dot > 0.985 && (!hit || hit.dist >= distP - 0.6)) {
      const chance = 1 - Math.min(0.75, distP / (t.range * 1.6));
      if (Math.random() < 0.35 + chance * 0.6) {
        this.onPlayerDamage(t.damage, e);
      }
    }
  }

  update(dt) {
    this.tracers.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this.player, this._ctx);
      if (e.removeMe) {
        this.scene.remove(e.obj);
        this.enemies.splice(i, 1);
      } else if (e.dead && !e.gibbed) {
        e.gibbed = true;
        this.particles.gib(e.pos.clone().setY(e.pos.y + 0.9), e.type.color, e.type.scale > 1.2 ? 60 : 36);
        this.particles.coin(e.pos.clone().setY(e.pos.y + 1.0), undefined, 7, 5.5);
      }
    }
  }

  /** 爆炸范围伤害 */
  explode(pos, radius, damage) {
    let kills = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = e.pos.distanceTo(pos);
      if (d > radius) continue;
      const k = 1 - d / radius;
      const dmg = damage * k;
      const killed = e.damage(dmg, e.pos.clone(), new THREE.Vector3(0, 1, 0), false, this.particles);
      this.onHurt?.(e, dmg, killed);
      if (killed) { this.onKill?.(e, false); kills++; }
    }
    return kills;
  }
}
