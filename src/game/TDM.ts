import { CFG } from '../core/Config';
import type { Game } from '../core/Game';
import type { Character } from '../characters/Character';
import type { SpawnPoint } from '../map/MonacoChurchMap';

export interface KillEvent {
  killer: string;
  victim: string;
  killerTeam: number;
  victimTeam: number;
  weapon: string;
  head: boolean;
  t: number;
}

/** 5v5 团队死斗：计分 / 死亡 / 重生 / 时间 / 结束判定 */
export class TDM {
  game: Game;
  scores: [number, number] = [0, 0];
  timeLeft: number = CFG.matchDuration;
  over = false;
  winner = -1;
  feed: KillEvent[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  onKill(killer: Character | null, victim: Character): void {
    const weaponName = killer ? killer.weapon.def.name : '环境';
    const head = false;
    if (killer && killer.team !== victim.team) {
      this.scores[killer.team]++;
      killer.kills++;
    } else if (!killer) {
      // 自杀 / 环境击杀：对方得分
      this.scores[1 - victim.team]++;
    }
    this.feed.push({
      killer: killer ? killer.name : '环境',
      victim: victim.name,
      killerTeam: killer ? killer.team : 1 - victim.team,
      victimTeam: victim.team,
      weapon: weaponName,
      head,
      t: this.game.time,
    });
    if (this.feed.length > 6) this.feed.shift();
    this.game.hud?.pushKillFeed(this.feed[this.feed.length - 1]);

    if (this.scores[killer ? killer.team : 1 - victim.team] >= CFG.scoreTarget && !this.over) {
      this.endMatch(killer ? killer.team : 1 - victim.team);
    }
  }

  endMatch(winner: number): void {
    this.over = true;
    this.winner = winner;
    this.game.audio?.play('matchwin');
    this.game.hud?.showMatchEnd(winner, this.scores);
  }

  update(dt: number): void {
    if (this.over) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      const w = this.scores[0] === this.scores[1] ? -1 : (this.scores[0] > this.scores[1] ? 0 : 1);
      this.endMatch(w);
    }
  }

  /** 选择出生点：尽量远离敌人 */
  spawnFor(team: 0 | 1): SpawnPoint {
    const list = this.game.mapData?.spawns[team];
    if (!list || !list.length) return { x: 0, y: 1, z: team === 0 ? 40 : -40, yaw: team === 0 ? Math.PI : 0 };
    let best = list[0];
    let bestScore = -Infinity;
    for (const s of list) {
      let nearest = Infinity;
      for (const c of this.game.characters) {
        if (!c.alive || c.team === team) continue;
        const d = Math.hypot(c.pos.x - s.x, c.pos.z - s.z);
        nearest = Math.min(nearest, d);
      }
      if (nearest === Infinity) nearest = 999;
      const score = nearest + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  reset(): void {
    this.scores = [0, 0];
    this.timeLeft = CFG.matchDuration;
    this.over = false;
    this.winner = -1;
    this.feed.length = 0;
  }
}
