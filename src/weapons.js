import * as THREE from 'three';
import { OPTICS, buildOptic, opticLensLocal } from './optics.js';
import { Rockets } from './gadgets.js';
import { BLOCK_COLORS } from './textures.js';

/** 射线 vs AABB：返回进入距离，未命中返回 null */
export function rayBox(origin, dir, box) {
  let tmin = -Infinity, tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const inv = 1 / (dir[axis] || 1e-9);
    let t1 = (box.min[axis] - origin[axis]) * inv;
    let t2 = (box.max[axis] - origin[axis]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin < 0 ? 0 : tmin;
}

// ---------------------------------------------------------------- 武器数据
export const WEAPONS = [
  {
    id: 'pistol', name: 'PISTOL', cn: '手枪 · M9',
    damage: 28, headMul: 2.2, rpm: 400, auto: false,
    mag: 12, magSize: 12, reserve: Infinity, reserveMax: Infinity,
    spread: 0.0075, reloadTime: 1.05, pellets: 1, range: 140,
    recoil: 0.030, kick: 0.055, sfx: 'pistol', speedMul: 1.06,
    rail: new THREE.Vector3(0, 0.052, -0.10),
    ironLens: new THREE.Vector3(0, 0.072, -0.02),   // 后照门（眼睛在其后方）
    ironRelief: 0.44,
    optics: ['iron', 'micro'],
    optic: 'iron',
  },
  {
    id: 'smg', name: 'SMG', cn: '冲锋枪 · MP5',
    damage: 19, headMul: 1.9, rpm: 900, auto: true,
    mag: 30, magSize: 30, reserve: 300, reserveMax: 300,
    spread: 0.022, reloadTime: 1.6, pellets: 1, range: 110,
    recoil: 0.013, kick: 0.038, sfx: 'rifle', speedMul: 1.0,
    rail: new THREE.Vector3(0, 0.078, -0.06),
    ironLens: new THREE.Vector3(0, 0.084, -0.14),
    optics: ['iron', 'micro', 'reflex', 'holo'],
    optic: 'micro',
  },
  {
    id: 'rifle', name: 'AK-47', cn: '突击步枪 · AK-47',
    damage: 25, headMul: 2.0, rpm: 700, auto: true,
    mag: 30, magSize: 30, reserve: 240, reserveMax: 240,
    spread: 0.016, reloadTime: 1.85, pellets: 1, range: 180,
    recoil: 0.017, kick: 0.042, sfx: 'rifle', speedMul: 0.95,
    rail: new THREE.Vector3(0, 0.098, -0.06),
    ironLens: new THREE.Vector3(0, 0.105, -0.30),   // AK 表尺（枪管后端）
    ironRelief: 0.50,
    optics: ['iron', 'micro', 'reflex', 'holo', 'scope'],
    optic: 'reflex',
  },
  {
    id: 'm14', name: 'M14', cn: '精确射手步枪 · M14',
    damage: 55, headMul: 2.8, rpm: 300, auto: false,
    mag: 20, magSize: 20, reserve: 120, reserveMax: 120,
    spread: 0.006, reloadTime: 2.2, pellets: 1, range: 260,
    recoil: 0.046, kick: 0.078, sfx: 'sniper', speedMul: 0.92,
    rail: new THREE.Vector3(0, 0.092, -0.04),
    ironLens: new THREE.Vector3(0, 0.098, -0.16),   // 觇孔式照门
    ironRelief: 0.36,
    optics: ['iron', 'micro', 'reflex', 'holo', 'scope'],
    optic: 'reflex',
  },
  {
    id: 'shotgun', name: 'SHOTGUN', cn: '霰弹枪 · 双管',
    damage: 15, headMul: 1.6, rpm: 90, auto: false,
    mag: 6, magSize: 6, reserve: 54, reserveMax: 54,
    spread: 0.075, reloadTime: 2.3, pellets: 9, range: 60,
    recoil: 0.062, kick: 0.13, sfx: 'shotgun', speedMul: 0.93,
    rail: new THREE.Vector3(0, 0.078, -0.16),
    ironLens: new THREE.Vector3(0, 0.088, -0.26),
    ironRelief: 0.44,
    optics: ['iron', 'micro', 'reflex'],
    optic: 'iron',
  },
  {
    id: 'sniper', name: 'SNIPER', cn: '狙击枪 · AWM',
    damage: 115, headMul: 2.6, rpm: 48, auto: false,
    mag: 5, magSize: 5, reserve: 45, reserveMax: 45,
    spread: 0.0012, reloadTime: 2.6, pellets: 1, range: 320,
    recoil: 0.075, kick: 0.16, sfx: 'sniper', speedMul: 0.88,
    rail: new THREE.Vector3(0, 0.082, -0.02),
    ironLens: new THREE.Vector3(0, 0.10, -0.16),
    optics: ['iron', 'reflex', 'holo', 'scope'],
    optic: 'scope',
  },
  {
    id: 'rpg', name: 'RPG-7', cn: '火箭筒 · RPG-7',
    damage: 0, headMul: 1, rpm: 55, auto: false,
    mag: 1, magSize: 1, reserve: 2, reserveMax: 2,
    spread: 0.005, reloadTime: 3.0, pellets: 1, range: 200,
    recoil: 0.085, kick: 0.24, sfx: 'rpg', speedMul: 0.80,
    rail: new THREE.Vector3(0, 0.10, -0.05),
    ironLens: new THREE.Vector3(0, 0.12, -0.60),
    optics: ['iron', 'micro'],
    optic: 'iron',
    rocket: { speed: 62, radius: 8.5, damage: 270, self: 0.35 },
    regen: 0.085,        // 每秒缓慢补充备弹，避免打空后武器彻底失效
  },
  {
    id: 'sledge', name: 'SLEDGE', cn: '大锤 · 破障锤',
    damage: 120, headMul: 1.4, rpm: 62, auto: false,
    mag: 1, magSize: 1, reserve: Infinity, reserveMax: Infinity,
    spread: 0, reloadTime: 0, pellets: 1, range: 3.6,
    recoil: 0.03, kick: 0.34, sfx: 'melee', speedMul: 0.96,
    rail: new THREE.Vector3(0, 0.30, -0.10),
    ironLens: new THREE.Vector3(0, 0.30, -0.10),
    optics: ['iron'], optic: 'iron',
    noAmmo: true, noAim: true,
    melee: { range: 3.6, arc: Math.PI * 0.55, dashDamage: 170, dashCd: 5.0 },
  },
  {
    id: 'flame', name: 'FLAMER', cn: '喷火器 · 烈焰',
    damage: 0, headMul: 1, rpm: 600, auto: true,
    mag: 100, magSize: 100, reserve: 220, reserveMax: 220,
    spread: 0.04, reloadTime: 2.8, pellets: 1, range: 11,
    recoil: 0.004, kick: 0.02, sfx: 'flame', speedMul: 0.90,
    rail: new THREE.Vector3(0, 0.085, -0.05),
    ironLens: new THREE.Vector3(0, 0.095, -0.32),
    optics: ['iron', 'micro'], optic: 'iron',
    continuous: true,
    flame: { range: 10.5, angle: 0.30, drain: 30, burnTime: 3.2, burnDps: 24 },
  },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

// 腰射时枪械相对相机的位置
const HIP = {
  pistol: [0.22, -0.20, -0.34],
  smg: [0.24, -0.22, -0.40],
  rifle: [0.24, -0.22, -0.42],
  m14: [0.24, -0.22, -0.46],
  shotgun: [0.24, -0.22, -0.44],
  sniper: [0.24, -0.22, -0.46],
  rpg: [0.15, -0.30, -0.62],
  sledge: [0.26, -0.36, -0.46],
  flame: [0.22, -0.24, -0.40],
};

// 枪口焰/弹道起点相对模型原点的位置（与模型末端对齐）
const MUZZLE_LEN = {
  pistol: 0.35, smg: 0.50, rifle: 0.64, m14: 0.70, shotgun: 0.68,
  sniper: 0.92, rpg: 1.12, sledge: 0.95, flame: 0.64,
};
const MUZZLE_Y = {
  pistol: 0.006, smg: 0.014, rifle: 0.020, m14: 0.012, shotgun: 0.046,
  sniper: 0.018, rpg: 0.0, sledge: 0.010, flame: 0.0,
};

// ---------------------------------------------------------------- 装备
export const EQUIPMENT = [
  {
    id: 'frag', name: '破片手雷', short: 'FRAG', count: 3, desc: '均衡 · 3 枚',
    radius: 7.5, damage: 130, color: 0x2f4a30, size: 0.26, smoke: false,
  },
  {
    id: 'he', name: '高爆手雷', short: 'HE', count: 2, desc: '大范围高伤 · 2 枚',
    radius: 10.5, damage: 220, color: 0x6a2c2c, size: 0.32, smoke: false,
  },
  {
    id: 'smoke', name: '烟雾弹', short: 'SMOKE', count: 3, desc: '遮蔽视线 · 3 枚',
    radius: 6.0, damage: 0, color: 0x5a6470, size: 0.28, smoke: true,
  },
];
export const EQUIP_BY_ID = Object.fromEntries(EQUIPMENT.map(e => [e.id, e]));

export const GADGETS = [
  {
    id: 'dome', name: '球形护盾', short: 'DOME', count: 1,
    desc: '半径 4.5 · 16 秒 · 挡子弹',
    radius: 4.5, life: 16, hp: 280,
  },
  {
    id: 'stim', name: '肾上腺素', short: 'STIM', count: 2,
    desc: '+60 HP · 5 秒提速 30%',
    heal: 60, boost: 1.3, boostTime: 5,
  },
];
export const GADGET_BY_ID = Object.fromEntries(GADGETS.map(g => [g.id, g]));

export const ARMORS = [
  { id: 'none', name: '无护甲', desc: '移动 +6%', armor: 0, speedMul: 1.06 },
  { id: 'light', name: '轻甲', desc: '+40 护甲', armor: 40, speedMul: 1.0 },
  { id: 'heavy', name: '重甲', desc: '+90 护甲 · 移动 -8%', armor: 90, speedMul: 0.92 },
];
export const ARMOR_BY_ID = Object.fromEntries(ARMORS.map(a => [a.id, a]));

// ---------------------------------------------------------------- 枪械模型
// 全部由方块拼成的像素/体素风格模型；同色材质复用，降低开销
const MAT_CACHE = new Map();
function mat(color) {
  let m = MAT_CACHE.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); MAT_CACHE.set(color, m); }
  return m;
}

