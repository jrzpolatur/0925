import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Character } from '../characters/Character';
import { MeshBuilder, VOXEL_MATERIAL } from '../map/VoxelBuilder';
import type { TeamId } from '../core/Types';

export interface ShieldEntity {
  type: 'mesh' | 'dome';
  owner: Character | null;
  team: TeamId;
  x: number; y: number; z: number;
  yaw: number;
  /** mesh 盾：宽 / 高 */
  w: number; h: number;
  /** dome 盾：半径 */
  radius: number;
  hp: number;
  maxHp: number;
  life: number;
  alive: boolean;
  obj: THREE.Object3D;
  panel: THREE.Mesh | null;
  flash: number;
}

export interface MineEntity {
  type: 'explosive' | 'flame';
  owner: Character | null;
  team: TeamId;
  x: number; y: number; z: number;
  armTime: number;
  life: number;
  alive: boolean;
  obj: THREE.Object3D;
}

export interface FieldEntity {
  type: 'cloak' | 'flame';
  owner: Character | null;
  team: TeamId;
  x: number; y: number; z: number;
  radius: number;
  life: number;
  tick: number;
  alive: boolean;
  obj: THREE.Object3D;
}

export interface JumpPadEntity {
  owner: Character | null;
  team: TeamId;
  x: number; y: number; z: number;
  uses: number;
  life: number;
  alive: boolean;
  obj: THREE.Object3D;
}

export interface ZiplineEntity {
  owner: Character | null;
  team: TeamId;
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  life: number;
  alive: boolean;
  obj: THREE.Object3D;
}

export interface PortalEntity {
  owner: Character | null;
  team: TeamId;
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  life: number;
  alive: boolean;
  objA: THREE.Object3D;
  objB: THREE.Object3D;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _local = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** 所有投掷/部署型道具的实体管理器 */
export class GadgetSystem {
  game: Game;
  shields: ShieldEntity[] = [];
  mines: MineEntity[] = [];
  fields: FieldEntity[] = [];
  jumpPads: JumpPadEntity[] = [];
  ziplines: ZiplineEntity[] = [];
  portals: PortalEntity[] = [];
  riders: Character[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  // ------------------------------------------------------- 网格护盾
  createMeshShield(owner: Character, hp = 620, life = 14): ShieldEntity {
    const team = owner.team;
    const color = team === 0 ? 0x49b8ff : 0xff6a5a;
    // 体素网格：纵横细条组成的方格阵列（半透明）
    const b = new MeshBuilder();
    const w = 2.3, h = 2.0;
    const cols = 7, rows = 6;
    const bar = 0.055;
    for (let i = 0; i <= cols; i++) {
      const x = -w / 2 + (w * i) / cols;
      b.addBox(x, 0, 0, bar, h, bar, color, 0.0);
    }
    for (let j = 0; j <= rows; j++) {
      const y = -h / 2 + (h * j) / rows;
      b.addBox(0, y, 0, w, bar, bar, color, 0.0);
    }
    const mesh = b.build(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    }))!;

    // 淡色面板，提升"能挡子弹"的可读性
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    panel.position.z = -0.02;

    const obj = new THREE.Group();
    obj.add(mesh);
    obj.add(panel);
    this.game.scene.add(obj);

    const s: ShieldEntity = {
      type: 'mesh', owner, team, x: 0, y: 0, z: 0, yaw: 0,
      w, h, radius: 0, hp, maxHp: hp, life, alive: true, obj, panel, flash: 0,
    };
    this.shields.push(s);
    return s;
  }

