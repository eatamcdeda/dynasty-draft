import type { DraftPick, DraftSettings, Player, Position, ScoringFormat } from "./types";
import { eraIncludes, playerRank } from "./types";
import { franchiseIncludes } from "./franchises";

function sortPool(players: Player[], scoring: ScoringFormat): Player[] {
  return [...players].sort((a, b) => {
    const rankDiff = playerRank(a, scoring) - playerRank(b, scoring);
    return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
  });
}

export class SnakeDraftEngine {
  readonly settings: DraftSettings;
  readonly totalPicks: number;
  readonly userTeamIndex: number;
  available: Player[];
  picks: DraftPick[] = [];

  constructor(settings: DraftSettings, pool: Player[]) {
    this.settings = settings;
    this.totalPicks = settings.teamCount * settings.rounds;
    this.userTeamIndex = Math.min(
      Math.max(settings.userTeamIndex, 0),
      settings.teamCount - 1,
    );
    this.available = sortPool(
      pool.filter(
        (player) =>
          eraIncludes(settings.era, player) && franchiseIncludes(settings.franchise, player),
      ),
      settings.scoring,
    );
  }

  get isComplete(): boolean {
    return this.picks.length >= this.totalPicks || this.available.length === 0;
  }

  get nextOverall(): number {
    return this.picks.length + 1;
  }

  get isUserOnTheClock(): boolean {
    return !this.isComplete && this.teamOnTheClock() === this.userTeamIndex;
  }

  teamOnTheClock(overallZeroBased = this.picks.length): number {
    const { teamCount } = this.settings;
    const round = Math.floor(overallZeroBased / teamCount);
    const indexInRound = overallZeroBased % teamCount;
    return round % 2 === 0 ? indexInRound : teamCount - 1 - indexInRound;
  }

  currentRound(): number {
    return Math.floor(this.picks.length / this.settings.teamCount) + 1;
  }

  pickInRound(): number {
    return (this.picks.length % this.settings.teamCount) + 1;
  }

  draft(playerId: string): DraftPick | null {
    if (this.isComplete) return null;
    const player = this.available.find((item) => item.id === playerId);
    if (!player) return null;
    const pick: DraftPick = {
      overall: this.nextOverall,
      round: this.currentRound(),
      pickInRound: this.pickInRound(),
      teamIndex: this.teamOnTheClock(),
      player,
    };
    this.picks = [...this.picks, pick];
    this.available = this.available.filter((item) => item.id !== player.id);
    return pick;
  }

  autoPick(): DraftPick | null {
    const teamIndex = this.teamOnTheClock();
    const choice =
      teamIndex === this.userTeamIndex
        ? this.available[0]
        : this.chooseCpuPlayer(teamIndex);
    if (!choice) return null;
    return this.draft(choice.id);
  }

  fillCpuTurns(): DraftPick[] {
    const made: DraftPick[] = [];
    while (!this.isComplete && !this.isUserOnTheClock) {
      const pick = this.autoPick();
      if (!pick) break;
      made.push(pick);
    }
    return made;
  }

  undoUserPick(): DraftPick | null {
    if (!this.picks.some((pick) => pick.teamIndex === this.userTeamIndex)) {
      return null;
    }
    let removedUser: DraftPick | null = null;
    while (this.picks.length > 0) {
      const last = this.undoLastPick();
      if (!last) break;
      if (last.teamIndex === this.userTeamIndex) {
        removedUser = last;
        break;
      }
    }
    return removedUser;
  }

  chooseCpuPlayer(teamIndex: number): Player | null {
    if (this.available.length === 0) return null;
    const counts = new Map<Position, number>();
    for (const pick of this.picks) {
      if (pick.teamIndex !== teamIndex) continue;
      counts.set(pick.player.position, (counts.get(pick.player.position) ?? 0) + 1);
    }
    const round = this.currentRound();
    const needAmp = Math.random() < 0.42 ? 1.35 + Math.random() * 0.9 : 0.85 + Math.random() * 0.4;
    const reach = 6 + Math.floor(Math.random() * 8);
    const ranked = [...this.available]
      .map((player) => ({
        player,
        score:
          this.cpuScore(player, counts, round, teamIndex, needAmp) +
          (Math.random() * reach - reach * 0.25),
      }))
      .sort((a, b) => a.score - b.score);
    const windowSize = Math.min(ranked.length, Math.random() < 0.2 ? 6 : 4);
    const slice = ranked.slice(0, windowSize);
    const weights = slice.map((_, index) => Math.pow(0.55, index));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = Math.random() * total;
    for (let i = 0; i < slice.length; i += 1) {
      ticket -= weights[i];
      if (ticket <= 0) return slice[i].player;
    }
    return slice[0].player;
  }

  private undoLastPick(): DraftPick | null {
    const last = this.picks[this.picks.length - 1];
    if (!last) return null;
    this.picks = this.picks.slice(0, -1);
    this.available = sortPool([...this.available, last.player], this.settings.scoring);
    return last;
  }

  private cpuScore(
    player: Player,
    counts: Map<Position, number>,
    round: number,
    teamIndex = 0,
    needAmp = 1,
  ): number {
    const count = counts.get(player.position) ?? 0;
    const singleStarter = ["QB", "TE", "DL", "LB", "DB", "DST"].includes(player.position);
    const starterNeed = singleStarter ? 1 : 2;
    const depthNeed = singleStarter ? 2 : 4;
    const needBias =
      count === 0 && round >= 3 ? -18 : count < starterNeed ? -10 : count < depthNeed ? 0 : 45;
    const earlySecondQb =
      player.position === "QB" && count >= 1 && round <= 8 ? 50 : 0;
    const lateQbReach = player.position === "QB" && count === 0 && round >= 6 ? -8 : 0;
    const style = teamIndex % 5;
    const styleBias =
      (style === 0 && player.position === "WR" ? -5 : 0) +
      (style === 1 && player.position === "RB" ? -5 : 0) +
      (style === 2 && (player.position === "DL" || player.position === "LB") ? -4 : 0) +
      (style === 3 && player.position === "TE" ? -4 : 0);
    return (
      playerRank(player, this.settings.scoring) +
      needBias * needAmp +
      earlySecondQb +
      lateQbReach +
      styleBias
    );
  }
}
