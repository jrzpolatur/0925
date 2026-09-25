import {
  WEAPONS, WEAPON_BY_ID, EQUIPMENT, EQUIP_BY_ID,
  ARMORS, ARMOR_BY_ID, GADGETS, GADGET_BY_ID,
} from './weapons.js';
import { OPTICS } from './optics.js';
import { WeaponPreview } from './preview.js';

export const MODES = [
  { id: 'survival', name: '生存模式', desc: '无限波次 · 阵亡即结束' },
  { id: 'tdm', name: '团队死斗', desc: '5v5 · 先到 40 杀 · 可复活' },
];
export const SETTINGS = [
  { id: 'aim-hold', name: '长按瞄准', desc: '按住右键举枪' },
  { id: 'aim-toggle', name: '切换瞄准', desc: '点一下右键切换' },
];

const PRIMARY_POOL = ['smg', 'rifle', 'm14', 'shotgun', 'sniper', 'flame'];
const SECONDARY_POOL = ['pistol', 'smg'];
const SPECIAL_POOL = [
  { id: 'none', name: '不带', desc: '轻装上阵' },
  { id: 'rpg', name: WEAPON_BY_ID.rpg.cn, desc: '2 发 · 大范围爆破' },
  { id: 'sledge', name: WEAPON_BY_ID.sledge.cn, desc: '近战 · 横扫 + 冲撞' },
];

export class Loadout {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = {
      primary: 'rifle',
      primaryOptic: 'reflex',
      secondary: 'pistol',
      secondaryOptic: 'iron',
      special: 'rpg',
      equip: 'frag',
      armor: 'light',
      gadget: 'dome',
      mode: 'survival',
      aim: 'aim-hold',
    };

    this.groups = {};
    document.querySelectorAll('#overlay .cards').forEach(el => {
      this.groups[el.dataset.group] = el;
    });
    this.stats = document.getElementById('statList');
    this.preview = new WeaponPreview(document.getElementById('preview'));
    this.previewFocus = 'primary';

