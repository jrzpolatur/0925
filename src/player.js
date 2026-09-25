import * as THREE from 'three';
import { B } from './world.js';

const GRAVITY = 30;
const JUMP_V = 11.8;
const WALK = 7.4;          // 行走（原 11.6）
const SPRINT = 12.8;       // 疾跑（原 24.5）
const CROUCH = 4.2;        // 蹲走（原 6.4）
const AIR_CTRL = 0.28;
const ACCEL = 60;
const MOVE_DAMP = 0.9;      // 有输入时的轻微阻尼（保证能跑到 maxSpeed）
const STOP_DAMP = 14;       // 松手时的刹车
const AIR_CAP = 1.12;       // 空中速度上限系数

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;

    this.pos = new THREE.Vector3(0, B, 0);       // 脚底位置
    this.vel = new THREE.Vector3();
    this.radius = 0.55;
    this.height = 1.85;
    this.eye = 1.68;

    this.hp = 150;
    this.maxHp = 150;
    this.armor = 50;
    this.maxArmor = 100;
    this.speedMul = 1;
    this.armorSpeedMul = 1;
    this.boost = 1;
    this.boostT = 0;

    this.onGround = false;
    this.crouching = false;
    this.sprinting = false;
    this.dead = false;

    this.yaw = 0;
    this.pitch = 0;

    this.bob = 0;
    this.bobAmount = 0;
    this.sprintT = 0;       // 0 = 行走姿态，1 = 疾跑姿态（平滑过渡，供相机 / 枪模用）
    this.recoilPitch = 0;   // 后坐力附加俯仰
    this.recoilYaw = 0;
    this.shake = 0;
    this.landShake = 0;

    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
  }

  get eyeHeight() {
    return this.crouching ? this.eye * 0.62 : this.eye;
  }
  get curHeight() {
    return this.crouching ? this.height * 0.66 : this.height;
  }

  /** 眼睛位置 */
  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** 朝向（含后坐力偏移） */
  lookDir(out = new THREE.Vector3()) {
    const p = this.pitch + this.recoilPitch;
    const y = this.yaw + this.recoilYaw;
    return out.set(
      -Math.sin(y) * Math.cos(p),
      Math.sin(p),
      -Math.cos(y) * Math.cos(p)
    );
  }

  applyMouse(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  addRecoil(pitch, yaw) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  update(dt, input, canMove = true) {
    // 后坐力回复
    if (this.boostT > 0) { this.boostT -= dt; if (this.boostT <= 0) this.boost = 1; }
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 9, dt);
    this.shake = THREE.MathUtils.damp(this.shake, 0, 7, dt);
    this.landShake = THREE.MathUtils.damp(this.landShake, 0, 8, dt);

    // 输入方向
    let ix = 0, iz = 0;
    if (canMove && !this.dead) {
      if (input.down('KeyW')) iz += 1;
      if (input.down('KeyS')) iz -= 1;
      if (input.down('KeyA')) ix -= 1;
      if (input.down('KeyD')) ix += 1;
    }

    // 只要有移动输入 + Shift 就疾跑（不限方向）
    this.sprinting = canMove && !this.dead && input.down('ShiftLeft')
      && (ix !== 0 || iz !== 0) && !this.crouching;
    const wantCrouch = canMove && !this.dead && (input.down('ControlLeft') || input.down('KeyC'));
    if (wantCrouch !== this.crouching) {
      // 起身前先确认头顶有空间
      if (!wantCrouch) {
        const testH = this.height;
        if (!this.world.boxOverlaps(this.pos.x, this.pos.y, this.pos.z, this.radius, testH)) {
          this.crouching = false;
        }
      } else this.crouching = true;
    }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 前 = (-sin, 0, -cos)，右 = (cos, 0, -sin)
    this.forward.set(-sin, 0, -cos);
    this.right.set(cos, 0, -sin);

    const wish = new THREE.Vector3()
      .addScaledVector(this.forward, iz)
      .addScaledVector(this.right, ix);
    if (wish.lengthSq() > 0) wish.normalize();

    const maxSpeed = (this.crouching ? CROUCH : (this.sprinting ? SPRINT : WALK)) * this.speedMul * this.boost;

    if (this.onGround) {
      if (wish.lengthSq() > 0) {
        // 有输入：轻阻尼 + 加速，最后硬性限速到 maxSpeed
        const k = Math.exp(-MOVE_DAMP * dt);
        this.vel.x *= k; this.vel.z *= k;
        this._accelerate(wish, maxSpeed, ACCEL * dt);
        this._clampSpeed(maxSpeed);
      } else {
        // 松手：快速刹车
        const k = Math.exp(-STOP_DAMP * dt);
        this.vel.x *= k; this.vel.z *= k;
        if (Math.hypot(this.vel.x, this.vel.z) < 0.12) { this.vel.x = 0; this.vel.z = 0; }
      }
    } else {
      if (wish.lengthSq() > 0) this._accelerate(wish, maxSpeed, ACCEL * AIR_CTRL * dt);
      this._clampSpeed(maxSpeed * AIR_CAP);
    }

    // 跳跃
    if (canMove && !this.dead && input.down('Space') && this.onGround) {
      this.vel.y = JUMP_V;
      this.onGround = false;
    }

    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -60) this.vel.y = -60;

    // 逐轴移动 + 碰撞
    const wasGround = this.onGround;
    const fallSpeed = this.vel.y;
    this.onGround = false;
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this._moveAxis('y', this.vel.y * dt);

    if (!wasGround && this.onGround && fallSpeed < -8) {
      this.landShake = Math.min(0.5, -fallSpeed * 0.02);
    }

    // 掉出世界
    if (this.pos.y < -30) {
      this.pos.set(0, B + 2, 0);
      this.vel.set(0, 0, 0);
    }

    // 走路 / 疾跑摆动：疾跑步频更快、幅度更大（bobAmount 在 _updateCamera 里按 sprintT 放大）
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.sprintT = THREE.MathUtils.damp(this.sprintT, this.sprinting && this.onGround ? 1 : 0, 9, dt);
    this.bob += dt * hSpeed * (1.55 + this.sprintT * 0.55);
    const moveK = this.onGround ? Math.min(hSpeed / WALK, 1) : 0;
    this.bobAmount = THREE.MathUtils.damp(this.bobAmount, moveK, 8, dt);

    this._updateCamera(dt);
  }

  _clampSpeed(max) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > max) {
      const s = max / sp;
      this.vel.x *= s; this.vel.z *= s;
    }
  }

  _accelerate(wish, maxSpeed, accel) {
    if (wish.lengthSq() === 0) return;
    const current = this.vel.x * wish.x + this.vel.z * wish.z;
    const add = Math.max(0, maxSpeed - current);
    const a = Math.min(accel, add);
    this.vel.x += wish.x * a;
    this.vel.z += wish.z * a;
  }

  _moveAxis(axis, amount) {
    if (amount === 0) return;
    const old = this.pos[axis];
    this.pos[axis] = old + amount;
    if (this.world.boxOverlaps(this.pos.x, this.pos.y, this.pos.z, this.radius, this.curHeight)) {
      this.pos[axis] = old;
      if (axis === 'y') {
        if (amount < 0) this.onGround = true;
        this.vel.y = 0;
      } else {
        this.vel[axis] = 0;
      }
    }
    if (axis === 'y' && !this.onGround && amount < 0) {
      // 贴地检测 + 吸附到方块顶面，避免逐帧下沉
      const probe = this.pos.y - 0.08;
      if (this.world.boxOverlaps(this.pos.x, probe, this.pos.z, this.radius, this.curHeight)) {
        const gy = Math.floor(probe / B);
        this.pos.y = (gy + 1) * B;
        this.vel.y = 0;
        this.onGround = true;
      }
    }
  }

  _updateCamera(dt) {
    // 行走：轻微上下；疾跑：幅度 ~2.2 倍 + 明显左右晃 + 轻微滚转
    const amp = this.bobAmount * (1 + this.sprintT * 1.2);
    const bobY = Math.sin(this.bob * 2) * 0.05 * amp;
    const bobX = Math.cos(this.bob) * 0.04 * amp;
    const shakeX = (Math.random() - 0.5) * this.shake * 0.5;
    const shakeY = (Math.random() - 0.5) * this.shake * 0.5;

    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw) + shakeX,
      this.pos.y + this.eyeHeight + bobY + shakeY,
      this.pos.z - bobX * Math.sin(this.yaw)
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw + this.recoilYaw);
    this.camera.rotateX(this.pitch + this.recoilPitch);
    this.camera.rotateZ(Math.sin(this.bob) * (0.010 + this.sprintT * 0.016) * this.bobAmount + (Math.random() - 0.5) * this.landShake * 0.2);
  }

  /** 受伤；返回实际死亡 */
  damage(amount) {
    if (this.dead) return false;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest * 0.6);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.hp -= rest;
    this.shake = Math.min(0.9, this.shake + amount * 0.012);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }
  addArmor(v) { this.armor = Math.min(this.maxArmor, this.armor + v); }

  /** 应用护甲配装 */
  setArmorProfile(def) {
    this.maxArmor = 100;
    this.armorProfile = def.armor;
    this.armor = def.armor;
    this.armorSpeedMul = def.speedMul;
  }

  respawn(pos) {
    this.pos.copy(pos);
    this.pos.y += 0.2;
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.armor = this.armorProfile ?? 50;
    this.dead = false;
    this.pitch = 0;
  }
}
