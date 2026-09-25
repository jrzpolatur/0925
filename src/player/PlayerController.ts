import * as THREE from 'three';
import type { Game } from '../core/Game';
import { CFG } from '../core/Config';
import type { Character } from '../characters/Character';
import { buildViewmodel } from '../weapons/WeaponModels';
import { clamp, damp } from '../core/Utils';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _o = new THREE.Vector3();
const _hit = { dist: Infinity, nx: 0, ny: 0, nz: 0 };

/**
 * 玩家控制器：把键鼠输入写进 Character.intent，然后由 Character.update() 统一处理。
 * 相机支持第一人称 / 第三人称（网格护盾时可切换），并做墙体检测避免穿墙。
 */
export class PlayerController {
  game: Game;
  player: Character;
  camera: THREE.PerspectiveCamera;

  firstPerson = true;
  yaw = 0;
  pitch = 0;

  /** 视图模型（挂在相机下） */
  private viewRoot = new THREE.Group();
  private viewModel: THREE.Group | null = null;
  private weaponId = '';

  /** 相机抖动 */
  private shakeAmt = 0;
  private shakeT = 0;
  /** 后坐力/开火反馈 */
  private kick = 0;
  private kickRot = 0;
  /** 呼吸/走路摆动 */
  private bobT = 0;
  private bobAmt = 0;
  /** 冲刺 FOV */
  private fovExtra = 0;
  /** 第三人称相机距离平滑（避免瞬移） */
  private tpDist = 3.4;

  /** 道具模式：举着道具时右键/LMB 即部署 */
  gadgetMode = false;
  private gadgetSel = 0;

