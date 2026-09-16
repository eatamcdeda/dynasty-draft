import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "draft-history");
const MIN_DRAFTS = 3;
const MIN_RATE = 0.34;
const MIN_HITS = 2;

type StoredPick = {
  overall: number;
  round: number;
  pickInRound: number;
  playerId: string;
  playerName: string;
  position: string;
};

type StoredDraft = {
  completedAt: string;
  teamCount: number | null;
  rounds: number | null;
  scoring: string | null;
  franchise: string | null;
  picks: StoredPick[];
};

function safeUserFile(userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return null;
  }
  return path.join(DIR, `${userId}.json`);
}

function readHistory(userId: string): StoredDraft[] {
  const file = safeUserFile(userId);
  if (!file || !fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(userId: string, drafts: StoredDraft[]) {
  const file = safeUserFile(userId);
  if (!file) return;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(drafts.slice(-40), null, 2));
}

function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function recordCompletedDraft(userId: string, payload: Record<string, unknown>) {
  const picks = Array.isArray(payload?.picks) ? payload.picks : [];
  const userPicks: StoredPick[] = picks
    .filter((pick): pick is Record<string, unknown> => Boolean(pick) && typeof pick === "object")
    .filter((pick) => Number.isFinite(Number(pick.overall)) && pick.playerId && pick.playerName)
    .map((pick) => ({
      overall: Number(pick.overall),
      round: Number(pick.round) || 1,
      pickInRound: Number(pick.pickInRound) || 1,
      playerId: String(pick.playerId),
      playerName: String(pick.playerName),
      position: String(pick.position ?? ""),
    }));
  if (userPicks.length === 0) return { ok: false, error: "No user picks to store" };
  const drafts = readHistory(userId);
  drafts.push({
    completedAt: new Date().toISOString(),
    teamCount: Number(payload.teamCount) || null,
    rounds: Number(payload.rounds) || null,
    scoring: typeof payload.scoring === "string" ? payload.scoring : null,
    franchise: typeof payload.franchise === "string" ? payload.franchise : null,
    picks: userPicks,
  });
  writeHistory(userId, drafts);
  return { ok: true, drafts: drafts.length };
}

export function insightForOverall(userId: string, overall: number) {
  const drafts = readHistory(userId);
  if (drafts.length < MIN_DRAFTS) return null;
  const atSlot: StoredPick[] = [];
  for (const draft of drafts) {
    const pick = draft.picks?.find((item) => item.overall === overall);
    if (pick) atSlot.push(pick);
  }
  if (atSlot.length < MIN_HITS) return null;
  const counts = new Map<string, number>();
  for (const pick of atSlot) {
    counts.set(pick.playerId, (counts.get(pick.playerId) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  }
  const rate = bestCount / drafts.length;
  if (!bestId || bestCount < MIN_HITS || rate < MIN_RATE) return null;
  const sample = atSlot.find((pick) => pick.playerId === bestId);
  const pct = Math.round(rate * 100);
  return {
    playerId: bestId,
    playerName: sample?.playerName ?? "this player",
    overall,
    count: bestCount,
    drafts: drafts.length,
    pct,
    text: `You've picked ${sample?.playerName ?? "this player"} ${ordinal(overall)} overall in ${pct}% of your past drafts.`,
  };
}