// 色板
const STL = 0x3a4046;    // 钢（机匣）
const STL_D = 0x22262b;  // 深钢（枪管 / 小件）
const STL_L = 0x59616a;  // 亮钢（倒角 / 高光）
const BLK = 0x191d21;    // 黑（瞄具 / 内孔）
const POLY = 0x2c3138;   // 聚合物（护木 / 底把）
const GRIP = 0x3b342d;   // 握把
const WOOD = 0x6b4a2a;   // 木质
const WOOD_D = 0x4e3620;
const WOOD_L = 0x825c34;
const BRASS = 0xb08d4a;  // 铜（弹壳 / 准星珠）
const COPPER = 0xa9663a;
const OLIVE = 0x44543a;  // 军绿（发射器）
const OLIVE_D = 0x2f3a26;
const RED = 0x8a3a2a;
const DOT = 0xdcd8c8;    // 夜视白点

function mkBox(w, h, d, color, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
/** 带旋转的方块 */
function mkBoxR(w, h, d, color, x, y, z, parent, rx = 0, ry = 0, rz = 0) {
  const m = mkBox(w, h, d, color, x, y, z, parent);
  m.rotation.set(rx, ry, rz);
  return m;
}
/** 沿 z 重复的小方块（散热槽 / 防滑纹 / 指槽） */
function ribs(parent, z0, z1, n, y, w, h, color, x = 0) {
  const step = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    mkBox(w, h, Math.abs(step) * 0.45, color, x, y, z0 + step * (i + 0.5), parent);
  }
}

/** 前准星：细柱，尖端正好落在瞄准线上，绝不越过视线中心 */
function frontPost(g, z, baseY, lineY, w = 0.008) {
  const grp = new THREE.Group();
  grp.position.set(0, baseY, z);
  const H = Math.max(0.012, lineY - baseY);
  mkBox(w * 2.8, 0.007, w * 2.8, STL_D, 0, 0.0035, 0, grp);   // 底座
  mkBox(w, H, w, BLK, 0, H / 2, 0, grp);                      // 准星柱（顶端 = 瞄准线）
  mkBox(w * 0.6, 0.004, 0.002, DOT, 0, H - 0.006, w * 0.7, grp);
  g.add(grp);
  return grp;
}

/** 后照门：宽缺口；整体以底部为轴，举枪时折下，保证瞄准线通透 */
function rearNotch(g, z, baseY, lineY, gap = 0.030, depth = 0.014) {
  const grp = new THREE.Group();
  grp.position.set(0, baseY, z);
  grp.userData.baseY = baseY;
  const H = Math.max(0.016, lineY - baseY);
  const wall = H + 0.010;
  mkBox(gap + 0.026, 0.008, depth + 0.006, STL_D, 0, 0.004, 0, grp);   // 底座
  mkBox(gap + 0.014, 0.007, depth, STL_D, 0, 0.011, 0, grp);           // 缺口底
  mkBox(0.007, wall, depth, BLK, -(gap / 2 + 0.0035), 0.008 + wall / 2, 0, grp);
  mkBox(0.007, wall, depth, BLK, gap / 2 + 0.0035, 0.008 + wall / 2, 0, grp);
  for (const s of [-1, 1]) {                                            // 两侧夜视白点
    mkBox(0.005, 0.005, 0.002, DOT, s * (gap / 2 + 0.0035), 0.008 + wall - 0.005, depth / 2 + 0.001, grp);
  }
  g.add(grp);
  return grp;
}

/** AK 准星座：粗柱 + 细柱 + 护耳（护耳顶部低于瞄准线，不挡视野） */
function akFrontTower(g, z, baseY, lineY) {
  const grp = new THREE.Group();
  grp.position.set(0, baseY, z);
  const H = lineY - baseY;
  const colH = Math.max(0.014, H - 0.020);
  mkBox(0.054, 0.016, 0.056, STL, 0, 0.008, 0, grp);              // 底座
  mkBox(0.018, colH, 0.018, STL, 0, 0.016 + colH / 2, 0, grp);    // 粗柱
  mkBox(0.008, 0.021, 0.008, BLK, 0, H - 0.010, 0, grp);          // 细准星柱（顶端 = 瞄准线）
  const earH = Math.min(0.030, H * 0.62);
  mkBox(0.006, earH, 0.052, STL_D, -0.021, 0.016 + earH / 2, 0, grp);
  mkBox(0.006, earH, 0.052, STL_D, 0.021, 0.016 + earH / 2, 0, grp);
  mkBox(0.006, 0.004, 0.003, DOT, 0, H - 0.006, 0.006, grp);
  g.add(grp);
  return grp;
}

/** 导轨（含底座与齿） */
function addRail(g, z, y, len) {
  mkBox(0.030, 0.006, len, STL_D, 0, y, z, g);
  mkBox(0.030, 0.010, len, BLK, 0, y + 0.008, z, g);
  const n = Math.max(4, Math.round(len / 0.016));
  for (let i = 0; i < n; i++) {
    mkBox(0.034, 0.006, 0.006, STL_L, 0, y + 0.014, z - len / 2 + (i + 0.5) * (len / n), g);
  }
}

// ------------------------------------------------------------------ 手枪 M9
function buildPistol() {
  const g = new THREE.Group();
  // 套筒
  mkBox(0.062, 0.092, 0.30, STL, 0, 0.006, -0.05, g);
  mkBox(0.050, 0.014, 0.28, STL_L, 0, 0.045, -0.05, g);        // 顶部倒角
  mkBox(0.064, 0.028, 0.006, STL_D, 0, 0.016, -0.196, g);      // 套筒前端
  mkBox(0.004, 0.030, 0.086, BLK, 0.031, 0.024, -0.075, g);    // 抛壳口
  ribs(g, 0.012, 0.090, 6, 0.049, 0.064, 0.006, STL_D);        // 后部防滑纹
  // 枪管 / 枪口
  mkBox(0.028, 0.028, 0.10, STL_D, 0, 0.006, -0.30, g);
  mkBox(0.036, 0.036, 0.022, STL, 0, 0.006, -0.336, g);
  mkBox(0.020, 0.020, 0.006, BLK, 0, 0.006, -0.349, g);
  // 底把
  mkBox(0.050, 0.048, 0.28, POLY, 0, -0.048, -0.04, g);
  mkBox(0.054, 0.040, 0.10, POLY, 0, -0.042, -0.16, g);        // 防尘盖
  mkBox(0.058, 0.018, 0.028, STL_D, 0, -0.030, -0.204, g);     // 前挂点
  // 扳机护圈
  for (const s of [-1, 1]) {
    mkBox(0.010, 0.030, 0.010, POLY, s * 0.028, -0.078, -0.086, g);
    mkBox(0.010, 0.010, 0.062, POLY, s * 0.028, -0.096, -0.056, g);
  }
  mkBox(0.046, 0.010, 0.012, POLY, 0, -0.096, -0.024, g);
  mkBoxR(0.010, 0.026, 0.010, STL_D, 0, -0.062, -0.056, g, -0.25);   // 扳机
  // 击锤 / 海狸尾
  mkBoxR(0.016, 0.030, 0.016, STL_D, 0, 0.030, 0.112, g, -0.32);
  mkBox(0.048, 0.034, 0.030, POLY, 0, 0.004, 0.118, g);
  // 握把（后倾）
  const grip = new THREE.Group();
  grip.position.set(0, -0.076, 0.060);
  grip.rotation.x = -0.26;
  g.add(grip);
  mkBox(0.058, 0.150, 0.084, GRIP, 0, -0.075, 0, grip);
  mkBox(0.006, 0.110, 0.062, 0x2a241f, -0.030, -0.070, 0, grip);   // 侧板
  mkBox(0.006, 0.110, 0.062, 0x2a241f, 0.030, -0.070, 0, grip);
  for (let i = 0; i < 3; i++) mkBox(0.050, 0.008, 0.006, 0x241e19, 0, -0.042 - i * 0.030, -0.043, grip);
  mkBox(0.062, 0.016, 0.088, STL_D, 0, -0.152, 0.002, grip);        // 弹匣底板
  mkBox(0.048, 0.060, 0.060, STL_D, 0, -0.128, 0.052, g);           // 弹匣
  // 空仓挂机杆 / 弹匣释放钮
  mkBox(0.008, 0.014, 0.030, STL_L, 0.032, -0.012, -0.030, g);
  mkBox(0.008, 0.010, 0.010, STL_L, 0.032, -0.046, -0.060, g);
  // 机瞄
  frontPost(g, -0.196, 0.052, 0.072);
  g.userData.ironRear = rearNotch(g, -0.020, 0.052, 0.072, 0.026, 0.012);
  addRail(g, -0.10, 0.052, 0.09);
  return g;
}

