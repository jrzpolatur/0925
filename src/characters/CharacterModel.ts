import * as THREE from 'three';
import { MeshBuilder } from '../map/VoxelBuilder';
import type { BuildId } from '../core/Types';
import type { Character } from './Character';
import { buildWeaponModel, type WeaponModel } from '../weapons/WeaponModels';
import { damp } from '../core/Utils';

/** 各体型的视觉比例：Light 最矮最瘦，Heavy 最高最宽 */
export const BUILD_VIS: Record<BuildId, { scale: number; width: number }> = {
  light: { scale: 0.90, width: 0.84 },
  medium: { scale: 1.00, width: 1.00 },
  heavy: { scale: 1.12, width: 1.24 },
};

const SKIN = 0xe0b087;
const SKIN_DARK = 0xb98a63;

/**
 * Minecraft / Pixel Gun 3D 风格体素角色：
 * Head / Torso / ArmL / ArmR / LegL / LegR 六个部件（各自可独立做动画），
 * 每个部件内部用多个 Box 合并，保留像素块细节但只有 6 个 Draw Call。
 */
export class CharacterModel {
  root = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  weaponMount = new THREE.Object3D();

  /** 角色专属材质（克隆出来，便于单独做隐身透明度） */
  private material: THREE.MeshLambertMaterial;
  private weaponModel: WeaponModel | null = null;
  private weaponId = '';

  private phase = 0;
  private lean = 0;
  private adsPose = 0;
  private sprintPose = 0;
  private firePose = 0;
  private deadT = -1;
  private cloakT = 0;
  private baseTorsoY = 0;
  private aliveScale = 1;

  build: BuildId;

