import type { Game } from '../core/Game';
import type { BuildId } from '../core/Types';
import { BUILD_ORDER, BUILDS } from '../game/Loadout';
import { GADGETS } from '../gadgets/Gadget';
import { getWeaponDef } from '../weapons/WeaponDefs';

function el(tag: string, cls?: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/** 主菜单（体型选择）与暂停面板 */
export class Menu {
  game: Game;
  root: HTMLElement;
  pauseRoot: HTMLElement;
  selected: BuildId = 'medium';
  private cards: HTMLElement[] = [];

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    this.pauseRoot = el('div', 'pause-root', root);
    this.buildMain();
    this.buildPause();
  }

  private buildMain(): void {
    const m = el('div', 'menu-root', this.root);
    m.id = 'main-menu';
    el('div', 'menu-title', m).textContent = 'THE FINALS';
    el('div', 'menu-sub', m).textContent = 'VOXEL STRIKE · MONACO CHURCH · 5v5 TDM';

    const cards = el('div', 'menu-cards', m);
    for (const id of BUILD_ORDER) {
      const b = BUILDS[id];
      const card = el('div', 'menu-card', cards);
      card.style.borderTopColor = `#${b.color.toString(16).padStart(6, '0')}`;
      el('h3', undefined, card).textContent = b.name;
      el('div', 'cn', card).textContent = b.cn;
      el('div', 'desc', card).textContent = b.desc;

      const st1 = el('div', 'stat', card);
      el('span', undefined, st1).textContent = '生命值';
      el('span', undefined, st1).textContent = String(b.hp);
      const st2 = el('div', 'stat', card);
      el('span', undefined, st2).textContent = '移动速度';
      el('span', undefined, st2).textContent = b.speed.toFixed(1);

      const ul = el('ul', undefined, card);
      for (const w of b.weapons) el('li', undefined, ul).textContent = `武器 · ${getWeaponDef(w).name}`;
      for (const g of b.gadgets) el('li', undefined, ul).textContent = `道具 · ${GADGETS[g]?.cn ?? g}`;
      el('li', undefined, ul).textContent = `技能 · ${b.ability.toUpperCase()}`;

      card.onclick = () => {
        this.selected = id;
        this.refresh();
        this.game.audio?.play('ui');
      };
      this.cards.push(card);
    }

    const btn = el('button', 'menu-btn', m) as HTMLButtonElement;
    btn.textContent = '进 入 战 区';
    btn.onclick = () => this.game.startMatch(this.selected);

    const hint = el('div', 'menu-hint', m);
    hint.innerHTML =
      'WASD 移动 · SHIFT 冲刺 · SPACE 跳跃 · 左键 射击 · 右键 开镜<br>' +
      'Q 技能 · F 道具 · G 举起道具（左/右键部署） · R 换弹 · 滚轮 切枪 · V 第三人称 · ESC 暂停';
    el('div', 'menu-foot', m).textContent =
      'Three.js WebGL · 体素美术 · 场景可破坏 · HFSM + Utility AI';
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].classList.toggle('sel', BUILD_ORDER[i] === this.selected);
    }
  }

  private buildPause(): void {
    el('div', 'pause-title', this.pauseRoot).textContent = '已暂停';
    const sub = el('div', 'menu-hint', this.pauseRoot);
    sub.innerHTML = '点击「继续」重新锁定鼠标<br>WASD 移动 · Q 技能 · F 道具 · G 举起道具 · V 第三人称';
    const resume = el('button', 'btn', this.pauseRoot) as HTMLButtonElement;
    resume.textContent = '继 续';
    resume.onclick = () => this.game.resume();
    const quit = el('button', 'btn ghost', this.pauseRoot) as HTMLButtonElement;
    quit.textContent = '返回主菜单';
    quit.onclick = () => this.game.backToMenu();
  }

  show(): void { (this.root.querySelector('#main-menu') as HTMLElement).style.display = 'flex'; }
  hide(): void { (this.root.querySelector('#main-menu') as HTMLElement).style.display = 'none'; }
  showPause(v: boolean): void { this.pauseRoot.classList.toggle('on', v); }
}
