import * as THREE from 'three';
import { World, B } from './world.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS, Grenades } from './weapons.js';
import { EnemyManager } from './enemy.js';
import { Particles } from './particles.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Loadout } from './loadout.js';
import { drawReticle } from './optics.js';
import { DomeShields } from './gadgets.js';
import { TeamDeathmatch, TEAM_COLORS } from './tdm.js';

const RENDER_SCALE = 0.7;      // 低分辨率渲染 + 像素化放大 = 复古颗粒感
const BASE_FOV = 80;

// ------------------------------------------------------------------ 渲染器
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * RENDER_SCALE);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x9ec9e8);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9e8);
scene.fog = new THREE.Fog(0x9ec9e8, 70, 220);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 500);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x53492f, 1.05));
const sun = new THREE.DirectionalLight(0xfff0cf, 1.0);
sun.position.set(48, 90, 30);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8fb4ff, 0.35);
fill.position.set(-40, 30, -50);
scene.add(fill);

// ---- 视图模型（手中的枪）独立场景 + 独立相机：彻底避免穿模 / 近裁剪
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(
  BASE_FOV, window.innerWidth / window.innerHeight, 0.005, 12
);
vmScene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3a2a, 1.35));
const vmKey = new THREE.DirectionalLight(0xfff4e0, 1.15);
vmKey.position.set(0.8, 1.4, 1.0);
vmScene.add(vmKey);
const vmFill = new THREE.DirectionalLight(0x8fb4ff, 0.55);
vmFill.position.set(-1.2, 0.3, -0.8);
vmScene.add(vmFill);
const vmGunLight = new THREE.PointLight(0xffffff, 1.6, 3, 1.2);
vmGunLight.position.set(0.3, 0.25, 0.25);
vmScene.add(vmGunLight);

// ------------------------------------------------------------------ 世界
const world = new World(20260919);
scene.add(world.group);

(function makeClouds() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const N = 220;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const cx = (Math.random() - 0.5) * 260;
    const cz = (Math.random() - 0.5) * 260;
    const cy = 46 + Math.random() * 16;
    const s = 4 + Math.random() * 9;
    m.makeTranslation(cx + (Math.random() - 0.5) * 14, cy + (Math.random() - 0.5) * 4, cz + (Math.random() - 0.5) * 14);
    m.scale(new THREE.Vector3(s, s * 0.55, s));
    mesh.setMatrixAt(i, m);
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
})();

// ------------------------------------------------------------------ 系统
const sfx = new Sfx();
const input = new Input(canvas);
const particles = new Particles(scene);
const player = new Player(world, camera);
const hud = new Hud(world, camera);

let score = 0, kills = 0, headshots = 0, wave = 1;
let waveState = 'fight';
let breakTimer = 0;
let mode = 'survival';    // survival | tdm
const PLAYER_TEAM = 0;
let equipCount = 3;
let equipDef = null;
let gadgetCount = 1;
let gadgetDef = null;
let gadgetCd = 0;

/** 当前模式下所有“可被玩家攻击”的目标 */
function hostiles() {
  if (mode === 'tdm') return tdm.bots.filter(b => !b.dead && b.team !== PLAYER_TEAM);
  return enemies.enemies.filter(e => !e.dead);
}

/** 金币：命中敌人爆出，被吸取时给一点反馈（节流） */
let coinSfxT = 0;
let coinBurstT = 0;
let coinsGot = 0;
particles.onCoin = () => {
  coinsGot++;
  if (coinSfxT <= 0) { coinSfxT = 0.1; sfx.coin(); }
};
const _coinPos = new THREE.Vector3();
const _coinTarget = new THREE.Vector3();   // 金币的吸附点，每帧更新为玩家眼睛位置

/** 玩家对目标造成伤害（统一处理计分） */
function hurtTarget(target, amount, dir, head = false, point = null) {
  const killed = target.damage(amount, point, dir, head, particles);
  hud.hitEnemy(target, amount, head);
  // 命中爆金币（每 0.12s 最多一次，避免刷屏）
  if (coinBurstT <= 0) {
    coinBurstT = 0.12;
    particles.coin(
      (point || _coinPos.copy(target.pos)).clone().setY(target.pos.y + 1.1),
      _coinTarget, head ? 3 : 2
    );
  }
  if (!killed) return false;
  if (target.team !== undefined) { tdm.onPlayerKill(target); playerKills++; }
  else grantKill(target, head);
  return true;
}

