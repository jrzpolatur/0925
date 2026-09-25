import * as THREE from 'three';
import type { Character } from '../characters/Character';

/** 队伍：0 = 蓝队（玩家方），1 = 红队 */
export type TeamId = 0 | 1;

/** 三种体型 */
export type BuildId = 'light' | 'medium' | 'heavy';

/** 射线命中结果（复用对象，需要长期保存请自行 clone） */
export interface RayHit {
  dist: number;
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  /** 命中类型 */
  kind: 'none' | 'world' | 'voxel' | 'character' | 'shield';
  /** 命中目标（Character / Shield / null） */
  target: any;
  /** 是否爆头 */
  head: boolean;
}

export function makeRayHit(): RayHit {
  return {
    dist: Infinity, px: 0, py: 0, pz: 0,
    nx: 0, ny: 1, nz: 0,
    kind: 'none', target: null, head: false,
  };
}

export function resetRayHit(h: RayHit): RayHit {
  h.dist = Infinity;
  h.kind = 'none';
  h.target = null;
  h.head = false;
  return h;
}

/**
 * 统一输入意图（Intent）。
 * 玩家由 PlayerController 从键鼠填充，AI 由 AIController 从决策系统填充，
 * 之后两者走完全相同的 Character.update() 逻辑，保证 AI 与玩家共用一套战斗系统。
 */
export interface Intent {
  /** 本地移动输入 x（右为正） */
  moveX: number;
  /** 本地移动输入 z（前为正） */
  moveZ: number;
  /** 绝对朝向 yaw（弧度） */
  yaw: number;
  /** 绝对俯仰 pitch（弧度） */
  pitch: number;
  jump: boolean;
  sprint: boolean;
  /** 持续开火（全自动武器 / AI 持续射击） */
  fire: boolean;
  /** 单帧开火沿（半自动武器 / 点射） */
  firePressed: boolean;
  ads: boolean;
  reload: boolean;
  ability: boolean;
  gadget: boolean;
  interact: boolean;
}

export function makeIntent(): Intent {
  return {
    moveX: 0, moveZ: 0, yaw: 0, pitch: 0,
    jump: false, sprint: false, fire: false, firePressed: false, ads: false,
    reload: false, ability: false, gadget: false, interact: false,
  };
}

/** 伤害来源信息 */
export interface DamageInfo {
  amount: number;
  attacker: Character | null;
  /** 命中点（世界坐标） */
  px: number; py: number; pz: number;
  /** 伤害方向（从攻击者指向目标，单位向量） */
  dx: number; dy: number; dz: number;
  head: boolean;
  cause: 'bullet' | 'explosion' | 'melee' | 'electric' | 'fire' | 'fall';
}