// ------------------------------------------------------------------ 冲锋枪 MP5
function buildSmg() {
  const g = new THREE.Group();
  // 机匣
  mkBox(0.076, 0.098, 0.40, STL, 0, 0, -0.04, g);
  mkBox(0.060, 0.014, 0.38, STL_L, 0, 0.050, -0.04, g);         // 顶部平面
  mkBox(0.078, 0.026, 0.018, STL_D, 0, 0.004, -0.228, g);       // 机匣前环
  mkBox(0.004, 0.030, 0.090, BLK, 0.039, 0.024, -0.10, g);      // 抛壳口
  mkBox(0.066, 0.056, 0.10, STL_D, 0, -0.070, -0.03, g);        // 弹匣井
  // 护木 + 散热槽
  mkBox(0.070, 0.076, 0.21, POLY, 0, -0.006, -0.29, g);
  ribs(g, -0.20, -0.38, 7, 0.032, 0.072, 0.007, 0x1f2328);
  mkBox(0.072, 0.012, 0.020, STL_D, 0, -0.030, -0.390, g);      // 护木前环
  // 枪管 + 三叉消焰器
  mkBox(0.030, 0.030, 0.14, STL_D, 0, 0.014, -0.44, g);
  mkBox(0.044, 0.044, 0.026, STL, 0, 0.014, -0.478, g);
  mkBox(0.022, 0.022, 0.006, BLK, 0, 0.014, -0.490, g);
  // 前准星（带护圈）
  const fs = new THREE.Group();
  fs.position.set(0, 0.042, -0.430);
  g.add(fs);
  mkBox(0.050, 0.014, 0.044, STL, 0, 0.007, 0, fs);
  mkBox(0.008, 0.042, 0.008, BLK, 0, 0.021, 0, fs);
  mkBox(0.006, 0.026, 0.040, STL_D, -0.019, 0.018, 0, fs);
  mkBox(0.006, 0.026, 0.040, STL_D, 0.019, 0.018, 0, fs);
  // 弹匣（略弯）
  const mag = new THREE.Group();
  mag.position.set(0, -0.072, -0.03);
  g.add(mag);
  mkBox(0.048, 0.10, 0.072, STL_D, 0, -0.050, 0, mag);
  mkBoxR(0.046, 0.09, 0.068, STL_D, 0, -0.130, -0.016, mag, 0.30);
  mkBoxR(0.042, 0.07, 0.062, STL_D, 0, -0.196, -0.052, mag, 0.62);
  // 握把
  const grip = new THREE.Group();
  grip.position.set(0, -0.056, 0.11);
  grip.rotation.x = -0.18;
  g.add(grip);
  mkBox(0.064, 0.150, 0.086, GRIP, 0, -0.075, 0, grip);
  for (let i = 0; i < 4; i++) mkBox(0.066, 0.008, 0.006, 0x241e19, 0, -0.030 - i * 0.030, -0.044, grip);
  mkBox(0.070, 0.014, 0.090, STL_D, 0, -0.152, 0, grip);
  // 枪托（伸缩托）
  mkBox(0.030, 0.026, 0.16, STL_D, -0.026, -0.008, 0.24, g);
  mkBox(0.030, 0.026, 0.16, STL_D, 0.026, -0.008, 0.24, g);
  mkBox(0.072, 0.110, 0.048, POLY, 0, -0.010, 0.35, g);        // 托底板
  mkBox(0.060, 0.020, 0.030, POLY, 0, 0.048, 0.34, g);         // 贴腮板
  // 拉机柄 / 快慢机 / 背带环
  mkBox(0.024, 0.020, 0.050, STL_D, 0.048, 0.010, -0.13, g);
  mkBox(0.010, 0.040, 0.026, STL_L, 0.048, -0.014, 0.06, g);
  mkBox(0.012, 0.034, 0.012, STL_D, 0.044, -0.020, 0.19, g);
  // 机瞄（后部转鼓）
  mkBox(0.052, 0.026, 0.066, STL_D, 0, 0.064, -0.14, g);
  g.userData.ironRear = rearNotch(g, -0.14, 0.070, 0.084, 0.026, 0.024);
  // 顶部导轨
  mkBox(0.030, 0.020, 0.14, STL_D, 0, 0.066, -0.06, g);
  addRail(g, -0.06, 0.078, 0.14);
  return g;
}

// ------------------------------------------------------------------ 突击步枪 AK-47
function buildRifle() {
  const g = new THREE.Group();
  // 机匣 + 防尘盖
  mkBox(0.088, 0.110, 0.44, STL, 0, 0, -0.06, g);
  mkBox(0.076, 0.030, 0.36, STL_L, 0, 0.058, -0.08, g);         // 防尘盖
  mkBox(0.092, 0.096, 0.080, STL, 0, 0.004, 0.13, g);           // 后机匣座
  mkBox(0.094, 0.040, 0.030, STL_D, 0, -0.030, 0.155, g);       // 机匣底
  mkBox(0.004, 0.034, 0.090, BLK, 0.045, 0.030, -0.16, g);      // 抛壳口
  mkBox(0.010, 0.010, 0.010, STL_L, -0.046, -0.030, -0.20, g);  // 铆钉
  mkBox(0.010, 0.010, 0.010, STL_L, 0.046, -0.030, -0.20, g);
  // 枪管
  mkBox(0.036, 0.036, 0.30, STL_D, 0, 0.018, -0.43, g);
  // 导气管 + 导气箍
  mkBox(0.030, 0.030, 0.17, STL_D, 0, 0.070, -0.415, g);
  mkBox(0.046, 0.052, 0.050, STL, 0, 0.050, -0.500, g);
  mkBox(0.020, 0.020, 0.020, STL_L, 0, 0.078, -0.500, g);       // 导气箍顶
  // 护木（上下两片木）
  mkBox(0.074, 0.040, 0.15, WOOD, 0, 0.048, -0.405, g);
  mkBox(0.078, 0.050, 0.15, WOOD_D, 0, -0.005, -0.405, g);
  mkBox(0.086, 0.026, 0.06, WOOD_L, 0, 0.010, -0.36, g);        // 护木握持凸起
  ribs(g, -0.34, -0.47, 4, -0.034, 0.070, 0.008, WOOD_D);       // 下护木散热孔
  // 准星座 + 枪口斜切防跳器
  akFrontTower(g, -0.545, 0.036, 0.105);
  mkBoxR(0.048, 0.046, 0.062, STL_D, 0, 0.020, -0.610, g, -0.28);   // 斜切消焰器
  mkBox(0.022, 0.022, 0.008, BLK, 0, 0.020, -0.638, g);             // 枪口内孔
  // 表尺（后照门，位于枪管后端）
  mkBox(0.056, 0.032, 0.086, STL, 0, 0.052, -0.30, g);
  mkBox(0.048, 0.014, 0.070, STL_L, 0, 0.072, -0.30, g);
  g.userData.ironRear = rearNotch(g, -0.30, 0.076, 0.105, 0.028, 0.030);
  // 弹匣（弧形香蕉匣）
  const mag = new THREE.Group();
  mag.position.set(0, -0.030, 0.02);
  g.add(mag);
  mkBox(0.058, 0.090, 0.078, 0x33383e, 0, -0.048, 0, mag);
  mkBoxR(0.056, 0.086, 0.074, 0x33383e, 0, -0.122, -0.030, mag, 0.30);
  mkBoxR(0.052, 0.076, 0.068, 0x2c3138, 0, -0.184, -0.076, mag, 0.60);
  mkBox(0.060, 0.010, 0.082, 0x4a5058, 0, -0.092, -0.014, mag);     // 加强筋
  // 扳机护圈 + 扳机
  for (const s of [-1, 1]) {
    mkBox(0.008, 0.026, 0.010, STL_D, s * 0.030, -0.070, 0.00, g);
    mkBox(0.008, 0.010, 0.070, STL_D, s * 0.030, -0.086, 0.03, g);
  }
  mkBoxR(0.010, 0.026, 0.010, STL_L, 0, -0.058, 0.02, g, -0.20);
  // 快慢机大拨片 + 拉机柄
  mkBox(0.010, 0.048, 0.028, STL_L, 0.052, -0.006, 0.085, g);
  mkBox(0.026, 0.020, 0.052, STL_D, 0.058, 0.012, -0.16, g);
  // 木握把
  const grip = new THREE.Group();
  grip.position.set(0, -0.052, 0.10);
  grip.rotation.x = -0.20;
  g.add(grip);
  mkBox(0.056, 0.150, 0.086, WOOD, 0, -0.075, 0, grip);
  mkBox(0.058, 0.016, 0.090, WOOD_D, 0, -0.152, 0, grip);
  mkBox(0.020, 0.020, 0.020, STL_L, 0, -0.060, 0.046, grip);        // 握把螺钉
  // 木枪托
  mkBox(0.062, 0.098, 0.22, WOOD, 0, -0.012, 0.27, g);
  mkBox(0.064, 0.030, 0.16, WOOD_L, 0, 0.052, 0.28, g);             // 托腮
  mkBox(0.078, 0.140, 0.026, WOOD_D, 0, -0.020, 0.44, g);           // 托底板
  mkBox(0.014, 0.034, 0.014, STL_D, 0, -0.050, 0.34, g);            // 背带环
  // 瞄准镜导轨（防尘盖上的燕尾座）
  mkBox(0.034, 0.026, 0.10, STL_D, 0, 0.086, -0.06, g);
  addRail(g, -0.06, 0.098, 0.20);
  return g;
}

