import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Character } from '../characters/Character';
import { CFG } from '../core/Config';
import { clamp, damp, wrapAngle } from '../core/Utils';
import { Perception, type EnemyInfo } from './Perception';
import { Navigation } from './Navigation';

export type AIState = 'search' | 'chase' | 'attack' | 'cover' | 'retreat' | 'reload';

/**
 * 分层式 AI（HFSM + Utility AI）
 *
 * 第一层 感知 Perception（12Hz）：视野锥 + 射线 LOS + 距离 + 记忆
 * 第二层 状态机 HFSM：search / chase / attack / cover / retreat / reload
 * 第三层 战术选择 Utility AI（8Hz）：对每个候选行为打分，取最高分
 * 第四层 导航 Navigation（3Hz）：NavGrid + A* + 路径平滑，破坏后局部重算
 *
 * AI 与玩家共用 Character.update()：AI 只写 intent，不直接改血量/位置。
 */
export class AIController {
  char: Character;
  game: Game;
  perception: Perception;
  nav: Navigation;

  state: AIState = 'search';
  targetInfo: EnemyInfo | null = null;
  target: Character | null = null;

  private path: THREE.Vector3[] = [];
  private pathIdx = 0;
  private dest = new THREE.Vector3();
  private hasDest = false;

  private aimYaw = 0;
  private aimPitch = 0;
  private aimErrorX = 0;
  private aimErrorY = 0;
  private errorT = 0;

  private tPercept = Math.random() * 0.1;
  private tDecide = Math.random() * 0.1;
  private tNav = Math.random() * 0.3;
  private tWeapon = 0;
  private burstT = 0;
  private bursting = false;
  private semiT = 0;
  private strafe = 1;
  private strafeT = 0;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private wantMove = false;
  private searchPoint = new THREE.Vector3();
  private searchT = 0;
  private wanderDir = 0;
  private wanderT = 0;

  /** 技术水平 0..1：影响瞄准误差、反应速度、技能使用概率 */
  skill = 0.72;
  reactDelay = 0.22;

  constructor(char: Character, game: Game) {
    this.char = char;
    this.game = game;
    this.nav = game.nav;
    this.perception = new Perception(char);
    this.aimYaw = char.yaw;
    this.lastPos.copy(char.pos);
    this.skill = 0.6 + Math.random() * 0.35;
    this.reactDelay = 0.14 + (1 - this.skill) * 0.3;
  }

  reset(): void {
    this.perception.reset();
    this.state = 'search';
    this.target = null;
    this.targetInfo = null;
    this.path.length = 0;
    this.hasDest = false;
    this.pathIdx = 0;
  }

  // ------------------------------------------------------------ 主循环
  update(dt: number): void {
    const c = this.char;
    const i = c.intent;
    i.fire = false;
    i.firePressed = false;
    i.ability = false;
    i.gadget = false;
    i.interact = false;
    i.reload = false;
    i.jump = false;
    i.sprint = false;
    i.ads = false;
    i.moveX = 0;
    i.moveZ = 0;

    if (!c.alive) return;

    // ---- 分频 Tick ----
    this.tPercept -= dt;
    if (this.tPercept <= 0) {
      this.tPercept = 1 / CFG.tick.perception;
      this.perception.update(this.game);
    }
    this.tDecide -= dt;
    if (this.tDecide <= 0) {
      this.tDecide = 1 / CFG.tick.decision;
      this.decide();
    }
    this.tNav -= dt;
    if (this.tNav <= 0) {
      this.tNav = 1 / CFG.tick.navigation;
      this.repath();
    }
    this.searchT -= dt;
    this.tWeapon -= dt;
    if (this.tWeapon <= 0) {
      this.tWeapon = 1.2;
      this.selectWeapon();
    }

    // ---- 瞄准（每帧，平滑） ----
    this.updateAim(dt);

    // ---- 移动（每帧） ----
    this.updateMove(dt);

    // ---- 开火 ----
    this.updateFire(dt);
  }

