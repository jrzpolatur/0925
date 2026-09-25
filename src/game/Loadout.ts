import type { BuildId } from '../core/Types';

/** 体型配置：HP / 速度 / 体积 / 武器 / 道具 / 技能 */
export interface BuildDef {
  id: BuildId;
  name: string;
  cn: string;
  desc: string;
  hp: number;
  /** 基础移动速度 m/s */
  speed: number;
  sprintMult: number;
  /** 碰撞体 */
  height: number;
  radius: number;
  /** 眼睛高度 */
  eye: number;
  weapons: string[];
  gadgets: string[];
  ability: string;
  color: number;
}

export const BUILDS: Record<BuildId, BuildDef> = {
  light: {
    id: 'light',
    name: 'LIGHT',
    cn: '轻型',
    desc: '最高机动 · 三段闪避冲刺 · 血量最低',
    hp: 150,
    speed: 7.4,
    sprintMult: 1.3,
    height: 1.70,
    radius: 0.34,
    eye: 1.56,
    weapons: ['xp54', 'stungun'],
    gadgets: ['portal', 'cloakbomb'],
    ability: 'dash',
    color: 0x7ce6b0,
  },
  medium: {
    id: 'medium',
    name: 'MEDIUM',
    cn: '中型',
    desc: '综合型 · 震荡波真实物理推力 · 机动道具齐全',
    hp: 250,
    speed: 6.3,
    sprintMult: 1.25,
    height: 1.85,
    radius: 0.40,
    eye: 1.66,
    weapons: ['akm', 'sa1216'],
    gadgets: ['jumppad', 'zipline', 'explosivemine'],
    ability: 'shockwave',
    color: 0x7fb2ff,
  },
  heavy: {
    id: 'heavy',
    name: 'HEAVY',
    cn: '重型',
    desc: '最高血量 · 网格护盾可切第三人称 · RPG 与火焰地雷',
    hp: 350,
    speed: 5.2,
    sprintMult: 1.2,
    height: 2.05,
    radius: 0.48,
    eye: 1.82,
    weapons: ['sa1216', 'rpg7'],
    gadgets: ['flamemine', 'domeshield'],
    ability: 'meshshield',
    color: 0xffa04d,
  },
};

export const BUILD_ORDER: BuildId[] = ['light', 'medium', 'heavy'];
