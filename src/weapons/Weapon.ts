import type { Character } from '../characters/Character';
import type { Intent } from '../core/Types';
import { moveTowards } from '../core/Utils';
import { RecoilSystem } from './RecoilSystem';
import { SpreadSystem } from './SpreadSystem';
import { getWeaponDef, type WeaponDef } from './WeaponDefs';

/**
 * 武器基类。
 * 所有射击行为最终都交给 CombatSystem.fireWeapon()，
 * 玩家与 AI 调用的是同一个方法，因此两者的弹道/伤害/扩散/后坐完全一致。
 */
export class Weapon {
  def: WeaponDef;
  owner: Character;
  ammo: number;
  reserve: number;
  cooldown = 0;
  reloadTimer = 0;
  recoil: RecoilSystem;
  spread: SpreadSystem;
  /** 上一次是否为开火状态（半自动判定用） */
  private prevFire = false;

  constructor(id: string, owner: Character) {
    this.def = getWeaponDef(id);
    this.owner = owner;
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.recoil = new RecoilSystem(this.def);
    this.spread = new SpreadSystem(this.def);
  }

  get reloading(): boolean { return this.reloadTimer > 0; }

  /** 换弹进度 0..1（HUD 用） */
  get reloadProgress(): number {
    return this.reloadTimer > 0 ? 1 - this.reloadTimer / this.def.reloadTime : 1;
  }

  onEquip(): void {
    this.reloadTimer = 0;
    this.cooldown = Math.max(this.cooldown, 0.22);
    this.spread.reset();
  }

  reset(): void {
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.recoil.reset();
    this.spread.reset();
    this.prevFire = false;
  }

  update(dt: number, char: Character, intent: Intent): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.recoil.update(dt);
    this.spread.update(dt);

    // ADS 过渡（冲刺中不能开镜）
    const adsTarget = intent.ads && !char.sprinting ? 1 : 0;
    char.ads = moveTowards(char.ads, adsTarget, dt / Math.max(0.05, this.def.adsTime));

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        const need = this.def.mag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }

    const wantFire = this.def.auto ? intent.fire : (intent.firePressed && !this.prevFire);
    this.prevFire = intent.firePressed;

    if (intent.reload) this.startReload();
    if (wantFire && this.canFire()) {
      this.fire(char);
    } else if (wantFire && this.ammo <= 0 && this.reloadTimer <= 0 && this.cooldown <= 0) {
      this.startReload();
      char.game.audio?.play('dryfire');
      this.cooldown = 0.3;
    }
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.reloadTimer <= 0 && this.ammo > 0 && this.owner.stun <= 0;
  }

  startReload(): void {
    if (this.reloadTimer > 0) return;
    if (this.ammo >= this.def.mag) return;
    if (this.reserve <= 0) return;
    this.reloadTimer = this.def.reloadTime;
    this.owner.game.audio?.play('reload');
  }

  fire(char: Character): void {
    this.ammo--;
    this.cooldown = 60 / this.def.rpm;
    this.recoil.onShot();
    this.spread.onShot();
    char.model.onFire();

    // 真正的弹道计算在这里完成（玩家与 AI 共用）
    char.game.combat.fireWeapon(char, this);

    char.game.audio?.play(this.def.sound, char.pos, 0.9);
    if (this.ammo <= 0) this.startReload();
  }
}
