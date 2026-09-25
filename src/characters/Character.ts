import * as THREE from 'three';
import type { Game } from '../core/Game';
import { CFG } from '../core/Config';
import type { BuildId, DamageInfo, Intent, TeamId } from '../core/Types';
import { makeIntent } from '../core/Types';
import { CharacterModel } from './CharacterModel';
import { Weapon } from '../weapons/Weapon';
import type { Ability } from '../abilities/Ability';
import { createAbility } from '../abilities/AbilityFactory';
import type { Gadget } from '../gadgets/Gadget';
import { createGadget } from '../gadgets/GadgetFactory';
import { BUILDS, type BuildDef } from '../game/Loadout';
import { clamp, moveTowards } from '../core/Utils';

const _dir = new THREE.Vector3();

/**
 * 战斗实体（玩家和 AI 完全共用的同一个类）。
 *
 * 关键点：玩家与 AI 都只写 intent（意图），然后走同一套 Character.update()：
 * 移动 → 物理 → 武器 → 技能 → 道具 → 动画。
 * AI 没有任何独立的伤害计算或作弊式位移，所有位移都经过 PhysicsWorld。
 */
export class Character {
  game: Game;
  id: number;
  name: string;
  team: TeamId;
  build: BuildId;
  def: BuildDef;
  isPlayer = false;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;

  radius: number;
  height: number;
  eyeHeight: number;
  baseSpeed: number;
  sprintMult: number;

  hp: number;
  maxHp: number;
  alive = true;
  respawnTimer = 0;
  grounded = false;
  sprinting = false;
  ads = 0;
  deathDir = 1;

  /** 后坐力视角偏移（玩家相机与 AI 瞄准共用，AI 同样吃后坐力） */
  recoilPitch = 0;
  recoilYaw = 0;

  // ---- 状态 ----
  stun = 0;
  stagger = 0;
  burn = 0;
  cloak = 0;
  cloakField = 0;
  jumpPadCd = 0;
  portalCd = 0;
  zipline: any = null;
  riding = false;

  // ---- 装备 ----
  weapons: Weapon[] = [];
  weaponIndex = 0;
  gadgets: Gadget[] = [];
  gadgetIndex = 0;
  ability: Ability;

  model: CharacterModel;
  intent: Intent = makeIntent();

  // ---- 统计 ----
  kills = 0;
  deaths = 0;
  damage = 0;
  lastAttacker: Character | null = null;
  lastDamageTime = -99;

  // ---- Dash ----
  dashCharges = CFG.dashCharges;
  dashRecharge = 0;
  dashTime = 0;
  dashCd = 0;
  dashDirX = 0;
  dashDirZ = 0;

  private moveResult = { grounded: false, wall: false, ceiling: false, stepped: false };
  private burnTick = 0;

  constructor(game: Game, id: number, name: string, team: TeamId, build: BuildId) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.team = team;
    this.build = build;
    this.def = BUILDS[build];

    this.radius = this.def.radius;
    this.height = this.def.height;
    this.eyeHeight = this.def.eye;
    this.baseSpeed = this.def.speed;
    this.sprintMult = this.def.sprintMult;
    this.maxHp = this.def.hp;
    this.hp = this.def.hp;

    for (const wid of this.def.weapons) this.weapons.push(new Weapon(wid, this));
    for (const gid of this.def.gadgets) {
      const g = createGadget(gid, this);
      if (g) this.gadgets.push(g);
    }
    this.ability = createAbility(this.def.ability, this);

