import * as THREE from 'three';
import { CFG } from './Config';
import { Input } from './Input';
import type { BuildId, TeamId } from './Types';
import { RendererSetup } from '../renderer/RendererSetup';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { DestructionSystem } from '../destruction/DestructionSystem';
import { Navigation } from '../ai/Navigation';
import { CombatSystem } from '../combat/CombatSystem';
import { ProjectileSystem } from '../combat/Projectiles';
import { GadgetSystem } from '../gadgets/GadgetSystem';
import { FXSystem } from '../effects/FXSystem';
import { AudioManager } from '../audio/AudioManager';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { TDM } from '../game/TDM';
import { MonacoChurchMap, type MapData } from '../map/MonacoChurchMap';
import { Character } from '../characters/Character';
import { PlayerController } from '../player/PlayerController';
import { AIController } from '../ai/AIController';
import { BUILD_ORDER, BUILDS } from '../game/Loadout';

const BLUE_NAMES = ['NOVA', 'PIXEL', 'AXIOM', 'KITE', 'DRIFT', 'VOLT', 'RIVET'];
const RED_NAMES = ['EMBER', 'ONYX', 'SLATE', 'TORQUE', 'BLAZE', 'GRIM', 'QUARTZ'];

/**
 * 游戏主类：装配所有子系统并驱动主循环。
 *
 * 时间策略：
 *  - 渲染：每帧（上限受显示器刷新率约束）
 *  - 物理 / 移动：固定步长 1/60（最多 4 次子步，避免卡顿雪崩）
 *  - AI：30Hz（内部再分频：感知 12Hz / 决策 8Hz / 导航 3Hz）
 */
export class Game {
  canvas: HTMLCanvasElement;
  renderer: RendererSetup;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  input: Input;

  physics = new PhysicsWorld();
  nav: Navigation;
  destruction: DestructionSystem;
  fx: FXSystem;
  audio = new AudioManager();
  combat: CombatSystem;
  projectiles: ProjectileSystem;
  gadgetSystem: GadgetSystem;
  hud: HUD;
  menu: Menu;
  tdm: TDM;

  characters: Character[] = [];
  player: Character | null = null;
  playerController: PlayerController | null = null;
  private ais: { char: Character; ctrl: AIController }[] = [];
  mapData!: MapData;

  time = 0;
  running = false;
  paused = false;

  private acc = 0;
  private aiAcc = 0;
  private last = performance.now();
  private perfEl: HTMLElement;
  private perfT = 0;
  private frames = 0;
  private fps = 0;
  private showPerf = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.renderer = new RendererSetup(canvas);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;
    this.input = new Input(canvas);

    this.nav = new Navigation(this);
    this.destruction = new DestructionSystem(
      this.scene, 16000, CFG.budget.debris,
      (x, z) => this.nav.groundHeightAt(x, z),
    );
    this.fx = new FXSystem(this.scene, this.camera,
      (x, z) => this.nav.groundHeightAt(x, z),
      (v) => this.playerController?.shake(v));
    this.combat = new CombatSystem(this);
    this.projectiles = new ProjectileSystem(this);
    this.gadgetSystem = new GadgetSystem(this);
    this.hud = new HUD(this, uiRoot);
    this.menu = new Menu(this, uiRoot);
    this.tdm = new TDM(this);

    // 体素破坏 -> 导航局部失效（AI 能穿过新炸开的洞）
    this.destruction.onChange = (x, _y, z, r) => this.nav.invalidateArea(x, _y, z, r);

    // ---- 地图 ----
    const map = new MonacoChurchMap(this.scene, this.physics, this.destruction);
    this.mapData = map.build();
    this.physics.provider = this.destruction;
    this.physics.buildLookup();
    const tNav = performance.now();
    this.nav.build(
      this.mapData.bounds.minX, this.mapData.bounds.minZ,
      this.mapData.bounds.maxX, this.mapData.bounds.maxZ,
    );
    console.info(`[nav] 导航网格构建 ${(performance.now() - tNav).toFixed(0)}ms · 单元 ${this.nav.walkable.length}`);

