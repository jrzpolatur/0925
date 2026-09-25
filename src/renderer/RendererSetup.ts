import * as THREE from 'three';
import { CFG } from '../core/Config';

/**
 * 渲染器 + 场景基础环境。
 * 刻意不使用实时阴影（Iris Xe 核显压力大），改用：
 *  - Hemisphere + Directional 两盏灯（无 shadow map）
 *  - 顶点色 + Lambert 材质模拟体素块的明暗
 *  - 场景雾做纵深
 */
export class RendererSetup {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.render.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x9fc7e8);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc7e8);
    // 地中海城市：明亮的天空 + 远处海面雾
    this.scene.fog = new THREE.Fog(0xa8cbe6, CFG.render.fogNear, CFG.render.fogFar);

    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x6b5b47, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    sun.position.set(48, 78, 32);
    this.scene.add(sun);

    // 补一盏反向弱光，避免背面全黑（体素块需要基本体积感）
    const fill = new THREE.DirectionalLight(0x9ab7d8, 0.35);
    fill.position.set(-40, 30, -35);
    this.scene.add(fill);

    this.camera = new THREE.PerspectiveCamera(
      CFG.render.fov,
      window.innerWidth / window.innerHeight,
      CFG.render.near,
      CFG.render.far,
    );
    this.camera.position.set(0, 2, 0);

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
