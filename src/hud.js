import * as THREE from 'three';
import { drawReticle, OPTICS } from './optics.js';
import { TEAM_COLORS } from './tdm.js';
import { drawAvatar } from './textures.js';

const $ = (id) => document.getElementById(id);

const HP_SEGS = 22;
const ARMOR_SEGS = 14;

export class Hud {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.el = {
      hud: $('hud'),
      hpBig: $('hpBig'),
      hpSegs: $('hpSegs'),
      armorSegs: $('armorSegs'),
      armorNum: $('armorNum'),
      plNameText: $('plNameText'),
      plChip: $('plChip'),
      score: $('score'), wave: $('wave'), waveMsg: $('waveMsg'),
      tdmScore: $('tdmScore'),
      wName: $('wName'), ammo: $('ammo'), ammoSegs: $('ammoSegs'),
      reloading: $('reloading'), reloadBar: $('reloadBar').firstElementChild,
      reloadWrap: $('reloadBar'),
      slots: $('slots'),
      minimap: $('minimap'),
      killfeed: $('killfeed'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      vignette: $('vignette'),
      lowhp: $('lowhp'),
      deathFlash: $('deathFlash'),
      scope: $('scope'),
      nade: $('nade'),
      gadget: $('gadget'),
      avatar: $('avatar'),
      reticle: $('reticle'),
      enemybars: $('enemybars'),
    };

    drawAvatar(this.el.avatar);
    this.el.plNameText.textContent = 'L PAPA';

    // 分段条
    this.hpCells = this._makeSegs(this.el.hpSegs, HP_SEGS);
    this.armorCells = this._makeSegs(this.el.armorSegs, ARMOR_SEGS);
    this.ammoCells = [];
    this._ammoCount = -1;

    this.slotEls = [];
    this._reticleType = null;

    // 飘字池
    this.floaters = [];
    this.floaterPool = [];
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.el.hud.appendChild(layer);
    this.floatLayer = layer;
    for (let i = 0; i < 26; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;font-size:14px;text-shadow:2px 2px 0 #000;opacity:0;will-change:transform;';
      layer.appendChild(d);
      this.floaterPool.push(d);
    }

    // 敌人血条池
    this.enemyBars = new Map();
    this.enemyBarPool = [];

    this._buildMinimapBase();
    this.mm = this.el.minimap.getContext('2d');
    this.mm.imageSmoothingEnabled = false;

    this.hitT = 0;
    this.killT = 0;
    this.vigT = 0;
    this.hurtT = 0;
    this.deathT = 0;
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

  _fillSegs(cells, ratio, extra = () => null) {
    const on = Math.ceil(ratio * cells.length);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.className = i < on ? 'on ' + (extra(i, on) || '') : '';
    }
  }