function grantKill(e, head) {
  const gain = e.type.score + (head ? 60 : 0);
  score += gain;
  kills++;
  if (head) headshots++;
  hud.killFeed(`<b>+${gain}</b> 击杀 ${e.type.name}${head ? ' [爆头]' : ''}`);
  hud.addFloater('+' + gain, e.pos.clone().setY(e.pos.y + 1.9), '#ffcc33', 15);
  maybeDrop(e.pos);
}

/** 玩家受伤 */
function hurtPlayer(amount) {
  if (state !== 'playing' || player.dead) return;
  const died = player.damage(amount);
  hud.damageFlash();
  sfx.hurt();
  // 被命中：从身上抖落金币
  const n = Math.min(6, 2 + Math.round(amount / 12));
  for (let i = 0; i < n; i++) {
    particles.spawn(
      player.pos.clone().setY(player.pos.y + 1.2),
      new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5 + 2, (Math.random() - 0.5) * 7),
      {
        color: Math.random() < 0.35 ? 0xfff0a0 : 0xffd54a,
        life: 1.1 + Math.random() * 0.5, size: 0.11 + Math.random() * 0.07,
        grav: 1.25, drag: 0.99,
      }
    );
  }
  if (!died) return;
  if (mode === 'tdm') {
    tdm.playerRespawnT = tdm.respawnDelay;
    hud.waveMessage('阵亡 · 等待复活');
  } else {
    gameOver();
  }
}

const enemies = new EnemyManager({
  scene, world, particles, sfx, player,
  onKill: (e, head) => grantKill(e, head),
  onPlayerDamage: (amount) => hurtPlayer(amount),
});

const tdm = new TeamDeathmatch({
  scene, world, particles, sfx, player, playerTeam: PLAYER_TEAM, killTarget: 40,
});
tdm.onEvent = (html) => hud.killFeed(html);
tdm.onPlayerHit = (amount) => hurtPlayer(amount);
tdm.onBotGrenade = (bot, tgt) => {
  const origin = bot.pos.clone().setY(bot.pos.y + 1.4);
  const dir = tgt.clone().sub(origin).normalize();
  grenades.throw(origin, dir, EQUIP_FRAG, bot);
};
tdm.onPlayerRespawn = () => hud.waveMessage('重新入场');
tdm.onFinish = (team) => {
  state = 'over';
  input.exitLock();
  sfx.gameOver();
  const win = team === PLAYER_TEAM;
  showSimple(win ? '团队胜利' : '团队失败',
    `${TEAM_COLORS[team].name} 先达到 ${tdm.killTarget} 击杀`,
    '返回配装');
  resultLine2.innerHTML =
    `<b style="color:${TEAM_COLORS[0].hex}">蓝队 ${tdm.score[0]}</b>　·　` +
    `<b style="color:${TEAM_COLORS[1].hex}">红队 ${tdm.score[1]}</b><br>` +
    `你的击杀 <b>${playerKills}</b>　目标 <b>${tdm.killTarget}</b>`;
};
tdm.losBlock = (a, b) => smokes.some(s => s.t > 0.35 && distPointSegment(s.pos, a, b) < s.radius * 0.8);

let playerKills = 0;
const EQUIP_FRAG = { id: 'frag', name: '破片手雷', radius: 6.5, damage: 90, color: 0x2f4a30, size: 0.26, smoke: false };

const domes = new DomeShields(scene, particles);

const _coneTo = new THREE.Vector3();

/** 爆炸：按模式结算，并处理自伤 */
function explodeAt(pos, radius, damage, selfK, attacker) {
  if (mode === 'tdm') tdm.explode(pos, radius, damage, attacker ?? player);
  else enemies.explode(pos, radius, damage);
  const d = player.pos.distanceTo(pos);
  if (d >= radius) return;
  const k = 1 - d / radius;
  player.shake = Math.min(2, player.shake + k * 1.6);
  const wasDead = player.dead;
  const died = player.damage(damage * k * selfK);
  hud.damageFlash();
  if (died && !wasDead) {
    if (mode === 'tdm') { tdm.playerRespawnT = tdm.respawnDelay; hud.waveMessage('阵亡 · 等待复活'); }
    else gameOver();
  }
}

