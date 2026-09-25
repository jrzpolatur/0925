import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Character } from '../characters/Character';
import type { Weapon } from '../weapons/Weapon';
import type { TeamId } from '../core/Types';

interface Proj {
  active: boolean;
  kind: 'rocket' | 'shockwave' | 'cloakbomb';
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  gravity: number;
  radius: number;
  fuse: number;
  life: number;
  explode: { radius: number; damage: number; impulse: number; structure: number } | null;
  owner: Character | null;
  team: TeamId;
  mesh: THREE.Mesh;
  trail: number;
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _wh = { dist: Infinity, nx: 0, ny: 0, nz: 0 };
const _ch = { dist: Infinity, char: null as Character | null, head: false, px: 0, py: 0, pz: 0 };
const _sh = { dist: Infinity, nx: 0, ny: 0, nz: 0, shield: null as any };

/**
 * 投射物系统（RPG 火箭 / 震荡波装置 / 匿踪炸弹）。
 * 池化 Mesh，按子步长推进并做线段碰撞，避免高速穿墙。
 */
export class ProjectileSystem {
  game: Game;
  private pool: Proj[] = [];
  private cursor = 0;
  private geo = new THREE.BoxGeometry(1, 1, 1);

  constructor(game: Game, capacity = 28) {
    this.game = game;
    for (let i = 0; i < capacity; i++) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      mesh.visible = false;
      mesh.frustumCulled = false;
      game.scene.add(mesh);
      this.pool.push({
        active: false, kind: 'rocket', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        gravity: 0, radius: 0.2, fuse: 0, life: 0, explode: null,
        owner: null, team: 0, mesh, trail: 0,
      });
    }
  }

  private alloc(): Proj {
    for (let i = 0; i < this.pool.length; i++) {
      const j = (this.cursor + i) % this.pool.length;
      if (!this.pool[j].active) { this.cursor = (j + 1) % this.pool.length; return this.pool[j]; }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  private launch(
    kind: Proj['kind'], owner: Character,
    speed: number, gravity: number, fuse: number, life: number,
    color: number, scale: [number, number, number],
    explode: Proj['explode'],
  ): void {
    const p = this.alloc();
    p.active = true;
    p.kind = kind;
    p.owner = owner;
    p.team = owner.team;
    p.gravity = gravity;
    p.fuse = fuse;
    p.life = life;
    p.explode = explode;
    p.radius = 0.22;
    p.trail = 0;
    // 起点：眼睛略前方，避免出生就撞自己
    _o.set(owner.pos.x, owner.pos.y + owner.eyeHeight, owner.pos.z);
    owner.aimDir(_d);
    p.x = _o.x + _d.x * 0.6;
    p.y = _o.y + _d.y * 0.6 - 0.08;
    p.z = _o.z + _d.z * 0.6;
    p.vx = _d.x * speed + owner.vel.x * 0.3;
    p.vy = _d.y * speed + owner.vel.y * 0.3;
    p.vz = _d.z * speed + owner.vel.z * 0.3;
    p.mesh.visible = true;
    (p.mesh.material as THREE.MeshLambertMaterial).color.set(color);
    p.mesh.scale.set(scale[0], scale[1], scale[2]);
    p.mesh.position.set(p.x, p.y, p.z);
  }

  spawnRocket(owner: Character, weapon: Weapon): void {
    const pr = weapon.def.projectile!;
    this.launch('rocket', owner, pr.speed, pr.gravity, 6, 6,
      0x6a7040, [0.11, 0.11, 0.55], { ...pr.explode });
  }

  spawnShockwave(owner: Character): void {
    this.launch('shockwave', owner, 24, 11, 0.95, 5,
      0x8fd8ff, [0.26, 0.26, 0.26],
      { radius: 6.5, damage: 46, impulse: 30, structure: 135 });
  }

  spawnCloakBomb(owner: Character): void {
    this.launch('cloakbomb', owner, 19, 17, 1.4, 5,
      0x9be8ff, [0.22, 0.22, 0.22], null);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      p.fuse -= dt;
      if (p.life <= 0) { this.deactivate(p); continue; }

      p.vy += p.gravity * dt;
      const speed = Math.hypot(p.vx, p.vy, p.vz);
      const steps = Math.min(6, Math.max(1, Math.ceil((speed * dt) / 0.6)));
      const sdt = dt / steps;
      let detonate = false;
      let hx = p.x, hy = p.y, hz = p.z;

      for (let s = 0; s < steps && !detonate; s++) {
        const nx = p.x + p.vx * sdt;
        const ny = p.y + p.vy * sdt;
        const nz = p.z + p.vz * sdt;
        const seg = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
        if (seg > 1e-5) {
          _o.set(p.x, p.y, p.z);
          _n.set(nx - p.x, ny - p.y, nz - p.z).normalize();

          // 世界
          if (this.game.physics.raycast(_o, _n, seg + p.radius, _wh)) {
            hx = _o.x + _n.x * _wh.dist;
            hy = _o.y + _n.y * _wh.dist;
            hz = _o.z + _n.z * _wh.dist;
            detonate = true;
            break;
          }
          // 角色（不打自己人）
          if (this.game.combat.raycastCharacters(_o, _n, seg + p.radius, _ch, p.team, p.owner)) {
            hx = _ch.px; hy = _ch.py; hz = _ch.pz;
            detonate = true;
            break;
          }
          // 护盾
          if (this.game.gadgetSystem.raycastShields(_o, _n, seg + p.radius, _sh)) {
            if (_sh.shield.team !== p.team) {
              hx = _o.x + _n.x * _sh.dist;
              hy = _o.y + _n.y * _sh.dist;
              hz = _o.z + _n.z * _sh.dist;
              detonate = true;
              break;
            }
          }
        }
        p.x = nx; p.y = ny; p.z = nz;
      }

      // 火箭尾迹
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.03;
        this.game.fx.smoke(p.x, p.y, p.z, p.kind === 'rocket' ? 0.45 : 0.3);
        if (p.kind === 'rocket') this.game.fx.flame(p.x, p.y, p.z, 0.5);
      }

      p.mesh.position.set(p.x, p.y, p.z);
      if (speed > 0.01) {
        _d.set(p.vx, p.vy, p.vz).normalize();
        p.mesh.lookAt(p.x + _d.x, p.y + _d.y, p.z + _d.z);
      }

      if (!detonate && p.fuse <= 0) {
        detonate = true;
        hx = p.x; hy = p.y; hz = p.z;
      }
      if (detonate) {
        this.detonate(p, hx, hy, hz);
        this.deactivate(p);
      }
    }
  }

  private detonate(p: Proj, x: number, y: number, z: number): void {
    if (p.kind === 'cloakbomb') {
      this.game.gadgetSystem.createField(p.owner!, 'cloak', x, Math.max(y, 0.6), z, 5.5, 9);
      this.game.fx.ring(x, y, z, 5.5, 0x9be8ff);
      this.game.fx.explosion(x, y, z, 2.0, 0x9be8ff, false);
      this.game.audio?.play('cloak', _o.set(x, y, z), 0.8);
      return;
    }
    const e = p.explode!;
    const cause = p.kind === 'shockwave' ? 'shockwave' : 'rpg';
    this.game.combat.explode(x, y, z, e.radius, e.damage, e.impulse, e.structure, p.owner, cause);
  }

  private deactivate(p: Proj): void {
    p.active = false;
    p.mesh.visible = false;
  }

  clear(): void {
    for (const p of this.pool) this.deactivate(p);
  }
}
