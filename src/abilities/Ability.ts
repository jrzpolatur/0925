import type { Character } from '../characters/Character';

/**
 * 技能基类。
 * 每个技能都有：独立类 / 冷却 / 状态 / 使用逻辑 / 视觉反馈 / 声音接口 / AI 调用接口。
 * AI 通过 char.intent.ability = true 触发，与玩家按 Q 完全等价。
 */
export abstract class Ability {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly cn: string;
  /** 冷却时间（秒） */
  abstract readonly cooldown: number;

  owner: Character;
  cdLeft = 0;
  active = false;
  elapsed = 0;
  duration = 0;

  constructor(owner: Character) {
    this.owner = owner;
  }

  /** HUD 冷却比例：0 = 刚用完，1 = 可用 */
  get cdRatio(): number {
    return this.cooldown > 0 ? Math.max(0, Math.min(1, 1 - this.cdLeft / this.cooldown)) : 1;
  }

  get ready(): boolean { return this.canUse(this.owner); }

  canUse(c: Character): boolean {
    return this.cdLeft <= 0 && !this.active && c.alive && c.stun <= 0;
  }

  /** 由 Character.update 调用 */
  update(dt: number, c: Character): void {
    if (this.cdLeft > 0) this.cdLeft -= dt;
    if (this.active) {
      this.elapsed += dt;
      this.onActive(dt, c);
      if (this.duration > 0 && this.elapsed >= this.duration) this.deactivate(c);
    }
  }

  /** 瞬发型技能（投掷/一次性）不进入持续状态 */
  protected instant = false;

  activate(c: Character): boolean {
    if (!this.canUse(c)) return false;
    const ok = this.onActivate(c);
    if (ok && !this.instant) {
      this.active = true;
      this.elapsed = 0;
    }
    return ok;
  }

  deactivate(c: Character): void {
    if (!this.active) return;
    this.active = false;
    this.onDeactivate(c);
  }

  reset(): void {
    this.cdLeft = 0;
    this.active = false;
    this.elapsed = 0;
  }

  onDeath(c: Character): void {
    if (this.active) this.deactivate(c);
  }

  protected abstract onActivate(c: Character): boolean;
  protected onActive(_dt: number, _c: Character): void {}
  protected onDeactivate(_c: Character): void {}
}
