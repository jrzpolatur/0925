import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Character } from '../characters/Character';
import { CFG } from '../core/Config';
import { makeRayHit, type RayHit } from '../core/Types';
import { makeVoxelHit } from '../destruction/DestructionSystem';
import type { Weapon } from '../weapons/Weapon';
import { TAU } from '../core/Utils';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _wh = { dist: Infinity, nx: 0, ny: 0, nz: 0 };
const _sh = { dist: Infinity, nx: 0, ny: 0, nz: 0, shield: null as any };

/**
 * 战斗系统：射线命中 / 伤害 / 爆炸物理。
 * 玩家和 AI 的所有开火都经过 fireWeapon()，不存在两套伤害逻辑。
 */
export class CombatSystem {
  game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  // ------------------------------------------------------------ 射线
  /** 只检测静态世界 + 可破坏体素（不含角色/护盾），用于 AI 视线与道具放置 */
  raycastWorld(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, out: { dist: number; nx: number; ny: number; nz: number }): boolean {
    return this.game.physics.raycast(o, d, maxDist, out);
  }

  /** 角色射线（返回最近命中的角色 + 是否爆头） */
  raycastCharacters(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; char: Character | null; head: boolean; px: number; py: number; pz: number },
    skipTeam: number | null = null,
    ignore: Character | null = null,
  ): boolean {
    let best = maxDist;
    let found = false;
    out.char = null;
    out.head = false;
    for (const c of this.game.characters) {
      if (!c.alive || c === ignore) continue;
      if (skipTeam !== null && c.team === skipTeam) continue;
      // 先做便宜的水平距离剔除
      const dx0 = c.pos.x - o.x, dz0 = c.pos.z - o.z;
      if (dx0 * dx0 + dz0 * dz0 > (best + 2) * (best + 2)) continue;

      // 头部盒
      const headMinY = c.pos.y + c.eyeHeight - 0.17;
      const headMaxY = c.pos.y + c.eyeHeight + 0.20;
      const hr = c.radius * 0.62;
      let t = rayAabb(o, d, c.pos.x - hr, headMinY, c.pos.z - hr, c.pos.x + hr, headMaxY, c.pos.z + hr);
      let head = t !== null;
      if (t === null) {
        // 身体盒
        const br = c.radius * 1.05;
        t = rayAabb(o, d, c.pos.x - br, c.pos.y + 0.05, c.pos.z - br, c.pos.x + br, c.pos.y + c.eyeHeight - 0.12, c.pos.z + br);
      }
      if (t !== null && t < best && t >= 0) {
        best = t;
        found = true;
        out.char = c;
        out.head = head;
        out.px = o.x + d.x * t;
        out.py = o.y + d.y * t;
        out.pz = o.z + d.z * t;
      }
    }
    if (found) out.dist = best;
    return found;
  }

  /** 完整射线：角色 / 护盾 / 世界，返回最近命中 */
  raycastAll(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, hit: RayHit, ignore: Character | null, skipTeam: number | null = null): boolean {
    resetHit(hit);
    let best = maxDist;

    // 1a) 静态世界
    if (this.game.physics.raycastBoxes(o, d, best, _wh)) {
      best = _wh.dist;
      hit.kind = 'world';
      hit.dist = best;
      hit.nx = _wh.nx; hit.ny = _wh.ny; hit.nz = _wh.nz;
      hit.px = o.x + d.x * best; hit.py = o.y + d.y * best; hit.pz = o.z + d.z * best;
    }
    // 1b) 可破坏体素（子弹打碎方块需要 struct + cell 信息）
    if (this.game.destruction.raycastVoxel(o, d, best, this.voxHit)) {
      const v = this.voxHit;
      best = v.dist;
      hit.kind = 'voxel';
      hit.dist = best;
      hit.nx = v.nx; hit.ny = v.ny; hit.nz = v.nz;
      hit.px = o.x + d.x * best; hit.py = o.y + d.y * best; hit.pz = o.z + d.z * best;
      hit.target = v.struct;
      (hit as any).cell = v.cell;
    }

    // 2) 护盾
    if (this.game.gadgetSystem.raycastShields(o, d, best, _sh)) {
      best = _sh.dist;
      hit.kind = 'shield';
      hit.dist = best;
      hit.nx = _sh.nx; hit.ny = _sh.ny; hit.nz = _sh.nz;
      hit.target = _sh.shield;
      hit.px = o.x + d.x * best; hit.py = o.y + d.y * best; hit.pz = o.z + d.z * best;
    }

    // 3) 角色
    const ch = this.charHit;
    if (this.raycastCharacters(o, d, best, ch, skipTeam, ignore)) {
      best = ch.dist;
      hit.kind = 'character';
      hit.dist = best;
      hit.target = ch.char;
      hit.head = ch.head;
      hit.px = ch.px; hit.py = ch.py; hit.pz = ch.pz;
      hit.nx = -d.x; hit.ny = -d.y; hit.nz = -d.z;
    }
    return hit.kind !== 'none';
  }

  private charHit = { dist: Infinity, char: null as Character | null, head: false, px: 0, py: 0, pz: 0 };
  private voxHit = makeVoxelHit();

  // ------------------------------------------------------------ 开火
  /** 玩家与 AI 共用的开火入口 */
  fireWeapon(shooter: Character, weapon: Weapon): void {
    const def = weapon.def;
    const spread = weapon.spread.current(shooter);

    // 枪口位置：第一人称用视图模型，第三人称/AI 用世界模型
    _o.set(shooter.pos.x, shooter.pos.y + shooter.eyeHeight, shooter.pos.z);
    shooter.aimDir(_d);

    const muzzle = _tmp;
    let hasMuzzle = false;
    if (shooter.isPlayer && this.game.playerController?.firstPerson) {
      hasMuzzle = this.game.playerController.getMuzzleWorld(muzzle);
    } else {
      hasMuzzle = shooter.model.getWeaponMuzzle(muzzle);
    }
    if (!hasMuzzle) muzzle.copy(_o).addScaledVector(_d, 0.4);

    // 枪焰（明亮但极短，不遮挡准星与敌人）
    this.game.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, def.muzzle, def.id === 'sa1216' ? 1.5 : 1);
    if (shooter.isPlayer) this.game.playerController?.recoilKick(def.recoil.shake, def.recoil.vertical);

    // 弹道起点：从眼睛出发，避免枪模型穿墙导致打不中
    const originX = _o.x, originY = _o.y, originZ = _o.z;

    if (def.projectile) {
      this.game.projectiles.spawnRocket(shooter, weapon);
      return;
    }

    // 构造扩散正交基
    _up.set(0, 1, 0);
    if (Math.abs(_d.y) > 0.98) _up.set(1, 0, 0);
    _right.copy(_up).cross(_d).normalize();
    _up.copy(_d).cross(_right).normalize();

    const hit = this.hitTmp;
    const pellets = def.pellets;
    const isStun = !!def.stun;

    for (let p = 0; p < pellets; p++) {
      // 圆盘均匀采样（sqrt 保证分布均匀）
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * spread;
      const ox = Math.cos(a) * r;
      const oy = Math.sin(a) * r;
      _n.copy(_d)
        .addScaledVector(_right, ox)
        .addScaledVector(_up, oy)
        .normalize();

      _p.set(originX, originY, originZ);
      const any = this.raycastAll(_p, _n, def.range, hit, shooter, null);
      const endDist = any ? hit.dist : def.range;
      const ex = originX + _n.x * endDist;
      const ey = originY + _n.y * endDist;
      const ez = originZ + _n.z * endDist;

      if (isStun) {
        this.game.fx.electricBeam(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez);
      } else if (pellets <= 2 || p % 2 === 0) {
        // 曳光弹（霰弹只画一半，避免刷屏）
        this.game.fx.tracer(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez, def.tracer);
      }

      if (!any) continue;

      if (hit.kind === 'character') {
        const target = hit.target as Character;
        if (target.team === shooter.team) continue; // 禁止友伤
        let dmg = def.damage * this.falloff(def, hit.dist);
        if (hit.head) dmg *= def.headMult;
        if (isStun) dmg *= 1;
        target.applyDamage({
          amount: dmg, attacker: shooter,
          px: hit.px, py: hit.py, pz: hit.pz,
          dx: _n.x, dy: _n.y, dz: _n.z,
          head: hit.head,
          cause: isStun ? 'electric' : 'bullet',
        });
        this.game.fx.hitFlesh(hit.px, hit.py, hit.pz);
      } else if (hit.kind === 'shield') {
        const s = hit.target;
        if (s.team === shooter.team && s.type === 'mesh') continue; // 自己的网格盾不挡自己的子弹（从内侧射出）
        this.game.gadgetSystem.damageShield(s, def.damage);
        this.game.fx.impact(hit.px, hit.py, hit.pz, hit.nx, hit.ny, hit.nz, 0x9be8ff);
      } else {
        this.game.fx.impact(hit.px, hit.py, hit.pz, hit.nx, hit.ny, hit.nz, 0xffe0a0);
        // 子弹可以削掉体素方块（对环境造成轻微结构伤害）
        if (hit.kind === 'voxel' && hit.target) {
          this.game.destruction.damageCell(hit.target, (hit as any).cell, def.damage * 0.55, originX, originY, originZ);
        }
      }
    }

    // 抛壳
    if (def.shell && shooter.isPlayer) {
      this.game.playerController?.ejectShell();
    }
  }

  private hitTmp = makeRayHit();

  private falloff(def: Weapon['def'], dist: number): number {
    const half = def.range * 0.5;
    if (dist <= half) return 1;
    const t = Math.min(1, (dist - half) / Math.max(0.001, def.range - half));
    return 1 + (def.falloffMin - 1) * t;
  }

  // ------------------------------------------------------------ 爆炸
  /**
   * 爆炸 / 震荡波的核心：
   *  距离衰减 -> 伤害
   *  方向向量 -> 真实 Impulse（改变速度，不是播放位移）
   *  同时对可破坏体素造成结构伤害
   */
  explode(
    x: number, y: number, z: number,
    radius: number, damage: number, impulse: number, structure: number,
    attacker: Character | null, cause: 'explosive' | 'flame' | 'shockwave' | 'rpg' = 'explosive',
  ): void {
    this.game.fx.explosion(x, y, z, radius, cause === 'shockwave' ? 0x8fd8ff : 0xffa030, true);
    this.game.audio?.play('explosion', _p.set(x, y, z), 1);

    // 环境破坏
    if (structure > 0) {
      this.game.destruction.damageSphere(x, y, z, radius * 0.9, structure);
    }

    for (const c of this.game.characters) {
      if (!c.alive) continue;
      _tmp.set(c.pos.x - x, (c.pos.y + c.height * 0.5) - y, c.pos.z - z);
      const dist = _tmp.length();
      if (dist > radius) continue;
      // 距离衰减（近处全额，边缘 25%）
      const f = Math.max(0, 1 - dist / radius);
      const falloff = f * f * 0.75 + f * 0.25;

      // 视线遮挡：被墙挡住只受 35% 伤害和推力
      _tmp.normalize();
      _o.set(x, y, z);
      _d.copy(_tmp);
      let blocked = false;
      if (this.raycastWorld(_o, _d, dist - 0.35, _wh)) blocked = true;
      const factor = blocked ? 0.35 : 1;

      const friendly = attacker ? c.team === attacker.team : false;
      const dmg = damage * falloff * factor * (friendly ? 0.45 : 1);
      if (dmg > 0.5) {
        c.applyDamage({
          amount: dmg, attacker,
          px: c.pos.x, py: c.pos.y + c.height * 0.6, pz: c.pos.z,
          dx: _tmp.x, dy: _tmp.y, dz: _tmp.z,
          head: false, cause: cause === 'flame' ? 'fire' : 'explosion',
        });
      }

      // 真实冲量：水平推开 + 向上抛飞，之后角色处于空中失衡状态
      const force = impulse * falloff * factor;
      c.addImpulse(_tmp.x * force, Math.abs(_tmp.y) * force * 0.6 + force * 0.55, _tmp.z * force, 0.75);
      if (cause !== 'explosive' && cause !== 'rpg') c.stagger = Math.max(c.stagger, 0.9);
    }

    // 屏幕反馈
    const pc = this.game.playerController;
    if (pc && this.game.player) {
      const pd = Math.hypot(this.game.player.pos.x - x, this.game.player.pos.y - y, this.game.player.pos.z - z);
      if (pd < radius * 2.2) {
        pc.shake(Math.max(0.15, 1 - pd / (radius * 2.2)) * (cause === 'shockwave' ? 1.2 : 1));
      }
    }
  }
}

function resetHit(h: RayHit): void {
  h.dist = Infinity;
  h.kind = 'none';
  h.target = null;
  h.head = false;
}

/** 射线 vs AABB（slab 法），返回进入距离或 null */
export function rayAabb(
  o: THREE.Vector3, d: THREE.Vector3,
  minx: number, miny: number, minz: number,
  maxx: number, maxy: number, maxz: number,
): number | null {
  let tmin = 0;
  let tmax = Infinity;
  // X
  if (Math.abs(d.x) < 1e-8) { if (o.x < minx || o.x > maxx) return null; }
  else {
    const inv = 1 / d.x;
    let t1 = (minx - o.x) * inv, t2 = (maxx - o.x) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(d.y) < 1e-8) { if (o.y < miny || o.y > maxy) return null; }
  else {
    const inv = 1 / d.y;
    let t1 = (miny - o.y) * inv, t2 = (maxy - o.y) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(d.z) < 1e-8) { if (o.z < minz || o.z > maxz) return null; }
  else {
    const inv = 1 / d.z;
    let t1 = (minz - o.z) * inv, t2 = (maxz - o.z) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
