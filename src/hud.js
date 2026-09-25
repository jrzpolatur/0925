import * as THREE from 'three';
import { drawReticle, OPTICS } from './optics.js';
import { TEAM_COLORS } from './tdm.js';
import { drawAvatar } from './textures.js';

const $ = (id) => document.getElementById(id);

const HP_SEGS = 24;
const ARMOR_SEGS = 16;

/**
 * 游戏内 HUD
 *  - 左下：玩家卡片（头像 / 生命 + 掉血残影 / 护甲 / 装备道具）
 *  - 右下：武器卡片（名称 / 瞄具 / 弹药 / 换弹进度）
 *  - 顶部：分数 + 波次 / 团队比分条
 *  - 右上：雷达 + 击杀播报
 *  - 中央：准星（命中张开变色）/ 命中标记 / 扩散环 / 连击伤害 / 击杀横幅 / 受伤方向
 *  - 世界：敌人头顶血条（命中或准星悬停时点亮，带掉血残影和伤害数字）
 */
export class Hud {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.el = {
      hud: $('hud'),
      // 玩家
      hpBig: $('hpBig'), hpSegs: $('hpSegs'),
      armorSegs: $('armorSegs'), armorNum: $('armorNum'),
      plNameText: $('plNameText'), plChip: $('plChip'), avatar: $('avatar'),
      nade: $('nade'), gadget: $('gadget'),
      // 顶部
      score: $('score'), wave: $('wave'), waveMsg: $('waveMsg'),
      tdmScore: $('tdmScore'), tdmBars: $('tdmBars'),
      // 武器
      wName: $('wName'), wOptic: $('wOptic'), ammo: $('ammo'), ammoSegs: $('ammoSegs'),
      reloading: $('reloading'), reloadWrap: $('reloadBar'), reloadBar: $('reloadBar').firstElementChild,
      slots: $('slots'),
      // 右上
      minimap: $('minimap'), mmCount: $('mmCount'), killfeed: $('killfeed'),
      // 中央
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), hitring: $('hitring'),
      dmgTotal: $('dmgTotal'), killBanner: $('killBanner'), dmgDir: $('dmgDir'),
      reticle: $('reticle'), scope: $('scope'),
      // 全屏
      vignette: $('vignette'), lowhp: $('lowhp'), deathFlash: $('deathFlash'), sprintLines: $('sprintLines'),
      enemybars: $('enemybars'),
    };

    drawAvatar(this.el.avatar);
    this.el.plNameText.textContent = 'L PAPA';

    // 分段条
    this.hpCells = this._makeSegs(this.el.hpSegs, HP_SEGS);
    this.armorCells = this._makeSegs(this.el.armorSegs, ARMOR_SEGS);
    this.ammoCells = [];
    this._ammoCount = -1;
    this.hpGhost = 1;          // 掉血残影（比实际血量慢一点回落）
    this._lastHp = null;

    this.slotEls = [];
    this._reticleType = null;

    // 飘字池
    this.floaters = [];
    this.floaterPool = [];
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.el.hud.appendChild(layer);
    this.floatLayer = layer;
    for (let i = 0; i < 30; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;font-size:14px;text-shadow:2px 2px 0 #000;opacity:0;will-change:transform;white-space:nowrap;';
      layer.appendChild(d);
      this.floaterPool.push(d);
    }

    // 敌人血条池
    this.enemyBars = new Map();
    this.enemyBarPool = [];
    this.hoverTarget = null;

    // 受伤方向箭头池
    this.dirArrows = [];
    for (let i = 0; i < 6; i++) {
      const a = document.createElement('div');
      a.className = 'arrow';
      this.el.dmgDir.appendChild(a);
      this.dirArrows.push({ el: a, t: 0, pos: new THREE.Vector3() });
    }

    this._buildMinimapBase();
    this.mm = this.el.minimap.getContext('2d');
    this.mm.imageSmoothingEnabled = false;

    // 计时器
    this.hitT = 0;
    this.crossHitT = 0;
    this.vigT = 0;
    this.hurtT = 0;
    this.deathT = 0;
    this.comboT = 0;
    this.comboDmg = 0;
    this.comboHead = false;
    this.comboKill = false;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  _makeSegs(host, n) {
    host.innerHTML = '';
    const cells = [];
    for (let i = 0; i < n; i++) {
      const i2 = document.createElement('i');
      host.appendChild(i2);
      cells.push(i2);
    }
    return cells;
  }

  _fillSegs(cells, ratio, ghostRatio = 0, extra = () => null) {
    const on = Math.ceil(ratio * cells.length);
    const gh = Math.ceil(ghostRatio * cells.length);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.className = i < on ? 'on ' + (extra(i, on) || '') : (i < gh ? 'ghost' : '');
    }
  }

  /** 按配装重建武器槽 */
  buildSlots(slots) {
    this.el.slots.innerHTML = '';
    this.slotEls = slots.map((w, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<div class="k">${i + 1}</div><div>${w.name}</div><div class="o">${OPTICS[w.optic].short}</div>`;
      this.el.slots.appendChild(d);
      return d;
    });
  }

  // ------------------------------------------------------------ 小地图
  _buildMinimapBase() {
    const { grid, n } = this.world.occupancyGrid();
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = grid[i];
      if (v === 2) { img.data[i * 4] = 200; img.data[i * 4 + 1] = 190; img.data[i * 4 + 2] = 170; }
      else if (v === 1) { img.data[i * 4] = 110; img.data[i * 4 + 1] = 105; img.data[i * 4 + 2] = 95; }
      else { img.data[i * 4] = 46; img.data[i * 4 + 1] = 62; img.data[i * 4 + 2] = 40; }
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mmBase = c;
    this.mmN = n;
  }

  drawMinimap(player, fighters) {
    const ctx = this.mm;
    const S = this.el.minimap.width;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mmBase, 0, 0, S, S);

    const n = this.mmN, HALF = n / 2, B = 2;
    const toPx = (v) => (((v / B) + HALF) / n) * S;
    for (const e of fighters) {
      if (e.dead) continue;
      const px = toPx(e.pos.x), py = toPx(e.pos.z);
      if (e.team !== undefined) {
        ctx.fillStyle = e.team === 0 ? '#54c8ff' : '#ff5a4d';
      } else {
        ctx.fillStyle = e.type.id === 'brute' ? '#ff9a3c' : e.type.id === 'sniper' ? '#c56cff' : e.type.id === 'runner' ? '#54c8ff' : '#ff4d4d';
      }
      const big = e.team !== undefined ? e.cls.id === 'heavy' : e.type.scale > 1.2;
      const s = big ? 5 : 4;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
      // 刚被打过的目标：闪一圈
      const bar = this.enemyBars.get(e);
      if (bar && bar.t < 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - s / 2 - 1.5, py - s / 2 - 1.5, s + 3, s + 3);
      }
    }

    // 玩家视野扇形 + 箭头
    const px = toPx(player.pos.x), py = toPx(player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-player.yaw + Math.PI);
    ctx.fillStyle = 'rgba(125,255,90,.16)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.arc(0, 0, 22, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7dff5a';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------ 敌人血条
  _enemyLabel(target) {
    if (target.team !== undefined) return target.name;
    return target.type.name;
  }

  _getBar(target) {
    let bar = this.enemyBars.get(target);
    if (!bar) {
      const el = this.enemyBarPool.pop() || this._makeEnemyBar();
      el.style.opacity = '0';
      el.classList.remove('hit', 'low', 'friend');
      this.el.enemybars.appendChild(el);
      bar = {
        el, t: 0, life: 3.0, dmgT: 0, acc: 0,
        fill: el.querySelector('.fill'), ghost: el.querySelector('.ghost'),
        dmg: el.querySelector('.dmg'), hpTxt: el.querySelector('.hp'),
      };
      this.enemyBars.set(target, bar);
      bar.el.querySelector('.name').textContent = this._enemyLabel(target);
      if (target.team !== undefined) el.classList.toggle('friend', target.team === 0);
      const ratio = Math.max(0, target.hp / (target.maxHp ?? 100));
      bar.fill.style.width = bar.ghost.style.width = (ratio * 100) + '%';
    }
    return bar;
  }

  /** 命中敌人时点亮血条并显示伤害 */
  hitEnemy(target, damage, isHead) {
    const bar = this._getBar(target);
    bar.t = 0;
    bar.life = isHead ? 3.6 : 3.0;
    const ratio = Math.max(0, target.hp / (target.maxHp ?? 100));
    bar.fill.style.width = (ratio * 100) + '%';
    // 残影在 CSS transition 里延迟收窄
    requestAnimationFrame(() => { bar.ghost.style.width = (ratio * 100) + '%'; });
    bar.el.classList.toggle('low', ratio < 0.3);
    bar.hpTxt.textContent = Math.ceil(target.hp);
    bar.el.classList.remove('hit');
    void bar.el.offsetWidth;
    bar.el.classList.add('hit');

    // 短时间内连续命中：伤害数字累加
    bar.acc = bar.dmgT > 0 ? bar.acc + damage : damage;
    bar.dmgT = 0.8;
    bar.dmg.textContent = (isHead ? '✷ ' : '') + Math.round(bar.acc);
    bar.dmg.classList.toggle('head', !!isHead);
    bar.dmg.classList.remove('show');
    void bar.dmg.offsetWidth;
    bar.dmg.classList.add('show');
  }

  /** 准星悬停在敌人身上：显示血条（不带伤害数字） */
  setHover(target) {
    this.hoverTarget = target;
    if (!target) return;
    const bar = this._getBar(target);
    bar.t = Math.min(bar.t, bar.life - 0.6);   // 悬停期间不淡出
    bar.hpTxt.textContent = Math.ceil(target.hp);
  }

  _makeEnemyBar() {
    const el = document.createElement('div');
    el.className = 'ebar';
    el.innerHTML =
      '<div class="nm"><span class="name"></span><span class="hp"></span></div>' +
      '<div class="rail"><div class="ghost"></div><div class="fill"></div><div class="ticks"></div></div>' +
      '<div class="dmg"></div>';
    return el;
  }

  updateEnemyBars(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const [target, bar] of this.enemyBars) {
      if (target.dead || target.removed) { this._retireBar(target, bar); continue; }
      bar.t += dt;
      if (bar.dmgT > 0) {
        bar.dmgT -= dt;
        if (bar.dmgT <= 0) { bar.dmg.classList.remove('show'); bar.acc = 0; }
      }
      if (bar.t > 0.12) bar.el.classList.remove('hit');
      if (bar.t > bar.life) { this._retireBar(target, bar); continue; }

      const hs = target.height ?? 1.85;
      this._w.copy(target.pos).setY(target.pos.y + hs + 0.35);
      this._v.copy(this._w).project(this.camera);
      if (this._v.z > 1) { bar.el.style.opacity = '0'; continue; }
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      // 远处的血条缩小一点
      const dist = this._w.distanceTo(this.camera.position);
      const sc = THREE.MathUtils.clamp(1.15 - dist / 60, 0.55, 1);
      bar.el.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${sc.toFixed(2)})`;
      bar.el.style.opacity = String(Math.min(1, Math.max(0, (bar.life - bar.t) / 0.4)));
    }
  }

  _retireBar(target, bar) {
    bar.el.style.opacity = '0';
    bar.el.remove();
    this.enemyBarPool.push(bar.el);
    this.enemyBars.delete(target);
  }

  // ------------------------------------------------------------ 飘字 / 提示
  addFloater(text, worldPos, color = '#fff', size = 14) {
    const d = this.floaterPool.pop();
    if (!d) return;
    d.textContent = text;
    d.style.color = color;
    d.style.fontSize = size + 'px';
    d.style.opacity = '1';
    this.floaters.push({ el: d, pos: worldPos.clone(), t: 0, life: 0.85, dx: (Math.random() - 0.5) * 30 });
  }

  updateFloaters(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) {
        f.el.style.opacity = '0';
        this.floaterPool.push(f.el);
        this.floaters.splice(i, 1);
        continue;
      }
      this._v.copy(f.pos).project(this.camera);
      if (this._v.z > 1) { f.el.style.opacity = '0'; continue; }
      const k = f.t / f.life;
      const x = (this._v.x * 0.5 + 0.5) * w + f.dx * k;
      const y = (-this._v.y * 0.5 + 0.5) * h - k * 50;
      f.el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(1.3 - k * 0.4).toFixed(2)})`;
      f.el.style.opacity = String(Math.max(0, 1 - k * k * 1.4));
    }
  }

  // ------------------------------------------------------------ 命中反馈
  /**
   * 命中标记
   * @param kill 是否击杀
   * @param head 是否爆头
   * @param damage 本次伤害（用于准星下方的连击合计）
   */
  hitmarker(kill, head = false, damage = 0) {
    const hm = this.el.hitmarker;
    hm.classList.remove('show');
    void hm.offsetWidth;
    hm.classList.toggle('kill', !!kill);
    hm.classList.toggle('head', !!head && !kill);
    hm.classList.add('show');
    this.hitT = kill ? 0.36 : 0.18;

    // 准星张开 + 变色
    const ch = this.el.crosshair;
    ch.classList.add('hit');
    ch.classList.toggle('head', !!head);
    ch.classList.toggle('kill', !!kill);
    this.crossHitT = kill ? 0.3 : 0.14;

    // 扩散环
    const ring = this.el.hitring;
    ring.classList.remove('go');
    void ring.offsetWidth;
    ring.classList.toggle('kill', !!kill);
    ring.classList.add('go');

    // 连击伤害合计
    if (damage > 0) {
      if (this.comboT <= 0) { this.comboDmg = 0; this.comboHead = false; this.comboKill = false; }
      this.comboDmg += damage;
      this.comboHead = this.comboHead || !!head;
      this.comboKill = this.comboKill || !!kill;
      this.comboT = 0.9;
      const dt = this.el.dmgTotal;
      dt.textContent = Math.round(this.comboDmg);
      dt.classList.toggle('head', this.comboHead && !this.comboKill);
      dt.classList.toggle('kill', this.comboKill);
      dt.style.opacity = '1';
      dt.classList.remove('pop');
      void dt.offsetWidth;
      dt.classList.add('pop');
      setTimeout(() => dt.classList.remove('pop'), 60);
    }
  }

  /** 击杀横幅（中央） */
  killBanner(name, head) {
    const b = this.el.killBanner;
    b.innerHTML = head ? `<span class="hs">爆头</span> · <b>击杀</b> ${name}` : `<b>击杀</b> ${name}`;
    b.classList.remove('go');
    void b.offsetWidth;
    b.classList.add('go');
  }

  /**
   * 受伤
   * @param fromPos 攻击者位置（可选）——显示方向箭头
   * @param player 玩家（用于计算相对方向）
   */
  damageFlash(fromPos = null, player = null) {
    this.el.vignette.style.opacity = '1';
    this.vigT = 0.35;
    this.hurtT = 0.55;
    if (fromPos && player) {
      // 复用最久未用的箭头
      let best = this.dirArrows[0];
      for (const a of this.dirArrows) if (a.t < best.t) best = a;
      best.t = 1.1;
      best.pos.copy(fromPos);
      best.el.style.opacity = '1';
    }
  }

  _updateDirArrows(dt, player) {
    for (const a of this.dirArrows) {
      if (a.t <= 0) continue;
      a.t -= dt;
      if (a.t <= 0) { a.el.style.opacity = '0'; continue; }
      // 相对朝向：屏幕正上方 = 玩家正前方
      const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z;
      const ang = Math.atan2(dx, -dz);           // 世界方位角（-Z 为 0）
      const rel = ang + player.yaw;               // 相对玩家朝向
      a.el.style.transform = `translate(-16px,-130px) rotate(${(rel * 180 / Math.PI).toFixed(1)}deg)`;
      a.el.style.opacity = String(Math.min(1, a.t / 0.4));
    }
  }

  /** 死亡瞬间：立刻红闪 */
  deathFlash() {
    this.el.deathFlash.classList.add('on');
    setTimeout(() => this.el.deathFlash.classList.remove('on'), 60);
    this.deathT = 0.5;
  }

  killFeed(text) {
    const d = document.createElement('div');
    d.innerHTML = text;
    this.el.killfeed.appendChild(d);
    setTimeout(() => d.remove(), 4200);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.firstChild.remove();
  }

  waveMessage(text) {
    this.el.waveMsg.textContent = text;
    if (text) setTimeout(() => { if (this.el.waveMsg.textContent === text) this.el.waveMsg.textContent = ''; }, 2200);
  }

  // ------------------------------------------------------------ 主更新
  update(dt, state) {
    const {
      player, weapons, score, wave, waveState,
      equipDef, equipCount, gadgetDef, gadgetCount, gadgetCd = 0,
      mode, tdm, fighters = [],
    } = state;

    // ---- 左下：生命
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    if (this._lastHp === null || player.hp > this._lastHp) this.hpGhost = hpRatio;   // 回血 / 复活：直接跟上
    this._lastHp = player.hp;
    this.hpGhost = Math.max(hpRatio, THREE.MathUtils.damp(this.hpGhost, hpRatio, 2.2, dt));
    this.el.hpBig.innerHTML = `${Math.ceil(player.hp)}<small> / ${player.maxHp}</small>`;
    this.el.hpBig.classList.toggle('hurt', player.hp < player.maxHp * 0.3);
    this._fillSegs(this.hpCells, hpRatio, this.hpGhost, (i, on) => {
      const f = (i + 1) / this.hpCells.length;
      return hpRatio < 0.3 ? 'low' : hpRatio < 0.6 ? 'mid' : (f > 0.999 ? '' : '');
    });
    this._fillSegs(this.armorCells, Math.max(0, player.armor / player.maxArmor));
    this.el.armorNum.textContent = Math.ceil(player.armor);

    if (mode === 'tdm') {
      this.el.plChip.textContent = TEAM_COLORS[0].name;
      this.el.plChip.style.background = TEAM_COLORS[0].hex;
      this.el.plChip.style.color = '#05131f';
    } else {
      this.el.plChip.textContent = '你';
      this.el.plChip.style.background = '#eef4ee';
      this.el.plChip.style.color = '#0a0e0a';
    }

    if (equipDef) {
      this.el.nade.querySelector('.t').textContent = equipDef.name;
      this.el.nade.querySelector('.n').textContent = '×' + equipCount;
      this.el.nade.classList.toggle('off', equipCount <= 0);
    }
    if (gadgetDef) {
      this.el.gadget.querySelector('.t').textContent = gadgetDef.name;
      this.el.gadget.querySelector('.n').textContent = '×' + gadgetCount;
      this.el.gadget.classList.toggle('off', gadgetCount <= 0);
      this.el.gadget.classList.toggle('cd', gadgetCd > 0);
    }

    // ---- 右下：武器
    const w = weapons.cur;
    this.el.wName.textContent = w.cn ? w.cn.split(' ')[0] : w.name;
    this.el.wOptic.textContent = (OPTICS[w.optic] || OPTICS.iron).short;
    this.el.ammo.innerHTML = w.noAmmo
      ? '—<small> 近战</small>'
      : w.mag + '<small> / ' + (w.reserve === Infinity ? '∞' : w.reserve) + '</small>';
    this.el.ammo.classList.toggle('low', !w.noAmmo && w.mag > 0 && w.mag <= Math.ceil(w.magSize * 0.25));
    this.el.ammo.classList.toggle('empty', !w.noAmmo && w.mag === 0 && !weapons.reloading);

    if (w.noAmmo) {
      this.el.ammoSegs.style.visibility = 'hidden';
    } else {
      this.el.ammoSegs.style.visibility = 'visible';
      const size = Math.min(w.magSize, 30);
      if (this._ammoCount !== size) {
        this._ammoCount = size;
        this.ammoCells = this._makeSegs(this.el.ammoSegs, size);
      }
      const on = Math.ceil((w.mag / w.magSize) * this.ammoCells.length);
      for (let i = 0; i < this.ammoCells.length; i++) this.ammoCells[i].className = i < on ? 'on' : '';
    }

    this.el.reloading.style.display = weapons.reloading ? 'block' : 'none';
    this.el.reloadWrap.style.display = weapons.reloading ? 'block' : 'none';
    if (weapons.reloading) this.el.reloadBar.style.width = ((1 - weapons.reloadTimer / w.reloadTime) * 100) + '%';

    for (let i = 0; i < this.slotEls.length; i++) this.slotEls[i].classList.toggle('active', i === weapons.index);

    // ---- 顶部
    const alive = fighters.filter(e => !e.dead && (e.team === undefined || e.team !== 0)).length;
    this.el.mmCount.textContent = alive ? `敌 ${alive}` : '';
    if (mode === 'tdm' && tdm) {
      this.el.score.style.display = 'none';
      this.el.wave.style.display = 'none';
      this.el.tdmScore.classList.remove('hidden');
      this.el.tdmBars.classList.remove('hidden');
      this.el.tdmScore.innerHTML =
        `<span class="t b">${tdm.score[0]}</span>` +
        `<span class="mid">目标<br>${tdm.killTarget}</span>` +
        `<span class="t r">${tdm.score[1]}</span>`;
      const kb = Math.min(1, tdm.score[0] / tdm.killTarget), kr = Math.min(1, tdm.score[1] / tdm.killTarget);
      this.el.tdmBars.children[0].style.transform = `scaleX(${kb.toFixed(3)})`;
      this.el.tdmBars.children[1].style.transform = `scaleX(${kr.toFixed(3)})`;
      if (player.dead && !tdm.finished) {
        this.el.waveMsg.textContent = `阵亡 · ${Math.max(0, tdm.playerRespawnT).toFixed(1)}s 后复活`;
        this._respawnMsg = true;
      } else if (this._respawnMsg) {
        this._respawnMsg = false;
        this.el.waveMsg.textContent = '';
      }
    } else {
      this.el.score.style.display = 'block';
      this.el.score.textContent = String(score).padStart(5, '0');
      this.el.wave.style.display = 'block';
      this.el.tdmScore.classList.add('hidden');
      this.el.tdmBars.classList.add('hidden');
      this.el.wave.textContent = waveState === 'break'
        ? `WAVE ${wave} 即将开始`
        : `WAVE ${wave} · 剩余 ${alive}`;
    }

    // ---- 准星 / 瞄具分划
    const optic = OPTICS[w.optic] || OPTICS.iron;
    const ads = weapons.aiming && weapons.aimT > 0.45;
    this.el.crosshair.style.opacity = ads ? '0' : '1';
    this.el.crosshair.classList.toggle('hover', !!this.hoverTarget && this.crossHitT <= 0);
    this.el.scope.style.display = (ads && weapons.isScope) ? 'block' : 'none';
    const showReticle = ads && !weapons.isScope;
    this.el.reticle.style.display = showReticle ? 'block' : 'none';
    if (showReticle && this._reticleType !== optic.reticle) {
      this._reticleType = optic.reticle;
      drawReticle(this.el.reticle, optic.reticle);
    }
    this.el.reticle.style.opacity = String(THREE.MathUtils.clamp((weapons.aimT - 0.45) / 0.35, 0, 1));

    // ---- 计时器
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.el.hitmarker.classList.remove('show');
    }
    if (this.crossHitT > 0) {
      this.crossHitT -= dt;
      if (this.crossHitT <= 0) this.el.crosshair.classList.remove('hit', 'head', 'kill');
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.el.dmgTotal.style.opacity = '0';
    }
    if (this.vigT > 0) {
      this.vigT -= dt;
      if (this.vigT <= 0) this.el.vignette.style.opacity = '0';
    }
    if (this.hurtT > 0) this.hurtT -= dt;
    this.el.lowhp.classList.toggle('on', hpRatio < 0.3 && !player.dead);
    this.el.sprintLines.style.opacity = String((player.sprintT ?? 0) * 0.9);

    this._updateDirArrows(dt, player);
    this.drawMinimap(player, fighters);
    this.updateEnemyBars(dt);
    this.updateFloaters(dt);
  }
}
