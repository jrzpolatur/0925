import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { DamageInfo } from '../core/Types';
import type { KillEvent } from '../game/TDM';
import { CFG } from '../core/Config';
import { clamp, formatTime } from '../core/Utils';
import { BUILDS } from '../game/Loadout';
import { GADGETS } from '../gadgets/Gadget';

function el(tag: string, cls?: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * HUD：HP / 准星 / 命中反馈 / 受击方向 / 击杀播报 / 武器弹药 / 道具 / 技能 CD / 记分
 * 全部用 DOM 绘制（不占用 WebGL 绘制预算），只在数值变化时更新，避免布局抖动。
 */
export class HUD {
  game: Game;
  root: HTMLElement;

  private hpNum!: HTMLElement;
  private hpMax!: HTMLElement;
  private hpFill!: HTMLElement;
  private buildDot!: HTMLElement;
  private buildName!: HTMLElement;
  private abilityChip!: HTMLElement;
  private abilityName!: HTMLElement;
  private abilityCd!: HTMLElement;
  private dashPips!: HTMLElement;

  private weaponName!: HTMLElement;
  private ammoCur!: HTMLElement;
  private ammoRes!: HTMLElement;
  private reloadBar!: HTMLElement;
  private reloadFill!: HTMLElement;
  private gadgetRow!: HTMLElement;
  private gadgetChips: HTMLElement[] = [];

  private scoreBlue!: HTMLElement;
  private scoreRed!: HTMLElement;
  private timer!: HTMLElement;
  private killFeed!: HTMLElement;

  private chLines: HTMLElement[] = [];
  private hitMarkerEl!: HTMLElement;
  private dmgArrows: { el: HTMLElement; t: number }[] = [];
  private hurtVig!: HTMLElement;
  private lowVig!: HTMLElement;
  private toastEl!: HTMLElement;
  private killBanner!: HTMLElement;
  private killBannerName!: HTMLElement;
  private killBannerTop!: HTMLElement;
  private respawn!: HTMLElement;
  private respawnTimer!: HTMLElement;
  private respawnKiller!: HTMLElement;

  private endRoot!: HTMLElement;
  private endTitle!: HTMLElement;
  private endScore!: HTMLElement;
  private endStats!: HTMLElement;

  private toastT = 0;
  private killBannerT = 0;
  private hitT = 0;
  private lastHp = -1;
  private lastAmmo = -1;
  private lastWeapon = '';
  private lastGadget = -1;
  private visible = true;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    this.build();
  }

  private build(): void {
    // ---------- 顶部记分 ----------
    const board = el('div', 'score-board', this.root);
    const blue = el('div', 'score-side blue', board);
    this.scoreBlue = el('div', 'score-num', blue);
    this.scoreBlue.textContent = '0';
    el('div', 'score-label', blue).textContent = 'BLUE';
    const mid = el('div', 'score-mid', board);
    this.timer = el('div', 'score-timer', mid);
    this.timer.textContent = '8:00';
    el('div', 'score-target', mid).textContent = `目标 ${CFG.scoreTarget} 击杀`;
    const red = el('div', 'score-side red', board);
    el('div', 'score-label', red).textContent = 'RED';
    this.scoreRed = el('div', 'score-num', red);
    this.scoreRed.textContent = '0';

    // ---------- 击杀播报 ----------
    this.killFeed = el('div', 'kill-feed', this.root);

    // ---------- 准星 ----------
    const ch = el('div', 'crosshair', this.root);
    for (let i = 0; i < 4; i++) {
      const l = el('div', 'ch-line', ch);
      if (i < 2) { l.style.width = '2px'; l.style.height = '8px'; }
      else { l.style.width = '8px'; l.style.height = '2px'; }
      this.chLines.push(l);
    }
    el('div', 'ch-dot', ch);

    this.hitMarkerEl = el('div', 'hitmarker', this.root);
    this.hitMarkerEl.innerHTML = '<span class="a"></span><span class="b"></span><span class="c"></span><span class="d"></span>';

    // ---------- 受击方向 ----------
    const dd = el('div', 'dmg-dir', this.root);
    for (let i = 0; i < 6; i++) {
      const a = el('div', 'dmg-arrow', dd);
      this.dmgArrows.push({ el: a, t: 0 });
    }

    // ---------- 屏幕反馈 ----------
    this.hurtVig = el('div', 'hurt-vignette', this.root);
    this.lowVig = el('div', 'lowhp-vignette', this.root);

    // ---------- 左下 HP ----------
    const left = el('div', 'hud-left', this.root);
    const hpRow = el('div', 'hp-row', left);
    this.hpNum = el('div', 'hp-num', hpRow);
    this.hpNum.textContent = '100';
    this.hpMax = el('div', 'hp-max', hpRow);
    const bar = el('div', 'hp-bar', left);
    this.hpFill = el('div', 'hp-fill', bar);
    const tag = el('div', 'build-tag', left);
    this.buildDot = el('div', 'build-dot', tag);
    this.buildName = el('div', undefined, tag);
    const abilityRow = el('div', 'ability-row', left);
    this.abilityChip = el('div', 'ability-chip', abilityRow);
    el('div', 'k', this.abilityChip).textContent = 'Q';
    this.abilityName = el('div', 'n', this.abilityChip);
    this.abilityCd = el('div', 'ability-cd', this.abilityChip);
    this.dashPips = el('div', 'dash-pips', left);

    // ---------- 右下 武器/道具 ----------
    const right = el('div', 'hud-right', this.root);
    this.weaponName = el('div', 'weapon-name', right);
    const ammoRow = el('div', 'ammo-row', right);
    this.ammoCur = el('div', 'ammo-cur', ammoRow);
    this.ammoRes = el('div', 'ammo-res', ammoRow);
    this.reloadBar = el('div', 'reload-bar', right);
    this.reloadFill = el('div', 'reload-fill', this.reloadBar);
    this.gadgetRow = el('div', 'gadget-row', right);

    // ---------- 中央提示 ----------
    this.toastEl = el('div', 'center-toast', this.root);
    this.killBanner = el('div', 'kill-banner', this.root);
    this.killBannerTop = el('div', 't', this.killBanner);
    this.killBannerName = el('div', 'n', this.killBanner);

    // ---------- 重生 ----------
    this.respawn = el('div', 'respawn-overlay', this.root);
    el('div', 'respawn-title', this.respawn).textContent = '被淘汰';
    this.respawnKiller = el('div', 'respawn-sub', this.respawn);
    this.respawnTimer = el('div', 'respawn-timer', this.respawn);

    // ---------- 结算 ----------
    this.endRoot = el('div', 'end-root', this.root);
    this.endTitle = el('div', 'end-title', this.endRoot);
    this.endScore = el('div', 'end-score', this.endRoot);
    this.endStats = el('div', 'end-stats', this.endRoot);
    const again = el('button', 'btn', this.endRoot) as HTMLButtonElement;
    again.textContent = '再来一局';
    again.onclick = () => this.game.restartMatch();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  // ------------------------------------------------------------ 事件反馈
  hitMarker(head: boolean): void {
    const hm = this.hitMarkerEl;
    hm.classList.remove('show');
    void hm.offsetWidth; // 强制重排以重启动画
    hm.classList.toggle('kill', head);
    hm.classList.add('show');
    this.hitT = 0.28;
  }

  damageDealt(_n: number): void {
    this.game.audio?.play('hit');
  }

  /** 玩家被击中：红色边缘 + 方向指示 + 轻震 */
  playerHurt(info: DamageInfo): void {
    this.hurtVig.style.opacity = String(Math.min(0.85, 0.25 + info.amount / 70));
    setTimeout(() => { this.hurtVig.style.opacity = '0'; }, 130);
    this.game.playerController?.shake(Math.min(0.5, info.amount / 90));

    // 方向：攻击者位于 -d 方向
    const ax = -info.dx, az = -info.dz;
    const world = Math.atan2(ax, az); // 世界方向角
    let rel = world - this.game.player.yaw;
    // 屏幕角度：以准星上方为 0，顺时针
    const deg = (rel * 180) / Math.PI + 180;
    const slot = this.dmgArrows.find((a) => a.t <= 0) || this.dmgArrows[0];
    slot.t = 1.3;
    slot.el.style.transform = `rotate(${deg}deg)`;
    slot.el.style.opacity = '1';
  }

  pushKillFeed(ev: KillEvent): void {
    const item = el('div', 'kf-item', this.killFeed);
    const killer = el('span', 'k', item);
    killer.textContent = ev.killer;
    killer.style.color = ev.killerTeam === 0 ? CFG.teams[0].css : CFG.teams[1].css;
    const victim = el('span', 'k', item);
    victim.textContent = ev.victim;
    victim.style.color = ev.victimTeam === 0 ? CFG.teams[0].css : CFG.teams[1].css;
    item.appendChild(document.createTextNode(' › '));
    item.appendChild(victim);
    const w = el('span', 'w', item);
    w.textContent = ev.weapon;
    while (this.killFeed.children.length > 6) this.killFeed.removeChild(this.killFeed.firstChild!);
    setTimeout(() => { item.style.opacity = '0.0'; }, 5200);
    setTimeout(() => { item.remove(); }, 5800);

    if (ev.killer === this.game.player?.name && ev.victim !== this.game.player?.name) {
      this.killBannerTop.textContent = '淘汰';
      this.killBannerName.textContent = ev.victim;
      this.killBanner.classList.remove('show');
      void this.killBanner.offsetWidth;
      this.killBanner.classList.add('show');
    }
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = 1.6;
  }

  flashWeapon(name: string): void {
    this.toast(`切换武器 · ${name}`);
  }

  flashGadget(name: string): void {
    this.toast(`切换道具 · ${name}`);
  }

  showMatchEnd(winner: number, scores: number[]): void {
    const p = this.game.player;
    this.endRoot.classList.add('on');
    if (winner < 0) {
      this.endTitle.textContent = '平局';
      this.endTitle.style.color = '#fff';
    } else {
      const isWin = p ? p.team === winner : false;
      this.endTitle.textContent = isWin ? '胜利' : '失败';
      this.endTitle.style.color = winner === 0 ? CFG.teams[0].css : CFG.teams[1].css;
    }
    this.endScore.textContent = `${scores[0]} : ${scores[1]}`;
    if (p) {
      this.endStats.innerHTML =
        `击杀 ${p.kills} · 死亡 ${p.deaths} · 伤害 ${Math.round(p.damage)}<br>` +
        `体型 ${BUILDS[p.build].cn} · 目标击杀数 ${CFG.scoreTarget}`;
    }
  }

  hideMatchEnd(): void {
    this.endRoot.classList.remove('on');
  }

  // ------------------------------------------------------------ 每帧更新
  update(dt: number): void {
    if (!this.visible) return;
    const p = this.game.player;
    if (!p) return;

    // ---- HP ----
    const hp = Math.max(0, Math.round(p.hp));
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.hpNum.textContent = String(hp);
      this.hpFill.style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
      this.hpFill.classList.toggle('low', p.hp / p.maxHp < 0.35);
      this.lowVig.classList.toggle('on', p.alive && p.hp / p.maxHp < 0.28);
    }
    this.hpMax.textContent = `/ ${p.maxHp}`;

    // ---- 体型 / 技能 ----
    const bd = BUILDS[p.build];
    this.buildDot.style.background = `#${bd.color.toString(16).padStart(6, '0')}`;
    this.buildName.textContent = `${bd.name} · ${bd.cn}`;
    const ab = p.ability;
    this.abilityName.textContent = ab.cn;
    const ratio = ab.id === 'dash'
      ? (p.dashCharges > 0 ? 1 : 0)
      : ab.cdRatio;
    this.abilityCd.style.transform = `scaleY(${1 - ratio})`;
    this.abilityChip.classList.toggle('ready', ratio >= 1);

    // Dash 三段显示
    if (ab.id === 'dash') {
      if (this.dashPips.children.length !== CFG.dashCharges) {
        this.dashPips.innerHTML = '';
        for (let i = 0; i < CFG.dashCharges; i++) el('div', 'dash-pip', this.dashPips);
      }
      const pips = this.dashPips.children;
      for (let i = 0; i < pips.length; i++) {
        (pips[i] as HTMLElement).classList.toggle('on', i < p.dashCharges);
      }
    } else if (this.dashPips.children.length) {
      this.dashPips.innerHTML = '';
    }

    // ---- 武器 / 弹药 ----
    const w = p.weapon;
    if (this.lastWeapon !== w.def.id) {
      this.lastWeapon = w.def.id;
      this.weaponName.textContent = w.def.name;
      // 重建道具条（不同体型道具不同）
      this.rebuildGadgets(p);
    }
    if (w.ammo !== this.lastAmmo) {
      this.lastAmmo = w.ammo;
      this.ammoCur.textContent = String(w.ammo);
      this.ammoCur.style.color = w.ammo === 0 ? '#ff4d55' : '#fff';
    }
    this.ammoRes.textContent = `/ ${w.reserve}`;
    const rl = w.reloading;
    this.reloadBar.classList.toggle('on', rl);
    if (rl) this.reloadFill.style.width = `${Math.round(w.reloadProgress * 100)}%`;

    // 道具数量
    for (let i = 0; i < this.gadgetChips.length; i++) {
      const g = p.gadgets[i];
      if (!g) continue;
      const c = this.gadgetChips[i].querySelector('.c') as HTMLElement;
      if (c) c.textContent = String(g.count);
      this.gadgetChips[i].classList.toggle('active', i === p.gadgetIndex);
    }

    // ---- 准星（动态扩散） ----
    const spread = w.spread.current(p);
    const gap = clamp(spread * 820, 3, 58);
    const len = 8;
    this.chLines[0].style.transform = `translate(-1px, ${-(gap + len)}px)`;
    this.chLines[1].style.transform = `translate(-1px, ${gap}px)`;
    this.chLines[2].style.transform = `translate(${-(gap + len)}px, -1px)`;
    this.chLines[3].style.transform = `translate(${gap}px, -1px)`;
    const vis = !this.game.playerController?.gadgetMode;
    for (const l of this.chLines) l.style.opacity = vis ? '1' : '0.25';

    // ---- 记分 ----
    const t = this.game.tdm;
    this.scoreBlue.textContent = String(t.scores[0]);
    this.scoreRed.textContent = String(t.scores[1]);
    this.timer.textContent = formatTime(t.timeLeft);

    // ---- 计时器 ----
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
    for (const a of this.dmgArrows) {
      if (a.t > 0) {
        a.t -= dt;
        if (a.t <= 0) a.el.style.opacity = '0';
      }
    }

    // ---- 重生 ----
    const dead = !p.alive;
    this.respawn.classList.toggle('on', dead);
    if (dead) {
      this.respawnTimer.textContent = String(Math.max(0, Math.ceil(p.respawnTimer)));
      const k = p.lastAttacker;
      this.respawnKiller.textContent = k ? `被 ${k.name} 淘汰` : '被环境淘汰';
    }
  }

  private rebuildGadgets(p: any): void {
    this.gadgetRow.innerHTML = '';
    this.gadgetChips.length = 0;
    for (const g of p.gadgets) {
      const chip = el('div', 'gadget-chip', this.gadgetRow);
      const def = GADGETS[g.def.id];
      chip.appendChild(document.createTextNode(def ? def.cn : g.def.id));
      el('span', 'c', chip).textContent = String(g.count);
      this.gadgetChips.push(chip);
    }
  }
}
