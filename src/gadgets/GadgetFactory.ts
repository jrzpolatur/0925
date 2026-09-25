import type { Character } from '../characters/Character';
import { GADGETS, Gadget } from './Gadget';
import { JumpPadGadget, PortalGadget, ZiplineGadget } from './Mobility';
import { ExplosiveMineGadget, FlameMineGadget } from './Mines';
import { CloakBombGadget, DomeShieldGadget } from './Deployables';

/** 道具注册表：新增道具只需在这里注册 */
const REGISTRY: Record<string, (c: Character) => Gadget> = {
  portal: (c) => new PortalGadget(c),
  jumppad: (c) => new JumpPadGadget(c),
  zipline: (c) => new ZiplineGadget(c),
  explosivemine: (c) => new ExplosiveMineGadget(c),
  flamemine: (c) => new FlameMineGadget(c),
  cloakbomb: (c) => new CloakBombGadget(c),
  domeshield: (c) => new DomeShieldGadget(c),
};

export function createGadget(id: string, owner: Character): Gadget | null {
  if (!GADGETS[id]) return null;
  const f = REGISTRY[id];
  return f ? f(owner) : null;
}
