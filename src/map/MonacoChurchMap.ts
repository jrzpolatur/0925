import * as THREE from 'three';
import { MeshBuilder, VOXEL_MATERIAL } from './VoxelBuilder';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { DestructionSystem } from '../destruction/DestructionSystem';
import { Rng } from '../core/Utils';

export const PALETTE = {
  road: 0x4a5058,
  roadLine: 0xd8cf9a,
  sidewalk: 0x8d8878,
  plaza: 0xa89c84,
  plazaAlt: 0x9a8f78,
  church: 0xded2b6,
  churchStone: 0xb9ad92,
  churchDark: 0x9d917a,
  roof: 0xa8503c,
  roofDark: 0x8a4130,
  wallA: 0xe2d5ba,
  wallB: 0xd8bb92,
  wallC: 0xc9a978,
  wallD: 0xe9dec4,
  wood: 0x7c5230,
  woodDark: 0x5e3d22,
  glass: 0x92d2ea,
  metal: 0x6a7078,
  grass: 0x5f8a4a,
  water: 0x3f8fbf,
  gold: 0xd8b451,
  green: 0x4f7a44,
  red: 0xa8402f,
};

export interface SpawnPoint { x: number; y: number; z: number; yaw: number; }

export interface MapData {
  spawns: { 0: SpawnPoint[]; 1: SpawnPoint[] };
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  objectives: THREE.Vector3[];
}

/**
 * 摩纳哥 · 教堂周边战区
 * 地中海城市 / 狭窄街道 / 广场 / 台阶 / 教堂主体 / 周边建筑群 / 屋顶 / 掩体
 *
 * 建造原则：
 *  - 静态几何用 MeshBuilder 合并，只有极少 Draw Call
 *  - 凡标为 destructible 的构件只生成体素结构（不生成静态碰撞盒），
 *    这样炸掉之后碰撞同步消失，玩家可以真正穿过去
 */
export class MonacoChurchMap {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private destruction: DestructionSystem;
  private mb = new MeshBuilder();
  private rng = new Rng(20240925);

  constructor(scene: THREE.Scene, physics: PhysicsWorld, destruction: DestructionSystem) {
    this.scene = scene;
    this.physics = physics;
    this.destruction = destruction;
  }

  // ------------------------------------------------------------ 基础工具
  /** 实体方块（有碰撞） */
  private solid(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, collide = true): void {
    this.mb.addBox(cx, cy, cz, sx, sy, sz, color);
    if (collide) this.physics.addBoxC(cx, cy, cz, sx, sy, sz);
  }

  /** 纯装饰（无碰撞） */
  private deco(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, jitter = 0.07): void {
    this.mb.addBox(cx, cy, cz, sx, sy, sz, color, jitter);
  }

  /** 可破坏体素结构（不生成静态碰撞盒，碰撞由体素单元提供） */
  private destructible(
    cx: number, cy: number, cz: number, sx: number, sy: number, sz: number,
    color: number, hp: number, kind: string, cell = 0.55,
  ): void {
    this.destruction.addStructure({
      center: new THREE.Vector3(cx, cy, cz),
      size: new THREE.Vector3(sx, sy, sz),
      cell, color, hp, kind,
      debrisColor: color,
    });
  }

  /**
   * 带矩形洞口的墙（用四段方块拼出洞口，洞口本身不放方块）。
   * holeX / holeY 为洞口中心相对墙中心的偏移。
   */
  private wallWithHole(
    cx: number, cy: number, cz: number,
    w: number, h: number, t: number,
    holeX: number, holeW: number, holeY: number, holeH: number,
    color: number, axis: 'x' | 'z',
  ): void {
    const put = (ox: number, oy: number, sx: number, sy: number) => {
      if (sx <= 0.05 || sy <= 0.05) return;
      if (axis === 'z') this.solid(cx + ox, cy + oy, cz, sx, sy, t, color);
      else this.solid(cx, cy + oy, cz + ox, t, sy, sx, color);
    };
    // 左段
    const leftW = (holeX - holeW / 2) + w / 2;
    if (leftW > 0.05) put((-w / 2 + (holeX - holeW / 2)) / 2, 0, leftW, h);
    // 右段
    const rightW = w / 2 - (holeX + holeW / 2);
    if (rightW > 0.05) put(((holeX + holeW / 2) + w / 2) / 2, 0, rightW, h);
    // 上段
    const topH = h / 2 - (holeY + holeH / 2);
    if (topH > 0.05) put(holeX, (holeY + holeH / 2 + h / 2) / 2, holeW, topH);
    // 下段（窗台）
    const botH = (holeY - holeH / 2) + h / 2;
    if (botH > 0.05) put(holeX, (-h / 2 + (holeY - holeH / 2)) / 2, holeW, botH);
  }

