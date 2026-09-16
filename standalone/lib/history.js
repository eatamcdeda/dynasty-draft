import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "draft-history");
const MIN_DRAFTS = 3;
const MIN_RATE = 0.34;
const MIN_HITS = 2;

function safeUserFile(userId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return null;
  }
  return path.join(DIR, `${userId}.json`);
}

function readHistory(userId) {
  const file = safeUserFile(userId);
  if (!file || !fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(userId, drafts) {
  const file = safeUserFile(userId);
  if (!file) return;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(drafts.slice(-40), null, 2));
}

export function recordCompletedDraft(userId, payload) {
  const picks = Array.isArray(payload?.picks) ? payload.picks : [];
  const userPicks = picks
    .filter((pick) => pick && Number.isFinite(pick.overall) && pick.playerId && pick.playerName)
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
    scoring: payload.scoring ?? null,
    franchise: payload.franchise ?? null,
    picks: userPicks,
  });
  writeHistory(userId, drafts);
  return { ok: true, drafts: drafts.length };
}

export function insightForOverall(userId, overall) {
  const drafts = readHistory(userId);
  if (drafts.length < MIN_DRAFTS) return null;
  const atSlot = [];
  for (const draft of drafts) {
    const pick = draft.picks?.find((item) => item.overall === overall);
    if (pick) atSlot.push(pick);
  }
  if (atSlot.length < MIN_HITS) return null;
  const counts = new Map();
  for (const pick of atSlot) {
    counts.set(pick.playerId, (counts.get(pick.playerId) ?? 0) + 1);
  }
  let bestId = null;
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

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
