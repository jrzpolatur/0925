import * as THREE from 'three';
import { MeshBuilder, VOXEL_MATERIAL } from '../map/VoxelBuilder';

/**
 * 体素枪械模型库。
 * 每把枪由「枪身 / 枪管 / 弹匣 / 瞄准具 / 枪托 / 发光细节」等多个 Box 组成，
 * 全部走 Minecraft 风格的方块化建模（不使用写实模型 / 不靠贴图代替结构）。
 */

export interface WeaponModel {
  root: THREE.Group;
  /** 枪口定位点（用于枪焰 / 曳光起点） */
  muzzle: THREE.Object3D;
  /** 弹匣（换弹动画可独立位移） */
  mag: THREE.Object3D | null;
  /** 发光部件（电击枪 / 瞄具） */
  glow: THREE.Mesh | null;
}

const C = {
  metal: 0x555c66,
  dark: 0x2c3138,
  black: 0x191c21,
  wood: 0x7c5230,
  woodDark: 0x5d3c22,
  accent: 0xffa23a,
  olive: 0x5d6340,
  cyan: 0x6fdcff,
  gold: 0xd9b451,
  red: 0xd8443c,
};

const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

interface PartSpec { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number; }

function buildParts(parts: PartSpec[], glowParts: PartSpec[]): { body: THREE.Mesh | null; glow: THREE.Mesh | null } {
  const b = new MeshBuilder();
  for (const p of parts) b.addBox(p.x, p.y, p.z, p.sx, p.sy, p.sz, p.c, 0.05);
  const g = new MeshBuilder();
  for (const p of glowParts) g.addBox(p.x, p.y, p.z, p.sx, p.sy, p.sz, p.c, 0.0);
  return { body: b.build(VOXEL_MATERIAL), glow: g.count ? g.build(GLOW_MAT) : null };
}

function assemble(parts: PartSpec[], glowParts: PartSpec[], muzzleZ: number, magSpec?: PartSpec): WeaponModel {
  const root = new THREE.Group();
  const { body, glow } = buildParts(parts, glowParts);
  if (body) root.add(body);
  if (glow) root.add(glow);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, muzzleZ);
  root.add(muzzle);

  let mag: THREE.Object3D | null = null;
  if (magSpec) {
    const mb = new MeshBuilder();
    mb.addBox(0, 0, 0, magSpec.sx, magSpec.sy, magSpec.sz, magSpec.c, 0.05);
    const mm = mb.build(VOXEL_MATERIAL);
    if (mm) {
      mag = new THREE.Object3D();
      mag.add(mm);
      mag.position.set(magSpec.x, magSpec.y, magSpec.z);
      root.add(mag);
    }
  }
  return { root, muzzle, mag, glow };
}

/** XP-54：轻型冲锋枪（紧凑、高频） */
function buildXP54(): WeaponModel {
  return assemble([
    { x: 0, y: 0, z: -0.08, sx: 0.075, sy: 0.085, sz: 0.30, c: C.metal },      // 机匣
    { x: 0, y: 0.055, z: -0.08, sx: 0.062, sy: 0.022, sz: 0.26, c: C.dark },    // 顶部导轨
    { x: 0, y: 0.010, z: -0.30, sx: 0.042, sy: 0.042, sz: 0.24, c: C.black },    // 枪管
    { x: 0, y: 0.010, z: -0.44, sx: 0.058, sy: 0.058, sz: 0.07, c: C.dark },     // 枪口消焰器
    { x: 0, y: -0.012, z: -0.24, sx: 0.062, sy: 0.058, sz: 0.14, c: C.dark },    // 护木
    { x: 0, y: -0.095, z: 0.025, sx: 0.055, sy: 0.135, sz: 0.062, c: C.black },  // 握把
    { x: 0, y: 0.082, z: -0.16, sx: 0.030, sy: 0.032, sz: 0.05, c: C.dark },     // 准星柱
    { x: 0, y: 0.082, z: 0.01, sx: 0.034, sy: 0.030, sz: 0.05, c: C.dark },      // 照门
    { x: 0, y: -0.005, z: 0.15, sx: 0.048, sy: 0.07, sz: 0.16, c: C.dark },      // 折叠枪托
    { x: 0.042, y: -0.02, z: -0.06, sx: 0.012, sy: 0.03, sz: 0.10, c: C.accent },// 侧面装饰
  ], [
    { x: 0, y: 0.076, z: -0.16, sx: 0.014, sy: 0.008, sz: 0.008, c: C.cyan },
  ], -0.50, { x: 0, y: -0.115, z: -0.11, sx: 0.052, sy: 0.16, sz: 0.068, c: C.black });
}