  // ------------------------------------------------------- 球形护盾
  createDomeShield(owner: Character, x: number, y: number, z: number, radius = 3.3, hp = 900, life = 15): ShieldEntity {
    const color = owner.team === 0 ? 0x49b8ff : 0xff6a5a;
    const geo = new THREE.IcosahedronGeometry(radius, 2);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, wireframe: true,
    });
    const obj = new THREE.Mesh(geo, mat);
    obj.position.set(x, y, z);
    this.game.scene.add(obj);
    const s: ShieldEntity = {
      type: 'dome', owner, team: owner.team, x, y, z, yaw: 0,
      w: 0, h: 0, radius, hp, maxHp: hp, life, alive: true, obj, panel: null, flash: 0,
    };
    this.shields.push(s);
    return s;
  }

  // ------------------------------------------------------- 地雷
  createMine(owner: Character, type: 'explosive' | 'flame', x: number, y: number, z: number): MineEntity {
    const b = new MeshBuilder();
    const base = type === 'explosive' ? 0x8a3030 : 0x9a5a20;
    b.addBox(0, 0.04, 0, 0.34, 0.09, 0.34, base, 0.05);
    b.addBox(0, 0.12, 0, 0.20, 0.10, 0.20, 0x2b2f35, 0.05);
    b.addBox(0, 0.19, 0, 0.09, 0.05, 0.09, type === 'explosive' ? 0xff4444 : 0xffa030, 0.0);
    const obj = b.build(VOXEL_MATERIAL)!;
    obj.position.set(x, y, z);
    this.game.scene.add(obj);
    const m: MineEntity = {
      type, owner, team: owner.team, x, y, z,
      armTime: 1.1, life: 45, alive: true, obj,
    };
    this.mines.push(m);
    return m;
  }

  // ------------------------------------------------------- 区域（火焰 / 匿踪）
  createField(owner: Character, type: 'cloak' | 'flame', x: number, y: number, z: number, radius: number, life: number): FieldEntity {
    const color = type === 'cloak' ? 0x9be8ff : 0xff7a2a;
    const obj = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: type === 'cloak' ? 0.13 : 0.22, depthWrite: false }),
    );
    obj.position.set(x, y, z);
    this.game.scene.add(obj);
    const f: FieldEntity = {
      type, owner, team: owner.team, x, y, z, radius, life,
      tick: 0, alive: true, obj,
    };
    this.fields.push(f);
    return f;
  }

  // ------------------------------------------------------- 跳板
  createJumpPad(owner: Character, x: number, y: number, z: number): JumpPadEntity {
    const b = new MeshBuilder();
    b.addBox(0, 0.06, 0, 1.15, 0.12, 1.15, 0x2e343d, 0.05);
    b.addBox(0, 0.15, 0, 0.95, 0.08, 0.95, 0xffc23a, 0.05);
    // 向上箭头（体素）
    b.addBox(0, 0.26, 0, 0.16, 0.10, 0.16, 0xffe08a, 0.0);
    b.addBox(0, 0.36, 0, 0.06, 0.12, 0.06, 0xffe08a, 0.0);
    const obj = b.build(VOXEL_MATERIAL)!;
    obj.position.set(x, y, z);
    this.game.scene.add(obj);
    const j: JumpPadEntity = { owner, team: owner.team, x, y, z, uses: 8, life: 60, alive: true, obj };
    this.jumpPads.push(j);
    return j;
  }

  // ------------------------------------------------------- 滑索
  createZipline(owner: Character, ax: number, ay: number, az: number, bx: number, by: number, bz: number): ZiplineEntity {
    const obj = new THREE.Group();
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, len, 5),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    );
    const mid = new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    line.position.copy(mid);
    line.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(bx - ax, by - ay, bz - az).normalize(),
    );
    obj.add(line);
    // 两端锚点
    const anchorGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const anchorMat = new THREE.MeshLambertMaterial({ color: 0x3a4150 });
    const a1 = new THREE.Mesh(anchorGeo, anchorMat);
    a1.position.set(ax, ay, az);
    const a2 = new THREE.Mesh(anchorGeo, anchorMat);
    a2.position.set(bx, by, bz);
    obj.add(a1, a2);
    this.game.scene.add(obj);
    const z: ZiplineEntity = {
      owner, team: owner.team, ax, ay, az, bx, by, bz, life: 45, alive: true, obj,
    };
    this.ziplines.push(z);
    return z;
  }

  // ------------------------------------------------------- 传送门
  createPortal(owner: Character, ax: number, ay: number, az: number, bx: number, by: number, bz: number): PortalEntity {
    const mk = (x: number, y: number, z: number, color: number) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.09, 6, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      const core = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 16),
        new THREE.MeshBasicMaterial({ color: 0x101820, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      g.add(ring, core);
      g.position.set(x, y, z);
      g.userData.ring = ring;
      return g;
    };
    const objA = mk(ax, ay, az, 0x9b6bff);
    const objB = mk(bx, by, bz, 0x53ffd6);
    this.game.scene.add(objA, objB);
    const p: PortalEntity = {
      owner, team: owner.team, ax, ay, az, bx, by, bz,
      life: 25, alive: true, objA, objB,
    };
    this.portals.push(p);
    return p;
  }

  // ------------------------------------------------------- 查询
  hasMeshShield(c: Character): boolean {
    return this.shields.some((s) => s.alive && s.type === 'mesh' && s.owner === c);
  }

  getMeshShield(c: Character): ShieldEntity | null {
    return this.shields.find((s) => s.alive && s.type === 'mesh' && s.owner === c) || null;
  }

  /** 护盾射线检测（网格盾用带朝向的盒体，球形盾用球体） */
  raycastShields(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; nx: number; ny: number; nz: number; shield: ShieldEntity | null },
  ): boolean {
    let best = maxDist;
    let found = false;
    out.shield = null;
    for (const s of this.shields) {
      if (!s.alive) continue;
      if (s.type === 'mesh') {
        // 世界 -> 盾牌局部（只有 yaw 旋转）
        const cos = Math.cos(-s.yaw), sin = Math.sin(-s.yaw);
        const ox = o.x - s.x, oz = o.z - s.z;
        // 绕 Y 轴旋转 -yaw
        const lx = ox * cos - oz * sin;
        const lz = ox * sin + oz * cos;
        const ly = o.y - s.y;
        const ldx = d.x * cos - d.z * sin;
        const ldz = d.x * sin + d.z * cos;
        const ldy = d.y;
        // 局部 AABB：x in [-w/2, w/2], y in [-h/2, h/2], z in [-0.06, 0.06]
        let t0 = 0, t1 = best;
        let ok = true;
        let axis = 0, sign = 1;
        const mn = [-s.w / 2, -s.h / 2, -0.09];
        const mx = [s.w / 2, s.h / 2, 0.09];
        const lo = [lx, ly, lz];
        const ld = [ldx, ldy, ldz];
        for (let a = 0; a < 3; a++) {
          if (Math.abs(ld[a]) < 1e-8) {
            if (lo[a] < mn[a] || lo[a] > mx[a]) { ok = false; break; }
            continue;
          }
          const inv = 1 / ld[a];
          let ta = (mn[a] - lo[a]) * inv;
          let tb = (mx[a] - lo[a]) * inv;
          let sg = -1;
          if (ta > tb) { const t = ta; ta = tb; tb = t; sg = 1; }
          if (ta > t0) { t0 = ta; axis = a; sign = sg; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 >= 0 && t0 < best) {
          best = t0; found = true; out.shield = s;
          // 局部法线转回世界
          const nx = axis === 0 ? sign : 0;
          const ny = axis === 1 ? sign : 0;
          const nz = axis === 2 ? sign : 0;
          const c2 = Math.cos(s.yaw), s2 = Math.sin(s.yaw);
          out.nx = nx * c2 - nz * s2;
          out.ny = ny;
          out.nz = nx * s2 + nz * c2;
        }
      } else {
        // 球体
        _v.set(s.x - o.x, s.y - o.y, s.z - o.z);
        const tca = _v.dot(d);
        if (tca < 0) continue;
        const d2 = _v.lengthSq() - tca * tca;
        const r2 = s.radius * s.radius;
        if (d2 > r2) continue;
        const thc = Math.sqrt(r2 - d2);
        let t = tca - thc;
        if (t < 0) t = 0;
        if (t < best) {
          best = t; found = true; out.shield = s;
          _v2.copy(o).addScaledVector(d, t);
          out.nx = (_v2.x - s.x) / s.radius;
          out.ny = (_v2.y - s.y) / s.radius;
          out.nz = (_v2.z - s.z) / s.radius;
        }
      }
    }
    if (found) out.dist = best;
    return found;
  }

  damageShield(s: ShieldEntity, dmg: number): void {
    s.hp -= dmg;
    s.flash = 0.12;
    if (s.panel) (s.panel.material as THREE.MeshBasicMaterial).opacity = 0.38;
    if (s.hp <= 0) {
      s.alive = false;
      this.game.scene.remove(s.obj);
      disposeObj(s.obj);
      this.game.fx.explosion(s.x, s.y, s.z, 0.6, 0x9be8ff, false);
    }
  }

  // ------------------------------------------------------- 每帧更新
  update(dt: number): void {
    const chars = this.game.characters;

    // --- 网格护盾跟随主人 ---
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      if (!s.alive) { this.shields.splice(i, 1); continue; }
      if (s.type === 'mesh' && s.owner) {
        const c = s.owner;
        if (!c.alive || !this.game.hasActiveMeshShield(c)) {
          s.alive = false;
          this.game.scene.remove(s.obj);
          disposeObj(s.obj);
          this.shields.splice(i, 1);
          continue;
        }
        // 放置在角色正前方 0.85m，随角色 yaw 旋转
        const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
        s.x = c.pos.x + fx * 0.95;
        s.y = c.pos.y + s.h * 0.5 - 0.15;
        s.z = c.pos.z + fz * 0.95;
        s.yaw = c.yaw;
        s.obj.position.set(s.x, s.y, s.z);
        s.obj.rotation.y = c.yaw;
      }
      if (s.life > 0) {
        s.life -= dt;
        if (s.life <= 0) {
          s.alive = false;
          this.game.scene.remove(s.obj);
          disposeObj(s.obj);
          this.shields.splice(i, 1);
          continue;
        }
      }
      if (s.flash > 0) {
        s.flash -= dt;
        if (s.flash <= 0 && s.panel) (s.panel.material as THREE.MeshBasicMaterial).opacity = 0.14;
      }
      if (s.type === 'dome') {
        const t = 1 - s.hp / s.maxHp;
        ((s.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.22 - t * 0.12;
      }
    }

    // --- 地雷 ---
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (!m.alive) { this.mines.splice(i, 1); continue; }
      m.life -= dt;
      if (m.armTime > 0) m.armTime -= dt;
      if (m.life <= 0) { this.removeMine(m, i); continue; }
      if (m.armTime > 0) continue;
      for (const c of chars) {
        if (!c.alive || c.team === m.team) continue;
        const dx = c.pos.x - m.x, dy = c.pos.y + 0.9 - m.y, dz = c.pos.z - m.z;
        if (dx * dx + dy * dy + dz * dz < 2.4 * 2.4) {
          this.triggerMine(m);
          this.removeMine(m, i);
          break;
        }
      }
    }

    // --- 区域效果 ---
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      if (!f.alive) { this.fields.splice(i, 1); continue; }
      f.life -= dt;
      if (f.life <= 0) {
        f.alive = false;
        this.game.scene.remove(f.obj);
        disposeObj(f.obj);
        this.fields.splice(i, 1);
        continue;
      }
      const r2 = f.radius * f.radius;
      for (const c of chars) {
        if (!c.alive) continue;
        const dx = c.pos.x - f.x, dy = c.pos.y + 0.9 - f.y, dz = c.pos.z - f.z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        if (f.type === 'cloak') {
          if (c.team === f.team) c.cloakField = 1;
        } else {
          if (c.team !== f.team) {
            f.tick -= dt;
            if (f.tick <= 0) {
              f.tick = 0.3;
              c.applyDamage({
                amount: 9, attacker: f.owner,
                px: c.pos.x, py: c.pos.y + 0.9, pz: c.pos.z,
                dx: 0, dy: 0, dz: 0, head: false, cause: 'fire',
              }, true);
              c.burn = Math.max(c.burn, 1.2);
            }
          }
        }
      }
      if (f.type === 'flame' && Math.random() < dt * 12) {
        this.game.fx.flame(
          f.x + (Math.random() - 0.5) * f.radius,
          f.y + 0.2,
          f.z + (Math.random() - 0.5) * f.radius, 1,
        );
      }
    }

    // --- 跳板 ---
    for (let i = this.jumpPads.length - 1; i >= 0; i--) {
      const jp = this.jumpPads[i];
      if (!jp.alive) { this.jumpPads.splice(i, 1); continue; }
      jp.life -= dt;
      if (jp.life <= 0 || jp.uses <= 0) {
        jp.alive = false;
        this.game.scene.remove(jp.obj);
        disposeObj(jp.obj);
        this.jumpPads.splice(i, 1);
        continue;
      }
      for (const c of chars) {
        if (!c.alive || c.jumpPadCd > 0) continue;
        const dx = c.pos.x - jp.x, dz = c.pos.z - jp.z;
        const dy = c.pos.y - jp.y;
        if (dx * dx + dz * dz < 1.05 * 1.05 && dy > -0.4 && dy < 1.0) {
          // 真实冲量：向上 + 保留水平速度
          c.addImpulse(c.vel.x * 0.35, 16.5, c.vel.z * 0.35, 0.1);
          c.jumpPadCd = 0.45;
          jp.uses--;
          this.game.fx.ring(jp.x, jp.y + 0.2, jp.z, 1.2, 0xffd24a);
          this.game.audio?.play('jumppad', c.pos, 0.8);
          if (c.isPlayer) this.game.playerController?.jumpPadFeedback();
        }
      }
    }

    // --- 滑索 ---
    for (let i = this.ziplines.length - 1; i >= 0; i--) {
      const z = this.ziplines[i];
      if (!z.alive) { this.ziplines.splice(i, 1); continue; }
      z.life -= dt;
      if (z.life <= 0) {
        z.alive = false;
        this.game.scene.remove(z.obj);
        disposeObj(z.obj);
        this.ziplines.splice(i, 1);
        continue;
      }
    }
    this.updateRiders(dt);

    // --- 传送门 ---
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const p = this.portals[i];
      if (!p.alive) { this.portals.splice(i, 1); continue; }
      p.life -= dt;
      const spin = this.game.time * 2.2;
      (p.objA.userData.ring as THREE.Mesh).rotation.z = spin;
      (p.objB.userData.ring as THREE.Mesh).rotation.z = -spin;
      if (p.life <= 0) {
        p.alive = false;
        this.game.scene.remove(p.objA, p.objB);
        disposeObj(p.objA); disposeObj(p.objB);
        this.portals.splice(i, 1);
        continue;
      }
      for (const c of chars) {
        if (!c.alive || c.portalCd > 0) continue;
        const da = Math.hypot(c.pos.x - p.ax, c.pos.y + 0.9 - p.ay, c.pos.z - p.az);
        const db = Math.hypot(c.pos.x - p.bx, c.pos.y + 0.9 - p.by, c.pos.z - p.bz);
        if (da < 0.95) this.teleport(c, p.bx, p.by, p.bz);
        else if (db < 0.95) this.teleport(c, p.ax, p.ay, p.az);
      }
    }
  }

  /** 传送：保留速度（真实移动机制，不是作弊瞬移，目标是玩家自己放置的传送门） */
  private teleport(c: Character, tx: number, ty: number, tz: number): void {
    if (!this.game.physics.freeAt(tx, ty + 0.05, tz, c.radius, c.height)) return;
    c.pos.set(tx, ty + 0.1, tz);
    c.portalCd = 1.1;
    c.vel.multiplyScalar(0.85);
    this.game.fx.ring(tx, ty + 0.9, tz, 1.0, 0x9b6bff);
    this.game.audio?.play('portal', c.pos, 0.9);
    if (c.isPlayer) this.game.hud?.toast('传送');
  }

  /** 尝试让角色上滑索 */
  tryRide(c: Character): boolean {
    if (c.riding) { this.stopRide(c); return false; }
    let best: ZiplineEntity | null = null;
    let bestD = 2.6;
    for (const z of this.ziplines) {
      if (!z.alive) continue;
      const d = distToSegment(c.pos.x, c.pos.y + 0.9, c.pos.z, z.ax, z.ay, z.az, z.bx, z.by, z.bz);
      if (d < bestD) { bestD = d; best = z; }
    }
    if (!best) return false;
    c.zipline = { z: best, t: nearestT(c.pos.x, c.pos.y + 0.9, c.pos.z, best) };
    c.riding = true;
    c.vel.set(0, 0, 0);
    if (!this.riders.includes(c)) this.riders.push(c);
    this.game.audio?.play('zipline', c.pos, 0.6);
    return true;
  }

  stopRide(c: Character): void {
    c.riding = false;
    c.zipline = null;
    const i = this.riders.indexOf(c);
    if (i >= 0) this.riders.splice(i, 1);
  }

  private updateRiders(dt: number): void {
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const c = this.riders[i];
      const ride = c.zipline;
      if (!c.riding || !ride || !ride.z.alive) { this.stopRide(c); continue; }
      const z = ride.z as ZiplineEntity;
      const len = Math.hypot(z.bx - z.ax, z.by - z.ay, z.bz - z.az) || 1;
      ride.t += (9.5 * dt) / len;
      if (ride.t >= 1) {
        ride.t = 1;
        c.pos.set(z.bx, z.by - 0.9, z.bz);
        c.vel.set(0, 1, 0);
        this.stopRide(c);
        continue;
      }
      c.pos.set(
        z.ax + (z.bx - z.ax) * ride.t,
        z.ay + (z.by - z.ay) * ride.t - 0.9,
        z.az + (z.bz - z.az) * ride.t,
      );
      c.grounded = false;
    }
  }

  private triggerMine(m: MineEntity): void {
    if (m.type === 'explosive') {
      this.game.combat.explode(m.x, m.y + 0.2, m.z, 5.0, 105, 13, 190, m.owner, 'explosive');
    } else {
      this.game.combat.explode(m.x, m.y + 0.2, m.z, 3.0, 30, 6, 70, m.owner, 'flame');
      this.createField(m.owner, 'flame', m.x, m.y + 0.3, m.z, 4.0, 6.5);
    }
  }

  private removeMine(m: MineEntity, i: number): void {
    m.alive = false;
    this.game.scene.remove(m.obj);
    disposeObj(m.obj);
    this.mines.splice(i, 1);
  }

  clear(): void {
    const kill = (o: THREE.Object3D) => { this.game.scene.remove(o); disposeObj(o); };
    for (const s of this.shields) { s.alive = false; kill(s.obj); }
    for (const m of this.mines) { m.alive = false; kill(m.obj); }
    for (const f of this.fields) { f.alive = false; kill(f.obj); }
    for (const j of this.jumpPads) { j.alive = false; kill(j.obj); }
    for (const z of this.ziplines) { z.alive = false; kill(z.obj); }
    for (const p of this.portals) { p.alive = false; kill(p.objA); kill(p.objB); }
    this.shields.length = 0;
    this.mines.length = 0;
    this.fields.length = 0;
    this.jumpPads.length = 0;
    this.ziplines.length = 0;
    this.portals.length = 0;
    this.riders.length = 0;
  }
}

function disposeObj(o: THREE.Object3D): void {
  o.traverse((c: any) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material && c.material !== VOXEL_MATERIAL) {
      if (Array.isArray(c.material)) c.material.forEach((m: any) => m.dispose());
      else c.material.dispose();
    }
  });
}

function distToSegment(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}

function nearestT(px: number, py: number, pz: number, z: ZiplineEntity): number {
  const dx = z.bx - z.ax, dy = z.by - z.ay, dz = z.bz - z.az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((px - z.ax) * dx + (py - z.ay) * dy + (pz - z.az) * dz) / l2 : 0;
  return Math.max(0, Math.min(1, t));
}