    const teamColor = team === 0 ? 0x2f7fd0 : 0xc23840;
    this.model = new CharacterModel(build, teamColor);
    this.model.setWeapon(this.weapon.def.id);
    game.scene.add(this.model.root);
  }

  get weapon(): Weapon { return this.weapons[this.weaponIndex]; }
  get gadget(): Gadget { return this.gadgets[this.gadgetIndex]; }

  get eyePos(): THREE.Vector3 {
    return _dir.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** 当前实际瞄准方向（含后坐力偏移） */
  aimDir(out: THREE.Vector3): THREE.Vector3 {
    const p = this.pitch + this.recoilPitch;
    const y = this.yaw + this.recoilYaw;
    const cp = Math.cos(p);
    out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
    return out;
  }

  /** 世界坐标下的前方向（不含俯仰） */
  forwardFlat(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  cycleWeapon(dir: number): void {
    if (this.weapons.length < 2) return;
    this.weaponIndex = (this.weaponIndex + dir + this.weapons.length) % this.weapons.length;
    this.weapon.onEquip();
    this.model.setWeapon(this.weapon.def.id);
    this.game.audio?.play('switch');
    if (this.isPlayer) this.game.hud?.flashWeapon(this.weapon.def.name);
  }

  selectWeapon(i: number): void {
    if (i < 0 || i >= this.weapons.length || i === this.weaponIndex) return;
    this.weaponIndex = i;
    this.weapon.onEquip();
    this.model.setWeapon(this.weapon.def.id);
    this.game.audio?.play('switch');
    if (this.isPlayer) this.game.hud?.flashWeapon(this.weapon.def.name);
  }

  cycleGadget(dir: number): void {
    if (this.gadgets.length < 2) return;
    this.gadgetIndex = (this.gadgetIndex + dir + this.gadgets.length) % this.gadgets.length;
    this.game.audio?.play('ui');
    if (this.isPlayer) this.game.hud?.flashGadget(this.gadget.def.name);
  }

  /** 真实的力：爆炸 / 震荡波 / 跳板都通过这里改变速度 */
  addImpulse(x: number, y: number, z: number, stagger = 0.35): void {
    this.vel.x += x;
    this.vel.y += y;
    this.vel.z += z;
    this.stagger = Math.max(this.stagger, stagger);
    if (y > 1.5) this.grounded = false;
  }

  startDash(dx: number, dz: number): void {
    if (this.dashCharges <= 0 || this.dashCd > 0) return;
    this.dashCharges--;
    this.dashCd = CFG.dashCooldown;
    this.dashTime = CFG.dashDuration;
    const l = Math.hypot(dx, dz) || 1;
    this.dashDirX = dx / l;
    this.dashDirZ = dz / l;
    if (this.dashRecharge <= 0) this.dashRecharge = CFG.dashRecharge;
  }

  // ---------------------------------------------------------------- 主更新
  update(dt: number): void {
    if (!this.alive) {
      this.respawnTimer -= dt;
      this.model.update(dt, this);
      return;
    }
    const i = this.intent;
    this.yaw = i.yaw;
    this.pitch = clamp(i.pitch, -1.5, 1.5);

    // ---- 状态计时 ----
    if (this.stun > 0) this.stun -= dt;
    if (this.stagger > 0) this.stagger -= dt;
    if (this.jumpPadCd > 0) this.jumpPadCd -= dt;
    if (this.portalCd > 0) this.portalCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.cloak > 0) this.cloak -= dt;
    if (this.dashCharges < CFG.dashCharges) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) {
        this.dashCharges++;
        this.dashRecharge = this.dashCharges < CFG.dashCharges ? CFG.dashRecharge : 0;
      }
    }
    if (this.burn > 0) {
      this.burn -= dt;
      this.burnTick -= dt;
      const dps = 14;
      this.applyDamage({
        amount: dps * dt, attacker: this.lastAttacker,
        px: this.pos.x, py: this.pos.y + 1, pz: this.pos.z,
        dx: 0, dy: 0, dz: 0, head: false, cause: 'fire',
      }, true);
      if (this.burnTick <= 0) {
        this.burnTick = 0.22;
        this.game.fx.flame(this.pos.x, this.pos.y + 0.6, this.pos.z, 1);
      }
    }
    const cloaked = this.cloak > 0 || this.cloakField > 0;
    this.cloakField = 0;

    this.ability.update(dt, this);
    for (const g of this.gadgets) g.update(dt, this);

    // ---- 移动 ----
    const stunned = this.stun > 0;
    let mx = stunned ? 0 : i.moveX;
    let mz = stunned ? 0 : i.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dx = cy * mx - sy * mz;
    const dz = -sy * mx - cy * mz;

    this.sprinting = i.sprint && mz > 0.2 && this.grounded && this.ads < 0.4 && !stunned;
    let maxSpeed = this.baseSpeed * this.weapon.def.moveMult;
    if (this.sprinting) maxSpeed *= this.sprintMult;
    if (this.ads > 0.01) maxSpeed *= 1 - 0.45 * this.ads;
    if (stunned) maxSpeed *= 0.3;

    if (this.dashTime > 0) {
      // Dash：直接给定速度，保留重力，不做加速平滑
      this.dashTime -= dt;
      const t = clamp(this.dashTime / CFG.dashDuration, 0, 1);
      const sp = CFG.dashSpeed * (0.45 + 0.55 * t);
      this.vel.x = this.dashDirX * sp;
      this.vel.z = this.dashDirZ * sp;
      if (this.game.time - (this._lastDashFx || 0) > 0.04) {
        this._lastDashFx = this.game.time;
        this.game.fx.dashTrail(this.pos.x, this.pos.y + 1.0, this.pos.z, this.team === 0 ? 0x8fe8ff : 0xffc0a0);
      }
    } else {
      const control = this.grounded ? 1 : CFG.airControl * (this.stagger > 0 ? 0.35 : 1);
      const a = CFG.accelGround * control * dt;
      this.vel.x = moveTowards(this.vel.x, dx * maxSpeed, a);
      this.vel.z = moveTowards(this.vel.z, dz * maxSpeed, a);
    }

    if (i.jump && this.grounded && !stunned) {
      this.vel.y = CFG.jumpSpeed;
      this.grounded = false;
      this.game.audio?.play('jump');
    }

    this.vel.y += CFG.gravity * dt;
    if (this.vel.y < CFG.terminalVelocity) this.vel.y = CFG.terminalVelocity;

    if (!this.riding) {
      this.game.physics.moveCharacter(this.pos, this.vel, this.radius, this.height, dt, this.moveResult);
      this.grounded = this.moveResult.grounded;
    }

    // ---- 武器 / 技能 / 道具 ----
    this.weapon.update(dt, this, i);
    this.recoilPitch = this.weapon.recoil.pitchOffset;
    this.recoilYaw = this.weapon.recoil.yawOffset;

    if (i.ability && this.ability.canUse(this)) {
      if (this.ability.activate(this)) {
        this.ability.cdLeft = this.ability.cooldown;
        this.game.audio?.play('ability');
      }
    }
    if (i.gadget && this.gadget.canUse(this)) {
      if (this.gadget.use(this)) {
        this.gadget.count--;
        this.gadget.cdLeft = this.gadget.def.cooldown;
      }
    }

    this.model.setCloak(cloaked ? 1 : 0);
    this.model.update(dt, this);
  }

  private _lastDashFx = 0;

  // ---------------------------------------------------------------- 伤害
  applyDamage(info: DamageInfo, silent = false): void {
    if (!this.alive || this.hp <= 0) return;
    const dmg = info.amount;
    this.hp -= dmg;
    this.lastAttacker = info.attacker;
    this.lastDamageTime = this.game.time;

    if (!silent && dmg > 0.5) {
      // 命中/受击都会洒金币：THE FINALS 的标志性反馈
      const n = clamp(Math.round(dmg / 8) + 1, 1, 6);
      this.game.fx.coinBurst(info.px, info.py, info.pz, n, 0.55);
      this.game.fx.impact(info.px, info.py, info.pz, info.dx, info.dy, info.dz, 0xff3b30);
    }

    if (info.attacker && info.attacker !== this) {
      info.attacker.damage += dmg;
      if (info.attacker.isPlayer) {
        this.game.hud.hitMarker(info.head);
        this.game.hud.damageDealt(dmg);
      }
    }

    if (this.isPlayer) {
      this.game.hud.playerHurt(info);
      this.game.audio?.play('hurt');
    }

    if (info.cause === 'electric' && this.alive) {
      this.stun = Math.max(this.stun, info.attacker?.weapon?.def?.stun ?? 1.2);
      this.game.fx.electricBurst(this.pos.x, this.pos.y + this.eyeHeight * 0.7, this.pos.z);
    }

    if (this.hp <= 0) this.die(info.attacker);
  }

  die(killer: Character | null): void {
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
    this.deaths++;
    this.respawnTimer = CFG.respawnDelay;
    this.vel.set(0, 0, 0);
    this.dashTime = 0;
    this.stun = 0;
    this.burn = 0;
    this.deathDir = Math.random() < 0.5 ? -1 : 1;
    this.model.setDead();
    this.ability.onDeath(this);

    // 击杀：大量金币爆散（比命中反馈明显得多）
    this.game.fx.coinBurst(this.pos.x, this.pos.y + 0.9, this.pos.z, CFG.killCoins, 1.35);
    this.game.fx.explosion(this.pos.x, this.pos.y + 0.9, this.pos.z, 1.1, 0xffd45e, false);
    this.game.audio?.play(killer?.isPlayer ? 'kill' : 'death');
    this.game.tdm.onKill(killer, this);
  }

  respawn(x: number, y: number, z: number, yaw: number): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stun = 0;
    this.burn = 0;
    this.cloak = 0;
    this.dashCharges = CFG.dashCharges;
    this.dashRecharge = 0;
    this.dashTime = 0;
    this.ability.reset();
    for (const g of this.gadgets) g.reset();
    for (const w of this.weapons) w.reset();
    this.model.setAlive();
    this.model.setVisible(!this.isPlayer || !this.game.playerController?.firstPerson);
  }

  dispose(): void {
    this.game.scene.remove(this.model.root);
    this.model.dispose();
  }
}
