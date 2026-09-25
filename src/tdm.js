import * as THREE from 'three';
import { buildBody } from './enemy.js';
import { WEAPON_BY_ID } from './weapons.js';

export const TEAM_COLORS = [
  { body: 0x2f5f9e, head: 0xe0b48a, name: '蓝队', hex: '#54a8ff' },
  { body: 0x9e3a35, head: 0xd9a274, name: '红队', hex: '#ff5a4d' },
];

/** AI 战士的战斗风格 */
const CLASSES = [
  { id: 'assault', weapon: 'rifle', hp: 150, speed: 6.4, prefer: 15, range: 46, dmg: 15, interval: 0.34, acc: 0.62 },
  { id: 'smg', weapon: 'smg', hp: 150, speed: 7.6, prefer: 10, range: 32, dmg: 12, interval: 0.20, acc: 0.58 },
  { id: 'shotgun', weapon: 'shotgun', hp: 150, speed: 6.8, prefer: 6, range: 18, dmg: 26, interval: 0.95, acc: 0.72 },
  { id: 'sniper', weapon: 'sniper', hp: 150, speed: 5.2, prefer: 40, range: 95, dmg: 48, interval: 1.9, acc: 0.80 },
  { id: 'heavy', weapon: 'rpg', hp: 150, speed: 5.0, prefer: 22, range: 70, dmg: 90, interval: 3.4, acc: 0.66 },
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** 队伍 AI 战士 */
export class Bot {
  constructor(scene, world, team, cls, pos, name) {
    this.scene = scene;
    this.world = world;
    this.team = team;
    this.cls = cls;
    this.name = name;

    const base = WEAPON_BY_ID[cls.weapon];
    this.weapon = Object.assign({}, base, {
      mag: base.magSize,
      reserve: base.reserve === Infinity ? Infinity : base.reserveMax,
    });

    this.hp = cls.hp;
    this.maxHp = cls.hp;
    this.dead = false;
    this.respawnT = 0;
    this.kills = 0;
    this.deaths = 0;

    const built = buildBody({
      color: TEAM_COLORS[team].body,
      headColor: TEAM_COLORS[team].head,
      hairColor: team === 0 ? 0x1a2440 : 0x3a1414,
      eyeColor: 0x1b1f24,
      weapon: cls.weapon === 'sniper' ? 'sniper' : cls.weapon === 'shotgun' ? 'shotgun' : cls.weapon === 'rifle' ? 'rifle' : 'pistol',
      scale: cls.id === 'heavy' ? 1.18 : 1,
    });
    this.parts = built;
    this.obj = built.group;
    // 队伍识别：肩章 + 头盔条
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(0.70, 0.10, 0.42),
      new THREE.MeshLambertMaterial({ color: team === 0 ? 0x54c8ff : 0xff6a4a, emissive: team === 0 ? 0x104a7a : 0x5a1010, emissiveIntensity: 0.6 })
    );
    mark.position.set(0, 1.42, 0);
    this.obj.add(mark);
    this.obj.scale.setScalar(0.01);

    this.pos = pos.clone();
    this.obj.position.copy(pos);
    this.vel = new THREE.Vector3();
    this.radius = 0.5 * (cls.id === 'heavy' ? 1.18 : 1);
    this.height = 1.85 * (cls.id === 'heavy' ? 1.18 : 1);
    this.onGround = false;
    this.face = Math.random() * 6.28;
    this.walkPhase = Math.random() * 10;

    this.fireTimer = 0.5 + Math.random();
    this.reloadT = 0;
    this.grenadeCd = 8 + Math.random() * 14;
    this.gadgetCd = 20 + Math.random() * 25;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.blockedTimer = 0;
    this.flash = 0;
    this.stagger = 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.spawnT = 0;
    this.deathT = 0;
    this.gibbed = false;
    this.target = null;

    this.bodyBox = new THREE.Box3();
    this.headBox = new THREE.Box3();
    this._mats = [built.bodyMat, built.headMat];
    this._baseEmissive = this._mats.map(m => m.emissive.clone());

    this.updateBoxes();
  }

  updateBoxes() {
    const s = this.cls.id === 'heavy' ? 1.18 : 1;
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

  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.5 * (this.cls.id === 'heavy' ? 1.18 : 1), this.pos.z);
  }

  damage(amount, point, dir) {
    if (this.dead) return false;
    this.hp -= amount;
    this.flash = 1;
    this.stagger = Math.min(0.4, this.stagger + amount * 0.004);
    if (dir) {
      this.vel.x += dir.x * Math.min(5, amount * 0.14);
      this.vel.z += dir.z * Math.min(5, amount * 0.14);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathT = 0;
      this.burnT = 0;
      return true;
    }
    return false;
  }

  respawn(pos) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.dead = false;
    this.gibbed = false;
    this.spawnT = 0;
    this.deathT = 0;
    this.burnT = 0;
    this.obj.scale.setScalar(0.01);
    this.obj.rotation.set(0, 0, 0);
    this.weapon.mag = this.weapon.magSize;
    if (this.weapon.reserve !== Infinity) this.weapon.reserve = this.weapon.reserveMax;
    this.grenadeCd = 6 + Math.random() * 12;
    this.obj.position.copy(pos);
    this.updateBoxes();
  }

  update(dt, ctx) {
    if (this.dead) {
      this.deathT += dt;
      const k = Math.max(0, 1 - this.deathT / 0.35);
      const s = (this.cls.id === 'heavy' ? 1.18 : 1) * k;
      this.obj.scale.setScalar(s);
      this.obj.rotation.z += dt * 6;
      if (this.deathT > 0.45) this.obj.visible = false;
      return;
    }
    this.obj.visible = true;

    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.4);
      const s = (this.cls.id === 'heavy' ? 1.18 : 1) * (0.2 + 0.8 * this.spawnT);
      this.obj.scale.setScalar(s);
      if (this.spawnT < 1) { this.updateBoxes(); return; }
    }

    // 燃烧
    if (this.burnT > 0) {
      this.burnT -= dt;
      if (this.damage(this.burnDps * dt, null, null)) { ctx.onDeath(this, this.lastAttacker); return; }
      if (Math.random() < dt * 20) {
        ctx.particles.spawn(
          this.pos.clone().setY(this.pos.y + 0.6 + Math.random() * 0.9),
          new THREE.Vector3(0, 1.3, 0),
          { color: [0xffdd44, 0xff9922, 0xff5511][(Math.random() * 3) | 0], life: 0.3, size: 0.16, grav: -0.5 }
        );
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

    // ---- 选目标
    const target = ctx.findTarget(this);
    this.target = target;
    if (!target) {
      this._animate(dt, 0);
      this.obj.position.copy(this.pos);
      this.updateBoxes();
      return;
    }

    const tp = target.pos;
    const to = _a.set(tp.x - this.pos.x, 0, tp.z - this.pos.z);
    const distFlat = to.length();
    const dist3 = this.pos.distanceTo(tp);

    const wantFace = Math.atan2(to.x, to.z);
    let diff = wantFace - this.face;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.face += diff * Math.min(1, dt * 7);

    // ---- 视线
    this.eye(_b);
    const tgt = new THREE.Vector3(tp.x, tp.y + (target.eyeHeight ?? 1.6) * 0.85, tp.z);
    const dirTo = tgt.clone().sub(_b);
    const distTo = dirTo.length();
    dirTo.normalize();
    const blocked = !!this.world.raycast(_b, dirTo, distTo - 0.5) || ctx.losBlock(_b, tgt);

    // ---- 移动
    let mx = 0, mz = 0;
    const c = this.cls;
    if (distFlat > c.prefer * 1.2) { mx += to.x / (distFlat || 1); mz += to.z / (distFlat || 1); }
    else if (distFlat < c.prefer * 0.65) { mx -= (to.x / (distFlat || 1)) * 0.9; mz -= (to.z / (distFlat || 1)) * 0.9; }

    if (blocked) {
      this.blockedTimer += dt;
      const sx = Math.cos(this.face), sz = -Math.sin(this.face);
      mx += sz * this.strafeDir * 1.4; mz += sx * this.strafeDir * 1.4;
      if (this.blockedTimer > 1.5) { this.strafeDir *= -1; this.blockedTimer = 0; }
    } else {
      this.blockedTimer = 0;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1.3 + Math.random() * 2.2; }
      if (distFlat > 5 && distFlat < c.prefer * 1.7) {
        const sx = Math.cos(this.face), sz = -Math.sin(this.face);
        mx += sz * this.strafeDir * 0.8; mz += sx * this.strafeDir * 0.8;
      }
    }

    // 分离
    for (const o of ctx.fighters) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const md = (this.radius + o.radius) * 2.1;
      if (d2 > 0.0001 && d2 < md * md) {
        const d = Math.sqrt(d2);
        mx += (dx / d) * (1 - d / md) * 1.7;
        mz += (dz / d) * (1 - d / md) * 1.7;
      }
    }

    const len = Math.hypot(mx, mz);
    if (len > 0.05) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
    const speed = c.speed * (this.stagger > 0 ? 0.5 : 1);
    this.vel.x = THREE.MathUtils.damp(this.vel.x, mx * speed, 9, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, mz * speed, 9, dt);

    const oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    if (this.world.boxOverlaps(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius, this.height)) {
      this.pos.x = oldX; this.vel.x = 0;
      if (this.onGround) this.vel.y = 11.6;
    }
    this.pos.z += this.vel.z * dt;
    if (this.world.boxOverlaps(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius, this.height)) {
      this.pos.z = oldZ; this.vel.z = 0;
      if (this.onGround) this.vel.y = 11.6;
    }

    // 用 AABB 解析：会撞头、会正确落地，不会从方块内部"电梯"穿出去
    this.onGround = this.world.stepVertical(this.pos, this.vel, this.radius, this.height, dt);
    if (this.pos.y < -20) this.pos.set(0, 4, 0);

    // ---- 开火
    this.fireTimer -= dt;
    this.reloadT -= dt;
    if (this.weapon.mag <= 0 && this.reloadT <= 0) {
      this.reloadT = this.weapon.reloadTime;
      this.weapon.mag = this.weapon.magSize;
      if (this.weapon.reserve !== Infinity) {
        const take = Math.min(this.weapon.magSize, this.weapon.reserve);
        this.weapon.mag = take; this.weapon.reserve -= take;
      }
    }

    const inRange = dist3 <= c.range && !blocked;
    if (inRange && this.fireTimer <= 0 && this.weapon.mag > 0 && this.reloadT <= 0) {
      this.fireTimer = c.interval * (0.8 + Math.random() * 0.4);
      this.weapon.mag--;
      ctx.onShoot(this, target, tgt, c);
    }

    // ---- 道具：手雷
    this.grenadeCd -= dt;
    if (this.grenadeCd <= 0 && dist3 > 8 && dist3 < 40 && !blocked) {
      this.grenadeCd = 14 + Math.random() * 16;
      ctx.onGrenade(this, tgt);
    }

    this._animate(dt, Math.hypot(this.vel.x, this.vel.z));
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.face + Math.PI;   // 模型正面 -Z，face 以 +Z 为基准
    this.updateBoxes();
  }

  _animate(dt, hSpeed) {
    this.walkPhase += dt * (2 + hSpeed * 1.5);
    const sw = Math.sin(this.walkPhase * 2.2) * Math.min(1, hSpeed / 4);
    this.parts.legL.rotation.x = sw * 0.85;
    this.parts.legR.rotation.x = -sw * 0.85;
    this.parts.armL.rotation.x = -sw * 0.6;
    this.parts.armR.rotation.x = 1.32 + Math.sin(this.walkPhase * 2.2) * 0.06;   // 正角度 = 向正面抬臂
    this.parts.head.rotation.y = Math.sin(this.walkPhase * 0.6) * 0.12;
  }
}

