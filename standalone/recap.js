import { playerRank, slotLabel } from "./draft.js";

export const POS_ORDER = ["QB", "RB", "WR", "TE", "DL", "LB", "DB", "DST"];
export const POS_COLORS = {
  QB: "#f59e0b",
  RB: "#34d399",
  WR: "#38bdf8",
  TE: "#facc15",
  DL: "#fb7185",
  LB: "#f97316",
  DB: "#a78bfa",
  DST: "#94a3b8",
};

export function summarizeDraft(engine) {
  const scoring = engine.settings.scoring;
  const userPicks = engine.picks.filter((pick) => pick.teamIndex === engine.userTeamIndex);
  const counts = Object.fromEntries(POS_ORDER.map((pos) => [pos, 0]));
  const rows = userPicks.map((pick) => {
    const rank = playerRank(pick.player, scoring);
    const delta = pick.overall - rank;
    const quality = qualityFromDelta(delta);
    counts[pick.player.position] += 1;
    return {
      slot: slotLabel(pick),
      overall: pick.overall,
      round: pick.round,
      name: pick.player.name,
      position: pick.player.position,
      rank,
      delta,
      ...quality,
    };
  });

  const avg = rows.length ? rows.reduce((sum, row) => sum + row.delta, 0) / rows.length : 0;
  let score = avg * 1.8;
  const holes = [];
  if ((counts.QB ?? 0) < 1) {
    holes.push("QB");
    score -= 6;
  }
  if ((counts.RB ?? 0) < 2) {
    holes.push("RB");
    score -= 4;
  }
  if ((counts.WR ?? 0) < 2) {
    holes.push("WR");
    score -= 4;
  }
  if ((counts.TE ?? 0) < 1) {
    holes.push("TE");
    score -= 3;
  }

  const stealCount = rows.filter((row) => row.tag === "steal").length;
  const reachCount = rows.filter((row) => row.tag === "reach").length;
  score += stealCount * 1.2 - reachCount * 1.4;
  const grade = letterFromScore(score);
  const best = [...rows].sort((a, b) => b.delta - a.delta)[0] ?? null;
  const worst = [...rows].sort((a, b) => a.delta - b.delta)[0] ?? null;
  const total = Math.max(1, rows.length);

  return {
    rows,
    counts,
    avg,
    grade,
    holes,
    best,
    worst,
    stealCount,
    reachCount,
    pie: conicFromCounts(counts, total),
    slices: pieSlices(counts, total),
  };
}

function qualityFromDelta(delta) {
  if (delta >= 8) return { tag: "steal", label: "Steal" };
  if (delta >= 3) return { tag: "value", label: "Value" };
  if (delta <= -10) return { tag: "reach", label: "Big reach" };
  if (delta <= -4) return { tag: "reach", label: "Reach" };
  if (delta <= -1) return { tag: "slight", label: "Slight reach" };
  return { tag: "board", label: "On the board" };
}

function letterFromScore(score) {
  if (score >= 14) return { letter: "A+", blurb: "Board wrecker. You kept stacking value." };
  if (score >= 8) return { letter: "A", blurb: "Sharp draft. Rank vs. slot stayed in your favor." };
  if (score >= 4) return { letter: "B+", blurb: "Solid night. A few wins outweigh the reaches." };
  if (score >= 0) return { letter: "B", blurb: "Clean enough. Some value, some stretch." };
  if (score >= -4) return { letter: "C+", blurb: "Playable, but you paid up more than you stole." };
  if (score >= -8) return { letter: "C", blurb: "The board got away from you in spots." };
  if (score >= -14) return { letter: "D", blurb: "Lots of reaches relative to career rank." };
  return { letter: "F", blurb: "Rough one. Next draft, let a few names come to you." };
}

function conicFromCounts(counts, total) {
  let deg = 0;
  const parts = [];
  for (const pos of POS_ORDER) {
    const n = counts[pos] ?? 0;
    if (!n) continue;
    const next = deg + (n / total) * 360;
    parts.push(`${POS_COLORS[pos]} ${deg}deg ${next}deg`);
    deg = next;
  }
  return parts.length ? parts.join(", ") : "#1a2f4d 0deg 360deg";
}

function pieSlices(counts, total) {
  const slices = [];
  let angle = -90;
  for (const pos of POS_ORDER) {
    const n = counts[pos] ?? 0;
    if (!n) continue;
    const sweep = (n / total) * 360;
    slices.push({
      pos,
      count: n,
      color: POS_COLORS[pos],
      d: donutSlice(80, 80, 62, 34, angle, angle + sweep),
    });
    angle += sweep;
  }
  return slices;
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function donutSlice(cx, cy, outer, inner, start, end) {
  if (end - start >= 359.9) {
    return `M ${cx} ${cy - outer} A ${outer} ${outer} 0 1 1 ${cx - 0.01} ${cy - outer} L ${cx - 0.01} ${cy - inner} A ${inner} ${inner} 0 1 0 ${cx} ${cy - inner} Z`;
  }
  const large = end - start > 180 ? 1 : 0;
  const [ox1, oy1] = polar(cx, cy, outer, start);
  const [ox2, oy2] = polar(cx, cy, outer, end);
  const [ix1, iy1] = polar(cx, cy, inner, end);
  const [ix2, iy2] = polar(cx, cy, inner, start);
  return `M ${ox1} ${oy1} A ${outer} ${outer} 0 ${large} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

export function barWidth(delta) {
  return Math.min(48, Math.max(6, Math.abs(delta) * 3.2));
}