  private shells: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];

  constructor(game: Game, player: Character) {
    this.game = game;
    this.player = player;
    this.camera = game.camera;
    this.camera.add(this.viewRoot);
    game.scene.add(this.camera);
    this.rebuildViewmodel();
  }

  private rebuildViewmodel(): void {
    const id = this.player.weapon.def.id;
    if (this.weaponId === id && this.viewModel) return;
    this.weaponId = id;
    if (this.viewModel) {
      this.viewRoot.remove(this.viewModel);
      this.viewModel.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
    }
    const teamColor = this.player.team === 0 ? 0x2f7fd0 : 0xc23840;
    this.viewModel = buildViewmodel(id, teamColor);
    this.viewRoot.add(this.viewModel);
  }

  getMuzzleWorld(out: THREE.Vector3): boolean {
    const vm = this.viewModel;
    if (!vm) return false;
    const wm = (vm as any).userData.wm;
    if (!wm) return false;
    wm.muzzle.getWorldPosition(out);
    return true;
  }

  toggleThirdPerson(): void {
    this.firstPerson = !this.firstPerson;
    this.player.model.setVisible(!this.firstPerson);
    this.game.hud?.toast(this.firstPerson ? '第一人称' : '第三人称');
  }

  shake(v: number): void {
    this.shakeAmt = Math.min(1.6, this.shakeAmt + v);
  }

  recoilKick(shake: number, vertical: number): void {
    this.kick = Math.min(1.4, this.kick + vertical * 8);
    this.kickRot = Math.min(0.6, this.kickRot + vertical * 1.2);
    this.shake(shake * 0.22);
  }

  dashFeedback(): void {
    this.shake(0.28);
    this.fovExtra = Math.max(this.fovExtra, 7);
  }

  jumpPadFeedback(): void {
    this.shake(0.3);
  }

  ejectShell(): void {
    if (!this.viewModel) return;
    _v.set(0.12, 0.05, 0.05);
    this.viewModel.localToWorld(_v);
    this.shells.push({
      x: _v.x, y: _v.y, z: _v.z,
      vx: (Math.random() * 1.5 + 1.5), vy: Math.random() * 1.5 + 1.2, vz: Math.random() * 1 - 0.5,
      life: 0.7,
    });
  }

  // ---------------------------------------------------------------- 输入
  fillIntent(dt: number): void {
    const input = this.game.input;
    const c = this.player;
    const i = c.intent;

    // 视角
    this.yaw += input.lookYaw;
    this.pitch = clamp(this.pitch + input.lookPitch, -1.45, 1.45);

    // 移动
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz -= 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;

    // 武器 / 道具切换
    if (input.wheel !== 0) {
      if (this.gadgetMode) {
        this.gadgetMode = false;
        this.game.hud?.toast('收起道具');
      }
      c.cycleWeapon(input.wheel > 0 ? 1 : -1);
      this.rebuildViewmodel();
    }
    if (input.wasPressed('Digit1')) { this.setWeaponMode(0); }
    if (input.wasPressed('Digit2')) { this.setWeaponMode(1); }
    if (input.wasPressed('KeyG')) this.cycleGadgetMode();
    if (input.wasPressed('KeyV')) this.toggleThirdPerson();

    i.moveX = mx;
    i.moveZ = mz;
    i.yaw = this.yaw;
    i.pitch = this.pitch;
    i.jump = input.isDown('Space');
    i.sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    i.ads = input.right && !this.gadgetMode;
    i.reload = input.wasPressed('KeyR');
    i.ability = input.wasPressed('KeyQ');
    i.interact = input.wasPressed('KeyE');

    // 开火 / 使用道具
    if (this.gadgetMode) {
      i.gadget = input.leftJust || input.rightJust;
      i.fire = false;
      i.firePressed = false;
    } else {
      i.fire = input.left;
      i.firePressed = input.leftJust;
      i.gadget = input.wasPressed('KeyF');
    }

    // 武器切换后重建视图模型
    if (this.weaponId !== c.weapon.def.id) this.rebuildViewmodel();
    void dt;
  }

  private setWeaponMode(idx: number): void {
    if (this.gadgetMode) { this.gadgetMode = false; this.game.hud?.toast('收起道具'); }
    this.player.selectWeapon(idx);
    this.rebuildViewmodel();
  }

  /** G：循环切换「武器 → 道具1 → 道具2 → 武器」 */
  private cycleGadgetMode(): void {
    const c = this.player;
    if (!this.gadgetMode) {
      if (c.gadgets.length === 0) return;
      this.gadgetMode = true;
      this.gadgetSel = 0;
      c.gadgetIndex = 0;
      this.game.hud?.toast(`举起 ${c.gadget.def.cn} · 左键/右键部署`);
      return;
    }
    this.gadgetSel++;
    if (this.gadgetSel >= c.gadgets.length) {
      this.gadgetMode = false;
      this.game.hud?.toast('收起道具');
    } else {
      c.gadgetIndex = this.gadgetSel;
      this.game.hud?.toast(`举起 ${c.gadget.def.cn}`);
    }
  }

  // ---------------------------------------------------------------- 相机
  update(dt: number): void {
    const c = this.player;
    this.rebuildViewmodel();

    // FOV：ADS 收窄 + 冲刺外扩 + Dash 冲击
    const targetFov = CFG.render.fov
      + (CFG.render.adsFov - CFG.render.fov) * c.ads
      + this.fovExtra
      + (c.sprinting ? 4 : 0);
    this.camera.fov = damp(this.camera.fov, targetFov, 12, dt);
    this.camera.updateProjectionMatrix();
    this.fovExtra = damp(this.fovExtra, 0, 6, dt);

    // 抖动衰减
    this.shakeAmt = damp(this.shakeAmt, 0, 7, dt);
    this.shakeT += dt * 42;
    this.kick = damp(this.kick, 0, 14, dt);
    this.kickRot = damp(this.kickRot, 0, 12, dt);

    const speed = Math.hypot(c.vel.x, c.vel.z);
    this.bobT += dt * (6 + speed * 1.1);
    this.bobAmt = damp(this.bobAmt, c.grounded ? Math.min(1, speed / 6) : 0, 8, dt);

    const shakeX = Math.sin(this.shakeT * 1.7) * this.shakeAmt * 0.012;
    const shakeY = Math.cos(this.shakeT * 2.3) * this.shakeAmt * 0.012;
    const bobX = Math.sin(this.bobT) * 0.022 * this.bobAmt;
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.026 * this.bobAmt;

    if (this.firstPerson) {
      _o.set(c.pos.x, c.pos.y + c.eyeHeight + bobY, c.pos.z);
      // 轻微侧倾（移动惯性）
      const lean = clamp(-c.vel.x * 0.004 + c.vel.z * 0, -0.05, 0.05);
      this.camera.position.copy(_o);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      this.camera.position.x += cy * bobX;
      this.camera.position.z += -sy * bobX;
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw + c.recoilYaw + shakeX + lean * 0.2;
      this.camera.rotation.x = this.pitch + c.recoilPitch + shakeY;
      this.camera.rotation.z = lean + shakeX * 0.4;
    } else {
      this.updateThirdPerson(dt, bobX, bobY, shakeX, shakeY);
    }

    this.updateViewmodel(dt, speed);
    this.updateShells(dt);
  }

  /** 第三人称：相机在角色后方，做墙体检测避免穿墙/看到角色内部 */
  private updateThirdPerson(dt: number, bobX: number, bobY: number, shakeX: number, shakeY: number): void {
    const c = this.player;
    const want = 3.4;
    // 距离平滑，避免切换时瞬移
    this.tpDist = damp(this.tpDist, want, 9, dt);

    const headY = c.pos.y + c.eyeHeight + 0.25;
    // 目标位置：角色后上方
    _d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); // 背后方向 = -forward
    const desiredX = c.pos.x + _d.x * this.tpDist;
    const desiredZ = c.pos.z + _d.z * this.tpDist;
    const desiredY = headY + 0.55 - this.pitch * 1.4;

    // 从头部向目标位置做射线，撞墙就把相机拉近
    _o.set(c.pos.x, headY, c.pos.z);
    let tx = desiredX, ty = desiredY, tz = desiredZ;
    const dx = desiredX - _o.x, dy = desiredY - _o.y, dz = desiredZ - _o.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    _v.set(dx / dist, dy / dist, dz / dist);
    if (this.game.physics.raycast(_o, _v, dist, _hit)) {
      const safe = Math.max(0.75, _hit.dist - 0.32);
      tx = _o.x + _v.x * safe;
      ty = _o.y + _v.y * safe;
      tz = _o.z + _v.z * safe;
    }
    this.camera.position.set(
      damp(this.camera.position.x, tx + bobX, 22, dt),
      damp(this.camera.position.y, ty + bobY, 22, dt),
      damp(this.camera.position.z, tz, 22, dt),
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = damp(this.camera.rotation.y, this.yaw, 20, dt) + shakeX * 0.5;
    this.camera.rotation.x = damp(this.camera.rotation.x, this.pitch * 0.6, 20, dt) + shakeY * 0.5;
    this.camera.rotation.z = damp(this.camera.rotation.z, 0, 14, dt);
  }

  private updateViewmodel(dt: number, speed: number): void {
    const vm = this.viewModel;
    if (!vm) return;
    const c = this.player;
    const ads = c.ads;
    const sprint = c.sprinting && speed > 1 ? 1 : 0;
    const gadget = this.gadgetMode ? 1 : 0;

    // 基础（腰射）位置
    let px = 0.20, py = -0.20, pz = -0.42;
    let rx = 0, ry = 0.06, rz = 0;
    // 开镜：贴近视线中心，绝不遮挡视野
    px += (0.0 - px) * ads;
    py += (-0.132 - py) * ads;
    pz += (-0.30 - pz) * ads;
    ry += (0.0 - 0.06) * ads;
    // 冲刺：收枪
    px += 0.10 * sprint;
    py += -0.09 * sprint;
    rz += 0.55 * sprint;
    rx += 0.35 * sprint;
    // 举道具：枪放下
    py += -0.22 * gadget;
    rx += 0.9 * gadget;

    // 走路摆动
    px += Math.sin(this.bobT) * 0.012 * this.bobAmt * (1 - ads);
    py += Math.abs(Math.cos(this.bobT)) * 0.010 * this.bobAmt * (1 - ads);

    // 后坐力：模型向后 + 上抬
    py += this.kick * 0.02;
    pz += this.kick * 0.05;
    rx += -this.kickRot * 0.6;

    vm.position.set(px, py, pz);
    vm.rotation.set(rx, ry, rz);
    // 第三人称时隐藏第一人称视图模型（否则会和角色模型重叠）
    vm.visible = this.firstPerson;
    void dt;
  }

  private updateShells(dt: number): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) { this.shells.splice(i, 1); continue; }
      s.vy += CFG.gravity * dt * 0.3;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (Math.random() < dt * 30) {
        this.game.fx.spawn('spark', s.x, s.y, s.z, 0, 0, 0, 0.02, 0xffd070, 0.12);
      }
    }
  }
}