  /** 体素坡屋顶（阶梯近似） */
  private roof(x: number, z: number, w: number, d: number, baseY: number, peakY: number, color: number, axis: 'x' | 'z'): void {
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const h = (peakY - baseY) * (1 - Math.abs(t - 0.5) * 2);
      const hh = Math.max(0.35, h);
      if (axis === 'x') {
        const ox = (t - 0.5) * w;
        this.solid(x + ox, baseY + hh / 2, z, w / steps + 0.02, hh, d, i % 2 ? color : PALETTE.roofDark);
      } else {
        const oz = (t - 0.5) * d;
        this.solid(x, baseY + hh / 2, z + oz, w, hh, d / steps + 0.02, i % 2 ? color : PALETTE.roofDark);
      }
    }
  }

  // ------------------------------------------------------------ 建造
  build(): MapData {
    this.buildGround();
    this.buildChurch();
    this.buildPlaza();
    this.buildStreets();
    this.buildBuildingRow(-46, -30, 44, PALETTE.wallA, 'w');
    this.buildBuildingRow(46, -30, 44, PALETTE.wallB, 'e');
    this.buildNorthBlock();
    this.buildSouthBlock();
    this.buildProps();

    const mesh = this.mb.build(VOXEL_MATERIAL);
    if (mesh) this.scene.add(mesh);

    return {
      spawns: {
        0: [
          { x: -14, y: 0.2, z: 46, yaw: Math.PI },
          { x: -3, y: 0.2, z: 49, yaw: Math.PI },
          { x: 11, y: 0.2, z: 46, yaw: Math.PI },
          { x: -23, y: 0.2, z: 41, yaw: Math.PI * 0.9 },
          { x: 21, y: 0.2, z: 41, yaw: Math.PI * 1.1 },
        ],
        1: [
          { x: -24, y: 0.2, z: -38, yaw: 0 },
          { x: -8, y: 0.2, z: -41, yaw: 0 },
          { x: 8, y: 0.2, z: -41, yaw: 0 },
          { x: 24, y: 0.2, z: -38, yaw: 0 },
          { x: 0, y: 0.2, z: -35, yaw: 0 },
        ],
      },
      bounds: { minX: -72, minZ: -72, maxX: 72, maxZ: 72 },
      objectives: [
        new THREE.Vector3(0, 0, 18),   // 广场
        new THREE.Vector3(0, 0, -14),  // 教堂
        new THREE.Vector3(-38, 0, 6),  // 西街
        new THREE.Vector3(38, 0, 6),   // 东街
      ],
    };
  }

  // ------------------------------------------------------------ 地面
  private buildGround(): void {
    // 大地基
    this.solid(0, -1, 0, 160, 2, 160, PALETTE.road, true);
    // 地中海海面（远景）
    this.deco(0, -1.2, 105, 200, 1.6, 60, PALETTE.water, 0.03);
  }

  // ------------------------------------------------------------ 教堂
  private buildChurch(): void {
    const cx = 0, cz = -14;
    const w = 20, d = 34;
    const wallH = 13;

    // 台基 + 前广场台阶
    this.solid(cx, 0.15, cz + 18, 26, 0.3, 6, PALETTE.churchStone);
    for (let i = 0; i < 5; i++) {
      this.solid(cx, 0.15 + (i + 1) * 0.25, cz + 20.2 + i * 0.9, 22 - i * 0.6, 0.25, 0.9, PALETTE.churchStone);
    }

    // 地面（教堂内部）
    this.solid(cx, 0.16, cz, w - 1, 0.3, d - 1, PALETTE.plazaAlt);

    // 侧墙（实体 + 可破坏的拱窗）
    for (const side of [-1, 1]) {
      const x = cx + side * (w / 2);
      // 下半实心
      this.solid(x, 3.0, cz, 1.2, 6, d, PALETTE.church);
      // 上半带窗洞
      for (let k = 0; k < 4; k++) {
        const z = cz - 12 + k * 8;
        this.wallWithHole(x, 9.5, z, d / 4, 7, 1.2, 0, 3.0, 0.4, 4.2, PALETTE.church, 'z');
        // 彩色玻璃窗（可破坏）
        this.destructible(x, 9.8, z, 1.0, 4.2, 3.0, PALETTE.glass, 18, 'glass', 0.45);
      }
      // 上部实体
      this.solid(x, 13.2, cz, 1.2, 0.8, d, PALETTE.churchStone);
    }

    // 后墙（部分可破坏：RPG 可以轰开新入口）
    this.solid(cx, 3.0, cz - d / 2, w, 6, 1.2, PALETTE.church);
    this.destructible(cx - w / 4, 3.0, cz - d / 2, w / 2 - 1, 6, 1.2, PALETTE.church, 70, 'wall');
    this.solid(cx + w / 4 - 0.5, 3.0, cz - d / 2, w / 2 - 1, 6, 1.2, PALETTE.church);
    this.solid(cx, 9.5, cz - d / 2, w, 7, 1.2, PALETTE.church);
    // 后墙圆窗
    this.deco(cx, 11.5, cz - d / 2 - 0.1, 4.2, 4.2, 0.3, PALETTE.glass, 0.02);

    // 正面（面向广场）：大门 + 两侧可破坏墙段
    const fz = cz + d / 2;
    this.solid(cx, 9.5, fz, w, 7, 1.4, PALETTE.churchStone);
    this.solid(cx - 7.5, 3.0, fz, 5, 6, 1.4, PALETTE.churchStone);
    this.solid(cx + 7.5, 3.0, fz, 5, 6, 1.4, PALETTE.churchStone);
    // 大门（木质，可破坏）
    this.destructible(cx, 2.6, fz, 5.5, 5.2, 0.7, PALETTE.wood, 46, 'wood', 0.5);
    // 拱形门楣
    for (let r = 0; r < 4; r++) {
      const t = r / 4;
      const ww = 5.5 - Math.sin(t * Math.PI * 0.5) * 2.2;
      this.deco(cx, 5.4 + r * 0.45, fz - 0.1, ww, 0.5, 0.9, PALETTE.churchStone, 0.03);
    }

    // 内部列柱 + 祭坛
    for (let k = -1; k <= 1; k++) {
      for (const side of [-1, 1]) {
        this.solid(cx + side * 6.5, 4, cz + k * 10, 1.4, 8, 1.4, PALETTE.churchStone);
        this.deco(cx + side * 6.5, 8.3, cz + k * 10, 1.8, 0.5, 1.8, PALETTE.churchStone, 0.03);
      }
    }
    this.solid(cx, 0.9, cz - 13, 7, 1.6, 2.4, PALETTE.gold);
    this.deco(cx, 2.4, cz - 13.6, 1.2, 2.6, 0.3, PALETTE.gold, 0.02);
    this.deco(cx, 3.2, cz - 13.6, 2.6, 0.5, 0.3, PALETTE.gold, 0.02);

    // 屋顶
    this.roof(cx, cz, w + 1.2, d + 1.2, 13.6, 20.5, PALETTE.roof, 'x');

    // 钟楼
    const tx = cx - 12, tz = cz + 12;
    this.solid(tx, 11, tz, 7, 22, 7, PALETTE.churchStone);
    this.solid(tx, 22.6, tz, 8, 1.2, 8, PALETTE.churchDark);
    // 钟（装饰）
    this.deco(tx, 20.4, tz, 2.4, 2.6, 2.4, PALETTE.gold, 0.02);
    // 尖顶
    for (let i = 0; i < 5; i++) {
      const s = 6 - i * 1.05;
      this.deco(tx, 23.6 + i * 1.0, tz, s, 1.0, s, PALETTE.roof, 0.03);
    }
    // 钟楼拱窗
    for (let k = 0; k < 3; k++) {
      this.destructible(tx + 3.6, 14 + k * 3, tz, 0.8, 2.0, 2.6, PALETTE.glass, 14, 'glass', 0.45);
    }
    // 钟楼内部楼梯（可上到屋顶层，制造高低差）
    for (let i = 0; i < 14; i++) {
      this.solid(tx + 1.6, 0.4 + i * 0.55, tz - 2.0 + i * 0.55, 2.6, 0.35, 1.1, PALETTE.churchDark);
    }
  }

  // ------------------------------------------------------------ 广场
  private buildPlaza(): void {
    // 石板铺装（棋盘格）
    for (let ix = -5; ix <= 5; ix++) {
      for (let iz = 0; iz <= 8; iz++) {
        const c = ((ix + iz) % 2 === 0) ? PALETTE.plaza : PALETTE.plazaAlt;
        this.deco(ix * 4.2, 0.06, 14 + iz * 4.2, 4.0, 0.12, 4.0, c, 0.05);
      }
    }
    // 广场地面碰撞（整块）
    this.physics.addBox(-24, 0, 14, 24, 0.12, 48);

    // 中央喷泉
    this.buildFountain(0, 26);

    // 市场摊位（可破坏）
    for (let i = 0; i < 4; i++) {
      const x = -16 + i * 10.5;
      this.buildStall(x, 40);
    }
    for (let i = 0; i < 2; i++) {
      this.buildStall(-20 - i * 7, 24);
    }

    // 花坛 + 树（掩体）
    for (let i = 0; i < 6; i++) {
      const x = -18 + i * 7.2;
      this.buildPlanter(x, 12 + (i % 2) * 26);
    }
  }

  private buildFountain(x: number, z: number): void {
    this.solid(x, 0.5, z, 8, 1.0, 8, PALETTE.churchStone);
    this.deco(x, 1.15, z, 6.6, 0.3, 6.6, PALETTE.water, 0.05);
    this.solid(x, 1.6, z, 1.6, 2.2, 1.6, PALETTE.churchStone);
    this.deco(x, 2.9, z, 2.6, 0.4, 2.6, PALETTE.churchStone, 0.03);
    // 边沿坐凳
    this.solid(x, 0.9, z - 4.6, 8, 0.5, 0.8, PALETTE.churchStone);
    this.solid(x, 0.9, z + 4.6, 8, 0.5, 0.8, PALETTE.churchStone);
  }

  private buildStall(x: number, z: number): void {
    // 台面
    this.solid(x, 1.0, z, 3.4, 0.25, 2.0, PALETTE.wood);
    // 支柱（可破坏，打掉会塌）
    for (const dx of [-1.5, 1.5]) {
      for (const dz of [-0.8, 0.8]) {
        this.destructible(x + dx, 0.5, z + dz, 0.3, 1.0, 0.3, PALETTE.woodDark, 26, 'wood', 0.5);
      }
    }
    // 遮阳棚（红白条纹，体素）
    for (let i = 0; i < 4; i++) {
      const c = i % 2 === 0 ? PALETTE.red : 0xe8e0cc;
      this.deco(x - 1.35 + i * 0.9, 2.35, z, 0.9, 0.16, 2.6, c, 0.03);
    }
    // 货物箱
    this.destructible(x - 0.9, 1.4, z, 0.8, 0.8, 0.8, PALETTE.wood, 22, 'wood', 0.5);
    this.destructible(x + 0.9, 1.35, z, 0.7, 0.7, 0.7, PALETTE.woodDark, 22, 'wood', 0.5);
  }

  private buildPlanter(x: number, z: number): void {
    this.solid(x, 0.45, z, 2.4, 0.9, 2.4, PALETTE.churchStone);
    this.deco(x, 1.1, z, 2.0, 0.3, 2.0, PALETTE.grass, 0.12);
    // 体素树
    this.solid(x, 2.0, z, 0.5, 2.2, 0.5, PALETTE.woodDark);
    this.deco(x, 3.4, z, 2.6, 1.7, 2.6, PALETTE.green, 0.14);
    this.deco(x, 4.4, z, 1.6, 1.0, 1.6, PALETTE.green, 0.14);
  }

  // ------------------------------------------------------------ 街道
  private buildStreets(): void {
    // 主街（南北向，教堂前）
    this.deco(0, 0.05, 55, 26, 0.1, 30, PALETTE.road, 0.04);
    // 横向街道
    this.deco(-30, 0.05, 6, 24, 0.1, 14, PALETTE.road, 0.04);
    this.deco(30, 0.05, 6, 24, 0.1, 14, PALETTE.road, 0.04);
    // 人行道
    for (const sx of [-13.5, 13.5]) {
      this.deco(sx, 0.14, 55, 3.0, 0.28, 30, PALETTE.sidewalk, 0.05);
      this.physics.addBoxC(sx, 0.14, 55, 3.0, 0.28, 30);
    }
    // 车道线
    for (let i = 0; i < 10; i++) {
      this.deco(0, 0.09, 42 + i * 3.4, 0.3, 0.02, 1.8, PALETTE.roadLine, 0.02);
    }
    // 路灯
    for (let i = 0; i < 6; i++) {
      this.buildLamp(-12.5, 30 + i * 9);
      this.buildLamp(12.5, 30 + i * 9);
    }
    // 路障（可破坏）
    for (let i = 0; i < 4; i++) {
      this.destructible(-9 - i * 0.2, 0.55, 20 + i * 6, 2.2, 1.1, 0.5, PALETTE.wood, 34, 'wood', 0.5);
      this.destructible(9 + i * 0.2, 0.55, 24 + i * 6, 2.2, 1.1, 0.5, PALETTE.wood, 34, 'wood', 0.5);
    }
    // 混凝土掩体
    for (let i = 0; i < 3; i++) {
      this.solid(-18 - i * 3, 0.6, 34 + i * 4, 3.0, 1.2, 0.9, PALETTE.metal);
      this.solid(18 + i * 3, 0.6, 34 + i * 4, 3.0, 1.2, 0.9, PALETTE.metal);
    }
  }

  private buildLamp(x: number, z: number): void {
    this.solid(x, 2.2, z, 0.3, 4.4, 0.3, PALETTE.metal);
    this.deco(x, 4.5, z, 0.9, 0.4, 0.9, PALETTE.gold, 0.02);
    this.deco(x, 4.2, z, 0.35, 0.3, 0.35, 0xfff0b0, 0.0);
  }

  // ------------------------------------------------------------ 建筑群
  /** 沿 Z 轴排列的一排建筑 */
  private buildBuildingRow(x: number, z0: number, z1: number, color: number, tag: string): void {
    const dir = x < 0 ? 1 : -1;
    let z = z0;
    let i = 0;
    while (z < z1) {
      const d = 10 + this.rng.int(0, 6);
      const w = 11 + this.rng.int(0, 4);
      const h = 9 + this.rng.int(0, 3) * 3.2;
      const c = [color, PALETTE.wallC, PALETTE.wallD, PALETTE.wallB][i % 4];
      this.buildBuilding(x, z + d / 2, w, d, h, c, dir, tag + i);
      z += d + 3.5;
      i++;
    }
  }

  /**
   * 单体建筑：四面墙 + 屋顶 + 门窗。
   * 正面底层做一段可破坏墙（RPG 可以轰出新通道），
   * 侧面留门洞让 AI 和玩家能进室内。
   */
  private buildBuilding(x: number, z: number, w: number, d: number, h: number, color: number, dir: number, tag: string): void {
    const floors = Math.max(1, Math.round(h / 3.4));
    const t = 0.9;

    // 地板
    this.solid(x, 0.12, z, w, 0.24, d, PALETTE.plazaAlt);

    // 左右侧墙（沿 Z）
    for (const sx of [-1, 1]) {
      this.solid(x + sx * (w / 2), h / 2, z, t, h, d, color);
    }
    // 后墙（沿 X）
    const backZ = dir < 0 ? z - d / 2 : z + d / 2;
    this.solid(x, h / 2, backZ, w, h, t, color);

    // 前墙（沿 X）：中间留门洞，两侧可破坏
    const frontZ = dir < 0 ? z + d / 2 : z - d / 2;
    // 门洞留得足够宽：NavGrid 有 0.62m 膨胀，太窄会让 AI 卡在门口
    const doorW = 4.4, doorH = 3.4;
    const sideW = (w - doorW) / 2;
    for (const s of [-1, 1]) {
      const segX = x + s * (doorW / 2 + sideW / 2);
      // 一层：可破坏（炸开就是新入口）
      this.destructible(segX, 1.7, frontZ, sideW, 3.4, t, color, 62, 'wall', 0.55);
      // 二层以上：实体
      if (h > 3.4) this.solid(segX, 3.4 + (h - 3.4) / 2, frontZ, sideW, h - 3.4, t, color);
    }

    // 门洞保持敞开（玩家与 AI 都能进出，不做"空气门"），
    // 门框用装饰块表现，可破坏门主要集中在教堂正门与摊位/路障上
    this.deco(x, 3.55, frontZ, doorW + 0.6, 0.35, 0.6, PALETTE.woodDark, 0.03);
    for (let f = 1; f < floors; f++) {
      const wy = 3.4 + (f - 1) * 3.4 + 1.7;
      if (wy + 1.6 > h) break;
      // 正面窗（可破坏玻璃）
      for (let k = 0; k < 2; k++) {
        const wxp = x + (k === 0 ? -w / 4 : w / 4);
        this.destructible(wxp, wy, frontZ, 2.4, 2.0, 0.45, PALETTE.glass, 12, 'glass', 0.45);
      }
      // 侧面窗
      for (const sx of [-1, 1]) {
        this.destructible(x + sx * (w / 2), wy, z, 0.45, 2.0, 2.4, PALETTE.glass, 12, 'glass', 0.45);
      }
    }

    // 屋顶
    this.roof(x, z, w + 1.0, d + 1.0, h, h + 3.6, PALETTE.roof, 'z');
    // 屋顶围栏
    this.deco(x, h + 0.9, z - d / 2, w, 0.6, 0.25, PALETTE.churchStone, 0.03);
    this.deco(x, h + 0.9, z + d / 2, w, 0.6, 0.25, PALETTE.churchStone, 0.03);

    // 外挂楼梯：贴着侧墙从后往前逐级升高，形成连续实心台阶（可一路走到屋顶）
    if (tag.endsWith('0') || tag.endsWith('2')) {
      const depth = 0.45;
      const steps = Math.max(4, Math.floor(d / depth));
      const rise = Math.min(0.55, Math.max(0.26, h / steps));
      const zStart = backZ + (dir < 0 ? depth / 2 : -depth / 2);
      for (let i = 0; i < steps; i++) {
        const top = rise * (i + 1);
        if (top > h) break;
        const zz = zStart + (dir < 0 ? 1 : -1) * i * depth;
        this.solid(x + dir * (w / 2 + 0.8), top / 2, zz, 1.5, top, depth + 0.02, PALETTE.churchStone);
      }
    }
    // 遮阳棚 / 阳台
    this.deco(x - dir * (w / 2 + 0.6), 3.6, frontZ, 1.4, 0.2, d * 0.6, PALETTE.red, 0.03);
  }

  private buildNorthBlock(): void {
    // 教堂北侧（红队后方）建筑
    this.buildBuilding(-26, -50, 16, 14, 12, PALETTE.wallC, 1, 'n0');
    this.buildBuilding(0, -54, 18, 12, 9.5, PALETTE.wallD, -1, 'n1');
    this.buildBuilding(26, -50, 16, 14, 12, PALETTE.wallA, -1, 'n2');
    // 后街掩体
    for (let i = 0; i < 5; i++) {
      this.destructible(-20 + i * 10, 0.6, -44, 1.6, 1.2, 1.6, PALETTE.wood, 30, 'wood', 0.5);
    }
  }

  private buildSouthBlock(): void {
    // 广场南侧（蓝队后方）建筑
    this.buildBuilding(-30, 56, 18, 12, 10.5, PALETTE.wallB, 1, 's0');
    this.buildBuilding(0, 60, 20, 12, 13, PALETTE.wallA, -1, 's1');
    this.buildBuilding(30, 56, 18, 12, 10.5, PALETTE.wallD, -1, 's2');
    // 木箱堆（掩体 + 可破坏）
    for (let i = 0; i < 8; i++) {
      const bx = -20 + i * 5.4;
      this.destructible(bx, 0.6, 52, 1.2, 1.2, 1.2, PALETTE.wood, 24, 'wood', 0.5);
      if (i % 3 === 0) this.destructible(bx + 0.4, 1.8, 52, 1.1, 1.1, 1.1, PALETTE.woodDark, 24, 'wood', 0.5);
    }
  }

  // ------------------------------------------------------------ 装饰 / 掩体
  private buildProps(): void {
    //  voxel 汽车（可破坏）
    const cars: [number, number, number][] = [
      [-10, 30, 0], [10, 46, Math.PI], [-8, 62, 0.3], [26, 20, Math.PI / 2],
    ];
    for (const [x, z, rot] of cars) {
      const c = [PALETTE.red, PALETTE.water, 0x3a4a5a, PALETTE.gold][Math.floor(this.rng.next() * 4)];
      // 车身（沿 X 方向）
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const put = (ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, color: number, dest: boolean) => {
        const wx = x + ox * cs - oz * sn;
        const wz = z + ox * sn + oz * cs;
        if (dest) this.destructible(wx, oy, wz, sx, sy, sz, color, 55, 'prop', 0.55);
        else this.solid(wx, oy, wz, sx, sy, sz, color);
      };
      put(0, 0.75, 0, 4.4, 0.9, 2.0, c, true);
      put(-0.4, 1.5, 0, 2.2, 0.9, 1.8, c, true);
      put(-0.4, 1.95, 0, 2.0, 0.22, 1.7, PALETTE.glass, false);
      // 轮子
      for (const wx of [-1.4, 1.4]) for (const wz of [-0.95, 0.95]) put(wx, 0.35, wz, 0.7, 0.7, 0.35, 0x20242a, false);
    }

    // 长椅
    for (let i = 0; i < 6; i++) {
      const x = -14 + i * 5.6;
      this.solid(x, 0.45, 16, 2.4, 0.18, 0.7, PALETTE.wood);
      this.solid(x, 0.75, 16.3, 2.4, 0.7, 0.18, PALETTE.wood);
      this.solid(x - 1.0, 0.2, 16, 0.2, 0.4, 0.7, PALETTE.metal);
      this.solid(x + 1.0, 0.2, 16, 0.2, 0.4, 0.7, PALETTE.metal);
    }

    // 高处平台（可被跳板/滑索利用）
    this.solid(-34, 2.2, 40, 8, 0.5, 8, PALETTE.churchStone);
    for (let i = 0; i < 8; i++) {
      this.solid(-34, 0.25 + i * 0.28, 45.2 - i * 0.7, 8, 0.28, 0.7, PALETTE.churchStone);
    }
    this.solid(34, 2.2, 40, 8, 0.5, 8, PALETTE.churchStone);
    for (let i = 0; i < 8; i++) {
      this.solid(34, 0.25 + i * 0.28, 45.2 - i * 0.7, 8, 0.28, 0.7, PALETTE.churchStone);
    }
    // 平台护栏
    this.deco(-34, 2.9, 36.2, 8, 0.7, 0.25, PALETTE.metal, 0.03);
    this.deco(34, 2.9, 36.2, 8, 0.7, 0.25, PALETTE.metal, 0.03);
  }
}