    this.render();
  }

  get primary() { return WEAPON_BY_ID[this.state.primary]; }
  get secondary() { return WEAPON_BY_ID[this.state.secondary]; }
  get equip() { return EQUIP_BY_ID[this.state.equip]; }
  get armor() { return ARMOR_BY_ID[this.state.armor]; }
  get gadget() { return GADGET_BY_ID[this.state.gadget]; }
  get specialWeapon() { return this.state.special === 'none' ? null : WEAPON_BY_ID[this.state.special]; }

  /** 把选择应用到武器定义 */
  apply() {
    this.primary.optic = this._validOptic(this.primary, this.state.primaryOptic);
    this.state.primaryOptic = this.primary.optic;
    this.secondary.optic = this._validOptic(this.secondary, this.state.secondaryOptic);
    this.state.secondaryOptic = this.secondary.optic;
    return this;
  }

  _validOptic(w, id) {
    return w.optics.includes(id) ? id : w.optics[0];
  }

  // ------------------------------------------------------------ 渲染
  render() {
    this.apply();

    this._cards('mode', MODES, this.state.mode, (id) => { this.state.mode = id; this.render(); });
    this._cards('settings', SETTINGS, this.state.aim, (id) => { this.state.aim = id; this.render(); });

    this._cards('primary', PRIMARY_POOL.map(id => ({
      id, name: WEAPON_BY_ID[id].cn, desc: this._brief(WEAPON_BY_ID[id]),
      off: id === this.state.secondary,
    })), this.state.primary, (id) => {
      this.state.primary = id;
      this.previewFocus = 'primary';
      this.apply(); this.render();
    });

    this._cards('primary-optic', this._opticCards(this.primary), this.state.primaryOptic, (id) => {
      this.state.primaryOptic = id; this.previewFocus = 'primary'; this.apply(); this.render();
    });

    this._cards('secondary', SECONDARY_POOL.map(id => ({
      id, name: WEAPON_BY_ID[id].cn, desc: this._brief(WEAPON_BY_ID[id]),
      off: id === this.state.primary,
    })), this.state.secondary, (id) => {
      this.state.secondary = id;
      this.previewFocus = 'secondary';
      this.apply(); this.render();
    });

    this._cards('secondary-optic', this._opticCards(this.secondary), this.state.secondaryOptic, (id) => {
      this.state.secondaryOptic = id; this.previewFocus = 'secondary'; this.apply(); this.render();
    });

    this._cards('special', SPECIAL_POOL, this.state.special, (id) => {
      this.state.special = id;
      this.previewFocus = id === 'none' ? 'primary' : 'special';
      this.render();
    });

    this._cards('equip', EQUIPMENT.map(e => ({ id: e.id, name: e.name, desc: e.desc })),
      this.state.equip, (id) => { this.state.equip = id; this.render(); });

    this._cards('armor', ARMORS.map(a => ({ id: a.id, name: a.name, desc: a.desc })),
      this.state.armor, (id) => { this.state.armor = id; this.render(); });

    this._cards('gadget', GADGETS.map(g => ({ id: g.id, name: g.name, desc: g.desc })),
      this.state.gadget, (id) => { this.state.gadget = id; this.render(); });

    this._stats();

    let w, o;
    if (this.previewFocus === 'secondary') { w = this.secondary; o = this.state.secondaryOptic; }
    else if (this.previewFocus === 'special' && this.specialWeapon) { w = this.specialWeapon; o = w.optics[0]; }
    else { w = this.primary; o = this.state.primaryOptic; }
    this.preview.set(w.id, o);
    this.onChange?.(this.state);
  }

  _opticCards(w) {
    return w.optics.map(id => {
      const o = OPTICS[id];
      return { id, name: o.name, desc: o.desc };
    });
  }

  _brief(w) {
    return `${w.damage}伤害 · ${w.rpm}RPM · ${w.magSize}发`;
  }

  _cards(group, list, sel, onClick) {
    const el = this.groups[group];
    if (!el) return;
    el.innerHTML = '';
    for (const item of list) {
      const d = document.createElement('div');
      d.className = 'card' + (item.id === sel ? ' on' : '') + (item.off ? ' off' : '');
      d.innerHTML = `<div class="n">${item.name}</div><div class="d">${item.desc}</div>`;
      if (!item.off) d.addEventListener('click', () => onClick(item.id));
      el.appendChild(d);
    }
  }

  _stats() {
    const p = this.primary, s = this.secondary, e = this.equip, a = this.armor;
    const sp = this.specialWeapon, g = this.gadget;
    const dmg = v => Math.min(100, Math.round(v / 2.4));
    const rpm = v => Math.min(100, Math.round(v / 10));
    const rng = v => Math.min(100, Math.round(v / 3.2));
    const row = (label, v, scale) =>
      `<div>${label} <b>${v}</b></div><div class="bar-mini"><span style="width:${scale(v)}%"></span></div>`;

    this.stats.innerHTML =
      `<div><b>主武器</b> ${p.cn}　+　${OPTICS[p.optic].name}</div>` +
      row('伤害', p.damage, dmg) +
      row('射速', p.rpm, rpm) +
      row('射程', p.range, rng) +
      `<div><b>副武器</b> ${s.cn}　+　${OPTICS[s.optic].name}</div>` +
      `<div><b>特殊</b> ${sp ? sp.cn : '—'}</div>` +
      `<div><b>装备</b> ${e.name} ×${e.count}</div>` +
      `<div><b>道具</b> ${g.name} ×${g.count}</div>` +
      `<div><b>护甲</b> ${a.name} <b>+${a.armor}</b>　移速 <b>×${a.speedMul.toFixed(2)}</b></div>` +
      `<div><b>模式</b> ${MODES.find(m => m.id === this.state.mode).name}　·　` +
      `<b>瞄准</b> ${SETTINGS.find(s => s.id === this.state.aim).name}</div>`;
  }
}