  // ------------------------------------------------------------ 第三层：Utility 决策
  private decide(): void {
    const c = this.char;
    const p = this.perception;
    const hpRatio = c.hp / c.maxHp;
    const info = p.nearestVisible() || p.nearestKnown(this.game.time);
    this.targetInfo = info;
    this.target = info ? info.char : null;

    const visible = !!info && info.visible;
    const dist = info ? info.dist : 999;
    const w = c.weapon;

    // --- 候选行为打分 ---
    let sAttack = 0, sChase = 0, sCover = 0, sRetreat = 0, sReload = 0, sSearch = 12;

    if (info && info.char.alive) {
      const inRange = dist < w.def.range * 1.15;
      const ammoOk = w.ammo > 0;
      sAttack = (visible && inRange && ammoOk)
        ? 70 * (1 - clamp(dist / w.def.range, 0, 1) * 0.45) + (dist < 10 ? 15 : 0)
        : 0;
      sChase = visible ? 26 : 42;
      if (!ammoOk) sChase *= 0.5;
      sSearch = 0;
    }

    // 血量低：撤退 / 找掩体
    if (hpRatio < 0.32) sRetreat = 62;
    else if (hpRatio < 0.55) { sCover = 44; sRetreat = 24; }
    // 正在被围攻
    if (p.visibleWithin(14) >= 2) { sRetreat += 18; sCover += 12; }
    // 弹药
    if (w.ammo === 0) sReload = 95;
    else if (w.ammo < w.def.mag * 0.22 && (!visible || dist > 20)) sReload = 55;

    // 选最高分
    const best = Math.max(sAttack, sChase, sCover, sRetreat, sReload, sSearch);
    let next: AIState = 'search';
    if (best === sReload) next = 'reload';
    else if (best === sRetreat) next = 'retreat';
    else if (best === sCover) next = 'cover';
    else if (best === sAttack) next = 'attack';
    else if (best === sChase) next = 'chase';
    else next = 'search';

    if (next !== this.state) {
      this.state = next;
      this.hasDest = false;
      this.path.length = 0;
      this.strafe = Math.random() < 0.5 ? 1 : -1;
    }

    // --- 技能 / 道具（战术层，按体型与局势触发，不是随机放） ---
    this.maybeUseAbility(visible, dist, hpRatio);
    this.maybeUseGadget(visible, dist, hpRatio);
  }

  /**
   * 技能使用策略（与体型强相关）
   * Light：危险/被追击 -> Dash；接敌 -> 电击枪（在 selectWeapon 里选）
   * Medium：敌人聚集 -> 震荡波
   * Heavy：敌人靠近且在射程内 -> 网格护盾
   */
  private maybeUseAbility(visible: boolean, dist: number, hpRatio: number): void {
    const c = this.char;
    const p = this.perception;
    const ab = c.ability;
    if (!ab.canUse(c)) return;

    if (ab.id === 'dash') {
      // 危险时闪避：近距离有敌人 / 血量低 / 需要拉近距离
      const danger = (visible && dist < 14) || hpRatio < 0.5;
      if (danger && Math.random() < 0.6 + this.skill * 0.3) {
        c.intent.ability = true;
      } else if (visible && dist > 18 && dist < 40 && Math.random() < 0.25) {
        c.intent.ability = true; // 突进
      }
    } else if (ab.id === 'shockwave') {
      // 敌人聚集或贴脸时震开
      const cluster = p.visibleWithin(7);
      if ((cluster >= 2 || (visible && dist < 5.5)) && Math.random() < 0.7) {
        c.intent.ability = true;
      }
    } else if (ab.id === 'meshshield') {
      if (ab.active) return;
      if ((visible && dist < 26) || hpRatio < 0.6) {
        if (Math.random() < 0.65) c.intent.ability = true;
      }
    }
  }

  /** 道具使用策略 */
  private maybeUseGadget(visible: boolean, dist: number, hpRatio: number): void {
    const c = this.char;
    const g = c.gadget;
    if (!g || !g.canUse(c)) return;
    const id = g.def.id;

    // 不同道具在不同局势下才有价值
    let want = false;
    switch (id) {
      case 'explosivemine':
        // 敌人正在接近 -> 在脚下/前方布雷
        want = visible && dist < 16 && dist > 3 && hpRatio > 0.4 && Math.random() < 0.4;
        break;
      case 'flamemine':
        want = visible && dist < 14 && Math.random() < 0.4;
        break;
      case 'jumppad':
        // 撤退或需要抢占高地
        want = (this.state === 'retreat' || this.state === 'cover') && Math.random() < 0.4;
        break;
      case 'zipline':
        want = this.state === 'retreat' && Math.random() < 0.35;
        break;
      case 'portal':
        want = this.state === 'retreat' && Math.random() < 0.35;
        break;
      case 'cloakbomb':
        want = hpRatio < 0.55 && Math.random() < 0.5;
        break;
      case 'domeshield':
        want = (hpRatio < 0.6 || (visible && dist > 14 && dist < 34)) && Math.random() < 0.45;
        break;
    }
    if (want) c.intent.gadget = true;
  }