/** 锥形范围内命中所有敌人 */
function coneHit(origin, dir, range, arc, damage, onEach) {
  let n = 0;
  const cosLimit = Math.cos(arc);
  for (const t of hostiles()) {
    _coneTo.copy(t.pos).setY(t.pos.y + 0.9).sub(origin);
    const dist = _coneTo.length();
    if (dist > range) continue;
    _coneTo.normalize();
    if (_coneTo.dot(dir) < cosLimit) continue;
    onEach?.(t, dist);
    hurtTarget(t, damage, dir, false, t.pos.clone().setY(t.pos.y + 0.9));
    n++;
  }
  return n;
}

const weapons = new WeaponSystem({
  scene, vmScene, camera, world, particles, sfx, player,
  baseFov: BASE_FOV,
  getEnemies: hostiles,
  onHit: (head, kill) => {
    hud.hitmarker(kill);
    if (head) sfx.headshot(); else sfx.hit();
  },
  // 命中敌人 → 点亮目标血条 + 爆金币
  onDamage: (target, damage, head) => {
    hud.hitEnemy(target, damage, head);
    if (coinBurstT <= 0) {
      coinBurstT = 0.12;
      particles.coin(target.pos.clone().setY(target.pos.y + 1.1), _coinTarget, head ? 3 : 2);
    }
  },
  onKill: (target, head) => {
    if (target.team !== undefined) { tdm.onPlayerKill(target); playerKills++; }
    else grantKill(target, head);
  },
  onRocketExplode: (pos, def) => explodeAt(pos, def.radius, def.damage, def.self ?? 0.45, player),
  // 大锤横扫
  onMelee: (origin, dir, melee, damage) => {
    sfx.melee();
    const n = coneHit(origin, dir, melee.range, melee.arc, damage, (t) => {
      particles.coin(t.pos.clone().setY(t.pos.y + 1.0), _coinTarget, 2);
    });
    if (n === 0) {
      const hit = world.raycast(origin, dir, melee.range);
      if (hit) { particles.impact(hit.point, hit.normal, 0x8b8b8b); sfx.hit(); }
    } else {
      sfx.hit();
    }
  },
  // 大锤冲撞
  onDash: (origin, dir, melee, p) => {
    let n = 0;
    for (const t of hostiles()) {
      const to = t.pos.clone().sub(p.pos);
      to.y = 0;
      const d = to.length();
      if (d > 3.0) continue;
      to.normalize();
      if (to.dot(dir) < 0.2) continue;
      hurtTarget(t, melee.dashDamage, dir, false, t.pos.clone());
      particles.coin(t.pos.clone().setY(t.pos.y + 1.0), _coinTarget, 3);
      n++;
    }
    if (n) { sfx.melee(); hud.hitmarker(true); }
    player.shake = Math.min(1.5, player.shake + 0.4);
  },
  // 喷火器
  onFlame: (origin, dir, f, tick) => {
    for (const t of hostiles()) {
      _coneTo.copy(t.pos).setY(t.pos.y + 0.9).sub(origin);
      const dist = _coneTo.length();
      if (dist > f.range) continue;
      _coneTo.normalize();
      if (_coneTo.dot(dir) < Math.cos(f.angle)) continue;
      t.burnT = f.burnTime;
      t.burnDps = f.burnDps;
      hurtTarget(t, 62 * tick * (1 - dist / f.range * 0.4), dir, false, t.pos.clone());
    }
  },
});

const grenades = new Grenades(scene, world, particles, sfx);
// 金币吸附点：玩家眼睛（向量原地更新，不用每帧重新赋值）
particles.attract = _coinTarget;
weapons.coinTarget = _coinTarget;
weapons.rockets.blockTest = (a, b) => domes.blocks(a, b);
weapons.rockets.opts.onDomeHit = (dome, point) => {
  domes.absorb(dome, 120);
  particles.explosion(point, 3);
  sfx.hit();
};

// ------------------------------------------------------------------ 配装
const loadout = new Loadout();

function applyLoadout() {
  const L = loadout.apply();
  weapons.configure(L.state.primary, L.state.secondary, L.state.special === 'none' ? null : L.state.special);
  player.setArmorProfile(L.armor);
  equipDef = L.equip;
  equipCount = L.equip.count;
  gadgetDef = L.gadget;
  gadgetCount = L.gadget.count;
  mode = L.state.mode;
  weapons.aimMode = L.state.aim === 'aim-toggle' ? 'toggle' : 'hold';
  weapons.aimToggled = false;
  hud.buildSlots(weapons.slots);
}
applyLoadout();

