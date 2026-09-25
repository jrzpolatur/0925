import type { Character } from '../characters/Character';
import { Ability } from './Ability';
import { DashAbility } from './Dash';
import { ShockwaveAbility } from './Shockwave';
import { MeshShieldAbility } from './MeshShield';

/** 技能注册表：新增技能只需在这里注册 */
const REGISTRY: Record<string, (c: Character) => Ability> = {
  dash: (c) => new DashAbility(c),
  shockwave: (c) => new ShockwaveAbility(c),
  meshshield: (c) => new MeshShieldAbility(c),
};

export function createAbility(id: string, owner: Character): Ability {
  const f = REGISTRY[id];
  if (!f) throw new Error(`未知技能: ${id}`);
  return f(owner);
}