  /** 武器选择：按距离与局势切换（走和玩家一样的 cycleWeapon 逻辑入口） */
  private selectWeapon(): void {
    const c = this.char;
    if (c.weapons.length < 2) return;
    const info = this.targetInfo;
    const dist = info ? info.dist : 40;
    const cluster = this.perception.visibleWithin(9);

    let want = c.weaponIndex;
    for (let k = 0; k < c.weapons.length; k++) {
      const def = c.weapons[k].def;
      if (def.id === 'rpg7') {
        // RPG：多个敌人聚集或远距离目标 -> 打建筑/炸人
        if (cluster >= 2 || dist > 22) { want = k; break; }
      } else if (def.id === 'stungun') {
        if (dist < 12 && c.weapons[k].ammo > 0) { want = k; break; }
      } else if (def.id === 'sa1216') {
        if (dist < 16) { want = k; break; }
      } else if (def.id === 'akm') {
        if (dist >= 14) { want = k; break; }
      } else if (def.id === 'xp54') {
        if (dist < 30) { want = k; break; }
      }
    }
    if (want !== c.weaponIndex && c.weapon.reloading === false) c.selectWeapon(want);
  }

  // ------------------------------------------------------------ 瞄准
  private updateAim(dt: number): void {
    const c = this.char;
    const info = this.targetInfo;
    let desiredYaw = this.aimYaw;
    let desiredPitch = 0;

    if (info && info.char.alive) {
      const t = info.char;
      // 目标点：胸口偏上；对投射物做简单提前量
      const def = c.weapon.def;
      let tx = t.pos.x, ty = t.pos.y + t.eyeHeight * 0.72, tz = t.pos.z;
      if (def.projectile) {
        const d0 = Math.hypot(tx - c.pos.x, ty - (c.pos.y + c.eyeHeight), tz - c.pos.z);
        const tof = d0 / def.projectile.speed;
        tx += t.vel.x * tof;
        tz += t.vel.z * tof;
        ty += t.vel.y * tof * 0.5;
      }
      const ex = c.pos.x, ey = c.pos.y + c.eyeHeight, ez = c.pos.z;
      const dx = tx - ex, dy = ty - ey, dz = tz - ez;
      const d = Math.hypot(dx, dy, dz) || 1;
      desiredYaw = Math.atan2(-dx, -dz);
      desiredPitch = Math.asin(clamp(dy / d, -1, 1));

      // 瞄准误差：随技术水平与距离变化，并周期性抖动（不是锁头）
      this.errorT -= dt;
      if (this.errorT <= 0) {
        this.errorT = 0.28 + Math.random() * 0.35;
        const base = (1 - this.skill) * 0.11 + Math.min(0.05, d * 0.0012);
        this.aimErrorX = (Math.random() - 0.5) * 2 * base;
        this.aimErrorY = (Math.random() - 0.5) * 2 * base * 0.6;
      }
      desiredYaw += this.aimErrorX;
      desiredPitch += this.aimErrorY;
    } else {
      // 无目标：朝移动方向看
      if (this.hasDest) {
        const dx = this.dest.x - c.pos.x, dz = this.dest.z - c.pos.z;
        if (Math.hypot(dx, dz) > 0.5) desiredYaw = Math.atan2(-dx, -dz);
      }
    }

    const turn = (5.5 + this.skill * 6) * (info && info.visible ? 1 : 0.6);
    this.aimYaw += wrapAngle(desiredYaw - this.aimYaw) * Math.min(1, turn * dt);
    this.aimPitch = damp(this.aimPitch, clamp(desiredPitch, -1.2, 1.2), 12, dt);
    c.intent.yaw = this.aimYaw;
    c.intent.pitch = this.aimPitch;
  }

