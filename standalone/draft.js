import { franchiseIncludes, franchiseName } from "./franchises.js";

export function eraIncludes(era, player) {
  if (era.startYear == null && era.endYear == null) return true;
  const start = era.startYear ?? Number.MIN_SAFE_INTEGER;
  const end = era.endYear ?? Number.MAX_SAFE_INTEGER;
  return player.careerEnd >= start && player.careerStart <= end;
}

export function eraLabel(era) {
  if (era.startYear == null && era.endYear == null) return "All-Time";
  return `${era.startYear ?? "—"}–${era.endYear ?? "—"}`;
}

export function poolLabel(era, franchise) {
  if (franchise) return `Franchise · ${franchiseName(franchise)}`;
  return eraLabel(era);
}

export function playerRank(player, scoring) {
  return scoring === "ppr" ? player.pprRank : player.standardRank;
}

export function slotLabel(pick) {
  return `${pick.round}.${String(pick.pickInRound).padStart(2, "0")}`;
}

function sortPool(players, scoring) {
  return [...players].sort((a, b) => {
    const rankDiff = playerRank(a, scoring) - playerRank(b, scoring);
    return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
  });
}

export class SnakeDraftEngine {
  constructor(settings, pool) {
    this.settings = settings;
    this.totalPicks = settings.teamCount * settings.rounds;
    this.userTeamIndex = Math.min(Math.max(settings.userTeamIndex, 0), settings.teamCount - 1);
    this.available = sortPool(
      pool.filter(
        (player) =>
          eraIncludes(settings.era, player) && franchiseIncludes(settings.franchise, player),
      ),
      settings.scoring,
    );
    this.picks = [];
  }

  get isComplete() {
    return this.picks.length >= this.totalPicks || this.available.length === 0;
  }

  get nextOverall() {
    return this.picks.length + 1;
  }

  get isUserOnTheClock() {
    return !this.isComplete && this.teamOnTheClock() === this.userTeamIndex;
  }

  teamOnTheClock(overallZeroBased = this.picks.length) {
    const { teamCount } = this.settings;
    const round = Math.floor(overallZeroBased / teamCount);
    const indexInRound = overallZeroBased % teamCount;
    return round % 2 === 0 ? indexInRound : teamCount - 1 - indexInRound;
  }

  currentRound() {
    return Math.floor(this.picks.length / this.settings.teamCount) + 1;
  }

  pickInRound() {
    return (this.picks.length % this.settings.teamCount) + 1;
  }

  draft(playerId) {
    if (this.isComplete) return null;
    const player = this.available.find((item) => item.id === playerId);
    if (!player) return null;
    const pick = {
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

  autoPick() {
    const teamIndex = this.teamOnTheClock();
    const choice =
      teamIndex === this.userTeamIndex ? this.available[0] : this.chooseCpuPlayer(teamIndex);
    if (!choice) return null;
    return this.draft(choice.id);
  }

  fillCpuTurns() {
    const made = [];
    while (!this.isComplete && !this.isUserOnTheClock) {
      const pick = this.autoPick();
      if (!pick) break;
      made.push(pick);
    }
    return made;
  }

  undoUserPick() {
    if (!this.picks.some((pick) => pick.teamIndex === this.userTeamIndex)) return null;
    let removedUser = null;
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

  chooseCpuPlayer(teamIndex) {
    if (this.available.length === 0) return null;
    const counts = new Map();
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
        score: this.cpuScore(player, counts, round, teamIndex, needAmp) + (Math.random() * reach - reach * 0.25),
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

  undoLastPick() {
    const last = this.picks[this.picks.length - 1];
    if (!last) return null;
    this.picks = this.picks.slice(0, -1);
    this.available = sortPool([...this.available, last.player], this.settings.scoring);
    return last;
  }

  cpuScore(player, counts, round, teamIndex = 0, needAmp = 1) {
    const count = counts.get(player.position) ?? 0;
    const singleStarter = ["QB", "TE", "DL", "LB", "DB", "DST"].includes(player.position);
    const starterNeed = singleStarter ? 1 : 2;
    const depthNeed = singleStarter ? 2 : 4;
    const needBias =
      count === 0 && round >= 3 ? -18 : count < starterNeed ? -10 : count < depthNeed ? 0 : 45;
    const earlySecondQb = player.position === "QB" && count >= 1 && round <= 8 ? 50 : 0;
    const lateQbReach = player.position === "QB" && count === 0 && round >= 6 ? -8 : 0;
    const style = teamIndex % 5;
    const styleBias =
      (style === 0 && player.position === "WR" ? -5 : 0) +
      (style === 1 && player.position === "RB" ? -5 : 0) +
      (style === 2 && (player.position === "DL" || player.position === "LB") ? -4 : 0) +
      (style === 3 && player.position === "TE" ? -4 : 0);
    return playerRank(player, this.settings.scoring) + needBias * needAmp + earlySecondQb + lateQbReach + styleBias;
  }
}
