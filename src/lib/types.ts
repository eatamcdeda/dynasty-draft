import { franchiseName } from "./franchises";

export type Position = "QB" | "RB" | "WR" | "TE" | "DL" | "LB" | "DB" | "DST";
export type ScoringFormat = "ppr" | "standard";

export type Player = {
  id: string;
  name: string;
  position: Position;
  team: string;
  careerStart: number;
  careerEnd: number;
  standardRank: number;
  pprRank: number;
  statLine: string;
  teams?: string[];
};

export type EraFilter = {
  startYear: number | null;
  endYear: number | null;
};

export type DraftSettings = {
  scoring: ScoringFormat;
  era: EraFilter;
  franchise: string | null;
  teamCount: 8 | 10 | 12;
  rounds: 8 | 10 | 12 | 15;
  userTeamIndex: number;
};

export type DraftPick = {
  overall: number;
  round: number;
  pickInRound: number;
  teamIndex: number;
  player: Player;
};

export const ALL_TIME: EraFilter = { startYear: null, endYear: null };

export function eraIncludes(era: EraFilter, player: Player): boolean {
  if (era.startYear == null && era.endYear == null) return true;
  const start = era.startYear ?? Number.MIN_SAFE_INTEGER;
  const end = era.endYear ?? Number.MAX_SAFE_INTEGER;
  return player.careerEnd >= start && player.careerStart <= end;
}

export function eraLabel(era: EraFilter): string {
  if (era.startYear == null && era.endYear == null) return "All-Time";
  return `${era.startYear ?? "—"}–${era.endYear ?? "—"}`;
}

export function poolLabel(era: EraFilter, franchise: string | null): string {
  if (franchise) return `Franchise · ${franchiseName(franchise)}`;
  return eraLabel(era);
}

export function playerRank(player: Player, scoring: ScoringFormat): number {
  return scoring === "ppr" ? player.pprRank : player.standardRank;
}

export function slotLabel(pick: DraftPick): string {
  return `${pick.round}.${String(pick.pickInRound).padStart(2, "0")}`;
}