  // ------------------------------------------------------------ 移动
  private updateMove(dt: number): void {
    const c = this.char;
    const i = c.intent;
    const info = this.targetInfo;

    // 决定目标点
    let wantX = this.dest.x, wantZ = this.dest.z;
    let followPath = true;

    if (this.state === 'attack' && info) {
      // 保持理想交战距离并侧移（strafe），不是站着不动
      const ideal = Math.min(c.weapon.def.range * 0.55, 16);
      const t = info.char;
      const dx = c.pos.x - t.pos.x, dz = c.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.4; this.strafe *= -1; }
      const tx = (-dz / d) * this.strafe;
      const tz = (dx / d) * this.strafe;
      const radial = (d - ideal) * 0.5;
      wantX = c.pos.x + tx * 2.4 - (dx / d) * radial;
      wantZ = c.pos.z + tz * 2.4 - (dz / d) * radial;
      followPath = false;
      i.ads = d > 8 && d < c.weapon.def.range * 0.8;
    } else if (this.state === 'chase' || this.state === 'search' || this.state === 'retreat' || this.state === 'cover') {
      if (!this.hasDest || this.pathIdx >= this.path.length) {
        // 暂无可达路径：朝随机方向小步游走，等待下一次寻路（不会原地僵住）
        followPath = false;
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 1.4; this.wanderDir = Math.random() * Math.PI * 2; }
        wantX = c.pos.x + Math.cos(this.wanderDir) * 4;
        wantZ = c.pos.z + Math.sin(this.wanderDir) * 4;
      } else {
        wantX = this.path[this.pathIdx].x;
        wantZ = this.path[this.pathIdx].z;
      }
    } else if (this.state === 'reload') {
      // 边换弹边后撤
      if (info) {
        const dx = c.pos.x - info.char.pos.x, dz = c.pos.z - info.char.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        wantX = c.pos.x + (dx / d) * 4;
        wantZ = c.pos.z + (dz / d) * 4;
      }
      followPath = false;
    }

    if (followPath && this.pathIdx < this.path.length) {
      const wp = this.path[this.pathIdx];
      if (Math.hypot(c.pos.x - wp.x, c.pos.z - wp.z) < 1.5) this.pathIdx++;
    }

    // 世界方向 -> 本地输入
    let wx = wantX - c.pos.x;
    let wz = wantZ - c.pos.z;
    const wl = Math.hypot(wx, wz);
    this.wantMove = wl > 0.6;
    if (this.wantMove) {
      wx /= wl; wz /= wl;
      const sy = Math.sin(this.aimYaw), cy = Math.cos(this.aimYaw);
      i.moveX = wx * cy + wz * (-sy);
      i.moveZ = wx * (-sy) + wz * (-cy);
      i.sprint = this.state === 'retreat' || (this.state === 'chase' && wl > 8);
    }

    // 卡住检测：想动却没动 -> 跳 / 重新寻路 / 换方向
    const moved = Math.hypot(c.pos.x - this.lastPos.x, c.pos.z - this.lastPos.z);
    this.lastPos.copy(c.pos);
    if (this.wantMove && moved < 0.02) {
      this.stuckT += dt;
      if (this.stuckT > 0.45) {
        this.stuckT = 0;
        i.jump = true;
        this.strafe *= -1;
        this.tNav = 0;                 // 立刻重新寻路
        this.searchPoint.set(0, 0, 0); // 换一个争夺点
        this.searchT = 0;
        this.hasDest = false;
        this.path.length = 0;
        this.wanderT = 0;
      }
    } else this.stuckT = 0;

    // 主动跳跃：追击时偶尔跨越障碍
    if (this.state === 'chase' && c.grounded && Math.random() < dt * 0.35) i.jump = true;

    // 滑索：撤退/转移时如果附近有滑索就乘坐
    if (this.state === 'retreat' || this.state === 'chase') {
      if (!c.riding && Math.random() < dt * 0.6) i.interact = true;
    }
  }

  // ------------------------------------------------------------ 开火
  private updateFire(dt: number): void {
    const c = this.char;
    const i = c.intent;
    const info = this.targetInfo;
    if (!info || !info.visible || !info.char.alive) { this.bursting = false; return; }
    if (this.state === 'reload' || this.state === 'retreat') {
      if (this.state === 'retreat' && c.weapon.ammo > 0 && info.dist < 20 && Math.random() < dt * 1.5) {
        // 撤退时仍会还击
      } else return;
    }

    const w = c.weapon;
    if (w.ammo <= 0 || w.reloading) { i.reload = true; return; }

    const dist = info.dist;
    if (dist > w.def.range * 1.1) return;

    // 只在枪口大致对准目标时才开火（避免"看到就打"的作弊感）
    const t = info.char;
    const ex = c.pos.x, ey = c.pos.y + c.eyeHeight, ez = c.pos.z;
    const dx = t.pos.x - ex, dy = (t.pos.y + t.eyeHeight * 0.72) - ey, dz = t.pos.z - ez;
    const d = Math.hypot(dx, dy, dz) || 1;
    const desiredYaw = Math.atan2(-dx, -dz);
    const desiredPitch = Math.asin(clamp(dy / d, -1, 1));
    const off = Math.abs(wrapAngle(desiredYaw - this.aimYaw)) + Math.abs(desiredPitch - this.aimPitch);
    if (off > 0.16 + (1 - this.skill) * 0.1) return;

    // 反应延迟
    if (this.game.time - (this._acquireTime || 0) < this.reactDelay) {
      if (this._acquireTarget !== t) {
        this._acquireTarget = t;
        this._acquireTime = this.game.time;
        return;
      }
      return;
    }

    // 连发节奏：点射而不是无脑压枪
    if (w.def.auto) {
      this.burstT -= dt;
      if (!this.bursting) {
        if (this.burstT <= 0) { this.bursting = true; this.burstT = 0.18 + Math.random() * 0.45; }
      } else {
        if (this.burstT <= 0) { this.bursting = false; this.burstT = 0.12 + Math.random() * 0.35; }
      }
      i.fire = this.bursting;
    } else {
      this.semiT -= dt;
      if (this.semiT <= 0) {
        this.semiT = (60 / w.def.rpm) * (0.85 + Math.random() * 0.5);
        i.firePressed = true;
      }
    }

    // 近距离开镜
    if (dist > 12 && dist < w.def.range * 0.9) i.ads = true;
  }

  private _acquireTime = 0;
  private _acquireTarget: Character | null = null;

  /** 争夺点轮换：到达或超时后换下一个，保证 AI 在地图上持续机动 */
  private pickSearchPoint(): THREE.Vector3 {
    const objs = this.game.mapData?.objectives;
    const arrived = this.searchPoint.lengthSq() > 0
      && Math.hypot(this.char.pos.x - this.searchPoint.x, this.char.pos.z - this.searchPoint.z) < 7;
    if (!objs || !objs.length) {
      this.nav.randomWander(this.searchPoint);
      return this.searchPoint;
    }
    if (arrived || this.searchT <= 0 || Math.random() < 0.02) {
      const o = objs[Math.floor(Math.random() * objs.length)];
      this.searchPoint.set(o.x + (Math.random() - 0.5) * 18, o.y, o.z + (Math.random() - 0.5) * 18);
      this.searchT = 15;
    }
    return this.searchPoint;
  }

  // ------------------------------------------------------------ 导航
  private repath(): void {
    const c = this.char;
    const info = this.targetInfo;
    const nav = this.nav;
    let tx = 0, tz = 0;
    let ok = false;

    switch (this.state) {
      case 'chase':
      case 'attack': {
        if (info && info.char.alive) { tx = info.char.pos.x; tz = info.char.pos.z; ok = true; }
        break;
      }
      case 'retreat': {
        // 远离威胁：往反方向找一个可行走点
        if (info) {
          const dx = c.pos.x - info.char.pos.x, dz = c.pos.z - info.char.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          tx = c.pos.x + (dx / d) * 22;
          tz = c.pos.z + (dz / d) * 22;
        } else { tx = c.pos.x + (Math.random() - 0.5) * 30; tz = c.pos.z + (Math.random() - 0.5) * 30; }
        ok = true;
        break;
      }
      case 'cover': {
        const v = this.tmpV;
        if (info && nav.findCover(c.pos.x, c.pos.z, info.char.pos.x, info.char.pos.z, v)) {
          tx = v.x; tz = v.z; ok = true;
        } else if (nav.randomWander(v)) { tx = v.x; tz = v.z; ok = true; }
        break;
      }
      case 'search': {
        // 优先前往"最后已知位置"；完全没有情报时向地图争夺点（广场/教堂/街道）推进，
        // 保证双方会自然遭遇，而不是各自在出生点附近乱逛。
        if (info && info.char.alive && info.lastSeen > 0) {
          tx = info.lx || info.char.pos.x; tz = info.lz || info.char.pos.z; ok = true;
        } else {
          const v = this.pickSearchPoint();
          tx = v.x; tz = v.z; ok = true;
        }
        break;
      }
      case 'reload': {
        const v = new THREE.Vector3();
        if (nav.randomWander(v)) { tx = v.x; tz = v.z; ok = true; }
        break;
      }
    }

    if (!ok) {
      // 目标不可达：退化为随机漫游点，绝不原地僵住
      const v = this.tmpV;
      if (nav.randomWander(v)) { tx = v.x; tz = v.z; ok = true; }
    }
    if (!ok) return;

    let found = nav.findPath(c.pos.x, c.pos.z, tx, tz, this.path);
    this.pathIdx = 0;
    if (!found) {
      const v = this.tmpV;
      if (nav.randomWander(v)) {
        found = nav.findPath(c.pos.x, c.pos.z, v.x, v.z, this.path);
        this.pathIdx = 0;
      }
    }
    if (found && this.path.length) {
      this.dest.copy(this.path[this.path.length - 1]);
      this.hasDest = true;
    } else {
      this.hasDest = false;
    }
  }

  private tmpV = new THREE.Vector3();
}
