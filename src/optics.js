import * as THREE from 'three';

const DARK = 0x24282d;
const DARK2 = 0x33383e;
const LENS = new THREE.MeshBasicMaterial({
  color: 0x9fd8e8, transparent: true, opacity: 0.18,
  side: THREE.DoubleSide, depthWrite: false,
});
const LENS_G = new THREE.MeshBasicMaterial({
  color: 0xa8ffd0, transparent: true, opacity: 0.14,
  side: THREE.DoubleSide, depthWrite: false,
});

function box(w, h, d, color, x, y, z, parent, mat) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat || new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function tube(rOuter, rInner, len, z, parent, seg = 14) {
  // 用开口圆柱表示镜筒（内壁双面可见，中间镂空能看穿）
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(rOuter, rOuter, len, seg, 1, true),
    new THREE.MeshLambertMaterial({ color: DARK, side: THREE.DoubleSide })
  );
  shell.rotation.x = Math.PI / 2;
  shell.position.z = z;
  parent.add(shell);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(rInner, rInner, len * 0.98, seg, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x05070a, side: THREE.BackSide, transparent: true, opacity: 0.55 })
  );
  inner.rotation.x = Math.PI / 2;
  inner.position.z = z;
  parent.add(inner);
  return shell;
}

// ---------------------------------------------------------------- 瞄具定义
// 原点 = 导轨接触点；lensHeight/lensZ = 镜片中心相对原点的位置
// zoom = 开镜放大倍率（实际 FOV = 基础 FOV ÷ zoom）；1.1 左右 = 放大 10%
export const OPTICS = {
  iron: {
    id: 'iron', name: '机械瞄具', short: 'IRONS', desc: '原厂机瞄 · 1.08× 微放大',
    lensHeight: 0, lensZ: 0, zoom: 1.08, relief: 0.34, reticle: 'iron', mag: 1.08,
    build: null,
  },
  micro: {
    id: 'micro', name: '微型反射', short: 'COMPACT', desc: '1.10× 放大 · 体积小视野好',
    lensHeight: 0.036, lensZ: 0, zoom: 1.10, relief: 0.24, reticle: 'dot', mag: 1.10,
    build() {
      const g = new THREE.Group();
      box(0.030, 0.011, 0.052, DARK, 0, 0.006, 0, g);
      box(0.005, 0.038, 0.044, DARK2, -0.0165, 0.031, 0, g);
      box(0.005, 0.038, 0.044, DARK2, 0.0165, 0.031, 0, g);
      box(0.038, 0.006, 0.044, DARK, 0, 0.054, 0, g);
      box(0.038, 0.005, 0.044, DARK, 0, 0.008, 0, g);
      const lens = box(0.026, 0.040, 0.001, 0, 0, 0.031, -0.023, g, LENS);
      lens.renderOrder = 2;
      return g;
    },
  },
  reflex: {
    id: 'reflex', name: '反射式红点', short: 'REFLECTOR', desc: '1.12× 放大 · 通用红点',
    lensHeight: 0.048, lensZ: -0.01, zoom: 1.12, relief: 0.22, reticle: 'reflex', mag: 1.12,
    build() {
      const g = new THREE.Group();
      box(0.034, 0.020, 0.046, DARK, 0, 0.010, 0, g);
      tube(0.025, 0.020, 0.056, -0.004, g, 16);
      const lens = box(0.044, 0.044, 0.001, 0, 0, 0.044, -0.028, g, LENS);
      lens.renderOrder = 2;
      box(0.038, 0.006, 0.006, DARK2, 0, 0.044, 0.024, g);
      return g;
    },
  },
  holo: {
    id: 'holo', name: '全息瞄准镜', short: 'HOLO', desc: '1.15× 放大 · 方形大视窗',
    lensHeight: 0.055, lensZ: -0.012, zoom: 1.15, relief: 0.21, reticle: 'holo', mag: 1.15,
    build() {
      const g = new THREE.Group();
      box(0.042, 0.024, 0.072, DARK, 0, 0.012, 0.004, g);
      // 方形护罩（细边框，尽量少挡视野）
      box(0.005, 0.072, 0.054, DARK2, -0.0275, 0.052, -0.006, g);
      box(0.005, 0.072, 0.054, DARK2, 0.0275, 0.052, -0.006, g);
      box(0.060, 0.005, 0.054, DARK2, 0, 0.084, -0.006, g);
      box(0.060, 0.005, 0.054, DARK2, 0, 0.020, -0.006, g);
      const lens = box(0.048, 0.062, 0.001, 0, 0, 0.052, -0.032, g, LENS_G);
      lens.renderOrder = 2;
      return g;
    },
  },
  scope: {
    id: 'scope', name: '3× 瞄准镜', short: '3X SCOPE', desc: '3 倍放大 · 远距离压制',
    lensHeight: 0.052, lensZ: 0.10, zoom: 3.0, relief: 0.20, reticle: 'scope', mag: 3,
    hideOnAds: true,   // 放大瞄具：举枪时隐藏 3D 镜筒，改用屏幕镜筒遮罩，避免穿模
    build() {
      const g = new THREE.Group();
      box(0.030, 0.024, 0.026, DARK, 0, 0.012, -0.09, g);
      box(0.030, 0.024, 0.026, DARK, 0, 0.012, 0.07, g);
      tube(0.021, 0.018, 0.24, -0.01, g, 16);
      tube(0.026, 0.021, 0.055, -0.14, g, 16);  // 物镜
      tube(0.024, 0.020, 0.050, 0.11, g, 16);   // 目镜
      box(0.020, 0.020, 0.026, DARK2, 0, 0.048, 0.0, g);  // 调节钮
      const lens = box(0.044, 0.044, 0.001, 0, 0, 0.048, -0.165, g,
        new THREE.MeshBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      lens.renderOrder = 2;
      return g;
    },
  },
};

export const OPTIC_ORDER = ['iron', 'micro', 'reflex', 'holo', 'scope'];

/** 生成瞄具模型 */
export function buildOptic(id) {
  const def = OPTICS[id] || OPTICS.iron;
  return def.build ? def.build() : null;
}

/** 镜片中心（相对导轨接触点） */
export function opticLensLocal(id) {
  const def = OPTICS[id] || OPTICS.iron;
  return new THREE.Vector3(0, def.lensHeight, def.lensZ);
}

// ---------------------------------------------------------------- 准星绘制
export function drawReticle(canvas, type, color = '#ff3b30') {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  const dot = (r, c = color, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  const line = (x1, y1, x2, y2, w, c, a = 1) => {
    ctx.globalAlpha = a;
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = 1;
  };

  switch (type) {
    case 'dot':
      dot(2.5);
      break;
    case 'reflex': {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      dot(3);
      break;
    }
    case 'holo': {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(cx, cy, 48, -0.5, 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 48, Math.PI - 0.5, Math.PI + 0.5); ctx.stroke();
      ctx.globalAlpha = 1;
      dot(3);
      break;
    }
    case 'scope': {
      const L = 240;
      line(cx - L, cy, cx - 12, cy, 2, '#0a0a0a', 0.9);
      line(cx + 12, cy, cx + L, cy, 2, '#0a0a0a', 0.9);
      line(cx, cy - L, cx, cy - 12, 2, '#0a0a0a', 0.9);
      line(cx, cy + 12, cx, cy + L, 2, '#0a0a0a', 0.9);
      // 密位点
      for (let i = 1; i <= 5; i++) {
        const d = i * 26;
        dot(2, '#0a0a0a', 0.85);
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.arc(cx - d, cy, 2, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + d, cy, 2, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy + d, 2, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      dot(2.5, color);
      break;
    }
    default: // iron —— 3D 机瞄本身可见，这里只给一个极淡的参考点
      ctx.globalAlpha = 0.35;
      dot(1.5, '#ffffff');
      ctx.globalAlpha = 1;
  }
}
