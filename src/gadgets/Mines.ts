import { GADGETS, Gadget } from './Gadget';
import type { Character } from '../characters/Character';

/** 爆炸地雷：敌人靠近触发真实爆炸（含对环境的破坏力） */
export class ExplosiveMineGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.explosivemine, owner); }

  use(c: Character): boolean {
    let y = c.game.physics.groundAt(c.pos.x, c.pos.z, c.pos.y + 2);
    if (y === -Infinity) y = c.pos.y;
    c.game.gadgetSystem.createMine(c, 'explosive', c.pos.x, y, c.pos.z);
    c.game.audio?.play('deploy', c.pos, 0.6);
    if (c.isPlayer) c.game.hud?.toast('爆炸地雷已布置');
    return true;
  }
}

/** 火焰地雷：触发后生成持续伤害的火焰区域 */
export class FlameMineGadget extends Gadget {
  constructor(owner: Character) { super(GADGETS.flamemine, owner); }

  use(c: Character): boolean {
    let y = c.game.physics.groundAt(c.pos.x, c.pos.z, c.pos.y + 2);
    if (y === -Infinity) y = c.pos.y;
    c.game.gadgetSystem.createMine(c, 'flame', c.pos.x, y, c.pos.z);
    c.game.audio?.play('deploy', c.pos, 0.6);
    if (c.isPlayer) c.game.hud?.toast('火焰地雷已布置');
    return true;
  }
}
