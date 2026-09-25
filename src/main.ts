import './ui/style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
const ui = document.getElementById('ui') as HTMLElement | null;
const loader = document.getElementById('loader');

if (!canvas || !ui) {
  throw new Error('缺少 #game / #ui 容器');
}

// 创建游戏（内部会构建地图、导航与全部子系统）
const game = new Game(canvas, ui);
(window as any).__game = game;

// 点击画布重新锁定鼠标（暂停后继续）
canvas.addEventListener('click', () => {
  if (game.running && game.paused) game.resume();
  else if (game.running && !game.paused && !game.input.locked) game.input.requestLock();
});

// 首次交互后初始化音频（浏览器自动播放策略）
window.addEventListener('pointerdown', () => game.audio.init(), { once: true });
window.addEventListener('keydown', () => game.audio.init(), { once: true });

if (loader) loader.remove();
