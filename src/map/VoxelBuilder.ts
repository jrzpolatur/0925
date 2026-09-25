import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 体素网格构建器。
 * 把大量 BoxGeometry 合并成一个 Mesh，并用「逐面明暗 + 随机抖动」的顶点色
 * 模拟像素体素块的光照块面感，避免贴图开销，同时把 Draw Call 压到极低。
 */
export class MeshBuilder {
  private geos: THREE.BufferGeometry[] = [];

  /** 立方体面顺序：+X -X +Y -Y +Z -Z，用逐面亮度伪造 AO/方向光 */
  private static FACE_TINT = [0.86, 0.82, 1.0, 0.55, 0.94, 0.9];

  addBox(
    cx: number, cy: number, cz: number,
    sx: number, sy: number, sz: number,
    color: number | THREE.Color,
    jitter = 0.06,
  ): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, cy, cz);
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = g.attributes.position.count; // 24
    const arr = new Float32Array(n * 3);
    for (let f = 0; f < 6; f++) {
      const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      const t = MeshBuilder.FACE_TINT[f] * j;
      for (let v = 0; v < 4; v++) {
        const i = (f * 4 + v) * 3;
        arr[i] = c.r * t;
        arr[i + 1] = c.g * t;
        arr[i + 2] = c.b * t;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }

  /** 体素台阶（用于教堂前广场、屋顶上下） */
  addStairs(
    cx: number, cy: number, cz: number,
    width: number, steps: number, stepH: number, stepD: number,
    color: number, axis: 'x' | 'z' = 'z',
  ): void {
    for (let i = 0; i < steps; i++) {
      const h = stepH * (i + 1);
      const off = stepD * i;
      if (axis === 'z') this.addBox(cx, cy + h / 2, cz + off, width, h, stepD, color);
      else this.addBox(cx + off, cy + h / 2, cz, stepD, h, width, color);
    }
  }

  /** 体素斜坡（阶梯近似，保持像素块风格） */
  addSlope(
    cx: number, cy: number, cz: number,
    sx: number, sy: number, sz: number,
    color: number, axis: 'x' | 'z' = 'x', dir = 1,
  ): void {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const h = sy * (dir > 0 ? 1 - t : t);
      const off = (axis === 'x' ? sx : sz) * (t - 0.5);
      if (axis === 'x') this.addBox(cx + off, cy + h / 2, cz, sx / steps, h, sz, color);
      else this.addBox(cx, cy + h / 2, cz + off, sx, h, sz / steps, color);
    }
  }

  /** 体素拱门（门窗上方的圆拱用阶梯块近似） */
  addArch(
    cx: number, cy: number, cz: number,
    w: number, h: number, thickness: number,
    color: number, axis: 'x' | 'z' = 'z',
  ): void {
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const t = r / rows;
      const shrink = Math.sin(t * Math.PI * 0.5) * w * 0.42;
      const y = cy + h + r * (h * 0.22);
      const ww = w - shrink;
      if (axis === 'z') this.addBox(cx, y, cz, ww, h * 0.24, thickness, color);
      else this.addBox(cx, y, cz, thickness, h * 0.24, ww, color);
    }
  }

  get count(): number { return this.geos.length; }

  build(material?: THREE.Material): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (!merged) return null;
    const mat = material || new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** 共享的体素材质（所有静态地图共用，减少 shader/状态切换） */
export const VOXEL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