// ------------------------------------------------------------------ 精确射手步枪 M14
function buildM14() {
  const g = new THREE.Group();
  // 机匣
  mkBox(0.078, 0.100, 0.34, STL, 0, 0, -0.06, g);
  mkBox(0.062, 0.014, 0.32, STL_L, 0, 0.052, -0.06, g);          // 机匣顶部
  mkBox(0.004, 0.030, 0.086, BLK, 0.040, 0.026, -0.14, g);       // 抛壳口
  mkBox(0.084, 0.034, 0.060, STL_D, 0, -0.030, 0.09, g);         // 机匣底部
  // 枪管 + 导气筒 + 消焰器
  mkBox(0.032, 0.032, 0.36, STL_D, 0, 0.012, -0.44, g);
  mkBox(0.028, 0.028, 0.20, STL_D, 0, -0.034, -0.46, g);         // 导气筒（枪管下方）
  mkBox(0.040, 0.040, 0.030, STL, 0, -0.020, -0.36, g);          // 导气箍
  mkBox(0.046, 0.046, 0.080, STL_D, 0, 0.012, -0.66, g);         // 消焰器
  mkBox(0.022, 0.022, 0.010, BLK, 0, 0.012, -0.705, g);
  mkBox(0.054, 0.054, 0.028, STL, 0, 0.014, -0.30, g);           // 前箍
  // 木质前护木
  mkBox(0.088, 0.058, 0.20, WOOD, 0, 0.034, -0.40, g);
  mkBox(0.092, 0.018, 0.030, WOOD_D, 0, 0.036, -0.49, g);        // 护木端箍
  // 准星座 + 觇孔照门
  akFrontTower(g, -0.585, 0.028, 0.098);
  mkBox(0.054, 0.016, 0.070, STL, 0, 0.056, -0.16, g);           // 照门座
  g.userData.ironRear = rearNotch(g, -0.16, 0.064, 0.098, 0.016, 0.030);
  // 枪机拉柄 + 连动杆
  mkBox(0.024, 0.020, 0.050, STL_D, 0.056, 0.024, -0.04, g);
  mkBox(0.014, 0.018, 0.34, STL_D, 0.052, -0.014, -0.36, g);
  mkBox(0.010, 0.030, 0.024, STL_L, 0.050, -0.030, 0.02, g);     // 快慢机/保险
  // 弹匣（20 发直匣）
  const mag = new THREE.Group();
  mag.position.set(0, -0.040, 0.0);
  g.add(mag);
  mkBox(0.052, 0.120, 0.082, 0x33383e, 0, -0.060, 0, mag);
  mkBoxR(0.050, 0.06, 0.078, 0x2c3138, 0, -0.146, -0.004, mag, 0.06);
  mkBox(0.056, 0.012, 0.086, 0x4a5058, 0, -0.178, -0.006, mag);  // 底板
  // 扳机护圈 + 扳机
  for (const s of [-1, 1]) {
    mkBox(0.008, 0.026, 0.010, STL_D, s * 0.030, -0.072, 0.03, g);
    mkBox(0.008, 0.010, 0.090, STL_D, s * 0.030, -0.088, 0.06, g);
  }
  mkBox(0.056, 0.010, 0.014, STL_D, 0, -0.088, 0.016, g);
  mkBoxR(0.010, 0.026, 0.010, STL_L, 0, -0.058, 0.05, g, -0.20);
  // 木质枪托（整体式 + 半握把）
  mkBox(0.080, 0.105, 0.14, WOOD, 0, -0.008, 0.17, g);           // 机匣后段
  mkBox(0.082, 0.115, 0.20, WOOD, 0, -0.020, 0.34, g);           // 托身
  mkBox(0.070, 0.032, 0.22, WOOD_L, 0, 0.048, 0.32, g);          // 贴腮
  mkBox(0.088, 0.150, 0.028, WOOD_D, 0, -0.030, 0.46, g);        // 托底
  mkBox(0.090, 0.155, 0.010, 0x2a2e33, 0, -0.030, 0.478, g);     // 托底板
  const grip = new THREE.Group();
  grip.position.set(0, -0.052, 0.10);
  grip.rotation.x = -0.38;
  g.add(grip);
  mkBox(0.072, 0.150, 0.088, WOOD, 0, -0.075, 0, grip);
  for (let i = 0; i < 3; i++) mkBox(0.074, 0.008, 0.006, WOOD_D, 0, -0.040 - i * 0.032, -0.045, grip);
  // 背带环
  mkBox(0.012, 0.034, 0.012, STL_D, 0.046, -0.052, -0.28, g);
  mkBox(0.012, 0.034, 0.012, STL_D, 0.046, -0.070, 0.30, g);
  mkBox(0.014, 0.012, 0.56, 0x4a4034, 0.058, -0.060, 0.0, g);    // 背带
  // 瞄准镜导轨
  mkBox(0.032, 0.026, 0.12, STL_D, 0, 0.086, -0.04, g);
  addRail(g, -0.04, 0.092, 0.16);
  return g;
}

// ------------------------------------------------------------------ 双管霰弹枪
function buildShotgun() {
  const g = new THREE.Group();
  // 双管 + 肋条
  mkBox(0.042, 0.042, 0.34, 0x2a2e33, -0.026, 0.046, -0.51, g);
  mkBox(0.042, 0.042, 0.34, 0x2a2e33, 0.026, 0.046, -0.51, g);
  mkBox(0.030, 0.010, 0.34, 0x3a4046, 0, 0.072, -0.51, g);        // 肋条
  mkBox(0.062, 0.030, 0.020, BLK, 0, 0.046, -0.676, g);           // 枪口端面
  mkBox(0.010, 0.010, 0.010, BRASS, 0, 0.086, -0.660, g);         // 准星珠
  // 机匣
  mkBox(0.110, 0.115, 0.52, 0x3c4048, 0, 0.0, -0.08, g);
  mkBox(0.090, 0.016, 0.50, 0x4a5058, 0, 0.062, -0.08, g);        // 机匣顶面
  mkBox(0.070, 0.030, 0.060, STL_L, 0, 0.078, 0.10, g);           // 开闭锁杆
  mkBox(0.020, 0.018, 0.070, STL_L, 0, 0.066, 0.14, g);           // 保险
  // 前护木（带指槽）
  mkBox(0.094, 0.072, 0.20, WOOD, 0, 0.020, -0.44, g);
  ribs(g, -0.36, -0.53, 5, -0.008, 0.096, 0.010, WOOD_D);
  mkBox(0.100, 0.020, 0.030, WOOD_D, 0, 0.048, -0.535, g);
  // 扳机护圈 + 双扳机
  for (const s of [-1, 1]) {
    mkBox(0.010, 0.028, 0.010, STL_D, s * 0.036, -0.078, -0.02, g);
    mkBox(0.010, 0.010, 0.090, STL_D, s * 0.036, -0.096, 0.03, g);
  }
  mkBoxR(0.010, 0.026, 0.010, STL_L, -0.014, -0.062, 0.01, g, -0.2);
  mkBoxR(0.010, 0.026, 0.010, STL_L, 0.014, -0.062, 0.01, g, -0.2);
  // 木枪托 + 握把
  mkBox(0.092, 0.130, 0.24, WOOD, 0, -0.030, 0.30, g);
  mkBox(0.096, 0.160, 0.028, WOOD_D, 0, -0.036, 0.43, g);         // 托底板
  mkBox(0.080, 0.026, 0.18, WOOD_L, 0, 0.046, 0.30, g);           // 托腮
  const grip = new THREE.Group();
  grip.position.set(0, -0.070, 0.10);
  grip.rotation.x = -0.30;
  g.add(grip);
  mkBox(0.082, 0.150, 0.092, WOOD, 0, -0.075, 0, grip);
  mkBox(0.086, 0.020, 0.096, WOOD_D, 0, -0.152, 0, grip);
  // 机瞄：肋条后端的缺口
  g.userData.ironRear = rearNotch(g, -0.26, 0.068, 0.088, 0.030, 0.024);
  addRail(g, -0.16, 0.078, 0.12);
  return g;
}

