import * as THREE from 'three';
import { GADGETS, Gadget, computePlacePoint } from './Gadget';
import type { Character } from '../characters/Character';

/** 传送门：入口在脚下，出口在准星落点，双向可穿 */
export class PortalGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.portal, owner); }

  use(c: Character): boolean {
    const p = new THREE.Vector3();
    const ok = computePlacePoint(c, 22, p);
    if (!ok) {
      if (c.isPlayer) c.game.hud?.toast('此处无法部署');
      return false;
    }
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    let ax = c.pos.x + fx * 1.0;
    let az = c.pos.z + fz * 1.0;
    let ay = c.game.physics.groundAt(ax, az, c.pos.y + 2);
    if (ay === -Infinity) ay = c.pos.y;
    c.game.gadgetSystem.createPortal(c, ax, ay + 1.0, az, p.x, p.y + 1.0, p.z);
    c.game.audio?.play('portal', c.pos, 0.9);
    if (c.isPlayer) c.game.hud?.toast('传送门已部署');
    return true;
  }
}

/** 跳板：踩上去获得真实向上冲量 */
export class JumpPadGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.jumppad, owner); }

  use(c: Character): boolean {
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const x = c.pos.x + fx * 1.3;
    const z = c.pos.z + fz * 1.3;
    let y = c.game.physics.groundAt(x, z, c.pos.y + 2.5);
    if (y === -Infinity) y = c.pos.y;
    if (!c.game.physics.freeAt(x, y + 0.05, z, 0.65, 1.2)) {
      if (c.isPlayer) c.game.hud?.toast('此处无法部署');
      return false;
    }
    c.game.gadgetSystem.createJumpPad(c, x, y, z);
    c.game.audio?.play('deploy', c.pos, 0.7);
    if (c.isPlayer) c.game.hud?.toast('跳板已部署');
    return true;
  }
}

/** 滑索：部署后靠近按 F 乘坐（真实沿线段移动） */
export class ZiplineGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.zipline, owner); }

  use(c: Character): boolean {
    const p = new THREE.Vector3();
    computePlacePoint(c, 26, p);
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const ax = c.pos.x + fx * 0.8;
    const az = c.pos.z + fz * 0.8;
    const ay = c.pos.y + 2.5;
    let by = Math.max(p.y + 1.6, ay - 6);
    const dist = Math.hypot(p.x - ax, p.z - az);
    if (dist < 4) {
      // 目标太近就朝正前方延长
      p.x = ax + fx * 16;
      p.z = az + fz * 16;
      by = ay;
    }
    by = Math.max(by, 1.2);
    c.game.gadgetSystem.createZipline(c, ax, ay, az, p.x, by, p.z);
    c.game.audio?.play('deploy', c.pos, 0.7);
    if (c.isPlayer) c.game.hud?.toast('滑索已部署 · 靠近按 F 乘坐');
    return true;
  }
}
