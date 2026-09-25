import { Ability } from './Ability';
import type { Character } from '../characters/Character';
import { CFG } from '../core/Config';

/**
 * 闪避冲刺（LIGHT）：三段积攒式 Dash
 * - 最多存 3 层，每次消耗 1 层
 * - 自动恢复（CFG.dashRecharge 秒/层）
 * - 层间有独立冷却（CFG.dashCooldown），不能无限连冲
 * - 方向由当前移动输入决定（AI 同样由 intent.moveX/moveZ 决定）
 */
export class DashAbility extends Ability {
  readonly id = 'dash';
  readonly name = 'DASH';
  readonly cn = '闪避冲刺';
  readonly cooldown = CFG.dashCooldown;

  canUse(c: Character): boolean {
    return c.dashCharges > 0 && c.dashCd <= 0 && c.alive && c.stun <= 0;
  }

  protected onActivate(c: Character): boolean {
    const i = c.intent;
    let mx = i.moveX;
    let mz = i.moveZ;
    // 无方向输入时朝正前方冲刺
    if (Math.abs(mx) < 0.1 && Math.abs(mz) < 0.1) { mx = 0; mz = 1; }
    const l = Math.hypot(mx, mz) || 1;
    mx /= l; mz /= l;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    const dx = cy * mx - sy * mz;
    const dz = -sy * mx - cy * mz;

    const before = c.dashCharges;
    c.startDash(dx, dz);
    if (c.dashCharges === before) return false;

    c.game.fx.dashBurst(c.pos.x, c.pos.y + 0.9, c.pos.z, c.team === 0 ? 0x8fe8ff : 0xffb0a0);
    c.game.audio?.play('dash', c.pos, 0.8);
    if (c.isPlayer) c.game.playerController?.dashFeedback();
    return true;
  }
}
