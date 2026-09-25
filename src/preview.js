import * as THREE from 'three';
import { buildWeaponModel, WEAPON_BY_ID } from './weapons.js';
import { buildOptic } from './optics.js';

/** 配装界面里的 3D 武器预览 */
export class WeaponPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.setClearColor(0x0a1208, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.02, 40);

    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x3a3a2a, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(1.4, 2, 1.6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.8);
    rim.position.set(-1.5, 0.6, -1.4);
    this.scene.add(rim);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.model = null;
    this.t = 0;
    this.spin = 0;
  }

  set(weaponId, opticId) {
    if (this.model) {
      this.pivot.remove(this.model);
      this.model.traverse(o => { o.geometry?.dispose(); });
      this.model = null;
    }
    const w = WEAPON_BY_ID[weaponId];
    if (!w) return;
    const g = new THREE.Group();
    const body = buildWeaponModel(weaponId);
    g.add(body);
    const optic = buildOptic(opticId);
    if (optic) {
      optic.position.copy(w.rail);
      g.add(optic);
    }

    // 自动居中 + 自动取景
    const box = new THREE.Box3().setFromObject(g);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    body.position.sub(center);
    if (optic) optic.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const d = maxDim * 1.25;
    this.camera.position.set(d * 0.62, d * 0.42, d * 0.92);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = maxDim * 0.05;
    this.camera.far = maxDim * 12;
    this.camera.updateProjectionMatrix();

    this.pivot.add(g);
    this.model = g;
    this.spin = 0;
  }

  update(dt) {
    if (!this.model) return;
    this.t += dt;
    this.spin = THREE.MathUtils.damp(this.spin, 0, 2, dt);
    this.pivot.rotation.y = Math.sin(this.t * 0.7) * 0.42 + this.spin;
    this.pivot.rotation.x = Math.sin(this.t * 0.5) * 0.06;
    this.renderer.render(this.scene, this.camera);
  }
}
