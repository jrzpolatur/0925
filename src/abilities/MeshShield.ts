import { Ability } from './Ability';
import type { Character } from '../characters/Character';

/**
 * 网格护盾（HEAVY）
 * - 真实碰撞体：CombatSystem 的射线会先命中护盾，子弹被挡下
 * - 有独立体素网格模型 + 受击闪烁 + 耐久 / 生命周期
 * - 展开期间玩家可切换到第三人称视角（PlayerController 检测 active 状态）
 */
export class MeshShieldAbility extends Ability {
  readonly id = 'meshshield';
  readonly name = 'MESH SHIELD';
  readonly cn = '网格护盾';
  readonly cooldown = 16;
  readonly duration = 14;

  protected onActivate(c: Character): boolean {
    c.game.gadgetSystem.createMeshShield(c, 620, this.duration);
    c.game.audio?.play('shield', c.pos, 0.9);
    c.game.fx.ring(c.pos.x, c.pos.y + 1.0, c.pos.z, 1.4, c.team === 0 ? 0x49b8ff : 0xff6a5a);
    if (c.isPlayer) c.game.hud?.toast('网格护盾展开 · 按 V 切换第三人称');
    return true;
  }

  protected onDeactivate(c: Character): void {
    if (c.isPlayer) c.game.hud?.toast('网格护盾收起');
  }
}