// ------------------------------------------------------------------ 狙击枪 AWM
function buildSniper() {
  const g = new THREE.Group();
  // 机匣
  mkBox(0.080, 0.100, 0.50, 0x2c3a2c, 0, 0, -0.06, g);
  mkBox(0.062, 0.018, 0.48, 0x3c4c3c, 0, 0.056, -0.06, g);         // 顶部
  mkBox(0.084, 0.026, 0.030, 0x1f2a1f, 0, 0.006, -0.302, g);       // 机匣前环
  // 枪管 + 制退器
  mkBox(0.036, 0.036, 0.56, 0x1a1e1a, 0, 0.018, -0.60, g);
  mkBox(0.050, 0.050, 0.080, 0x243024, 0, 0.018, -0.88, g);
  mkBox(0.026, 0.026, 0.010, BLK, 0, 0.018, -0.916, g);
  ribs(g, -0.34, -0.52, 4, 0.040, 0.030, 0.008, 0x111a11);         // 枪管凹槽
  // 护木 / 前托
  mkBox(0.082, 0.060, 0.30, 0x243024, 0, -0.020, -0.34, g);
  ribs(g, -0.22, -0.47, 6, -0.052, 0.078, 0.008, 0x1a241a);        // 侧面散热孔
  // 两脚架（折叠向前）
  mkBoxR(0.014, 0.014, 0.24, 0x22281f, -0.048, -0.072, -0.46, g, -0.30);
  mkBoxR(0.014, 0.014, 0.24, 0x22281f, 0.048, -0.072, -0.46, g, -0.30);
  mkBox(0.046, 0.030, 0.040, 0x1a1e1a, 0, -0.044, -0.35, g);       // 脚架座
  // 枪机拉柄
  mkBox(0.026, 0.020, 0.060, STL_D, 0.056, 0.014, 0.02, g);
  mkBox(0.030, 0.030, 0.030, STL_L, 0.070, 0.014, -0.01, g);       // 拉柄球
  // 弹匣
  mkBox(0.062, 0.100, 0.090, 0x22301f, 0, -0.104, -0.02, g);
  mkBox(0.066, 0.014, 0.094, 0x111a11, 0, -0.152, -0.02, g);
  // 握把
  const grip = new THREE.Group();
  grip.position.set(0, -0.056, 0.14);
  grip.rotation.x = -0.34;
  g.add(grip);
  mkBox(0.066, 0.150, 0.088, GRIP, 0, -0.075, 0, grip);
  for (let i = 0; i < 3; i++) mkBox(0.068, 0.008, 0.006, 0x241e19, 0, -0.040 - i * 0.030, -0.045, grip);
  // 枪托（带托腮板 + 拇指孔）
  mkBox(0.092, 0.140, 0.26, 0x33422f, 0, -0.020, 0.34, g);
  mkBox(0.086, 0.046, 0.20, 0x3c503a, 0, 0.062, 0.32, g);          // 托腮板
  mkBox(0.098, 0.180, 0.030, 0x22301f, 0, -0.030, 0.47, g);        // 托底板
  mkBox(0.060, 0.070, 0.070, 0x22301f, 0, 0.010, 0.24, g);         // 拇指孔座
  // 机瞄（应急折叠照门）
  frontPost(g, -0.60, 0.036, 0.10, 0.007);
  g.userData.ironRear = rearNotch(g, -0.16, 0.060, 0.10, 0.026, 0.014);
  addRail(g, -0.02, 0.082, 0.22);
  return g;
}

// ------------------------------------------------------------------ RPG-7
function buildRpg() {
  const g = new THREE.Group();
  // 发射筒
  mkBox(0.100, 0.100, 0.86, OLIVE, 0, 0, -0.30, g);
  mkBox(0.106, 0.030, 0.60, OLIVE_D, 0, 0.040, -0.30, g);          // 筒身加强段
  mkBox(0.108, 0.024, 0.024, 0x54663f, 0, 0, -0.10, g);            // 中段箍
  mkBox(0.108, 0.024, 0.024, 0x54663f, 0, 0, -0.50, g);
  // 尾喷口
  mkBox(0.130, 0.130, 0.16, OLIVE_D, 0, 0, 0.20, g);
  mkBox(0.150, 0.150, 0.040, 0x22301f, 0, 0, 0.29, g);             // 喇叭口
  mkBox(0.090, 0.090, 0.020, BLK, 0, 0, 0.315, g);
  // 前喇叭
  mkBox(0.150, 0.150, 0.14, OLIVE_D, 0, 0, -0.78, g);
  mkBox(0.176, 0.176, 0.040, 0x22301f, 0, 0, -0.86, g);
  // 装填的火箭弹
  mkBox(0.082, 0.082, 0.10, 0x3a4046, 0, 0, -0.90, g);
  mkBox(0.072, 0.072, 0.08, 0x4a5058, 0, 0, -0.99, g);
  mkBox(0.056, 0.056, 0.06, RED, 0, 0, -1.06, g);
  mkBox(0.030, 0.030, 0.05, 0x6a2c2c, 0, 0, -1.11, g);             // 弹头尖
  for (let i = 0; i < 4; i++) {                                    // 尾翼
    const a = i * Math.PI / 2;
    mkBoxR(0.012, 0.070, 0.10, 0x2c3138,
      Math.cos(a) * 0.048, Math.sin(a) * 0.048, -0.86, g, 0, 0, -a);
  }
  // 握把 + 前握把
  const grip = new THREE.Group();
  grip.position.set(0, -0.070, -0.10);
  grip.rotation.x = -0.16;
  g.add(grip);
  mkBox(0.062, 0.170, 0.078, GRIP, 0, -0.085, 0, grip);
  mkBox(0.066, 0.016, 0.082, 0x241e19, 0, -0.170, 0, grip);
  mkBox(0.050, 0.100, 0.060, 0x4a3a26, 0, -0.110, -0.52, g);       // 前握把
  mkBox(0.056, 0.020, 0.064, 0x2c241a, 0, -0.062, -0.52, g);
  // 肩托 + 背带
  mkBox(0.100, 0.070, 0.10, OLIVE_D, 0, -0.030, 0.30, g);
  mkBox(0.110, 0.090, 0.030, 0x22301f, 0, -0.036, 0.36, g);
  mkBox(0.012, 0.040, 0.070, 0x2c3138, 0, -0.056, -0.30, g);       // 背带环
  mkBox(0.014, 0.012, 0.70, 0x4a4034, 0.056, 0.010, -0.30, g);     // 背带
  // 瞄具：前准星 + 可折叠表尺
  frontPost(g, -0.74, 0.050, 0.10);
  mkBox(0.046, 0.020, 0.070, OLIVE_D, 0, 0.056, -0.60, g);         // 表尺座
  g.userData.ironRear = rearNotch(g, -0.60, 0.066, 0.10, 0.024, 0.030);
  addRail(g, -0.05, 0.10, 0.12);
  return g;
}

// ------------------------------------------------------------------ 破障大锤
function buildSledge() {
  const g = new THREE.Group();
  // 木柄 + 缠带
  mkBox(0.052, 0.052, 0.86, WOOD, 0, 0, -0.28, g);
  mkBox(0.058, 0.058, 0.16, 0x2a2e33, 0, 0, 0.02, g);              // 握把段
  ribs(g, 0.00, 0.10, 4, 0.0, 0.062, 0.062, 0x1d2126);             // 防滑缠带
  mkBox(0.062, 0.062, 0.06, 0x1d2126, 0, 0, -0.62, g);             // 柄箍
  mkBox(0.070, 0.070, 0.030, STL_L, 0, 0, -0.66, g);               // 紧固环
  // 锤头
  mkBox(0.210, 0.190, 0.28, 0x4a5158, 0, 0.010, -0.80, g);
  mkBox(0.230, 0.060, 0.30, 0x33383e, 0, 0.115, -0.80, g);         // 顶盖
  mkBox(0.230, 0.050, 0.30, 0x33383e, 0, -0.095, -0.80, g);        // 底盖
  mkBox(0.090, 0.090, 0.070, 0x8a6a3a, 0, 0, -0.945, g);           // 前撞面
  mkBox(0.030, 0.030, 0.030, STL_L, -0.070, 0.010, -0.945, g);     // 铆钉
  mkBox(0.030, 0.030, 0.030, STL_L, 0.070, 0.010, -0.945, g);
  mkBoxR(0.070, 0.070, 0.14, 0x3a4046, 0, 0.010, -0.655, g, 0, 0, Math.PI / 4);  // 楔形座
  return g;
}

// ------------------------------------------------------------------ 喷火器
function buildFlamer() {
  const g = new THREE.Group();
  // 双燃料罐（罐身用三段方块近似圆柱）
  for (const s of [-1, 1]) {
    const t = new THREE.Group();
    t.position.set(s * 0.078, 0, 0.06);
    g.add(t);
    mkBox(0.070, 0.10, 0.26, 0x8a5a2a, 0, 0, 0, t);
    mkBox(0.090, 0.11, 0.22, 0x9a6633, 0, 0, 0, t);
    mkBox(0.070, 0.10, 0.26, 0x7a4d22, 0, 0, 0, t);
    mkBox(0.094, 0.020, 0.20, 0x5a3a1a, 0, 0.056, 0, t);           // 罐口箍
    mkBox(0.094, 0.020, 0.20, 0x5a3a1a, 0, -0.056, 0, t);
    mkBox(0.040, 0.040, 0.040, STL_L, 0, 0, -0.15, t);             // 阀门
  }
  mkBox(0.030, 0.026, 0.16, 0x2c3138, 0, 0.03, -0.04, g);          // 连接管
  mkBox(0.024, 0.024, 0.10, 0x2c3138, 0, 0.0, -0.12, g);           // 软管
  // 喷管组件
  mkBox(0.070, 0.070, 0.44, 0x3a4046, 0, 0, -0.18, g);
  mkBox(0.078, 0.030, 0.10, 0x4a5058, 0, 0.030, -0.06, g);         // 机匣段
  mkBox(0.055, 0.055, 0.20, 0x22262b, 0, 0, -0.48, g);             // 枪口段
  mkBox(0.075, 0.075, 0.06, 0x5a3a22, 0, 0, -0.60, g);             // 喷嘴
  mkBox(0.030, 0.030, 0.010, BLK, 0, 0, -0.635, g);
  mkBox(0.050, 0.050, 0.10, 0x2a2e33, 0, 0.060, -0.24, g);         // 点火器
  mkBox(0.030, 0.030, 0.03, 0xffa733, 0, 0.080, -0.19, g);         // 长明火
  // 握把 + 前握把 + 枪托
  const grip = new THREE.Group();
  grip.position.set(0, -0.056, -0.06);
  grip.rotation.x = -0.16;
  g.add(grip);
  mkBox(0.070, 0.150, 0.086, GRIP, 0, -0.075, 0, grip);
  mkBox(0.074, 0.016, 0.090, 0x241e19, 0, -0.152, 0, grip);
  mkBox(0.058, 0.100, 0.070, 0x4a3a26, 0, -0.100, -0.34, g);
  mkBox(0.100, 0.070, 0.16, OLIVE_D, 0, -0.020, 0.26, g);
  return g;
}

