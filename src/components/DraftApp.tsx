"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PLAYERS } from "@/lib/players";
import { SnakeDraftEngine } from "@/lib/draft";
import {
  ALL_TIME,
  poolLabel,
  playerRank,
  slotLabel,
  type DraftSettings,
  type EraFilter,
  type Position,
  type ScoringFormat,
} from "@/lib/types";
import { NFL_FRANCHISES, countFranchisePool, countFranchiseIdp, franchiseName, playerTeamCodes } from "@/lib/franchises";

import { summarizeDraft, POS_ORDER, POS_COLORS, barWidth } from "@/lib/recap";
import { UnlockButton } from "@/components/UnlockButton";

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "DL", "LB", "DB", "DST"];
const USER_SECONDS = 15;
const CPU_SECONDS = 4;

const positionClass: Record<Position, string> = {
  QB: "text-amber-400",
  RB: "text-emerald-400",
  WR: "text-sky-400",
  TE: "text-yellow-300",
  DL: "text-rose-400",
  LB: "text-orange-400",
  DB: "text-violet-400",
  DST: "text-slate-300",
};

export default function DraftApp() {
  const [engine, setEngine] = useState<SnakeDraftEngine | null>(null);

  if (!engine) {
    return <SetupScreen onStart={(settings) => setEngine(new SnakeDraftEngine(settings, PLAYERS))} />;
  }

  return (
    <DraftScreen
      engine={engine}
      onReset={() => setEngine(null)}
      onChange={() => setEngine(cloneEngine(engine))}
    />
  );
}

function cloneEngine(engine: SnakeDraftEngine): SnakeDraftEngine {
  const next = new SnakeDraftEngine(engine.settings, PLAYERS);
  next.available = engine.available;
  next.picks = engine.picks;
  return next;
}

