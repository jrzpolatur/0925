import type { Character } from '../characters/Character';
import type { Game } from '../core/Game';
import { DEG } from '../core/Utils';

export interface EnemyInfo {
  char: Character;
  dist: number;
  visible: boolean;
  /** 最后一次被看到的时间（game.time） */
  lastSeen: number;
  lx: number; ly: number; lz: number;
  /** 是否在视野锥内 */
  inCone: boolean;
}

/**
 * 感知系统（AI 第一层）
 * 检测：视野锥 / 距离 / 射线遮挡（LOS）/ 队友 / HP / 弹药 / 技能 CD / 受击来源
 * 只运行于 12Hz，不每帧计算，节省 CPU。
 */
export class Perception {
  owner: Character;
  /** 视野角度（度） */
  fov = 145 * DEG;
  range = 72;
  enemies: EnemyInfo[] = [];
  /** 最近一次受击来源 */
  lastThreat: Character | null = null;
  lastThreatTime = -99;
  /** 附近敌人数量（用于 RPG / 震荡波 的群体判断） */
  clusterCount = 0;

  constructor(owner: Character) {
    this.owner = owner;
  }

  /** 听到枪声/爆炸：即使看不见也能获得大致位置 */
  hear(x: number, y: number, z: number, time: number): void {
    for (const e of this.enemies) {
      const d = Math.hypot(e.char.pos.x - x, e.char.pos.y - y, e.char.pos.z - z);
      if (d < 6) {
        e.lastSeen = time;
        e.lx = e.char.pos.x; e.ly = e.char.pos.y; e.lz = e.char.pos.z;
      }
    }
  }

  update(game: Game): void {
    const o = this.owner;
    // 同步敌人列表
    for (const c of game.characters) {
      if (c.team === o.team || c === o) continue;
      let info = this.enemies.find((e) => e.char === c);
      if (!info) {
        info = { char: c, dist: 0, visible: false, lastSeen: -99, lx: 0, ly: 0, lz: 0, inCone: false };
        this.enemies.push(info);
      }
    }
    // 清理已不存在的（重开一局时）
    if (this.enemies.length > game.characters.length) {
      this.enemies = this.enemies.filter((e) => game.characters.includes(e.char));
    }

    const eyeX = o.pos.x, eyeY = o.pos.y + o.eyeHeight, eyeZ = o.pos.z;
    const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw);
    const cosFov = Math.cos(this.fov * 0.5);
    this.clusterCount = 0;

    for (const e of this.enemies) {
      const c = e.char;
      if (!c.alive) { e.visible = false; continue; }
      const dx = c.pos.x - eyeX;
      const dy = (c.pos.y + c.eyeHeight * 0.7) - eyeY;
      const dz = c.pos.z - eyeZ;
      const dist = Math.hypot(dx, dy, dz);
      e.dist = dist;
      // 隐身状态更难被发现
      const cloakFactor = (c.cloak > 0 || c.cloakField > 0) ? 0.45 : 1;
      if (dist > this.range * cloakFactor) { e.visible = false; e.inCone = false; continue; }

      const nd = dist > 0.001 ? 1 / dist : 0;
      const dot = (dx * nd) * fx + (dz * nd) * fz;
      e.inCone = dot >= cosFov || dist < 6; // 贴脸时无视视野锥
      if (!e.inCone) { e.visible = false; continue; }

      const los = game.nav.lineOfSight(
        eyeX, eyeY, eyeZ,
        c.pos.x, c.pos.y + c.eyeHeight * 0.75, c.pos.z,
      );
      e.visible = los && Math.random() < 1;
      if (e.visible) {
        e.lastSeen = game.time;
        e.lx = c.pos.x; e.ly = c.pos.y; e.lz = c.pos.z;
        if (dist < 9) this.clusterCount++;
      }
    }
  }

  /** 最近的可见敌人 */
  nearestVisible(maxDist = Infinity): EnemyInfo | null {
    let best: EnemyInfo | null = null;
    for (const e of this.enemies) {
      if (!e.visible || !e.char.alive) continue;
      if (e.dist > maxDist) continue;
      if (!best || e.dist < best.dist) best = e;
    }
    return best;
  }

  /** 最近的有记忆的敌人（即使当前不可见） */
  nearestKnown(time: number, memory = 6): EnemyInfo | null {
    let best: EnemyInfo | null = null;
    for (const e of this.enemies) {
      if (!e.char.alive) continue;
      if (!e.visible && time - e.lastSeen > memory) continue;
      const score = e.visible ? e.dist : e.dist + 12;
      if (!best || score < (best.visible ? best.dist : best.dist + 12)) best = e;
    }
    return best;
  }

  /** 指定半径内的可见敌人数（用于 RPG / 震荡波） */
  visibleWithin(radius: number): number {
    let n = 0;
    for (const e of this.enemies) if (e.visible && e.char.alive && e.dist < radius) n++;
    return n;
  }

  reset(): void {
    this.enemies.length = 0;
    this.lastThreat = null;
  }
}