/** AKM：中型突击步枪（长枪管 + 木托 + 弧形弹匣） */
function buildAKM(): WeaponModel {
  return assemble([
    { x: 0, y: 0, z: -0.06, sx: 0.080, sy: 0.090, sz: 0.34, c: C.metal },       // 机匣
    { x: 0, y: 0.058, z: -0.06, sx: 0.066, sy: 0.028, sz: 0.30, c: C.dark },     // 防尘盖
    { x: 0, y: 0.045, z: -0.30, sx: 0.028, sy: 0.028, sz: 0.20, c: C.dark },     // 导气管
    { x: 0, y: 0.008, z: -0.40, sx: 0.040, sy: 0.040, sz: 0.36, c: C.black },    // 枪管
    { x: 0, y: -0.008, z: -0.28, sx: 0.078, sy: 0.078, sz: 0.22, c: C.wood },    // 木护木
    { x: 0, y: 0.008, z: -0.58, sx: 0.052, sy: 0.052, sz: 0.06, c: C.dark },     // 枪口
    { x: 0, y: 0.070, z: -0.56, sx: 0.028, sy: 0.055, sz: 0.03, c: C.dark },     // 准星
    { x: 0, y: 0.075, z: -0.16, sx: 0.030, sy: 0.030, sz: 0.06, c: C.dark },     // 照门
    { x: 0, y: -0.100, z: 0.04, sx: 0.055, sy: 0.140, sz: 0.062, c: C.woodDark },// 握把
    { x: 0, y: -0.010, z: 0.24, sx: 0.062, sy: 0.085, sz: 0.26, c: C.wood },     // 木枪托
    { x: 0, y: 0.040, z: 0.36, sx: 0.062, sy: 0.030, sz: 0.05, c: C.woodDark },  // 托底板
    { x: 0, y: -0.045, z: 0.16, sx: 0.030, sy: 0.055, sz: 0.05, c: C.dark },     // 扳机护圈
  ], [], -0.62, { x: 0, y: -0.130, z: -0.10, sx: 0.058, sy: 0.19, sz: 0.08, c: C.dark });
}

/** SA1216：重型半自动霰弹枪（粗壮、大弹鼓） */
function buildSA1216(): WeaponModel {
  return assemble([
    { x: 0, y: 0, z: -0.04, sx: 0.100, sy: 0.110, sz: 0.32, c: C.metal },       // 机匣
    { x: 0, y: 0.070, z: -0.04, sx: 0.080, sy: 0.024, sz: 0.28, c: C.dark },     // 顶部
    { x: 0, y: 0.012, z: -0.34, sx: 0.052, sy: 0.052, sz: 0.34, c: C.black },    // 枪管
    { x: 0, y: 0.012, z: -0.52, sx: 0.062, sy: 0.062, sz: 0.05, c: C.dark },     // 枪口
    { x: 0, y: -0.058, z: -0.28, sx: 0.075, sy: 0.050, sz: 0.14, c: C.dark },    // 泵动前握
    { x: 0, y: -0.105, z: 0.10, sx: 0.060, sy: 0.140, sz: 0.065, c: C.black },   // 握把
    { x: 0, y: 0.005, z: 0.24, sx: 0.070, sy: 0.095, sz: 0.20, c: C.dark },      // 枪托
    { x: 0, y: 0.090, z: -0.20, sx: 0.026, sy: 0.026, sz: 0.04, c: C.dark },     // 准星
    { x: 0.055, y: 0.01, z: -0.10, sx: 0.010, sy: 0.045, sz: 0.12, c: C.accent },// 侧面警示条
    { x: -0.055, y: 0.01, z: -0.10, sx: 0.010, sy: 0.045, sz: 0.12, c: C.accent },
  ], [], -0.56, { x: 0, y: -0.115, z: 0.00, sx: 0.110, sy: 0.090, sz: 0.115, c: C.dark });
}

