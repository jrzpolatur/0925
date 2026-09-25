import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Character } from '../characters/Character';

export interface GadgetDef {
  id: string;
  name: string;
  cn: string;
  /** 携带数量 */
  count: number;
  /** 使用间隔冷却 */
  cooldown: number;
  hint: string;
}

export const GADGETS: Record<string, GadgetDef> = {
  portal: { id: 'portal', name: 'PORTAL', cn: '传送门', count: 2, cooldown: 1.2, hint: '入口在脚下，出口在准星落点' },
  cloakbomb: { id: 'cloakbomb', name: 'CLOAK BOMB', cn: '匿踪炸弹', count: 2, cooldown: 1.0, hint: '抛掷后生成匿踪力场' },
  jumppad: { id: 'jumppad', name: 'JUMP PAD', cn: '跳板', count: 3, cooldown: 0.8, hint: '踩上去获得真实向上冲量' },
  zipline: { id: 'zipline', name: 'ZIPLINE', cn: '滑索', count: 2, cooldown: 1.0, hint: '部署后靠近按 F 乘坐' },
  explosivemine: { id: 'explosivemine', name: 'EXPLOSIVE MINE', cn: '爆炸地雷', count: 2, cooldown: 1.0, hint: '敌人靠近触发爆炸' },
  flamemine: { id: 'flamemine', name: 'FLAME MINE', cn: '火焰地雷', count: 2, cooldown: 1.0, hint: '触发后生成火焰区域' },
  domeshield: { id: 'domeshield', name: 'DOME SHIELD', cn: '球形护盾', count: 2, cooldown: 1.5, hint: '部署球形护盾阻挡子弹' },
};

/**
 * 道具基类。
 * 玩家按 F（或装备预览时右键）与 AI 走同一个 use() 入口。
 */
export abstract class Gadget {
  def: GadgetDef;
  owner: Character;
  count: number;
  cdLeft = 0;

  constructor(def: GadgetDef, owner: Character) {
    this.def = def;
    this.owner = owner;
    this.count = def.count;
  }

  get game(): Game { return this.owner.game; }

  canUse(c: Character): boolean {
    return this.count > 0 && this.cdLeft <= 0 && c.alive && c.stun <= 0;
  }

  update(dt: number, _c: Character): void {
    if (this.cdLeft > 0) this.cdLeft -= dt;
  }

  /** 返回 true 表示消耗一次数量 */
  abstract use(c: Character): boolean;

  reset(): void {
    this.count = this.def.count;
    this.cdLeft = 0;
  }
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = { dist: Infinity, nx: 0, ny: 0, nz: 0 };

/**
 * 计算部署点：从眼睛沿准星射线找落点，找不到就取最远距离并吸附到地面。
 * 部署道具统一使用该函数，保证不会卡进墙里。
 */
export function computePlacePoint(c: Character, maxDist: number, out: THREE.Vector3): boolean {
  c.eyePos;
  _o.set(c.pos.x, c.pos.y + c.eyeHeight, c.pos.z);
  c.aimDir(_d);
  c.game.raycast(_o, _d, maxDist, _hit);
  if (_hit.dist < maxDist) {
    out.set(
      _o.x + _d.x * _hit.dist + _hit.nx * 0.15,
      _o.y + _d.y * _hit.dist + _hit.ny * 0.15,
      _o.z + _d.z * _hit.dist + _hit.nz * 0.15,
    );
  } else {
    out.set(_o.x + _d.x * maxDist, _o.y + _d.y * maxDist, _o.z + _d.z * maxDist);
  }
  // 吸附地面，避免悬空或埋进地里
  const g = c.game.physics.groundAt(out.x, out.z, out.y + 3);
  if (g > -Infinity && out.y < g + 0.05) out.y = g;
  out.y = Math.max(out.y, 0.05);
  return c.game.physics.freeAt(out.x, out.y + 0.02, out.z, 0.4, 1.6);
}