const BUILDERS = {
  pistol: buildPistol, smg: buildSmg, rifle: buildRifle, m14: buildM14, shotgun: buildShotgun,
  sniper: buildSniper, rpg: buildRpg, sledge: buildSledge, flame: buildFlamer,
};

/** 供菜单/预览构建 3D 模型 */
export function buildWeaponModel(id) { return BUILDERS[id](); }

// ---------------------------------------------------------------- 弹道曳光
class Tracers {
  constructor(scene) {
    this.scene = scene;
    this.pool = []; this.active = [];
    for (let i = 0; i < 28; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 1 });
      const line = new THREE.Line(geo, mat);
      line.visible = false; line.frustumCulled = false;
      scene.add(line); this.pool.push(line);
    }
  }
  add(a, b, color = 0xffe9a0) {
    const line = this.pool.pop(); if (!line) return;
    const p = line.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    line.material.color.set(color); line.material.opacity = 1; line.visible = true;
    this.active.push({ line, t: 0 });
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i]; a.t += dt;
      a.line.material.opacity = Math.max(0, 1 - a.t / 0.075);
      if (a.t > 0.075) { a.line.visible = false; this.pool.push(a.line); this.active.splice(i, 1); }
    }
  }
}

// ---------------------------------------------------------------- 投掷物
export class Grenades {
  constructor(scene, world, particles, sfx) {
    this.scene = scene; this.world = world; this.particles = particles; this.sfx = sfx;
    this.list = [];
  }

  /** 体素手雷 / 烟雾罐 */
  _mesh(def) {
    const g = new THREE.Group();
    if (def.smoke) {
      mkBox(0.66, 0.80, 0.66, def.color, 0, 0, 0, g);            // 罐体
      mkBox(0.70, 0.12, 0.70, 0x39424c, 0, 0.40, 0, g);           // 上下箍
      mkBox(0.70, 0.12, 0.70, 0x39424c, 0, -0.40, 0, g);
      mkBox(0.34, 0.16, 0.34, 0x8a9098, 0, 0.46, 0, g);          // 出烟口
      mkBox(0.10, 0.26, 0.10, 0xc8ccd0, 0, 0.62, 0, g);          // 拉环
      mkBox(0.72, 0.10, 0.10, 0x2f353c, 0, 0.10, 0.34, g);       // 侧面标条
    } else {
      mkBox(0.68, 0.74, 0.68, def.color, 0, -0.02, 0, g);        // 弹体
      for (let i = 0; i < 3; i++) mkBox(0.72, 0.06, 0.72, 0x1a1e22, 0, -0.24 + i * 0.24, 0, g);  // 破片刻槽
      for (const s of [-1, 1]) mkBox(0.06, 0.72, 0.72, 0x1a1e22, s * 0.20, -0.02, 0, g);
      mkBox(0.32, 0.20, 0.32, 0x3a4046, 0, 0.42, 0, g);          // 引信座
      mkBox(0.10, 0.24, 0.10, 0xd8c07a, 0, 0.60, 0, g);          // 引信
      mkBoxR(0.08, 0.42, 0.10, 0x9aa0a8, 0.32, 0.40, 0, g, 0, 0, -0.22);  // 保险握片
      mkBox(0.07, 0.07, 0.24, 0xc8ccd0, 0, 0.48, 0.20, g);       // 拉环
    }
    return g;
  }

  throw(origin, dir, def, owner = null) {
    const mesh = this._mesh(def);
    mesh.scale.setScalar(def.size);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.list.push({
      mesh, def, owner,
      vel: dir.clone().multiplyScalar(24).add(new THREE.Vector3(0, 3.5, 0)),
      fuse: def.smoke ? 1.2 : 2.0,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      beep: 0,
    });
    this.sfx.pin();
  }
  update(dt, onExplode) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      g.vel.y -= 26 * dt;
      const p = g.mesh.position;
      const step = g.vel.clone().multiplyScalar(dt);
      for (const axis of ['x', 'y', 'z']) {
        const old = p[axis];
        p[axis] = old + step[axis];
        if (this.world.isSolidAtWorld(p.x, p.y, p.z)) {
          p[axis] = old;
          g.vel[axis] *= -0.35;
          g.vel.x *= 0.72; g.vel.z *= 0.72;
        }
      }
      const groundY = this.world.groundBelow(p.x, p.y + 0.15, p.z, 3);
      if (groundY > -40 && p.y < groundY + 0.13) {
        p.y = groundY + 0.13;
        g.vel.y = Math.abs(g.vel.y) > 2 ? -g.vel.y * 0.35 : 0;
        g.vel.x *= 0.8; g.vel.z *= 0.8;
      }
      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      g.mesh.rotation.z += g.spin.z * dt;

      if (!g.def.smoke) {
        const k = Math.floor(g.fuse * 4);
        if (k !== g.beep) { g.beep = k; this.sfx.pin(); }
      }

      if (g.fuse <= 0) {
        if (!g.def.smoke) {
          this.particles.explosion(p.clone(), g.def.radius * 0.7);
          this.sfx.explode();
        }
        onExplode?.(p.clone(), g.def, g.owner);
        this.scene.remove(g.mesh);
        g.mesh.traverse(o => { o.geometry?.dispose(); });   // 材质为共享缓存，不释放
        this.list.splice(i, 1);
      }
    }
  }
}

// ---------------------------------------------------------------- 武器系统
export class WeaponSystem {
  constructor({ scene, vmScene, camera, world, particles, sfx, getEnemies, onHit, onKill, onDamage, onMelee, onDash, onFlame, player, onRocketExplode, baseFov = 80 }) {
    this.scene = scene; this.vmScene = vmScene; this.camera = camera; this.world = world;
    this.particles = particles; this.sfx = sfx;
    this.getEnemies = getEnemies; this.onHit = onHit; this.onKill = onKill;
    // 之前这几个回调没有保存下来 → 命中不点亮血条、大锤 / 喷火器无效
    this.onDamage = onDamage; this.onMelee = onMelee; this.onDash = onDash; this.onFlame = onFlame;
    this.player = player;
    this.baseFov = baseFov;   // 腰射基础 FOV，用于换算开镜倍率
    this.coinTarget = null;   // 金币吸附点（外部指向玩家眼睛位置）

    this.tracers = new Tracers(scene);
    this.rockets = new Rockets(scene, world, particles, sfx, { getEnemies, onExplode: onRocketExplode });

    // 视图模型放在独立场景里，用单独的相机渲染 → 不会和世界穿模，也不受近裁剪面影响
    this.root = new THREE.Group();
    vmScene.add(this.root);
    this.root.position.set(0.24, -0.22, -0.42);
    this.slots = [];

    // 为每把枪建一份模型（最多同时持 2 把，但预建全部以便菜单预览）
    this.models = {};
    for (const w of WEAPONS) {
      const g = BUILDERS[w.id]();
      g.visible = false;
      this.root.add(g);

      const muzzle = new THREE.Object3D();
      const len = MUZZLE_LEN[w.id] ?? 0.40;
      const mz = MUZZLE_Y[w.id] ?? 0.02;
      muzzle.position.set(0, mz, -len);
      g.add(muzzle);

      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      flash.position.copy(muzzle.position);
      flash.visible = false;
      g.add(flash);

      const light = new THREE.PointLight(0xffc04a, 0, 7, 2);
      light.position.copy(muzzle.position);
      g.add(light);

      const opticGroup = new THREE.Group();
      g.add(opticGroup);

      this.models[w.id] = {
        group: g, muzzle, flash, light, opticGroup, opticId: null,
        ironRear: g.userData.ironRear || null,   // 机瞄后照门（举枪时折下）
      };
    }
    for (const w of WEAPONS) this.setWeaponOptic(w, w.optic);

    this.index = 1;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.swapTimer = 0;
    this.aiming = false;
    this.aimT = 0;
    this.recoilOffset = 0;
    this.swapAnim = 0;
    this.prevLeft = false;
    this.prevRight = false;
    this.swayX = 0; this.swayY = 0;
    this.adsPos = new THREE.Vector3(0, -0.115, -0.30);
    this.adsLerp = 0;
    this.swing = 0;
    this.dashCd = 0;
    this.aimMode = 'hold';      // hold | toggle
    this.aimToggled = false;
    this.flameDmgT = 0;
    this.flameSfxT = 0;
  }

