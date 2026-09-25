import { Ability } from './Ability';
import type { Character } from '../characters/Character';

/**
 * 震荡波（MEDIUM）
 *
 * 实现方式：投掷一枚震荡波装置（真实投射物，受重力影响），
 * 落地/引信到期后引爆 -> CombatSystem.explode() 计算：
 *   距离衰减 + 方向 + Falloff -> 对角色施加 Impulse（真实速度改变）
 * 敌人/队友/玩家本身都会被真实推开，并在空中短暂失衡（stagger），
 * 同时对可破坏体素造成结构伤害（可以震碎墙）。
 */
export class ShockwaveAbility extends Ability {
  readonly id = 'shockwave';
  readonly name = 'SHOCKWAVE';
  readonly cn = '震荡波';
  readonly cooldown = 9.0;
  protected instant = true;

  protected onActivate(c: Character): boolean {
    c.game.projectiles.spawnShockwave(c);
    c.game.audio?.play('throw', c.pos, 0.7);
    return true;
  }
}