// ------------------------------------------------------------------ 道具
function useGadget() {
  if (gadgetCd > 0 || gadgetCount <= 0 || player.dead) return;
  const g = gadgetDef;
  if (g.radius) {
    const p = player.pos.clone().addScaledVector(player.forward, 1.4);
    const gy = world.groundBelow(p.x, p.y + 1.2, p.z, 4);
    p.y = gy > -40 ? gy : player.pos.y;
    domes.deploy(p, { radius: g.radius, life: g.life, hp: g.hp });
    hud.addFloater('护盾展开', p.clone().setY(p.y + 1.2), '#7fd0ff', 13);
  } else {
    player.heal(g.heal);
    player.boost = g.boost;
    player.boostT = g.boostTime;
    hud.addFloater(`+${g.heal} HP · 提速`, player.pos.clone().setY(player.pos.y + 2.1), '#4ade80', 13);
  }
  gadgetCount--;
  gadgetCd = 0.7;
  sfx.pickup();
}

// ------------------------------------------------------------------ 烟雾
const smokes = [];
const smokeGeo = new THREE.BoxGeometry(1, 1, 1);

function spawnSmoke(pos, def) {
  const group = new THREE.Group();
  group.position.copy(pos);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xd6dce2, transparent: true, opacity: 0.0, depthWrite: false,
  });
  const R = def.radius;
  for (let i = 0; i < 18; i++) {
    const s = R * (0.35 + Math.random() * 0.5);
    const m = new THREE.Mesh(smokeGeo, mat);
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * R * 0.75;
    m.position.set(Math.cos(a) * rr, 0.6 + Math.random() * R * 0.7, Math.sin(a) * rr);
    m.scale.set(s, s * (0.7 + Math.random() * 0.5), s);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(m);
  }
  scene.add(group);
  smokes.push({ group, mat, pos: pos.clone(), radius: R, t: 0, life: 9, maxOpacity: 0.88 });
}

function updateSmokes(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.t += dt;
    if (s.t > s.life) {
      scene.remove(s.group);
      s.group.traverse(o => o.geometry === smokeGeo ? null : o.geometry?.dispose());
      s.mat.dispose();
      smokes.splice(i, 1);
      continue;
    }
    const grow = Math.min(1, s.t / 0.8);
    const fade = s.t > s.life - 2 ? (s.life - s.t) / 2 : 1;
    s.mat.opacity = s.maxOpacity * grow * fade;
    s.group.rotation.y += dt * 0.25;
    s.group.scale.setScalar(0.55 + 0.45 * grow);
  }
}

function distPointSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}
enemies.losBlock = (a, b) =>
  smokes.some(s => s.t > 0.35 && distPointSegment(s.pos, a, b) < s.radius * 0.8);

const _domeHit = new THREE.Vector3();
enemies.domeBlock = (a, b) => {
  const d = domes.blocks(a, b, _domeHit);
  return d ? { dome: d, point: _domeHit.clone() } : null;
};
enemies.onDomeAbsorb = (dome, amount) => domes.absorb(dome, amount * 2.5);

// ------------------------------------------------------------------ 补给
const PICKUP_DEFS = {
  health: { color: 0x4ade80 },
  armor: { color: 0x60a5fa },
  ammo: { color: 0xfbbf24 },
};
const pickups = [];
const pickupGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);

function spawnPickup(pos, kind) {
  const def = PICKUP_DEFS[kind];
  const mesh = new THREE.Mesh(pickupGeo, new THREE.MeshLambertMaterial({
    color: def.color, emissive: def.color, emissiveIntensity: 0.35,
  }));
  mesh.position.copy(pos).setY(pos.y + 0.6);
  scene.add(mesh);
  pickups.push({ mesh, kind, t: 0, life: 26 });
}