  /** 载入配装：主武器 / 副武器 / 特殊武器（可为 null） */
  configure(slotA, slotB, slotC = null) {
    this.slots = [WEAPON_BY_ID[slotA] || WEAPON_BY_ID.rifle, WEAPON_BY_ID[slotB] || WEAPON_BY_ID.pistol];
    if (slotC && WEAPON_BY_ID[slotC]) this.slots.push(WEAPON_BY_ID[slotC]);
    for (const w of WEAPONS) this.models[w.id].group.visible = false;
    this.index = 0;
    this.models[this.slots[0].id].group.visible = true;
    this.reloading = false; this.reloadTimer = 0; this.cooldown = 0;
    this.swapAnim = 1; this.swapTimer = 0.35;
    this._recalcAds();
  }

  get cur() { return this.slots[this.index]; }
  get other() { return this.slots[1 - this.index]; }

  /** 给某把枪装上瞄具（同时用于菜单预览） */
  setWeaponOptic(w, opticId) {
    if (!w.optics.includes(opticId)) opticId = w.optics[0];
    w.optic = opticId;
    const m = this.models[w.id];
    if (m.opticId === opticId) return;
    m.opticId = opticId;
    while (m.opticGroup.children.length) {
      const c = m.opticGroup.children.pop();
      c.traverse?.(o => { o.geometry?.dispose(); });
      m.opticGroup.remove(c);
    }
    const model = buildOptic(opticId);
    if (model) {
      model.position.copy(w.rail);
      m.opticGroup.add(model);
    }
    w._attachedOptic = model;
    if (this.slots && this.cur === w) this._recalcAds();
  }

  _recalcAds() {
    const w = this.cur;
    if (!w) return;
    let lens;
    if (w.optic === 'iron') lens = w.ironLens.clone();
    else lens = w.rail.clone().add(opticLensLocal(w.optic));
    const relief = w.optic === 'iron'
      ? (w.ironRelief ?? OPTICS.iron.relief)
      : ((OPTICS[w.optic] || OPTICS.iron).relief ?? 0.24);
    this.adsPos.set(-lens.x, -lens.y, -lens.z - relief);
    this.adsRelief = relief;
  }

  /** 开镜 FOV：由瞄具倍率换算（放大 = 缩小 FOV） */
  get aimFov() {
    const o = OPTICS[this.cur.optic] || OPTICS.iron;
    return this.baseFov / (o.zoom || 1);
  }
  /** 开镜倍率（1 表示不放大） */
  get aimZoom() { return (OPTICS[this.cur.optic] || OPTICS.iron).zoom || 1; }
  get isScope() { return (OPTICS[this.cur.optic] || OPTICS.iron).reticle === 'scope'; }

  setSlot(i) {
    if (i === this.index || !this.slots[i]) return;
    if (i >= this.slots.length) return;
    this.models[this.cur.id].group.visible = false;
    this.index = i;
    this.models[this.cur.id].group.visible = true;
    this.reloading = false; this.reloadTimer = 0;
    this.cooldown = Math.max(this.cooldown, 0.3);
    this.swapAnim = 1; this.swapTimer = 0.34;
    this.sfx.swap();
    this._recalcAds();
  }

  startReload() {
    const w = this.cur;
    if (this.reloading || w.noAmmo || w.mag >= w.magSize) return;
    if (w.reserve !== Infinity && w.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = w.reloadTime;
    this.sfx.reload();
  }

  // ------------------------------------------------------------ 每帧
  update(dt, input, opts = {}) {
    const w = this.cur;
    this.cooldown -= dt;
    this.swapTimer = Math.max(0, this.swapTimer - dt);
    this.swapAnim = Math.max(0, this.swapAnim - dt * 3.2);
    this.aimT = THREE.MathUtils.damp(this.aimT, this.aiming ? 1 : 0, 15, dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = w.magSize - w.mag;
        if (w.reserve === Infinity) w.mag = w.magSize;
        else { const take = Math.min(need, w.reserve); w.mag += take; w.reserve -= take; }
        this.reloading = false;
      }
    }

    this.tracers.update(dt);
    this.rockets.update(dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    // 缓慢补充备弹（RPG 这类低备弹武器）
    if (w.regen && w.reserve !== Infinity && w.reserve < w.reserveMax) {
      w.regenAcc = (w.regenAcc ?? 0) + w.regen * dt;
      if (w.regenAcc >= 1) {
        const add = Math.floor(w.regenAcc);
        w.regenAcc -= add;
        w.reserve = Math.min(w.reserveMax, w.reserve + add);
      }
    }

    // ---- 瞄准（长按 / 切换）—— 阵亡时全部冻结
    const canAim = !w.noAim && !opts.frozen;
    if (opts.frozen) {
      this.aimToggled = false;
    } else if (this.aimMode === 'toggle') {
      if (input.mouse.right && !this.prevRight && canAim) this.aimToggled = !this.aimToggled;
      if (player.sprinting) this.aimToggled = false;
      if (this.reloading) this.aimToggled = false;
    } else {
      this.aimToggled = input.mouse.right;
    }
    this.prevRight = opts.frozen ? false : input.mouse.right;
    const wantAim = canAim && this.aimToggled && !this.reloading;
    this.aiming = wantAim;

    if (!opts.frozen) {
      const justLeft = input.mouse.left && !this.prevLeft;

      // 大锤：右键 = 冲撞
      if (w.melee && input.mouse.right && this.dashCd <= 0) this._dash();

      if (w.continuous) {
        if (input.mouse.left && !this.reloading && w.mag > 0 && this.swapTimer <= 0) {
          this._flameTick(dt);
        } else {
          this.flameDmgT = 0;
          if (w.mag <= 0 && !this.reloading) this.startReload();
        }
      } else {
        if (input.mouse.left && !this.reloading && this.swapTimer <= 0 && this.cooldown <= 0) {
          if (w.auto || justLeft) this.fire();
        }
        if (justLeft && !w.noAmmo && w.mag <= 0 && !this.reloading) { this.sfx.dry(); this.startReload(); }
      }

      if (input.justPressed('KeyR')) this.startReload();
      if (input.justPressed('Digit1')) this.setSlot(0);
      if (input.justPressed('Digit2')) this.setSlot(1);
      if (input.justPressed('Digit3')) this.setSlot(2);
      if (input.mouse.wheel) this.setSlot((this.index + (input.mouse.wheel > 0 ? 1 : -1) + this.slots.length) % this.slots.length);
    }
    this.prevLeft = opts.frozen ? false : input.mouse.left;

    this._updateModel(dt, input, opts);
  }

  /** 枪口在世界坐标中的位置（视图模型在独立场景，需要转换） */
  muzzleWorld(out = new THREE.Vector3()) {
    this.models[this.cur.id].muzzle.getWorldPosition(out);
    this.camera.localToWorld(out);
    return out;
  }

  /** 大锤冲撞（右键） */
  _dash() {
    const w = this.cur;
    const p = this.player;
    this.dashCd = w.melee.dashCd;
    const dir = p.lookDir().clone();
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
    dir.normalize();
    p.vel.x += dir.x * 26;
    p.vel.z += dir.z * 26;
    if (p.vel.y < 3) p.vel.y = 3.5;
    p.shake = Math.min(1.3, p.shake + 0.45);
    this.swing = 1;
    this.sfx.dash();
    this.onDash?.(p.pos.clone(), dir, w.melee, p);
  }

  /** 喷火器持续输出 */
  _flameTick(dt) {
    const w = this.cur;
    const f = w.flame;
    w.mag -= f.drain * dt;
    const m = this.models[w.id];
    const muzzle = this.muzzleWorld();
    const dir = this.player.lookDir();

    for (let i = 0; i < 5; i++) {
      const d = dir.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18
      )).normalize().multiplyScalar(13 + Math.random() * 11);
      this.particles.spawn(muzzle, d, {
        color: [0xffdd44, 0xff9922, 0xff5511, 0x8a4411][(Math.random() * 4) | 0],
        life: 0.30 + Math.random() * 0.24,
        size: 0.22 + Math.random() * 0.32,
        grav: -0.5, drag: 0.90,
      });
    }

    m.light.color.set(0xff8833);
    m.light.intensity = 7;
    m.flash.visible = true;
    m.flash.material.color.set(0xffaa33);
    m.flash.material.opacity = 0.55;

    this.flameSfxT -= dt;
    if (this.flameSfxT <= 0) { this.flameSfxT = 0.24; this.sfx.flame(); }