function SetupScreen({ onStart }: { onStart: (settings: DraftSettings) => void }) {
  const [scoring, setScoring] = useState<ScoringFormat>("ppr");
  const [poolMode, setPoolMode] = useState<"all" | "era" | "franchise">("all");
  const [fromDecade, setFromDecade] = useState(1990);
  const [toDecade, setToDecade] = useState(2020);
  const [franchise, setFranchise] = useState("GB");
  const [teamCount, setTeamCount] = useState<8 | 10 | 12>(10);
  const [rounds, setRounds] = useState<8 | 10 | 12 | 15>(12);
  const [draftSlot, setDraftSlot] = useState(1);
  const [randomSlot, setRandomSlot] = useState(false);
  const [access, setAccess] = useState<{ unlocked: boolean; trialUsed: boolean; amountCents: number }>({
    unlocked: false,
    trialUsed: false,
    amountCents: 999,
  });
  const [startError, setStartError] = useState<string | null>(null);
  const notice =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("unlocked") === "1"
        ? "unlocked"
        : new URLSearchParams(window.location.search).get("checkout") === "cancelled"
          ? "cancelled"
          : null
      : null;

  useEffect(() => {
    fetch("/api/access")
      .then((res) => res.json())
      .then((data) => setAccess((prev) => ({ ...prev, ...data })))
      .catch(() => undefined);
  }, []);

  async function start() {
    setStartError(null);
    if (!access.unlocked) {
      if (access.trialUsed) {
        setStartError("Your free draft is used. Unlock full access to start another.");
        return;
      }
      const trial = await fetch("/api/trial", { method: "POST" });
      if (trial.status === 402) {
        setAccess((prev) => ({ ...prev, trialUsed: true }));
        setStartError("Your free draft is used. Unlock full access to start another.");
        return;
      }
      setAccess((prev) => ({ ...prev, trialUsed: true }));
    }
    const era: EraFilter =
      poolMode === "era" ? { startYear: fromDecade, endYear: toDecade + 9 } : ALL_TIME;
    const selectedFranchise = poolMode === "franchise" ? franchise : null;
    const slot = randomSlot
      ? Math.floor(Math.random() * teamCount)
      : Math.min(Math.max(draftSlot, 1), teamCount) - 1;
    onStart({
      scoring,
      era,
      franchise: selectedFranchise,
      teamCount,
      rounds,
      userTeamIndex: slot,
    });
  }

  const price = `$${(access.amountCents / 100).toFixed(2)}`;

  return (
    <main className="relative mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-extrabold tracking-[0.28em] text-red-600 uppercase">Live mock · All-time board</p>
      <h1 className="mt-2 font-oswald text-5xl uppercase tracking-wide text-white">Dynasty Draft</h1>
      <p className="mt-3 max-w-xl text-slate-400">
        Historical greats, current stars, and all-time defenses in one snake draft — ranked by career value, not last season&apos;s ADP.
      </p>
      <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
        <strong className="text-white">On the clock:</strong> 15 seconds for your pick. CPU teams take a few seconds each so the board doesn&apos;t blur past.
      </p>
      {notice === "unlocked" ? (
        <p className="mt-4 rounded-xl bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
          Full access is unlocked on this browser. Unlimited drafts are on.
        </p>
      ) : null}
      {notice === "cancelled" ? (
        <p className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-slate-300">
          Checkout cancelled. Your free trial draft is unchanged.
        </p>
      ) : null}
      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
        {access.unlocked ? (
          <>
            <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-extrabold uppercase tracking-widest text-emerald-300">Full access</span>
            <p className="mt-2 text-sm text-slate-400">Unlimited drafts this season. Live ratings and head-to-head drafts will land here when they ship.</p>
          </>
        ) : (
          <>
            <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-300">
              {access.trialUsed ? "Trial used" : "Free trial"}
            </span>
            <p className="mt-2 text-sm text-slate-400">
              {access.trialUsed
                ? `Your free draft is used. Unlock unlimited drafts for a one-time ${price}.`
                : `Free: one full snake draft to try the board. Then a one-time ${price} unlocks unlimited drafts this season.`}
            </p>
            <UnlockButton className="mt-3" label={`Unlock full access — ${price}`} />
          </>
        )}
      </div>

      <section className="mt-8 space-y-8 rounded-2xl border border-white/10 bg-slate-950/50 px-5 py-6">
        <ChipGroup label="Scoring">
          <Chip selected={scoring === "ppr"} onClick={() => setScoring("ppr")}>PPR</Chip>
          <Chip selected={scoring === "standard"} onClick={() => setScoring("standard")}>Non-PPR</Chip>
        </ChipGroup>

        <div>
          <h2 className="mb-3 font-oswald text-xl uppercase text-white">Player pool</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip selected={poolMode === "all"} onClick={() => setPoolMode("all")}>All-Time</Chip>
            <Chip selected={poolMode === "era"} onClick={() => setPoolMode("era")}>Era range</Chip>
            <Chip selected={poolMode === "franchise"} onClick={() => setPoolMode("franchise")}>Franchise draft</Chip>
          </div>
          {poolMode === "era" ? (
            <>
              <p className="mb-2 text-sm text-slate-400">Career overlap with this decade range</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {DECADES.map((decade) => (
                  <Chip
                    key={`from-${decade}`}
                    selected={fromDecade === decade}
                    onClick={() => {
                      setFromDecade(decade);
                      if (toDecade < decade) setToDecade(decade);
                    }}
                  >
                    {decade}s from
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {DECADES.map((decade) => (
                  <Chip
                    key={`to-${decade}`}
                    selected={toDecade === decade}
                    onClick={() => {
                      setToDecade(decade);
                      if (fromDecade > decade) setFromDecade(decade);
                    }}
                  >
                    {decade}s to
                  </Chip>
                ))}
              </div>
            </>
          ) : null}
          {poolMode === "franchise" ? (
            <>
              <p className="mb-2 text-sm text-slate-400">Build an all-time roster from one NFL franchise</p>
              <select
                value={franchise}
                onChange={(event) => setFranchise(event.target.value)}
                className="w-full max-w-md rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white"
              >
                {NFL_FRANCHISES.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <p className="mt-2 text-sm text-slate-400">
                {countFranchisePool(PLAYERS, franchise)} players ({countFranchiseIdp(PLAYERS, franchise)} IDP/DST) in the {franchiseName(franchise)} pool
              </p>
            </>
          ) : null}
        </div>

        <ChipGroup label="League size">
          {([8, 10, 12] as const).map((size) => (
            <Chip
              key={size}
              selected={teamCount === size}
              onClick={() => {
                setTeamCount(size);
                if (draftSlot > size) setDraftSlot(size);
              }}
            >
              {size} teams
            </Chip>
          ))}
        </ChipGroup>

        <div>
          <h2 className="mb-2 font-oswald text-xl uppercase text-white">Your draft slot</h2>
          <p className="mb-3 text-sm text-slate-400">Other teams are drafted by the CPU. Random slot re-rolls every time you start.</p>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={randomSlot}
              onClick={() => setRandomSlot(true)}
            >
              Random slot
            </Chip>
            {Array.from({ length: teamCount }, (_, i) => i + 1).map((slot) => (
              <Chip
                key={slot}
                selected={!randomSlot && draftSlot === slot}
                onClick={() => {
                  setRandomSlot(false);
                  setDraftSlot(slot);
                }}
              >
                {slot}
              </Chip>
            ))}
          </div>
        </div>

        <ChipGroup label="Rounds">
          {([8, 10, 12, 15] as const).map((count) => (
            <Chip key={count} selected={rounds === count} onClick={() => setRounds(count)}>
              {count}
            </Chip>
          ))}
        </ChipGroup>

        {startError ? <p className="text-sm text-red-300">{startError}</p> : null}
        <button
          type="button"
          onClick={start}
          className="w-full rounded-full bg-gradient-to-b from-red-600 to-red-800 px-6 py-3 font-oswald text-lg uppercase tracking-widest text-white"
        >
          {access.unlocked || !access.trialUsed ? "Start snake draft" : "Unlock to start another draft"}
        </button>
      </section>
    </main>
  );
}

function DraftScreen({
  engine,
  onReset,
  onChange,
}: {
  engine: SnakeDraftEngine;
  onReset: () => void;
  onChange: () => void;
}) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const deadlineRef = useRef(0);
  const totalRef = useRef(USER_SECONDS);
  const [insight, setInsight] = useState<string | null>(null);
  const savedRef = useRef(false);
  const [showRecap, setShowRecap] = useState(true);
  const { settings } = engine;

  useEffect(() => {
    if (engine.isComplete) {
      deadlineRef.current = 0;
      return;
    }
    const total = engine.isUserOnTheClock ? USER_SECONDS : CPU_SECONDS;
    totalRef.current = total;
    deadlineRef.current = Date.now() + total * 1000;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      if (deadlineRef.current && stamp >= deadlineRef.current) {
        deadlineRef.current = 0;
        engine.autoPick();
        onChange();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [engine, engine.picks.length, engine.isComplete, engine.isUserOnTheClock, onChange]);

  useEffect(() => {
    if (!engine.isComplete || savedRef.current) return;
    savedRef.current = true;
    const userPicks = engine.picks
      .filter((pick) => pick.teamIndex === engine.userTeamIndex)
      .map((pick) => ({
        overall: pick.overall,
        round: pick.round,
        pickInRound: pick.pickInRound,
        playerId: pick.player.id,
        playerName: pick.player.name,
        position: pick.player.position,
      }));
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamCount: engine.settings.teamCount,
        rounds: engine.settings.rounds,
        scoring: engine.settings.scoring,
        franchise: engine.settings.franchise,
        picks: userPicks,
      }),
    }).catch(() => {
      savedRef.current = false;
    });
  }, [engine, engine.isComplete, engine.picks, engine.userTeamIndex]);

  useEffect(() => {
    if (!engine.isUserOnTheClock || engine.isComplete) {
      setInsight(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/history/insight?overall=${engine.nextOverall}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setInsight(data.insight?.text ?? null);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [engine.isUserOnTheClock, engine.isComplete, engine.nextOverall]);

  const seconds = engine.isComplete
    ? 0
    : Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
  const pct = totalRef.current ? (seconds / totalRef.current) * 100 : 0;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return engine.available.filter((player) => {
      const matchesPosition = position == null || player.position === position;
      const matchesQuery =
        query.length === 0 ||
        player.name.toLowerCase().includes(query) ||
        player.team.toLowerCase().includes(query) ||
        playerTeamCodes(player).some((code) => code.toLowerCase().includes(query));
      return matchesPosition && matchesQuery;
    });
  }, [engine.available, position, search]);

  const last = engine.picks[engine.picks.length - 1];

  if (engine.isComplete && showRecap) {
    return <RecapScreen engine={engine} onReset={onReset} onBoard={() => setShowRecap(false)} />;
  }

  function draftPlayer(id: string) {
    if (!engine.isUserOnTheClock) return;
    engine.draft(id);
    onChange();
  }

  function autoPick() {
    if (!engine.isUserOnTheClock) return;
    engine.autoPick();
    onChange();
  }

  function undo() {
    engine.undoUserPick();
    onChange();
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-oswald text-3xl uppercase tracking-wide text-white">Dynasty Draft</h1>
          <p className="text-sm text-slate-400">
            {settings.scoring === "ppr" ? "PPR" : "Non-PPR"} · {poolLabel(settings.era, settings.franchise)} · Slot {settings.userTeamIndex + 1} · IDP + DST
          </p>
        </div>
        <div className="flex gap-3">
          {engine.isComplete ? (
            <button type="button" onClick={() => setShowRecap(true)} className="rounded-full bg-gradient-to-b from-red-600 to-red-800 px-4 py-2 text-sm font-semibold">
              See results
            </button>
          ) : null}
          <button type="button" onClick={onReset} className="font-semibold text-red-400 hover:underline">
            New draft
          </button>
        </div>
      </header>

      <section className="grid items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:grid-cols-[auto_1fr_auto]">
        <div
          className="grid h-20 w-20 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${engine.isUserOnTheClock ? "#d50a0a" : "#f0c14b"} ${pct}%, #24344d 0)`,
          }}
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-950 font-oswald text-2xl">
            {engine.isComplete ? "—" : seconds}
          </span>
        </div>
        <div>
          <p className={`text-xs font-extrabold tracking-[0.16em] uppercase ${engine.isUserOnTheClock ? "text-red-500" : "text-amber-300"}`}>
            {engine.isComplete ? "Final" : engine.isUserOnTheClock ? "You are on the clock" : "CPU on the clock"}
          </p>
          <h2 className="font-oswald text-2xl uppercase">
            {engine.isComplete ? "Draft complete" : engine.isUserOnTheClock ? "Your pick" : `CPU Team ${engine.teamOnTheClock() + 1}`}
          </h2>
          <p className="text-sm text-slate-400">
            R{engine.currentRound()} · Pick {engine.pickInRound()} · Overall {Math.min(engine.nextOverall, engine.totalPicks)}/{engine.totalPicks}
          </p>
          {insight ? <p className="mt-2 text-sm text-amber-200/80">{insight}</p> : null}
        </div>
        <div className="text-right text-sm text-slate-400">
          Latest selection
          <div className="text-base font-semibold text-white">
            {last ? `${slotLabel(last)} ${last.player.name}` : "Waiting on first pick"}
          </div>
        </div>
      </section>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name or team"
        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-red-600"
      />

      <div className="flex flex-wrap gap-2">
        <Chip selected={position == null} onClick={() => setPosition(null)}>ALL</Chip>
        {POSITIONS.map((item) => (
          <Chip key={item} selected={position === item} onClick={() => setPosition(item)}>
            {item}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!engine.picks.some((pick) => pick.teamIndex === settings.userTeamIndex)}
          className="rounded-full border border-white/30 px-4 py-2 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={autoPick}
          disabled={!engine.isUserOnTheClock}
          className="rounded-full bg-gradient-to-b from-red-600 to-red-800 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          Auto-pick
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="min-h-0">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-slate-500">
            Available ({filtered.length})
          </h2>
          <ul className="max-h-[62vh] space-y-2 overflow-auto pr-1">
            {filtered.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  disabled={!engine.isUserOnTheClock}
                  onClick={() => draftPlayer(player.id)}
                  className="flex w-full items-start rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-left hover:border-red-500/60 disabled:cursor-default"
                >
                  <span className={`mr-3 mt-0.5 w-10 font-oswald text-lg ${positionClass[player.position]}`}>
                    {player.position}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{player.name}</span>
                    <span className="text-sm text-slate-400">
                      {teamLabel(player, settings.franchise)} · {player.careerStart}–{player.careerEnd}
                    </span>
                    <span className="mt-1 block text-sm text-amber-200/80">{player.statLine}</span>
                  </span>
                  <span className="font-oswald text-lg text-slate-400">#{playerRank(player, settings.scoring)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xs uppercase tracking-widest text-slate-500">
            Draft board ({engine.picks.length})
          </h2>
          <ol className="max-h-[62vh] space-y-1 overflow-auto rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm">
            {engine.picks.length === 0 && <li className="text-slate-500">Picks appear here in snake order.</li>}
            {engine.picks.map((pick, index) => {
              const owner =
                pick.teamIndex === settings.userTeamIndex ? "You" : `CPU ${pick.teamIndex + 1}`;
              return (
                <li
                  key={pick.overall}
                  className={`grid grid-cols-[3.2rem_3.4rem_1fr] gap-2 py-1 ${index === engine.picks.length - 1 ? "bg-red-950/40" : ""}`}
                >
                  <span className="text-amber-400">{slotLabel(pick)}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">{owner}</span>
                  <span>{pick.player.position} {pick.player.name}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}

function RecapScreen({
  engine,
  onReset,
  onBoard,
}: {
  engine: SnakeDraftEngine;
  onReset: () => void;
  onBoard: () => void;
}) {
  const recap = summarizeDraft(engine);
  const maxPos = Math.max(1, ...POS_ORDER.map((pos) => recap.counts[pos] ?? 0));
  const { settings } = engine;
  return (
    <main className="relative mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-[0.28em] text-red-600 uppercase">Post-draft report</p>
          <h1 className="font-oswald text-4xl uppercase tracking-wide">How&apos;d you do?</h1>
          <p className="text-sm text-slate-400">
            {settings.scoring === "ppr" ? "PPR" : "Non-PPR"} · {poolLabel(settings.era, settings.franchise)} · Slot {settings.userTeamIndex + 1}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onBoard} className="rounded-full border border-white/30 px-4 py-2">View board</button>
          <button type="button" onClick={onReset} className="rounded-full bg-gradient-to-b from-red-600 to-red-800 px-4 py-2 font-semibold">New draft</button>
        </div>
      </header>

      <section className="mt-6 grid items-center gap-6 rounded-2xl border border-white/10 bg-gradient-to-br from-red-950/40 to-slate-950 p-5 sm:grid-cols-[160px_1fr]">
        <div className="mx-auto grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-red-600 shadow-lg shadow-red-900/40">
          <div className="text-center">
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-slate-950">Draft grade</div>
            <div className="font-oswald text-6xl leading-none text-slate-950">{recap.grade.letter}</div>
          </div>
        </div>
        <div>
          <h2 className="font-oswald text-2xl uppercase">{recap.grade.blurb}</h2>
          <p className="mt-2 text-sm text-slate-400">Value vs. reach uses career rank against the overall pick. Positive = you waited and still got a higher-ranked name.</p>
          <div className="mt-4 flex flex-wrap gap-6">
            <Stat n={recap.rows.length} label="your picks" />
            <Stat n={`${recap.avg >= 0 ? "+" : ""}${recap.avg.toFixed(1)}`} label="avg value" />
            <Stat n={recap.stealCount} label="steals" />
            <Stat n={recap.reachCount} label="reaches" />
          </div>
          {recap.holes.length ? <p className="mt-3 text-sm text-slate-400">Thin at {recap.holes.join(", ")}.</p> : null}
          {recap.best ? (
            <p className="mt-2 text-sm text-slate-400">
              Best value: <strong className="text-white">{recap.best.name}</strong> ({recap.best.slot}, rank #{recap.best.rank}).
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
        <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
          <h3 className="mb-3 text-xs uppercase tracking-widest text-slate-500">Position mix</h3>
          <div className="flex flex-wrap items-center gap-4">
            <svg viewBox="0 0 160 160" className="h-40 w-40">
              {recap.slices.map((slice) => (
                <path key={slice.pos} d={slice.d} fill={slice.color} />
              ))}
              <circle cx="80" cy="80" r="28" fill="#07111f" />
            </svg>
            <ul className="min-w-[180px] flex-1 space-y-2 text-sm">
              {POS_ORDER.filter((pos) => recap.counts[pos]).map((pos) => (
                <li key={pos} className="grid grid-cols-[12px_2.4rem_1.2rem_1fr] items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: POS_COLORS[pos] }} />
                  <b>{pos}</b>
                  <span>{recap.counts[pos]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-900">
                    <i className="block h-full" style={{ width: `${(recap.counts[pos] / maxPos) * 100}%`, background: POS_COLORS[pos] }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-slate-500">Round-by-round quality</h3>
          <div className="mb-2 flex justify-between px-2 text-[0.7rem] uppercase tracking-widest text-slate-500">
            <span>Reach</span>
            <span>Value</span>
          </div>
          <ul className="space-y-2 text-sm">
            {recap.rows.map((row) => (
              <li key={row.overall} className="grid grid-cols-[3.4rem_1fr_42%_5.5rem] items-center gap-2">
                <span className="font-bold text-amber-400">{row.slot}</span>
                <span>{row.position} {row.name}</span>
                <div className="relative h-2.5 rounded-full bg-slate-900">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                  <span
                    className={`absolute inset-y-0 rounded-full ${row.delta >= 0 ? "left-1/2 bg-emerald-400" : "right-1/2 bg-rose-400"}`}
                    style={{ width: `${barWidth(row.delta)}%` }}
                  />
                </div>
                <span className={`text-right text-[0.7rem] font-extrabold uppercase ${row.tag === "reach" ? "text-rose-400" : row.tag === "steal" || row.tag === "value" ? "text-emerald-400" : "text-slate-500"}`}>
                  {row.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <div className="font-oswald text-2xl">{n}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function teamLabel(player: { id: string; team: string; teams?: string[] }, franchise: string | null) {
  const codes = playerTeamCodes(player);
  if (!franchise) return codes.join(" / ");
  const aliases = new Set((NFL_FRANCHISES.find((item) => item.id === franchise)?.codes ?? [franchise]));
  const hit = codes.filter((code) => aliases.has(code));
  const rest = codes.filter((code) => !aliases.has(code));
  return [...hit, ...rest].join(" / ");
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 font-oswald text-xl uppercase text-white">{label}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm ${
        selected
          ? "bg-gradient-to-b from-red-600 to-red-800 font-bold text-white"
          : "border border-white/10 bg-slate-900 text-white hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}