    this.perfEl = document.createElement('div');
    this.perfEl.className = 'perf';
    this.perfEl.style.display = 'none';
    uiRoot.appendChild(this.perfEl);

    // 指针锁定：解锁即暂停
    this.input.setLockHandler((locked) => {
      if (!locked && this.running && !this.tdm.over) this.pause();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        this.showPerf = !this.showPerf;
        this.perfEl.style.display = this.showPerf ? '' : 'none';
      }
      if (e.code === 'Escape' && this.running) {
        if (this.paused) this.resume(); else this.pause();
      }
    });

    this.hud.setVisible(false);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ 对局
  startMatch(build: BuildId): void {
    this.audio.init();
    this.disposeCharacters();

    // 玩家队伍 0，敌方 1
    const builds0: BuildId[] = [build];
    const builds1: BuildId[] = [];
    for (let i = 0; i < 4; i++) builds0.push(BUILD_ORDER[Math.floor(Math.random() * 3)]);
    for (let i = 0; i < 5; i++) builds1.push(BUILD_ORDER[Math.floor(Math.random() * 3)]);

    let id = 0;
    const namesB = [...BLUE_NAMES].sort(() => Math.random() - 0.5);
    const namesR = [...RED_NAMES].sort(() => Math.random() - 0.5);

    for (let i = 0; i < 5; i++) {
      const isPlayer = i === 0;
      const c = new Character(this, id++, isPlayer ? 'YOU' : namesB[i % namesB.length], 0 as TeamId, builds0[i]);
      this.characters.push(c);
      if (isPlayer) this.setupPlayer(c);
      else this.setupAI(c);
    }
    for (let i = 0; i < 5; i++) {
      const c = new Character(this, id++, namesR[i % namesR.length], 1 as TeamId, builds1[i]);
      this.characters.push(c);
      this.setupAI(c);
    }

    for (const c of this.characters) {
      const s = this.tdm.spawnFor(c.team);
      const gy = this.physics.groundAt(s.x, s.z, s.y + 4);
      c.respawn(s.x, (gy === -Infinity ? 0.2 : gy) + 0.1, s.z, s.yaw);
    }

    this.tdm.reset();
    this.hud.hideMatchEnd();
    this.hud.setVisible(true);
    this.menu.hide();
    this.menu.showPause(false);
    this.running = true;
    this.paused = false;
    this.input.requestLock();
    this.hud.toast(`进入战区 · ${BUILDS[build].cn}`);
  }

  restartMatch(): void {
    const build = this.player?.build ?? 'medium';
    this.hud.hideMatchEnd();
    this.startMatch(build);
  }

  backToMenu(): void {
    this.running = false;
    this.paused = false;
    this.input.exitLock();
    this.hud.setVisible(false);
    this.menu.showPause(false);
    this.menu.show();
  }

  private setupPlayer(c: Character): void {
    c.isPlayer = true;
    this.player = c;
    this.playerController = new PlayerController(this, c);
    c.model.setVisible(false);
  }

  private setupAI(c: Character): void {
    this.ais.push({ char: c, ctrl: new AIController(c, this) });
  }

  private disposeCharacters(): void {
    for (const c of this.characters) c.dispose();
    this.characters.length = 0;
    this.ais.length = 0;
    this.player = null;
    if (this.playerController) {
      this.scene.remove(this.camera);
      this.playerController = null;
    }
    this.gadgetSystem.clear();
    this.projectiles.clear();
    this.fx.clear();
    this.destruction.reset();
  }

  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.menu.showPause(true);
    this.input.exitLock();
  }

  resume(): void {
    if (!this.running) return;
    this.paused = false;
    this.menu.showPause(false);
    this.input.requestLock();
  }

  // ------------------------------------------------------------ 主循环
  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > CFG.maxFrameDt) dt = CFG.maxFrameDt;
    this.frames++;

    if (this.running && !this.paused) {
      // 玩家输入每帧采集（视角必须跟手）
      if (this.player && this.playerController && this.player.alive) {
        this.playerController.fillIntent(dt);
      } else if (this.player && this.playerController && !this.player.alive) {
        // 死亡时仍能转动视角
        this.playerController.fillIntent(dt);
      }

      // 固定步长推进物理与角色
      this.acc += dt;
      let steps = 0;
      while (this.acc >= CFG.fixedStep && steps < CFG.maxSubSteps) {
        this.step(CFG.fixedStep);
        this.acc -= CFG.fixedStep;
        steps++;
      }
      if (steps >= CFG.maxSubSteps) this.acc = 0;

      // 每帧系统（视觉 / 投射物 / 道具）
      this.projectiles.update(dt);
      this.gadgetSystem.update(dt);
      this.destruction.update(dt);
      this.fx.update(dt, this.time);
      this.nav.processDirty();
      this.tdm.update(dt);

      if (this.playerController) this.playerController.update(dt);
      this.audio.setListener(this.camera.position);
      this.hud.update(dt);
    }

    this.input.endFrame();
    this.renderer.render();

    // 性能统计
    this.perfT += dt;
    if (this.perfT >= 0.5) {
      this.fps = this.frames / this.perfT;
      this.frames = 0;
      this.perfT = 0;
      if (this.showPerf) this.updatePerf();
    }
  };

  private step(dt: number): void {
    this.time += dt;

    // AI：30Hz（内部再分频决策）
    this.aiAcc += dt;
    const runAI = this.aiAcc >= 1 / 30;
    if (runAI) this.aiAcc = 0;
    if (runAI) {
      for (const a of this.ais) a.ctrl.update(dt * 2);
    }

    for (const c of this.characters) {
      c.update(dt);
      if (!c.alive && c.respawnTimer <= 0) {
        const s = this.tdm.spawnFor(c.team);
        const gy = this.physics.groundAt(s.x, s.z, s.y + 4);
        c.respawn(s.x, (gy === -Infinity ? 0.2 : gy) + 0.1, s.z, s.yaw);
        if (c.isPlayer) {
          this.hud.toast('重新部署');
          if (this.playerController && this.playerController.firstPerson) c.model.setVisible(false);
        }
      }
    }
  }

  private updatePerf(): void {
    const info = this.renderer.renderer.info;
    const c = this.player;
    this.perfEl.textContent =
      `FPS ${this.fps.toFixed(0)}\n` +
      `Draw ${info.render.calls}  Tri ${(info.render.triangles / 1000).toFixed(1)}k\n` +
      `Geo ${info.memory.geometries}  Tex ${info.memory.textures}\n` +
      `破坏单元 ${this.destruction.stats.destroyed}/${this.destruction.stats.cells}\n` +
      `碎片 ${this.destruction.debris.activeCount}  金币 ${this.fx.coins.activeCount}\n` +
      `碰撞盒 ${this.physics.boxes.length}\n` +
      (c ? `状态 ${c.ability.cn} ${(c.ability.cdRatio * 100).toFixed(0)}%` : '');
  }

  // ------------------------------------------------------------ 工具
  /** 世界射线（静态 + 可破坏体素），不含角色 */
  raycast(
    o: THREE.Vector3, d: THREE.Vector3, maxDist: number,
    out: { dist: number; nx: number; ny: number; nz: number } = { dist: Infinity, nx: 0, ny: 0, nz: 0 },
  ): boolean {
    return this.physics.raycast(o, d, maxDist, out);
  }

  /** 网格护盾是否正在生效（用于第三人称与护盾跟随） */
  hasActiveMeshShield(c: Character): boolean {
    return c.ability.id === 'meshshield' && c.ability.active;
  }

  shakeCamera(v: number): void {
    this.playerController?.shake(v);
  }
}