// ---------------------------------------------------------------- 模式管理
export class TeamDeathmatch {
  constructor({ scene, world, particles, sfx, player, playerTeam = 0, killTarget = 40 }) {
    this.scene = scene; this.world = world; this.particles = particles; this.sfx = sfx;
    this.player = player;
    this.playerTeam = playerTeam;
    this.killTarget = killTarget;
    this.bots = [];
    this.score = [0, 0];
    this.finished = false;
    this.winner = -1;
    this.respawnDelay = 4.5;
    this.playerRespawnT = 0;
    this.tracers = [];
    this.onEvent = null;      // (text) => void  播报

    // 双方出生区（对角）
    this.bases = [new THREE.Vector3(-40, 0, -40), new THREE.Vector3(40, 0, 40)];

    this._ctx = {
      fighters: this.bots,
      particles,
      findTarget: (bot) => this._findTarget(bot),
      losBlock: (a, b) => this.losBlock ? this.losBlock(a, b) : false,
      onShoot: (bot, target, tgt, cls) => this._shoot(bot, target, tgt, cls),
      onGrenade: (bot, tgt) => this.onBotGrenade?.(bot, tgt),
      onDeath: (bot, killer) => this._onDeath(bot, killer),
    };
  }

  /** 生成 9 个 AI：玩家队 4 个，敌队 5 个 */
  spawnAll() {
    this.clear();
    const planPlayer = [CLASSES[0], CLASSES[1], CLASSES[3], CLASSES[2]];
    const planEnemy = [CLASSES[0], CLASSES[1], CLASSES[2], CLASSES[3], CLASSES[4]];
    const names = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOX', 'GOLF', 'HOTEL', 'INDIA'];
    let n = 0;
    planPlayer.forEach((cls, i) => this._add(cls, 0, this.playerTeam === 0 ? names[n++] : names[n++]));
    planEnemy.forEach((cls) => this._add(cls, 1, names[n++]));
  }