    this.flameDmgT += dt;
    if (this.flameDmgT >= 0.1) {
      const tick = this.flameDmgT;
      this.flameDmgT = 0;
      this.onFlame?.(muzzle, dir, f, tick);
    }
  }

  fire() {
    const w = this.cur;
    if (!w.noAmmo) {
      if (w.mag <= 0) { this.sfx.dry(); return; }
      w.mag--;
    }
    this.cooldown = 60 / w.rpm;
    this.sfx.shot(w.sfx);

    const player = this.player;
    const m = this.models[w.id];
    const muzzle = this.muzzleWorld();

    // ---- 大锤横扫
    if (w.melee) {
      this.swing = 1;
      this.recoilOffset = 1;
      player.addRecoil(-0.02, (Math.random() - 0.5) * 0.02);
      player.shake = Math.min(1, player.shake + 0.30);
      this.onMelee?.(player.eyePos(), player.lookDir(), w.melee, w.damage);
      this.particles.coin(muzzle, this.coinTarget, 1, 2.4);
      return;
    }

    // ---- 火箭筒
    if (w.rocket) {
      const dir = player.lookDir().clone();
      const sp = w.spread * (1 - this.aimT * 0.7);
      if (sp > 0) {
        dir.x += (Math.random() - 0.5) * sp * 2;
        dir.y += (Math.random() - 0.5) * sp * 2;
        dir.z += (Math.random() - 0.5) * sp * 2;
        dir.normalize();
      }
      this.rockets.spawn(muzzle, dir, w.rocket, player);
      this.recoilOffset = Math.min(1, this.recoilOffset + 1);
      player.addRecoil(w.recoil, (Math.random() - 0.5) * w.recoil * 0.6);
      player.shake = Math.min(1.4, player.shake + 0.55);
      this.particles.muzzle(muzzle, dir);
      m.flash.visible = true;
      m.flash.material.opacity = 0.95;
      m.light.intensity = 12;
      return;
    }

    const origin = player.eyePos();
    const aimK = 1 - this.aimT * 0.7;
    const recoilScale = 1 - this.aimT * 0.25;

    let anyHit = false, anyKill = false, headshot = false, hitPoint = null;

    for (let i = 0; i < w.pellets; i++) {
      const dir = player.lookDir().clone();
      const sp = w.spread * aimK;
      if (sp > 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * sp;
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(dir, up).normalize();
        const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(realUp, Math.sin(a) * r).normalize();
      }
      const res = this._shoot(origin, dir, w);
      if (res.hitEnemy) { anyHit = true; if (res.killed) anyKill = true; if (res.head) headshot = true; hitPoint = res.point; }
      if (res.point) {
        this.tracers.add(muzzle, res.point, w.id === 'sniper' ? 0xfff0b0 : 0xffe9a0);
      }
    }

    this.recoilOffset = Math.min(1, this.recoilOffset + 1);
    player.addRecoil(w.recoil * recoilScale, (Math.random() - 0.5) * w.recoil * 0.9 * recoilScale);
    player.shake = Math.min(1, player.shake + w.recoil * 2.2);

    this.particles.muzzle(muzzle, player.lookDir());
    m.flash.visible = true;
    m.flash.material.opacity = 0.95;
    m.flash.rotation.z = Math.random() * Math.PI;
    m.light.intensity = 9;

    if (anyHit) this.onHit?.(headshot, anyKill, hitPoint);
    if (anyKill) this.sfx.kill();
  }

  _shoot(origin, dir, w) {
    const worldHit = this.world.raycast(origin, dir, w.range);
    let best = null;
    for (const e of this.getEnemies()) {
      if (e.dead) continue;
      const tBody = rayBox(origin, dir, e.bodyBox);
      const tHead = rayBox(origin, dir, e.headBox);
      let t = null, head = false;
      if (tHead !== null && (tBody === null || tHead <= tBody)) { t = tHead; head = true; }
      else if (tBody !== null) { t = tBody; }
      if (t === null) continue;
      if (worldHit && worldHit.dist < t) continue;
      if (!best || t < best.t) best = { e, t, head };
    }

    if (best) {
      const point = origin.clone().addScaledVector(dir, best.t);
      const dmg = w.damage * (best.head ? w.headMul : 1);
      const killed = best.e.damage(dmg, point, dir, best.head, this.particles);
      // 命中特效：爆金币（替代原来的血液）
      this.particles.coin(point, this.coinTarget, killed ? 5 : 2, 3.6);
      this.onDamage?.(best.e, dmg, best.head);
      if (killed) this.onKill?.(best.e, best.head);
      return { hitEnemy: true, killed, head: best.head, point, dist: best.t };
    }

    if (worldHit) {
      this.particles.impact(worldHit.point, worldHit.normal, BLOCK_COLORS[worldHit.type] ?? 0x8b8b8b);
      return { hitEnemy: false, point: worldHit.point, dist: worldHit.dist };
    }
    const far = origin.clone().addScaledVector(dir, w.range);
    return { hitEnemy: false, point: far, dist: w.range };
  }

  _updateModel(dt, input, opts) {
    const w = this.cur;
    const m = this.models[w.id];
    const player = this.player;

    // 放大瞄具：举枪时收起 3D 镜筒，避免镜筒糊满屏幕 / 穿模
    const opticDef = OPTICS[w.optic] || OPTICS.iron;
    if (opticDef.hideOnAds) m.opticGroup.visible = this.aimT < 0.55;
    else m.opticGroup.visible = true;

    // 机械瞄具：用机瞄举枪时把后照门折下去，瞄准线保持通透（前准星只留尖端）
    const ir = m.ironRear;
    if (ir) {
      const k = w.optic === 'iron' ? THREE.MathUtils.smoothstep(this.aimT, 0.30, 0.80) : 0;
      ir.scale.y = 1 - 0.88 * k;
      ir.position.y = (ir.userData.baseY ?? 0) - 0.004 * k;
    }

    this.recoilOffset = THREE.MathUtils.damp(this.recoilOffset, 0, 11, dt);

    const targetSwayX = THREE.MathUtils.clamp(-input.mouse.dx * 0.0016, -0.06, 0.06);
    const targetSwayY = THREE.MathUtils.clamp(-input.mouse.dy * 0.0016, -0.06, 0.06);
    this.swayX = THREE.MathUtils.damp(this.swayX, targetSwayX, 9, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, targetSwayY, 9, dt);

    // 行走：小幅平移晃动；疾跑：幅度更大 + 8 字形晃动
    const sp = this.aiming ? 0 : player.sprintT;
    const bobAmp = player.bobAmount * (1 + sp * 1.6);
    const bobX = Math.cos(player.bob) * 0.018 * bobAmp;
    const bobY = (Math.sin(player.bob * 2) * 0.016 + Math.abs(Math.sin(player.bob)) * 0.02 * sp) * bobAmp;

    const hip = HIP[w.id] || HIP.rifle;
    const hipX = hip[0], hipY = hip[1], hipZ = hip[2];
    const t = this.aimT;
    const a = this.adsPos;

    const px = THREE.MathUtils.lerp(hipX, a.x, t) + this.swayX * (1 - t * 0.92) + bobX * (1 - t * 0.9);
    const py = THREE.MathUtils.lerp(hipY, a.y, t) + this.swayY * (1 - t * 0.92) + bobY * (1 - t * 0.9)
      - this.recoilOffset * 0.012 - this.swapAnim * 0.34;
    const pz = THREE.MathUtils.lerp(hipZ, a.z, t) + this.recoilOffset * w.kick;

    this.root.position.set(px, py, pz);
    this.root.rotation.x = -this.recoilOffset * 0.22 + this.swapAnim * 1.1;
    this.root.rotation.y = this.swayX * 1.4 * (1 - t * 0.9) + this.swapAnim * 0.4;
    this.root.rotation.z = this.swapAnim * 0.6 + this.swayX * 0.6 * (1 - t * 0.9);

    if (this.reloading) {
      const k = 1 - this.reloadTimer / w.reloadTime;
      const curve = Math.sin(Math.min(1, k) * Math.PI);
      this.root.rotation.x += curve * 0.85;
      this.root.position.y -= curve * 0.18;
      this.root.rotation.z += curve * 0.5;
    }

    // 阵亡：枪垂下
    if (opts.frozen) {
      this.root.position.y -= 0.5;
      this.root.position.z += 0.1;
      this.root.rotation.x += 0.55;
      this.root.rotation.z += 0.35;
    }

    // 近战挥击动作
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 3.4);
      const sw = this.swing;
      const ease = sw * sw;
      this.root.rotation.x -= ease * 1.7;
      this.root.rotation.z += ease * 1.25;
      this.root.position.z += ease * 0.30;
      this.root.position.y += ease * 0.16;
    }

    // 疾跑姿态：枪口斜向下压、枪身内收，随 sprintT 平滑过渡。
    // 之前是对每帧重算出来的 rotation 做 damp，结果每帧只挪 ~10%，姿态几乎看不出来。
    if (sp > 0.001) {
      const ease = sp * sp * (3 - 2 * sp);
      this.root.rotation.z += 0.78 * ease;
      this.root.rotation.y += -0.46 * ease;
      this.root.rotation.x += -0.30 * ease;
      this.root.position.x += -0.06 * ease;
      this.root.position.y += -0.07 * ease;
      this.root.position.z += 0.05 * ease;
      // 疾跑时跟着步伐前后甩
      this.root.rotation.x += Math.sin(player.bob) * 0.06 * ease * player.bobAmount;
    }

    if (m.flash.visible) {
      m.flash.material.opacity -= dt * 22;
      m.light.intensity -= dt * 180;
      if (m.flash.material.opacity <= 0) { m.flash.visible = false; m.light.intensity = 0; }
    }
  }

  refill(ratio = 0.4) {
    for (const w of this.slots) {
      if (!w) continue;
      if (w.reserve === Infinity) { w.mag = w.magSize; continue; }
      w.reserve = Math.min(w.reserveMax, w.reserve + Math.ceil(w.reserveMax * ratio));
    }
  }
}