/** RPG-7：重型火箭筒 */
function buildRPG7(): WeaponModel {
  return assemble([
    { x: 0, y: 0, z: -0.20, sx: 0.105, sy: 0.105, sz: 0.92, c: C.olive },        // 发射筒
    { x: 0, y: 0, z: 0.31, sx: 0.132, sy: 0.132, sz: 0.16, c: C.dark },          // 尾部喇叭
    { x: 0, y: 0, z: -0.74, sx: 0.150, sy: 0.150, sz: 0.26, c: C.olive },        // 弹头
    { x: 0, y: 0, z: -0.89, sx: 0.080, sy: 0.080, sz: 0.07, c: C.accent },       // 弹头尖
    { x: 0, y: -0.115, z: -0.02, sx: 0.058, sy: 0.145, sz: 0.065, c: C.black },  // 握把
    { x: 0, y: -0.115, z: -0.28, sx: 0.058, sy: 0.120, sz: 0.06, c: C.black },   // 前握把
    { x: 0, y: 0.085, z: -0.34, sx: 0.045, sy: 0.055, sz: 0.12, c: C.dark },     // 光学瞄具
    { x: 0, y: 0.075, z: -0.05, sx: 0.020, sy: 0.028, sz: 0.05, c: C.dark },     // 表尺
    { x: 0.058, y: 0.02, z: -0.45, sx: 0.012, sy: 0.05, sz: 0.30, c: C.dark },   // 筒身挂带
  ], [
    { x: 0, y: 0.085, z: -0.34, sx: 0.030, sy: 0.012, sz: 0.012, c: C.red },
  ], -0.94, null);
}

/** 电击枪：轻型特殊装备 */
function buildStunGun(): WeaponModel {
  return assemble([
    { x: 0, y: 0, z: -0.06, sx: 0.070, sy: 0.085, sz: 0.22, c: C.metal },        // 机身
    { x: 0, y: 0.010, z: -0.24, sx: 0.038, sy: 0.038, sz: 0.14, c: C.dark },     // 前段
    { x: 0.035, y: 0.010, z: -0.33, sx: 0.016, sy: 0.016, sz: 0.09, c: C.gold }, // 电极 A
    { x: -0.035, y: 0.010, z: -0.33, sx: 0.016, sy: 0.016, sz: 0.09, c: C.gold },// 电极 B
    { x: 0, y: -0.100, z: 0.03, sx: 0.052, sy: 0.135, sz: 0.060, c: C.black },   // 握把
    { x: 0, y: 0.058, z: -0.10, sx: 0.026, sy: 0.024, sz: 0.05, c: C.dark },     // 瞄具
    { x: 0, y: -0.045, z: 0.10, sx: 0.028, sy: 0.05, sz: 0.045, c: C.dark },     // 扳机护圈
  ], [
    { x: 0, y: 0.055, z: -0.06, sx: 0.042, sy: 0.030, sz: 0.09, c: C.cyan },     // 高压线圈
    { x: 0.035, y: 0.010, z: -0.38, sx: 0.020, sy: 0.020, sz: 0.02, c: C.cyan }, // 电弧端点
    { x: -0.035, y: 0.010, z: -0.38, sx: 0.020, sy: 0.020, sz: 0.02, c: C.cyan },
  ], -0.40, null);
}

const BUILDERS: Record<string, () => WeaponModel> = {
  xp54: buildXP54,
  akm: buildAKM,
  sa1216: buildSA1216,
  rpg7: buildRPG7,
  stungun: buildStunGun,
};

export function buildWeaponModel(id: string): WeaponModel {
  const b = BUILDERS[id] || buildAKM;
  return b();
}

/** 第一人称视图模型：枪 + 体素双手（Minecraft 风格方块手臂） */
export function buildViewmodel(id: string, teamColor: number): THREE.Group {
  const g = new THREE.Group();
  const wm = buildWeaponModel(id);
  wm.root.name = 'gun';
  g.add(wm.root);

  const armMat = new THREE.MeshLambertMaterial({ color: teamColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b98a });

  // 右手（握把）
  const rArm = new THREE.Group();
  const rUpper = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.16), armMat);
  rUpper.position.set(0, -0.03, 0.05);
  rArm.add(rUpper);
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), skinMat);
  rHand.position.set(0, -0.075, -0.01);
  rArm.add(rHand);
  rArm.position.set(0.01, -0.085, 0.055);
  g.add(rArm);

  // 左手（护木）
  const lArm = new THREE.Group();
  const lUpper = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.18), armMat);
  lUpper.position.set(0, 0, 0.09);
  lArm.add(lUpper);
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), skinMat);
  lHand.position.set(0, 0, -0.01);
  lArm.add(lHand);
  lArm.position.set(-0.02, -0.075, -0.22);
  lArm.rotation.y = -0.18;
  g.add(lArm);

  (g as any).userData.wm = wm;
  (g as any).userData.rightArm = rArm;
  (g as any).userData.leftArm = lArm;
  return g;
}
