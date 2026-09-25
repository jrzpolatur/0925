/**
 * 武器数据表。
 * 新增武器：在这里加一条定义 + WeaponModels 里加一个体素模型即可，
 * 其余系统（射击/换弹/后坐/扩散/HUD/AI）全部数据驱动。
 */

export interface RecoilDef {
  /** 每发垂直上跳（弧度） */
  vertical: number;
  /** 水平扰动基准（弧度） */
  horizontal: number;
  /** 固定后坐序列（可选）：按发数循环的水平偏移，形成「可压枪」的枪感 */
  pattern?: number[];
  /** 回复速度（越大越快回正） */
  recovery: number;
  /** 相机抖动强度 */
  shake: number;
}

export interface SpreadDef {
  /** 腰射基础扩散（弧度，半角） */
  hip: number;
  /** 开镜基础扩散 */
  ads: number;
  /** 移动附加（乘以速度比例） */
  move: number;
  /** 腾空附加 */
  air: number;
  /** 每发累积 */
  perShot: number;
  /** 扩散上限 */
  max: number;
  /** 每秒回复 */
  decay: number;
}

export interface ProjectileDef {
  speed: number;
  gravity: number;
  radius: number;
  explode: {
    radius: number;
    damage: number;
    /** 对角色的推力 */
    impulse: number;
    /** 对环境的破坏力 */
    structure: number;
  };
}

export interface WeaponDef {
  id: string;
  name: string;
  /** 是否全自动 */
  auto: boolean;
  /** 射速（发/分钟） */
  rpm: number;
  damage: number;
  /** 每发弹丸数（霰弹） */
  pellets: number;
  headMult: number;
  mag: number;
  reserve: number;
  reloadTime: number;
  adsTime: number;
  /** 有效射程（超过后伤害衰减） */
  range: number;
  falloffMin: number;
  /** 弹道（火箭类） */
  projectile?: ProjectileDef;
  /** 电击枪：命中眩晕时长 */
  stun?: number;
  /** 移动速度倍率 */
  moveMult: number;
  recoil: RecoilDef;
  spread: SpreadDef;
  /** 枪口焰颜色 */
  muzzle: number;
  /** 曳光弹颜色 */
  tracer: number;
  /** 是否抛壳 */
  shell: boolean;
  /** 枪声类型 */
  sound: string;
  /** 模型 key */
  model: string;
  /** 跨角度（第三人称/世界模型）缩放 */
  scale: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  // ---------------- LIGHT: XP-54 冲锋枪 ----------------
  xp54: {
    id: 'xp54', name: 'XP-54', auto: true, rpm: 950,
    damage: 15, pellets: 1, headMult: 1.7,
    mag: 28, reserve: 168, reloadTime: 1.75, adsTime: 0.16,
    range: 46, falloffMin: 0.55,
    moveMult: 1.0,
    // 高频、小幅度、轻微水平扰动
    recoil: { vertical: 0.0092, horizontal: 0.0034, recovery: 11, shake: 0.35 },
    spread: { hip: 0.020, ads: 0.0045, move: 0.020, air: 0.030, perShot: 0.0035, max: 0.075, decay: 0.085 },
    muzzle: 0xffd08a, tracer: 0xffe0a0, shell: true, sound: 'smg', model: 'xp54', scale: 1,
  },

  // ---------------- MEDIUM: AKM 突击步枪 ----------------
  akm: {
    id: 'akm', name: 'AKM', auto: true, rpm: 620,
    damage: 24, pellets: 1, headMult: 1.8,
    mag: 30, reserve: 180, reloadTime: 2.25, adsTime: 0.22,
    range: 68, falloffMin: 0.6,
    moveMult: 0.95,
    // 明显垂直上跳 + 固定水平偏移序列（先右后左）
    recoil: {
      vertical: 0.0195, horizontal: 0.0055,
      pattern: [0.0018, 0.0032, 0.0024, -0.0012, -0.0030, -0.0026, 0.0009, 0.0022],
      recovery: 8.5, shake: 0.6,
    },
    spread: { hip: 0.026, ads: 0.0055, move: 0.024, air: 0.036, perShot: 0.0052, max: 0.09, decay: 0.075 },
    muzzle: 0xffc060, tracer: 0xffd070, shell: true, sound: 'rifle', model: 'akm', scale: 1,
  },

  // ---------------- HEAVY: SA1216 半自动霰弹枪 ----------------
  sa1216: {
    id: 'sa1216', name: 'SA1216', auto: false, rpm: 100,
    damage: 13, pellets: 9, headMult: 1.35,
    mag: 6, reserve: 48, reloadTime: 3.0, adsTime: 0.26,
    range: 26, falloffMin: 0.32,
    moveMult: 0.92,
    // 强烈后坐 + 射击间隔长
    recoil: { vertical: 0.042, horizontal: 0.012, recovery: 6.5, shake: 1.15 },
    spread: { hip: 0.052, ads: 0.030, move: 0.016, air: 0.030, perShot: 0.010, max: 0.12, decay: 0.10 },
    muzzle: 0xffb040, tracer: 0xffc880, shell: true, sound: 'shotgun', model: 'sa1216', scale: 1,
  },

  // ---------------- HEAVY: RPG-7 火箭筒 ----------------
  rpg7: {
    id: 'rpg7', name: 'RPG-7', auto: false, rpm: 48,
    damage: 40, pellets: 1, headMult: 1.0,
    mag: 1, reserve: 5, reloadTime: 2.9, adsTime: 0.3,
    range: 200, falloffMin: 1.0,
    moveMult: 0.85,
    projectile: {
      speed: 52, gravity: 5.5, radius: 0.22,
      explode: { radius: 6.0, damage: 120, impulse: 17, structure: 210 },
    },
    recoil: { vertical: 0.055, horizontal: 0.006, recovery: 5.0, shake: 1.5 },
    spread: { hip: 0.014, ads: 0.006, move: 0.010, air: 0.020, perShot: 0.0, max: 0.03, decay: 0.2 },
    muzzle: 0xffa030, tracer: 0xff8020, shell: false, sound: 'rpg', model: 'rpg7', scale: 1,
  },

  // ---------------- LIGHT: 电击枪 ----------------
  stungun: {
    id: 'stungun', name: 'STUN GUN', auto: false, rpm: 70,
    damage: 22, pellets: 1, headMult: 1.0,
    mag: 4, reserve: 12, reloadTime: 2.4, adsTime: 0.18,
    range: 15, falloffMin: 0.8,
    moveMult: 1.02,
    stun: 1.7,
    recoil: { vertical: 0.014, horizontal: 0.004, recovery: 9, shake: 0.45 },
    spread: { hip: 0.010, ads: 0.004, move: 0.012, air: 0.018, perShot: 0.004, max: 0.04, decay: 0.12 },
    muzzle: 0x9fd8ff, tracer: 0x8fd0ff, shell: false, sound: 'electric', model: 'stungun', scale: 1,
  },
};

export function getWeaponDef(id: string): WeaponDef {
  const d = WEAPONS[id];
  if (!d) throw new Error(`未知武器: ${id}`);
  return d;
}
