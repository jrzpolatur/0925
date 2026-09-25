import * as THREE from 'three';
import { GADGETS, Gadget, computePlacePoint } from './Gadget';
import type { Character } from '../characters/Character';

/** 匿踪炸弹：抛掷（真实投掷物），落地生成匿踪力场 */
export class CloakBombGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.cloakbomb, owner); }

  use(c: Character): boolean {
    c.game.projectiles.spawnCloakBomb(c);
    c.game.audio?.play('throw', c.pos, 0.7);
    if (c.isPlayer) c.game.hud?.toast('匿踪炸弹已投掷');
    return true;
  }
}

/** 球形护盾：阻挡子弹的球形力场 */
export class DomeShieldGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.domeshield, owner); }

  use(c: Character): boolean {
    const p = new THREE.Vector3();
    const ok = computePlacePoint(c, 10, p);
    if (!ok) {
      if (c.isPlayer) c.game.hud?.toast('此处无法部署');
      return false;
    }
    const y = Math.max(p.y, c.game.physics.groundAt(p.x, p.z, p.y + 3));
    c.game.gadgetSystem.createDomeShield(c, p.x, y + 1.4, p.z, 3.3, 900, 15);
    c.game.audio?.play('shield', c.pos, 0.8);
    if (c.isPlayer) c.game.hud?.toast('球形护盾已部署');
    return true;
  }
}