  constructor(build: BuildId, teamColor: number) {
    this.build = build;
    const vis = BUILD_VIS[build];
    const s = vis.scale;
    const w = vis.width;

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });

    // ---- 尺寸（以 Medium 为基准） ----
    const legLen = 0.78 * s;
    const legW = 0.19 * w, legD = 0.21 * w;
    const torsoH = 0.62 * s;
    const torsoW = 0.52 * w, torsoD = 0.30 * w;
    const headS = 0.35 * s;
    const armLen = 0.66 * s;
    const armW = 0.155 * w, armD = 0.17 * w;

    const hipY = legLen;
    const neckY = hipY + torsoH;
    const shoulderY = torsoH - 0.06 * s;

    // ---- 腿（pivot 在髋部） ----
    const legBuilderL = new MeshBuilder();
    legBuilderL.addBox(0, -legLen / 2, 0, legW, legLen, legD, 0x3a4450);
    legBuilderL.addBox(0, -legLen + 0.06 * s, 0.02, legW * 1.06, 0.12 * s, legD * 1.25, 0x22272e); // 靴
    const legMeshL = legBuilderL.build(this.material)!;
    this.legL.add(legMeshL);
    this.legL.position.set(legW * 0.62, hipY, 0);

    const legBuilderR = new MeshBuilder();
    legBuilderR.addBox(0, -legLen / 2, 0, legW, legLen, legD, 0x3a4450);
    legBuilderR.addBox(0, -legLen + 0.06 * s, 0.02, legW * 1.06, 0.12 * s, legD * 1.25, 0x22272e);
    const legMeshR = legBuilderR.build(this.material)!;
    this.legR.add(legMeshR);
    this.legR.position.set(-legW * 0.62, hipY, 0);

    // ---- 躯干（pivot 在腰） ----
    const tb = new MeshBuilder();
    tb.addBox(0, torsoH / 2, 0, torsoW, torsoH, torsoD, 0x4d5766);            // 主体
    tb.addBox(0, torsoH * 0.72, 0, torsoW * 1.04, torsoH * 0.2, torsoD * 1.05, teamColor); // 队伍色胸带
    tb.addBox(0, torsoH * 0.3, 0, torsoW * 1.02, torsoH * 0.12, torsoD * 1.03, 0x2b313a);  // 腰带
    tb.addBox(torsoW * 0.42, torsoH * 0.82, 0, torsoW * 0.3, torsoH * 0.22, torsoD * 1.1, teamColor); // 肩甲
    tb.addBox(-torsoW * 0.42, torsoH * 0.82, 0, torsoW * 0.3, torsoH * 0.22, torsoD * 1.1, teamColor);
    tb.addBox(0, torsoH * 0.5, -torsoD * 0.6, torsoW * 0.5, torsoH * 0.34, torsoD * 0.25, 0x2b313a); // 背包
    if (build === 'heavy') {
      tb.addBox(0, torsoH * 0.55, -torsoD * 0.75, torsoW * 0.62, torsoH * 0.42, torsoD * 0.35, 0x6b5030); // 重型弹药箱
    }
    const torsoMesh = tb.build(this.material)!;
    this.torso.add(torsoMesh);
    this.torso.position.set(0, hipY, 0);
    this.baseTorsoY = hipY;

    // ---- 头（pivot 在颈） ----
    const hb = new MeshBuilder();
    hb.addBox(0, headS / 2, 0, headS, headS, headS, SKIN);
    hb.addBox(0, headS * 0.92, 0, headS * 1.04, headS * 0.24, headS * 1.04, teamColor); // 头盔
    hb.addBox(0, headS * 0.62, -headS * 0.52, headS * 0.8, headS * 0.18, headS * 0.08, 0x15181c); // 面罩
    hb.addBox(headS * 0.2, headS * 0.62, -headS * 0.55, headS * 0.18, headS * 0.1, headS * 0.06, 0x8fe8ff); // 目镜光
    hb.addBox(-headS * 0.2, headS * 0.62, -headS * 0.55, headS * 0.18, headS * 0.1, headS * 0.06, 0x8fe8ff);
    const headMesh = hb.build(this.material)!;
    this.head.add(headMesh);
    this.head.position.set(0, neckY, 0);

    // ---- 手臂（pivot 在肩） ----
    const armBuilder = (side: number) => {
      const ab = new MeshBuilder();
      ab.addBox(0, -armLen / 2, 0, armW, armLen, armD, 0x4d5766);
      ab.addBox(0, -armLen + 0.05 * s, 0, armW * 1.05, 0.14 * s, armD * 1.05, SKIN_DARK); // 手
      ab.addBox(0, -0.02 * s, 0, armW * 1.12, 0.16 * s, armD * 1.12, teamColor);          // 肩章
      return ab.build(this.material)!;
    };
    this.armL.add(armBuilder(1));
    this.armR.add(armBuilder(-1));
    this.armL.position.set(torsoW * 0.5 + armW * 0.4, shoulderY, 0);
    this.armR.position.set(-(torsoW * 0.5 + armW * 0.4), shoulderY, 0);

    // 枪挂在右手末端
    this.weaponMount.position.set(0, -armLen + 0.05 * s, -0.04);
    this.armR.add(this.weaponMount);

    this.torso.add(this.head);
    this.torso.add(this.armL);
    this.torso.add(this.armR);
    this.root.add(this.torso);
    this.root.add(this.legL);
    this.root.add(this.legR);

    // 默认持枪姿势：手臂前伸
    this.armR.rotation.x = 1.32;
    this.armL.rotation.x = 1.15;
    this.armL.rotation.z = 0.32;
  }

  /** 切换武器模型（只在 weaponId 变化时重建，避免频繁 new） */
  setWeapon(id: string): void {
    if (this.weaponId === id) return;
    this.weaponId = id;
    if (this.weaponModel) {
      this.weaponMount.remove(this.weaponModel.root);
      this.weaponModel = null;
    }
    const wm = buildWeaponModel(id);
    wm.root.scale.setScalar(0.92);
    this.weaponMount.add(wm.root);
    this.weaponModel = wm;
  }

  /** 死亡：0.5s 内倒地 */
  setDead(): void {
    if (this.deadT < 0) this.deadT = 0;
  }

  setAlive(): void {
    this.deadT = -1;
    this.aliveScale = 1;
    this.root.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** 隐身（匿踪炸弹）：0=可见 1=完全透明 */
  setCloak(v: number): void {
    this.cloakT = v;
  }

  /** 当前是否有武器模型（用于枪焰定位） */
  getWeaponMuzzle(out: THREE.Vector3): boolean {
    if (!this.weaponModel) return false;
    this.weaponModel.muzzle.getWorldPosition(out);
    return true;
  }

  onFire(): void {
    this.firePose = 1;
  }

  update(dt: number, char: Character): void {
    const vis = BUILD_VIS[this.build];
    const speed = Math.hypot(char.vel.x, char.vel.z);
    const moving = speed > 0.5 && char.grounded;

    if (this.deadT >= 0) {
      // 倒地动画
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.45);
      this.root.rotation.z = t * Math.PI * 0.48 * (char.deathDir >= 0 ? 1 : -1);
      this.torso.rotation.x = t * 0.25;
      this.root.position.y = char.pos.y;
      this.root.scale.setScalar(vis.scale * (1 - 0.06 * t));
      return;
    }

    // ---- 位置 / 朝向 ----
    this.root.position.set(char.pos.x, char.pos.y, char.pos.z);
    this.root.rotation.y = char.yaw;
    this.root.scale.setScalar(vis.scale * this.aliveScale);

    // ---- 行走循环 ----
    this.phase += dt * (moving ? 5.5 + speed * 1.15 : 1.6);
    const amp = moving ? Math.min(1, speed / 5.5) : 0;
    const s = Math.sin(this.phase) * 0.72 * amp;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;

    // ---- 姿态混合 ----
    this.sprintPose = damp(this.sprintPose, char.sprinting && moving ? 1 : 0, 9, dt);
    this.adsPose = damp(this.adsPose, char.ads, 14, dt);
    this.firePose = damp(this.firePose, 0, 11, dt);

    const swingL = -s * 0.55 * (1 - this.adsPose) * (1 - this.sprintPose * 0.6);
    const swingR = s * 0.35 * (1 - this.adsPose) * (1 - this.sprintPose * 0.6);

    // 基础持枪：手臂前伸；ADS 时更贴近视线；冲刺时收枪
    const baseR = 1.32 - this.sprintPose * 0.72;
    const baseL = 1.15 - this.sprintPose * 0.55 + this.adsPose * 0.28;
    this.armR.rotation.x = baseR + swingR - this.firePose * 0.18 + this.adsPose * 0.16;
    this.armL.rotation.x = baseL + swingL - this.firePose * 0.10 + this.adsPose * 0.20;
    this.armR.rotation.z = this.adsPose * 0.30 - this.sprintPose * 0.2;
    this.armL.rotation.z = 0.32 - this.adsPose * 0.26 + this.sprintPose * 0.18;

    // ---- 躯干倾斜 / 呼吸 ----
    this.lean = damp(this.lean, char.sprinting && moving ? 0.20 : 0, 8, dt);
    this.torso.rotation.x = this.lean + this.firePose * 0.08;
    this.torso.position.y = this.baseTorsoY + (moving ? Math.abs(Math.sin(this.phase)) * 0.035 * amp : Math.sin(this.phase * 0.6) * 0.008);

    // ---- 头部随俯仰 ----
    this.head.rotation.x = char.pitch * 0.55;
    this.head.rotation.y = this.adsPose * 0.05;

    // ---- 腾空姿势 ----
    if (!char.grounded) {
      this.legL.rotation.x = 0.35;
      this.legR.rotation.x = -0.2;
    }

    // ---- 隐身透明 ----
    if (this.cloakT > 0.001) {
      this.material.opacity = 1 - 0.86 * this.cloakT;
      this.material.transparent = true;
      if (this.weaponModel) {
        this.weaponModel.root.visible = this.cloakT < 0.6;
      }
    } else if (this.material.opacity !== 1) {
      this.material.opacity = 1;
      if (this.weaponModel) this.weaponModel.root.visible = true;
    }
  }

  dispose(): void {
    this.root.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.material.dispose();
  }
}