function maybeDrop(pos) {
  if (Math.random() > 0.32) return;
  const roll = Math.random();
  spawnPickup(pos, roll < 0.5 ? 'health' : roll < 0.8 ? 'armor' : 'ammo');
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    p.mesh.rotation.y += dt * 2.2;
    p.mesh.rotation.x += dt * 1.1;
    p.mesh.position.y += Math.sin(p.t * 3) * dt * 0.6;
    if (p.life <= 0) { scene.remove(p.mesh); pickups.splice(i, 1); continue; }
    if (p.mesh.position.distanceTo(player.pos) < 1.7) {
      const at = player.pos.clone().setY(player.pos.y + 2);
      if (p.kind === 'health') { player.heal(35); hud.addFloater('+35 HP', at, '#4ade80'); }
      else if (p.kind === 'armor') { player.addArmor(40); hud.addFloater('+40 ARMOR', at, '#60a5fa'); }
      else {
        weapons.refill(0.35);
        equipCount = Math.min(equipDef.count + 2, equipCount + 1);
        hud.addFloater('+AMMO', at, '#fbbf24');
      }
      sfx.pickup();
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ 流程
let state = 'menu';
const overlay = document.getElementById('overlay');
const boxMain = document.getElementById('boxMain');
const boxSimple = document.getElementById('boxSimple');
const ovTitle = document.getElementById('ovTitle');
const ovSub = document.getElementById('ovSub');
const resultLine2 = document.getElementById('resultLine2');
const ovBtn = document.getElementById('ovBtn');
const ovBtn2 = document.getElementById('ovBtn2');

function showMenu() {
  boxMain.classList.remove('hidden');
  boxSimple.classList.add('hidden');
  overlay.style.display = 'flex';
}
function showSimple(title, sub, btn, result = '') {
  ovTitle.textContent = title;
  ovSub.innerHTML = sub;
  resultLine2.innerHTML = result;
  ovBtn2.textContent = btn;
  boxMain.classList.add('hidden');
  boxSimple.classList.remove('hidden');
  overlay.style.display = 'flex';
}
function hideOverlay() { overlay.style.display = 'none'; }

function resetRun() {
  enemies.clear();
  for (const p of pickups) scene.remove(p.mesh);
  pickups.length = 0;
  for (const s of smokes) { scene.remove(s.group); s.mat.dispose(); }
  smokes.length = 0;
  domes.clear();
  weapons.rockets.clear();
  tdm.clear();
  for (const w of WEAPONS) { w.mag = w.magSize; if (w.reserve !== Infinity) w.reserve = w.reserveMax; }
  weapons.setSlot(0);
  equipCount = equipDef.count;
  gadgetCount = gadgetDef.count;
  gadgetCd = 0;
  player.boost = 1; player.boostT = 0;
  score = 0; kills = 0; headshots = 0; wave = 1;
  waveState = 'fight'; breakTimer = 0;
  playerKills = 0;

  if (mode === 'tdm') {
    tdm.spawnAll();
    const sp = tdm.teamSpawn(PLAYER_TEAM);
    player.respawn(sp);
    const eb = tdm.bases[1 - PLAYER_TEAM];
    player.yaw = Math.atan2(-(eb.x - sp.x), -(eb.z - sp.z));
    hud.waveMessage(`团队死斗 · 先到 ${tdm.killTarget} 杀`);
  } else {
    player.respawn(world.spawnPoints[0]);
    player.yaw = 0;
    enemies.spawnWave(wave, 5);
    hud.waveMessage('WAVE 1');
  }
  sfx.waveStart();
}

function startGame() {
  sfx.resume();
  applyLoadout();
  hideOverlay();
  hud.show(true);
  state = 'playing';
  resetRun();
  input.requestLock();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  input.exitLock();
  showSimple('已暂停', '战场静止中…', '继续战斗');
}

function resumeGame() {
  hideOverlay();
  state = 'playing';
  input.requestLock();
}

function gameOver() {
  state = 'over';
  input.exitLock();
  hud.deathFlash();
  hud.show(false);            // 立刻收起 HUD，直接切死亡画面
  sfx.gameOver();
  showSimple('你阵亡了', '像素战场吞没了你', '返回配装', '');
  resultLine2.innerHTML =
    `最终得分 <b>${score}</b><br>击杀 <b>${kills}</b> · 爆头 <b>${headshots}</b> · 抵达波次 <b>${wave}</b><br>` +
    `拾取金币 <b>${coinsGot}</b>`;
}

ovBtn.addEventListener('click', startGame);
ovBtn2.addEventListener('click', () => {
  if (state === 'paused') resumeGame();
  else { showMenu(); state = 'menu'; }
});

input.onLockChange = (locked) => {
  if (!locked && state === 'playing') pauseGame();
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (e.code === 'Enter' && (state === 'menu' || state === 'over')) startGame();
});

// ------------------------------------------------------------------ 波次
function updateWaves(dt) {
  if (waveState === 'fight') {
    if (enemies.alive === 0) {
      waveState = 'break';
      breakTimer = 4.5;
      score += 200 * wave;
      player.heal(30);
      player.addArmor(25);
      weapons.refill(0.5);
      equipCount = Math.min(equipDef.count + 2, equipCount + 1);
      hud.waveMessage(`WAVE ${wave} 清除  +${200 * wave}`);
      hud.killFeed(`<b>WAVE ${wave} 完成！</b>`);
      sfx.waveStart();
    }
  } else {
    breakTimer -= dt;
    if (breakTimer <= 0) {
      wave++;
      waveState = 'fight';
      const count = Math.min(20, 4 + Math.round(wave * 1.8));
      enemies.spawnWave(wave, count);
      hud.waveMessage(`WAVE ${wave} 开始`);
      sfx.waveStart();
    }
  }
}

// ------------------------------------------------------------------ 主循环
const clock = new THREE.Clock();
let footstepAcc = 0;

let _errCount = 0;
function reportError(err) {
  if (_errCount++ < 3) console.error('[PIXEL STRIKE] 帧异常：', err);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  // 任何一帧的异常都不能把渲染循环搞死
  try { simulate(dt); } catch (err) { reportError(err); }
  input.endFrame();
}

function simulate(dt) {
  if (state === 'playing') {
    const alive = !player.dead;

    // 阵亡后：不能转视角、不能移动、不能开枪/投掷
    if (input.locked && alive) {
      const sens = 0.0022 * (weapons.aimT > 0.5 ? 0.5 : 1);
      player.applyMouse(input.mouse.dx, input.mouse.dy, sens);
    }
    if (input.locked && !alive) {
      input.mouse.dx = 0;
      input.mouse.dy = 0;
    }

    player.speedMul = (player.armorSpeedMul ?? 1) * weapons.cur.speedMul;
    player.update(dt, input, alive);

    footstepAcc += Math.hypot(player.vel.x, player.vel.z) * dt;
    if (footstepAcc > 3.4 && player.onGround && alive) { footstepAcc = 0; sfx.step(); }

    coinSfxT -= dt;
    coinBurstT -= dt;
    player.eyePos(_coinTarget);

    if (alive && input.justPressed('KeyG') && equipCount > 0) {
      equipCount--;
      const origin = player.eyePos().addScaledVector(player.lookDir(), 0.7);
      grenades.throw(origin, player.lookDir(), equipDef);
    }

    gadgetCd -= dt;
    if (alive && input.justPressed('KeyF')) useGadget();

    weapons.update(dt, input, { frozen: !alive });
    grenades.update(dt, (pos, def, owner) => {
      if (def.smoke) { spawnSmoke(pos, def); sfx.hiss(); return; }
      explodeAt(pos, def.radius, def.damage, owner === player ? 0.45 : 0.7, owner ?? player);
    });

    if (mode === 'tdm') {
      tdm.update(dt);
    } else {
      enemies.update(dt);
      updateWaves(dt);
    }
    domes.update(dt);
    updateSmokes(dt);
    updatePickups(dt);

    const targetFov = weapons.aiming ? weapons.aimFov : (player.sprinting ? BASE_FOV + 7 : BASE_FOV);
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 13, dt);
    camera.updateProjectionMatrix();
  } else if (state === 'menu') {
    player.yaw += dt * 0.055;
    player.update(dt, input, false);
  }

  if (state !== 'paused') particles.update(state === 'playing' ? dt : dt * 0.2);

  hud.update(dt, {
    player, weapons, score, wave, waveState,
    equipDef, equipCount, gadgetDef, gadgetCount,
    mode, tdm,
    fighters: mode === 'tdm' ? tdm.bots : enemies.enemies,
  });

  renderer.render(scene, camera);
  // 第二遍：清深度后渲染手中的枪（不会与墙体穿模）
  vmCamera.fov = THREE.MathUtils.clamp(camera.fov, 44, BASE_FOV);
  vmCamera.updateProjectionMatrix();
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(vmScene, vmCamera);
  renderer.autoClear = true;

  if (state === 'menu') loadout.preview.update(dt);
  }

// ------------------------------------------------------------------ 尺寸
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * RENDER_SCALE);
  renderer.setSize(window.innerWidth, window.innerHeight);
  vmCamera.aspect = camera.aspect;
  vmCamera.updateProjectionMatrix();
});

player.setArmorProfile(loadout.armor);
player.respawn(world.spawnPoints[0]);
player.yaw = 0.6; player.pitch = -0.05;
camera.fov = BASE_FOV;
hud.show(false);
drawReticle(hud.el.reticle, 'dot');
frame();
