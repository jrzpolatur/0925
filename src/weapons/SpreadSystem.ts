import type { SpreadDef, WeaponDef } from './WeaponDefs';
import type { Character } from '../characters/Character';

/**
 * 动态扩散系统（腰射 / 开镜 / 移动 / 腾空 / 连射累积）
 * 输出结果同时用于：
 *  - 实际弹道随机偏移（玩家与 AI 完全一致）
 *  - HUD 准星动态张开（实时反馈）
 */
export class SpreadSystem {
  private def: SpreadDef;
  /** 连射累积扩散（bloom） */
  bloom = 0;

  constructor(def: WeaponDef) {
    this.def = def.spread;
  }

  onShot(): void {
    this.bloom = Math.min(this.def.max, this.bloom + this.def.perShot);
  }

  update(dt: number): void {
    this.bloom = Math.max(0, this.bloom - this.def.decay * dt);
  }

  /** 当前扩散半角（弧度） */
  current(char: Character): number {
    const d = this.def;
    const ads = char.ads; // 0 = 腰射, 1 = 完全开镜
    let base = d.hip + (d.ads - d.hip) * ads;
    // 移动影响：按水平速度比例
    const hs = Math.hypot(char.vel.x, char.vel.z);
    const moveRatio = Math.min(1, hs / Math.max(1, char.baseSpeed));
    base += d.move * moveRatio * (1 - ads * 0.65);
    // 冲刺额外惩罚
    if (char.sprinting) base += d.move * 0.55 * (1 - ads * 0.8);
    // 腾空
    if (!char.grounded) base += d.air;
    return Math.min(d.max, base + this.bloom);
  }

  reset(): void {
    this.bloom = 0;
  }
}
