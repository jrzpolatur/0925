import * as THREE from 'three';

/** 简单的可复现随机数 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const cache = new Map();

function makeTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 噪点填充：在 base 色基础上抖动亮度 */
function noise(ctx, size, rng, base, amp, density = 1) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    if (density < 1 && rng() > density) continue;
    const k = (rng() - 0.5) * amp;
    d[i * 4 + 0] = Math.max(0, Math.min(255, base[0] + k));
    d[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + k));
    d[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + k));
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function fill(ctx, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

function dot(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** 所有方块纹理生成器 */
const BUILDERS = {
  grass(ctx, s, rng) {
    fill(ctx, s, '#4a9e3f');
    noise(ctx, s, rng, [74, 158, 63], 60);
    for (let i = 0; i < 22; i++) {
      const x = (rng() * s) | 0, y = (rng() * s) | 0;
      dot(ctx, x, y, 1, 2, rng() > 0.5 ? '#6fd65c' : '#2f6b28');
    }
  },
  dirt(ctx, s, rng) {
    fill(ctx, s, '#7a5330');
    noise(ctx, s, rng, [122, 83, 48], 48);
    for (let i = 0; i < 14; i++) {
      dot(ctx, (rng() * s) | 0, (rng() * s) | 0, 2, 2, '#5c3d22');
    }
  },
  sand(ctx, s, rng) {
    fill(ctx, s, '#d8c07a');
    noise(ctx, s, rng, [216, 192, 122], 34);
    for (let i = 0; i < 10; i++) dot(ctx, (rng() * s) | 0, (rng() * s) | 0, 1, 1, '#b39c58');
  },
  stone(ctx, s, rng) {
    fill(ctx, s, '#8b8b8b');
    noise(ctx, s, rng, [139, 139, 139], 44);
    for (let i = 0; i < 6; i++) {
      const x = (rng() * (s - 4)) | 0, y = (rng() * (s - 4)) | 0;
      dot(ctx, x, y, 3, 3, '#6d6d6d');
      dot(ctx, x + 1, y + 1, 1, 1, '#a3a3a3');
    }
  },
  brick(ctx, s, rng) {
    fill(ctx, s, '#8c3d33');
    noise(ctx, s, rng, [140, 61, 51], 30);
    ctx.fillStyle = '#c9bcae';
    for (let y = 0; y < s; y += 4) {
      ctx.fillRect(0, y, s, 1);
    }
    for (let y = 0; y < s; y += 4) {
      const off = ((y / 4) | 0) % 2 === 0 ? 0 : 4;
      for (let x = off; x < s; x += 8) ctx.fillRect(x, y, 1, 4);
    }
  },
  wood(ctx, s, rng) {
    fill(ctx, s, '#9a6b3c');
    noise(ctx, s, rng, [154, 107, 60], 26);
    ctx.fillStyle = '#6f4a26';
    for (let y = 2; y < s; y += 5) ctx.fillRect(0, y, s, 1);
    for (let i = 0; i < 8; i++) dot(ctx, (rng() * s) | 0, (rng() * s) | 0, 2, 1, '#b8854e');
  },
  metal(ctx, s, rng) {
    fill(ctx, s, '#6f7d86');
    noise(ctx, s, rng, [111, 125, 134], 32);
    ctx.fillStyle = '#4d585f';
    ctx.fillRect(0, 0, s, 1); ctx.fillRect(0, s - 1, s, 1);
    ctx.fillRect(0, 0, 1, s); ctx.fillRect(s - 1, 0, 1, s);
    for (const [x, y] of [[2, 2], [s - 4, 2], [2, s - 4], [s - 4, s - 4]]) {
      dot(ctx, x, y, 2, 2, '#98a6ae');
    }
  },
  crate(ctx, s, rng) {
    fill(ctx, s, '#a97a3f');
    noise(ctx, s, rng, [169, 122, 63], 24);
    ctx.fillStyle = '#6f4a26';
    ctx.fillRect(0, 0, s, 2); ctx.fillRect(0, s - 2, s, 2);
    ctx.fillRect(0, 0, 2, s); ctx.fillRect(s - 2, 0, 2, s);
    ctx.strokeStyle = '#6f4a26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, 1); ctx.lineTo(s - 1, s - 1);
    ctx.moveTo(s - 1, 1); ctx.lineTo(1, s - 1);
    ctx.stroke();
  },
  road(ctx, s, rng) {
    fill(ctx, s, '#3c3f44');
    noise(ctx, s, rng, [60, 63, 68], 26);
    ctx.fillStyle = '#e8d84a';
    ctx.fillRect(6, 7, 4, 2);
    for (let i = 0; i < 5; i++) dot(ctx, (rng() * s) | 0, (rng() * s) | 0, 1, 1, '#22242a');
  },
  concrete(ctx, s, rng) {
    fill(ctx, s, '#a9a49c');
    noise(ctx, s, rng, [169, 164, 156], 30);
    ctx.fillStyle = '#847f78';
    ctx.fillRect(0, 0, s, 1); ctx.fillRect(0, 0, 1, s);
    for (let i = 0; i < 4; i++) dot(ctx, (rng() * s) | 0, (rng() * s) | 0, 1, 2, '#7a756e');
  },
  rust(ctx, s, rng) {
    fill(ctx, s, '#7a4a2a');
    noise(ctx, s, rng, [122, 74, 42], 50);
    for (let i = 0; i < 10; i++) dot(ctx, (rng() * s) | 0, (rng() * s) | 0, 2, 2, '#94593a');
  },
};

/** 取得某个方块类型的纹理（带缓存） */
export function blockTexture(name) {
  if (cache.has(name)) return cache.get(name);
  const builder = BUILDERS[name] || BUILDERS.stone;
  const t = makeTexture(16, (ctx, s) => builder(ctx, s, makeRng(name.length * 9781 + 1237)));
  cache.set(name, t);
  return t;
}

/** 方块调色板：名字 -> 主色（用于粒子/小地图） */
export const BLOCK_COLORS = {
  grass: 0x4a9e3f, dirt: 0x7a5330, sand: 0xd8c07a, stone: 0x8b8b8b,
  brick: 0x8c3d33, wood: 0x9a6b3c, metal: 0x6f7d86, crate: 0xa97a3f,
  road: 0x3c3f44, concrete: 0xa9a49c, rust: 0x7a4a2a,
};

/** 生成一个像素风头像（HUD 用） */
export function drawAvatar(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  P(0, 0, 16, 16, '#1c2a1c');
  P(3, 2, 10, 7, '#c98d5f');      // 脸
  P(3, 2, 10, 3, '#3a3026');      // 头发
  P(4, 5, 2, 2, '#1a1a1a');       // 眼
  P(10, 5, 2, 2, '#1a1a1a');
  P(5, 8, 6, 1, '#8a5a3a');       // 嘴
  P(2, 9, 12, 7, '#3f7a3f');      // 身体
  P(5, 10, 6, 4, '#2c5c2c');      // 背心
  P(2, 11, 2, 4, '#c98d5f');      // 手臂
  P(12, 11, 2, 4, '#c98d5f');
}