  _add(cls, team, name) {
    const p = this.teamSpawn(team);
    const bot = new Bot(this.scene, this.world, team, cls, p, name || 'AI');
    this.scene.add(bot.obj);
    this.bots.push(bot);
    this.particles.spawn(p.clone().setY(p.y + 0.9), new THREE.Vector3(0, 3, 0), {
      color: TEAM_COLORS[team].body, life: 0.5, size: 0.2, grav: 0.2,
    });
    return bot;
  }

  teamSpawn(team) {
    const base = this.bases[team];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 14;
      const x = base.x + Math.cos(a) * r;
      const z = base.z + Math.sin(a) * r;
      if (Math.abs(x) > 56 || Math.abs(z) > 56) continue;
      const y = this.world.groundBelow(x, 30, z, 60);
      if (y < 0 || y > 26) continue;
      if (this.world.boxOverlaps(x, y, z, 0.6, 2.2)) continue;
      return new THREE.Vector3(x, y, z);
    }
    return new THREE.Vector3(base.x, 4, base.z);
  }

  clear() {
    for (const b of this.bots) this.scene.remove(b.obj);
    this.bots.length = 0;
    this.score = [0, 0];
    this.finished = false;
    this.winner = -1;
  }

  get aliveByTeam() {
    const a = [0, 0];
    for (const b of this.bots) if (!b.dead) a[b.team]++;
    return a;
  }

  _findTarget(bot) {
    let best = null, bestD = Infinity;
    // 玩家（只在对立队伍眼中才算目标，且距离加权，优先冲玩家）
    const p = this.player;
    if (!p.dead && bot.team !== this.playerTeam) {
      const d = bot.pos.distanceTo(p.pos);
      if (d < 70) { best = p; bestD = d * 0.8; }
    }
    for (const o of this.bots) {
      if (o === bot || o.dead || o.team === bot.team) continue;
      const d = bot.pos.distanceTo(o.pos);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  _shoot(bot, target, tgt, cls) {
    const muzzle = bot.muzzlePos();
    const dir = tgt.clone().sub(muzzle).normalize();
    const spread = (1 - cls.acc) * 0.09;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.8;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const distTo = muzzle.distanceTo(tgt);
    const hit = this.world.raycast(muzzle, dir, cls.range + 12);
    const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, cls.range);
    this._tracer(muzzle, end, TEAM_COLORS[bot.team].body);
    this.particles.muzzle(muzzle, dir);
    this.sfx.shot('enemy');

    // 命中判定
    const toT = tgt.clone().sub(muzzle);
    const dT = toT.length();
    toT.normalize();
    if (toT.dot(dir) > 0.975 && (!hit || hit.dist >= dT - 0.8)) {
      const falloff = 1 - Math.min(0.55, dT / (cls.range * 1.5));
      if (Math.random() < cls.acc + falloff * 0.25) {
        this._damageTarget(target, cls.dmg, dir, bot);
      }
    }
  }

  _damageTarget(target, amount, dir, attacker) {
    if (target === this.player) {
      this.onPlayerHit?.(amount, attacker);
      return;
    }
    target.lastAttacker = attacker;
    const killed = target.damage(amount, null, dir);
    if (killed) this._onDeath(target, attacker);
  }

  _onDeath(bot, killer) {
    const killerTeam = killer === this.player ? this.playerTeam
      : (killer && killer.team !== undefined ? killer.team : 1 - bot.team);
    this.score[killerTeam]++;
    bot.deaths++;
    this.particles.gib(bot.pos.clone().setY(bot.pos.y + 0.9), TEAM_COLORS[bot.team].body, 38);
    this.particles.coin(bot.pos.clone().setY(bot.pos.y + 1.0), undefined, 7, 5.5);
    this.onEvent?.(
      `<b style="color:${TEAM_COLORS[killerTeam].hex}">${killer === this.player ? '你' : (killer?.name ?? '战场')}</b>` +
      ` 击杀 <b style="color:${TEAM_COLORS[bot.team].hex}">${bot.name}</b>`
    );
    bot.respawnT = this.respawnDelay;
    if (this.score[killerTeam] >= this.killTarget && !this.finished) {
      this.finished = true;
      this.winner = killerTeam;
      this.onFinish?.(killerTeam);
    }
  }

  _tracer(a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, t: 0 });
  }

  update(dt) {
    for (const b of this.bots) b.update(dt, this._ctx);

    // 复活
    if (!this.finished) {
      for (const b of this.bots) {
        if (b.dead) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) b.respawn(this.teamSpawn(b.team));
        }
      }
    }

    // 玩家复活
    if (this.player.dead && !this.finished) {
      this.playerRespawnT -= dt;
      if (this.playerRespawnT <= 0) {
        this.player.respawn(this.teamSpawn(this.playerTeam));
        this.player.respawnT = 0;
        this.onPlayerRespawn?.();
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      t.line.material.opacity = Math.max(0, 1 - t.t / 0.09);
      if (t.t > 0.09) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  /** 玩家造成的击杀（用于记分） */
  onPlayerKill(bot) {
    this._onDeath(bot, this.player);
  }

  /** 范围伤害（手雷 / 火箭） */
  explode(pos, radius, damage, attacker) {
    const atkTeam = attacker === this.player ? this.playerTeam : attacker?.team;
    for (const b of this.bots) {
      if (b.dead) continue;
      if (atkTeam !== undefined && b.team === atkTeam) continue;   // 不打自己人
      const d = b.pos.distanceTo(pos);
      if (d > radius) continue;
      const k = 1 - d / radius;
      b.lastAttacker = attacker;
      const dmg = damage * k;
      const killed = b.damage(dmg, null, new THREE.Vector3(0, 0.4, 0).normalize());
      if (attacker === this.player) this.onPlayerHurt?.(b, dmg, killed);
      if (killed) this._onDeath(b, attacker);
    }
    const dp = this.player.pos.distanceTo(pos);
    if (dp < radius && atkTeam !== this.playerTeam) {
      const k = 1 - dp / radius;
      this.onPlayerHit?.(damage * k * 0.55, attacker);
    }
  }

  /** 玩家近战 / 喷火：对 AI 造成伤害 */
  hitByPlayer(origin, dir, range, arc, damage, onHitEach) {
    let hits = 0;
    const d2 = new THREE.Vector3();
    for (const b of this.bots) {
      if (b.dead) continue;
      if (b.team === this.playerTeam) continue;
      d2.copy(b.pos).setY(b.pos.y + 0.9).sub(origin);
      const dist = d2.length();
      if (dist > range) continue;
      d2.normalize();
      if (d2.dot(dir) < Math.cos(arc)) continue;
      b.lastAttacker = this.player;
      onHitEach?.(b, dist);
      if (b.damage(damage, null, dir)) this._onDeath(b, this.player);
      hits++;
    }
    return hits;
  }
}
