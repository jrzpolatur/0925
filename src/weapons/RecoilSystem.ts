import type { RecoilDef, WeaponDef } from './WeaponDefs';
import { damp } from '../core/Utils';

/**
 * 独立后坐力系统。
 * 每把枪有自己的 RecoilDef：
 *  - vertical / horizontal：每发上跳与水平扰动
 *  - pattern：按发数循环的水平偏移序列（AKM 先右后左，可压枪）
 *  - recovery：回正速度
 * 角色只持有 pitchOffset/yawOffset 两个数值，玩家相机与 AI 瞄准共用同一份，
 * 因此 AI 也真实承受后坐力，不存在「AI 无后坐」的作弊。
 */
export class RecoilSystem {
  private def: RecoilDef;
  private shotIndex = 0;
  /** 当前后坐偏移（弧度） */
  pitchOffset = 0;
  yawOffset = 0;
  /** 视觉抖动（用于相机/模型） */
  kick = 0;
  /** 是否已被"压枪"（玩家可在开火后下拉鼠标抵消，这里保留原始值用于回正） */
  private targetPitch = 0;
  private targetYaw = 0;

  constructor(def: WeaponDef) {
    this.def = def.recoil;
  }

  onShot(): void {
    const r = this.def;
    this.targetPitch += r.vertical;
    let h = (Math.random() - 0.5) * 2 * r.horizontal;
    if (r.pattern && r.pattern.length) {
      h += r.pattern[this.shotIndex % r.pattern.length];
    }
    this.targetYaw += h;
    this.shotIndex++;
    this.kick = Math.min(1.6, this.kick + r.shake * 0.5);
  }

  update(dt: number): void {
    // 指数回正：射击越密集，累积越高，停火后快速归零
    this.targetPitch = damp(this.targetPitch, 0, this.def.recovery, dt);
    this.targetYaw = damp(this.targetYaw, 0, this.def.recovery, dt);
    this.pitchOffset = damp(this.pitchOffset, this.targetPitch, 22, dt);
    this.yawOffset = damp(this.yawOffset, this.targetYaw, 22, dt);
    this.kick = damp(this.kick, 0, 9, dt);
  }

  reset(): void {
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.pitchOffset = 0;
    this.yawOffset = 0;
    this.kick = 0;
    this.shotIndex = 0;
  }
}