  /** 按配装重建武器槽 */
  buildSlots(slots) {
    this.el.slots.innerHTML = '';
    this.slotEls = slots.map((w, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<div class="k">${i + 1}</div><div>${w.name}</div><div style="font-size:7px;color:#6d856d">${OPTICS[w.optic].short}</div>`;
      this.el.slots.appendChild(d);
      return d;
    });
  }

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
    for (const e of fighters) {
      if (e.dead) continue;
      const px = (((e.pos.x / B) + HALF) / n) * S;
      const py = (((e.pos.z / B) + HALF) / n) * S;
      if (e.team !== undefined) {
        ctx.fillStyle = e.team === 0 ? '#54c8ff' : '#ff5a4d';
      } else {
        ctx.fillStyle = e.type.id === 'brute' ? '#ff9a3c' : e.type.id === 'sniper' ? '#c56cff' : e.type.id === 'runner' ? '#54c8ff' : '#ff4d4d';
      }
      const big = e.team !== undefined ? e.cls.id === 'heavy' : e.type.scale > 1.2;
      const s = big ? 5 : 4;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }

    const px = (((player.pos.x / B) + HALF) / n) * S;
    const py = (((player.pos.z / B) + HALF) / n) * S;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-player.yaw + Math.PI);
    ctx.fillStyle = '#7dff5a';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }

  // ------------------------------------------------------------ 敌人血条
  _enemyLabel(target) {
    if (target.team !== undefined) return target.name;
    return target.type.name;
  }

  /** 命中敌人时点亮血条 */
  hitEnemy(target, damage, isHead) {
    let bar = this.enemyBars.get(target);
    if (!bar) {
      const el = this.enemyBarPool.pop() || this._makeEnemyBar();
      el.style.opacity = '0';
      this.el.enemybars.appendChild(el);
      bar = { el, t: 0, life: 3.2, dmgT: 0 };
      this.enemyBars.set(target, bar);
      this._updateBarContent(bar, target);
    }
    bar.t = 0;
    bar.life = isHead ? 3.6 : 3.0;
    const ratio = Math.max(0, target.hp / (target.maxHp ?? 100));
    bar.el.querySelector('.fill').style.width = (ratio * 100) + '%';
    bar.el.classList.add('hit');
    setTimeout(() => bar.el.classList.remove('hit'), 90);

    const dmg = bar.el.querySelector('.dmg');
    dmg.textContent = (isHead ? '✷' : '') + Math.round(damage);
    dmg.style.color = isHead ? '#ffd84a' : '#fff';
    bar.dmgT = 0.7;
  }

  _makeEnemyBar() {
    const el = document.createElement('div');
    el.className = 'ebar';
    el.innerHTML = '<div class="nm"></div><div class="rail"><div class="fill"></div></div><div class="dmg"></div>';
    return el;
  }

  _updateBarContent(bar, target) {
    bar.el.querySelector('.nm').textContent = this._enemyLabel(target);
    if (target.team !== undefined) {
      bar.el.classList.toggle('friend', target.team === 0);
    }
  }

  updateEnemyBars(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const [target, bar] of this.enemyBars) {
      if (target.dead || target.removed) {
        this._retireBar(target, bar);
        continue;
      }
      bar.t += dt;
      if (bar.dmgT > 0) {
        bar.dmgT -= dt;
        if (bar.dmgT <= 0) bar.el.querySelector('.dmg').textContent = '';
      }
      if (bar.t > bar.life) { this._retireBar(target, bar); continue; }

      const hs = target.height ?? (target.cls ? 1.85 : 1.85 * target.type.scale);
      this._w.copy(target.pos).setY(target.pos.y + hs + 0.35);
      this._v.copy(this._w).project(this.camera);
      if (this._v.z > 1) { bar.el.style.opacity = '0'; continue; }
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      bar.el.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
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
    this.floaters.push({ el: d, pos: worldPos.clone(), t: 0, life: 0.85 });
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
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h - k * 46;
      f.el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(1.25 - k * 0.35).toFixed(2)})`;
      f.el.style.opacity = String(Math.max(0, 1 - k * k * 1.4));
    }
  }

  hitmarker(kill) {
    const el = this.el.hitmarker;
    el.classList.toggle('kill', !!kill);
    el.style.opacity = '1';
    this.hitT = kill ? 0.34 : 0.16;
  }

  damageFlash() {
    this.el.vignette.style.opacity = '1';
    this.vigT = 0.35;
    this.hurtT = 0.55;
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
      equipDef, equipCount, gadgetDef, gadgetCount,
      mode, tdm, fighters = [],
    } = state;

    // ---- 左下：生命
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    this.el.hpBig.innerHTML = `${Math.ceil(player.hp)} <small>/ ${player.maxHp}</small>`;
    this.el.hpBig.classList.toggle('hurt', player.hp < player.maxHp * 0.35);
    this._fillSegs(this.hpCells, hpRatio, (i, on) => {
      const f = (i + 1) / on;
      return f < 0.4 ? 'low' : f < 0.75 ? 'mid' : '';
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

    // ---- 右下：武器
    const w = weapons.cur;
    this.el.wName.textContent = w.cn ? w.cn.split(' ')[0] : w.name;
    this.el.ammo.innerHTML = w.noAmmo
      ? '—<small> 近战</small>'
      : w.mag + '<small> / ' + (w.reserve === Infinity ? '∞' : w.reserve) + '</small>';
    this.el.ammo.classList.toggle('low', !w.noAmmo && w.mag <= Math.ceil(w.magSize * 0.25));

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
      for (let i = 0; i < this.ammoCells.length; i++) {
        this.ammoCells[i].className = i < on ? 'on' : '';
      }
    }

    this.el.reloading.style.display = weapons.reloading ? 'block' : 'none';
    this.el.reloadWrap.style.display = weapons.reloading ? 'block' : 'none';
    if (weapons.reloading) this.el.reloadBar.style.width = ((1 - weapons.reloadTimer / w.reloadTime) * 100) + '%';

    for (let i = 0; i < this.slotEls.length; i++) {
      this.slotEls[i].classList.toggle('active', i === weapons.index);
    }

    if (equipDef) this.el.nade.textContent = `${equipDef.name} ×${equipCount}`;
    if (gadgetDef) {
      this.el.gadget.textContent = `${gadgetDef.name} ×${gadgetCount}`;
      this.el.gadget.style.color = gadgetCount > 0 ? '#bfe6ff' : '#5d755d';
    }

    // ---- 顶部
    if (mode === 'tdm' && tdm) {
      this.el.score.textContent = String(tdm.score[0]).padStart(2, '0');
      this.el.wave.style.display = 'none';
      this.el.tdmScore.classList.remove('hidden');
      this.el.tdmScore.innerHTML =
        `<span style="color:${TEAM_COLORS[0].hex}">蓝 ${tdm.score[0]}</span>` +
        `　<span style="color:#6d856d">/</span>　` +
        `<span style="color:${TEAM_COLORS[1].hex}">红 ${tdm.score[1]}</span>` +
        `　<span style="color:#8fa88f">目标 ${tdm.killTarget}</span>`;
      if (player.dead && !tdm.finished) {
        this.el.waveMsg.textContent = `阵亡 · ${Math.max(0, tdm.playerRespawnT).toFixed(1)}s 后复活`;
        this._respawnMsg = true;
      } else if (this._respawnMsg) {
        this._respawnMsg = false;
        this.el.waveMsg.textContent = '';
      }
    } else {
      this.el.score.textContent = String(score).padStart(5, '0');
      this.el.wave.style.display = 'block';
      this.el.tdmScore.classList.add('hidden');
      const alive = fighters.filter(e => !e.dead).length;
      this.el.wave.textContent = waveState === 'break'
        ? `WAVE ${wave} 即将开始`
        : `WAVE ${wave} · 剩余 ${alive}`;
    }

    // ---- 准星 / 瞄具分划
    const optic = OPTICS[w.optic] || OPTICS.iron;
    const ads = weapons.aiming && weapons.aimT > 0.45;
    this.el.crosshair.style.opacity = ads ? '0' : '1';
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
      if (this.hitT <= 0) this.el.hitmarker.style.opacity = '0';
    }
    if (this.vigT > 0) {
      this.vigT -= dt;
      if (this.vigT <= 0) this.el.vignette.style.opacity = '0';
    }
    if (this.hurtT > 0) this.hurtT -= dt;
    this.el.lowhp.classList.toggle('on', hpRatio < 0.3 && !player.dead);

    this.drawMinimap(player, fighters);
    this.updateEnemyBars(dt);
    this.updateFloaters(dt);
  }
}
