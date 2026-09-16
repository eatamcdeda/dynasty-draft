import { summarizeDraft, POS_ORDER, POS_COLORS, barWidth } from "./recap.js";
import { NFL_FRANCHISES, countFranchisePool, countFranchiseIdp, franchiseName, playerTeamCodes } from "./franchises.js";
import { SnakeDraftEngine, playerRank, poolLabel, slotLabel } from "./draft.js";

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
const POSITIONS = ["QB", "RB", "WR", "TE", "DL", "LB", "DB", "DST"];
const USER_SECONDS = 15;
const CPU_SECONDS = 4;

const root = document.getElementById("root");
let access = { unlocked: false, trialUsed: false, amountCents: 999, notice: null };

const players = await fetch("./players.json").then((res) => res.json());
try {
  const loaded = await fetch("/api/access").then((res) => res.json());
  access = { ...access, ...loaded };
} catch {
  /* preview still works if billing routes are down */
}
const params = new URLSearchParams(window.location.search);
if (params.get("unlocked") === "1") access.notice = "unlocked";
if (params.get("checkout") === "cancelled") access.notice = "cancelled";

let engine = null;
let search = "";
let positionFilter = null;
let deadline = 0;
let tickTimer = null;
let clockKind = "user";
let clockTotal = USER_SECONDS;
let resolving = false;
let historySaved = false;
let pickInsight = null;
let recapOpen = true;

render();

function render() {
  const poolScroll = document.getElementById("pool")?.scrollTop ?? 0;
  const boardScroll = document.getElementById("board")?.scrollTop ?? 0;
  const searchActive = document.activeElement?.id === "search";
  root.innerHTML = !engine ? setupHtml() : engine.isComplete && recapOpen ? recapHtml() : draftHtml();
  bind();
  const pool = document.getElementById("pool");
  const board = document.getElementById("board");
  if (pool) pool.scrollTop = poolScroll;
  if (board) board.scrollTop = boardScroll;
  if (searchActive) {
    const next = document.getElementById("search");
    if (next) {
      next.focus();
      next.setSelectionRange(search.length, search.length);
    }
  }
  paintClock();
}

function setupHtml() {
  const scoring = window.__setup?.scoring ?? "ppr";
  const poolMode = window.__setup?.poolMode ?? "all";
  const allTime = poolMode !== "era";
  const fromDecade = window.__setup?.fromDecade ?? 1990;
  const toDecade = window.__setup?.toDecade ?? 2020;
  const franchise = window.__setup?.franchise ?? "GB";
  const teamCount = window.__setup?.teamCount ?? 10;
  const rounds = window.__setup?.rounds ?? 12;
  const draftSlot = window.__setup?.draftSlot ?? 1;
  const randomSlot = window.__setup?.randomSlot ?? false;
  window.__setup = { scoring, poolMode, allTime: poolMode !== "era", fromDecade, toDecade, franchise, teamCount, rounds, draftSlot, randomSlot };
  const franchiseCount = countFranchisePool(players, franchise);
  const franchiseIdp = countFranchiseIdp(players, franchise);

  return `
    <main class="wrap">
      <div class="brand-row">
        <div class="mark">DD</div>
        <p class="eyebrow">Live mock · All-time board</p>
      </div>
      <h1>Dynasty Draft</h1>
      <p class="lede">Historical greats, current stars, and all-time defenses in one snake draft — ranked by career value, not last season’s ADP.</p>
      <div class="hero-card">
        <p><b>On the clock:</b> 15 seconds for your pick. CPU teams take a few seconds each so the board doesn’t blur past.</p>
      </div>
      ${membershipHtml()}
      <div class="setup-panel">
        <h2>Scoring</h2>
        <div class="chips">
          ${chip("scoring", "ppr", scoring === "ppr", "PPR")}
          ${chip("scoring", "standard", scoring === "standard", "Non-PPR")}
        </div>
        <h2>Player pool</h2>
        <div class="chips">
          ${chip("pool", "all", poolMode === "all", "All-Time")}
          ${chip("pool", "era", poolMode === "era", "Era range")}
          ${chip("pool", "franchise", poolMode === "franchise", "Franchise draft")}
        </div>
        ${poolMode === "era" ? `
          <p class="hint">Career overlap with this decade range</p>
          <div class="chips">${DECADES.map((d) => chip("from", String(d), fromDecade === d, `${d}s from`)).join("")}</div>
          <div class="chips">${DECADES.map((d) => chip("to", String(d), toDecade === d, `${d}s to`)).join("")}</div>
        ` : ""}
        ${poolMode === "franchise" ? `
          <label class="hint" for="franchise">Build an all-time roster from one NFL franchise</label>
          <select id="franchise" class="select">
            ${NFL_FRANCHISES.map((item) => `<option value="${item.id}" ${item.id === franchise ? "selected" : ""}>${item.name}</option>`).join("")}
          </select>
          <p class="hint">${franchiseCount} players (${franchiseIdp} IDP/DST) in the ${franchiseName(franchise)} pool</p>
        ` : ""}
        <h2>League size</h2>
        <div class="chips">${[8, 10, 12].map((n) => chip("teams", String(n), teamCount === n, `${n} teams`)).join("")}</div>
        <h2>Your draft slot</h2>
        <p class="hint">Other teams are drafted by the CPU. Random slot re-rolls every time you start.</p>
        <div class="chips">
          ${chip("slot", "random", randomSlot, "Random slot")}
          ${Array.from({ length: teamCount }, (_, i) => i + 1).map((n) => chip("slot", String(n), !randomSlot && draftSlot === n, String(n))).join("")}
        </div>
        <h2>Rounds</h2>
        <div class="chips">${[8, 10, 12, 15].map((n) => chip("rounds", String(n), rounds === n, String(n))).join("")}</div>
        <button id="start" class="primary wide">${access.unlocked || !access.trialUsed ? "Start snake draft" : "Unlock to start another draft"}</button>
      </div>
    </main>
  `;
}

function priceLabel() {
  return `$${(Number(access.amountCents ?? 999) / 100).toFixed(2)}`;
}

function membershipHtml() {
  const notice =
    access.notice === "unlocked"
      ? `<p class="banner ok">Full access is unlocked on this browser. Unlimited drafts are on.</p>`
      : access.notice === "cancelled"
        ? `<p class="banner">Checkout cancelled. Your free trial draft is unchanged.</p>`
        : access.notice === "small-pool"
          ? `<p class="banner">That franchise pool is too small for this league size. Pick a bigger pool or fewer teams.</p>`
          : "";
  if (access.unlocked) {
    return `${notice}<div class="member-card"><span class="badge on">Full access</span><p>Unlimited drafts this season. Live ratings and head-to-head drafts will land here when they ship.</p></div>`;
  }
  const trialLine = access.trialUsed
    ? "Your free draft is used. Unlock unlimited drafts for a one-time $9.99."
    : "Free: one full snake draft to try the board. Then a one-time $9.99 unlocks unlimited drafts this season.";
  return `${notice}
    <div class="member-card">
      <span class="badge">${access.trialUsed ? "Trial used" : "Free trial"}</span>
      <p>${trialLine}</p>
      <button type="button" class="primary" id="unlock-pay">Unlock full access — ${priceLabel()}</button>
      <p class="hint" id="unlock-error"></p>
    </div>`;
}

function recapHtml() {
  const recap = summarizeDraft(engine);
  const { settings } = engine;
  const maxPos = Math.max(1, ...POS_ORDER.map((pos) => recap.counts[pos] ?? 0));
  return `
    <main class="wrap wide recap">
      <header class="top">
        <div class="brand-row">
          <div class="mark">DD</div>
          <div>
            <p class="eyebrow">Post-draft report</p>
            <h1 class="small">How'd you do?</h1>
            <p class="hint">${settings.scoring === "ppr" ? "PPR" : "Non-PPR"} · ${poolLabel(settings.era, settings.franchise)} · Slot ${settings.userTeamIndex + 1}</p>
          </div>
        </div>
        <div class="row" style="margin:0">
          <button id="view-board" class="ghost">View board</button>
          <button id="reset" class="primary">New draft</button>
        </div>
      </header>

      <section class="recap-hero">
        <div class="grade-orb">
          <span>Draft grade</span>
          <strong>${recap.grade.letter}</strong>
        </div>
        <div>
          <h2>${escapeHtml(recap.grade.blurb)}</h2>
          <p class="hint">Value vs. reach uses career rank against the overall pick. Positive = you waited and still got a higher-ranked name.</p>
          <div class="recap-stats">
            <div><b>${recap.rows.length}</b><span>your picks</span></div>
            <div><b>${recap.avg >= 0 ? "+" : ""}${recap.avg.toFixed(1)}</b><span>avg value</span></div>
            <div><b>${recap.stealCount}</b><span>steals</span></div>
            <div><b>${recap.reachCount}</b><span>reaches</span></div>
          </div>
          ${recap.holes.length ? `<p class="hint">Thin at ${recap.holes.join(", ")}.</p>` : ""}
          ${recap.best ? `<p class="hint">Best value: <b>${escapeHtml(recap.best.name)}</b> (${recap.best.slot}, rank #${recap.best.rank}).</p>` : ""}
          ${recap.worst && recap.worst.delta < 0 ? `<p class="hint">Biggest reach: <b>${escapeHtml(recap.worst.name)}</b> (${recap.worst.slot}, rank #${recap.worst.rank}).</p>` : ""}
        </div>
      </section>

      <div class="recap-grid">
        <section class="recap-card">
          <h3>Position mix</h3>
          <div class="pie-row">
            <svg class="pie" viewBox="0 0 160 160" aria-hidden="true">
              ${recap.slices.map((slice) => `<path d="${slice.d}" fill="${slice.color}"></path>`).join("")}
              <circle cx="80" cy="80" r="28" fill="#07111f"></circle>
            </svg>
            <ul class="legend">
              ${POS_ORDER.filter((pos) => recap.counts[pos]).map((pos) => `
                <li>
                  <span class="swatch" style="background:${POS_COLORS[pos]}"></span>
                  <b>${pos}</b>
                  <span>${recap.counts[pos]}</span>
                  <span class="pos-bar"><i style="width:${(recap.counts[pos] / maxPos) * 100}%;background:${POS_COLORS[pos]}"></i></span>
                </li>
              `).join("")}
            </ul>
          </div>
        </section>
        <section class="recap-card">
          <h3>Round-by-round quality</h3>
          <p class="axis"><span>Reach</span><span>Value</span></p>
          <ul class="quality">
            ${recap.rows.map((row) => {
              const width = barWidth(row.delta);
              const side = row.delta >= 0 ? "value" : "reach";
              return `<li>
                <span class="q-slot">${row.slot}</span>
                <span class="q-name">${row.position} ${escapeHtml(row.name)}</span>
                <div class="q-track">
                  <div class="q-mid"></div>
                  <div class="q-bar ${side}" style="width:${width}%"></div>
                </div>
                <span class="q-tag ${row.tag}">${row.label}</span>
              </li>`;
            }).join("")}
          </ul>
        </section>
      </div>
    </main>
  `;
}

function chip(group, value, selected, label) {
  return `<button type="button" class="chip ${selected ? "on" : ""}" data-group="${group}" data-value="${value}">${label}</button>`;
}

function teamLabel(player) {
  const codes = playerTeamCodes(player);
  const franchise = engine?.settings?.franchise;
  if (!franchise) return codes.join(" / ");
  const aliases = new Set((NFL_FRANCHISES.find((item) => item.id === franchise)?.codes ?? [franchise]));
  const hit = codes.filter((code) => aliases.has(code));
  const rest = codes.filter((code) => !aliases.has(code));
  return [...hit, ...rest].join(" / ");
}

function secondsLeft() {
  if (!engine || engine.isComplete || !deadline) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function draftHtml() {
  const { settings } = engine;
  const query = search.trim().toLowerCase();
  const filtered = engine.available.filter((player) => {
    const matchesPosition = positionFilter == null || player.position === positionFilter;
    const matchesQuery =
      query.length === 0 ||
      player.name.toLowerCase().includes(query) ||
      player.team.toLowerCase().includes(query) ||
      playerTeamCodes(player).some((code) => code.toLowerCase().includes(query));
    return matchesPosition && matchesQuery;
  });
  const canUndo = engine.picks.some((pick) => pick.teamIndex === settings.userTeamIndex);
  const last = engine.picks[engine.picks.length - 1];
  const lastLabel = last
    ? `${slotLabel(last)} ${last.player.name}`
    : "Waiting on first pick";
  const userTurn = engine.isUserOnTheClock;
  const complete = engine.isComplete;

  return `
    <main class="wrap wide">
      <header class="top">
        <div class="brand-row">
          <div class="mark">DD</div>
          <div>
            <h1 class="small">Dynasty Draft</h1>
            <p class="hint">${settings.scoring === "ppr" ? "PPR" : "Non-PPR"} · ${poolLabel(settings.era, settings.franchise)} · Slot ${settings.userTeamIndex + 1} · IDP + DST</p>
          </div>
        </div>
        <button id="reset" class="link">New draft</button>
        ${complete ? `<button id="see-results" class="primary">See results</button>` : ""}
      </header>
      <section class="scoreboard" id="scoreboard">
        <div class="timer-ring ${userTurn ? "" : "cpu"}" id="timer-ring" style="--pct: 100">
          <strong id="timer-secs">${complete ? "—" : secondsLeft()}</strong>
        </div>
        <div class="clock-copy">
          <p class="kicker ${userTurn ? "" : "cpu"}" id="clock-kicker">${clockKicker()}</p>
          <h2 id="clock-title">${clockTitle()}</h2>
          <p id="clock-meta">R${engine.currentRound()} · Pick ${engine.pickInRound()} · Overall ${Math.min(engine.nextOverall, engine.totalPicks)}/${engine.totalPicks}</p>
          <p class="insight" id="pick-insight">${pickInsight && userTurn ? escapeHtml(pickInsight.text) : ""}</p>
        </div>
        <div class="last-pick">
          <span>Latest selection</span>
          <b>${escapeHtml(lastLabel)}</b>
        </div>
      </section>
      <input id="search" value="${escapeAttr(search)}" placeholder="Search name or team" />
      <div class="chips">
        ${chip("pos", "ALL", positionFilter == null, "ALL")}
        ${POSITIONS.map((p) => chip("pos", p, positionFilter === p, p)).join("")}
      </div>
      <div class="row">
        <button id="undo" class="ghost" ${canUndo ? "" : "disabled"}>Undo</button>
        <button id="auto" class="primary" ${userTurn && !complete ? "" : "disabled"}>Auto-pick</button>
      </div>
      <div class="grid">
        <section>
          <h3>Available (${filtered.length})</h3>
          <ul class="list" id="pool">
            ${filtered.map((player) => `
              <li>
                <button class="player" data-id="${player.id}" ${userTurn && !complete ? "" : "disabled"}>
                  <span class="pos ${player.position}">${player.position}</span>
                  <span class="meta">
                    <strong>${escapeHtml(player.name)}</strong>
                    <em>${escapeHtml(teamLabel(player))} · ${player.careerStart}–${player.careerEnd}</em>
                    <span class="stat">${escapeHtml(player.statLine ?? "")}</span>
                  </span>
                  <span class="rank">#${playerRank(player, settings.scoring)}</span>
                </button>
              </li>
            `).join("")}
          </ul>
        </section>
        <section>
          <h3>Draft board (${engine.picks.length})</h3>
          <ol class="board" id="board">
            ${engine.picks.length === 0 ? "<li class='hint'>Picks appear here in snake order.</li>" : ""}
            ${engine.picks.map((pick, index) => {
              const owner = pick.teamIndex === settings.userTeamIndex ? "You" : `CPU ${pick.teamIndex + 1}`;
              const fresh = index === engine.picks.length - 1 ? "fresh" : "";
              return `<li class="${fresh}"><span class="slot">${slotLabel(pick)}</span><span class="owner">${owner}</span><span>${pick.player.position} ${escapeHtml(pick.player.name)}</span></li>`;
            }).join("")}
          </ol>
        </section>
      </div>
    </main>
  `;
}

function clockKicker() {
  if (!engine || engine.isComplete) return "Final";
  return engine.isUserOnTheClock ? "You are on the clock" : "CPU on the clock";
}

function clockTitle() {
  if (!engine || engine.isComplete) return "Draft complete";
  return engine.isUserOnTheClock ? "Your pick" : `CPU Team ${engine.teamOnTheClock() + 1}`;
}

function paintClock() {
  if (!engine) return;
  const secsEl = document.getElementById("timer-secs");
  const ring = document.getElementById("timer-ring");
  const kicker = document.getElementById("clock-kicker");
  const title = document.getElementById("clock-title");
  if (!secsEl || !ring) return;
  if (engine.isComplete) {
    secsEl.textContent = "—";
    ring.style.setProperty("--pct", "0");
    if (kicker) kicker.textContent = "Final";
    if (title) title.textContent = "Draft complete";
    return;
  }
  const left = secondsLeft();
  secsEl.textContent = String(left);
  const pct = clockTotal ? (left / clockTotal) * 100 : 0;
  ring.style.setProperty("--pct", String(pct));
  ring.classList.toggle("cpu", !engine.isUserOnTheClock);
  if (kicker) {
    kicker.textContent = clockKicker();
    kicker.classList.toggle("cpu", !engine.isUserOnTheClock);
  }
  if (title) title.textContent = clockTitle();
}

function stopClock() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function armClock() {
  stopClock();
  if (!engine || engine.isComplete) {
    deadline = 0;
    paintClock();
    maybeSaveHistory();
    return;
  }
  clockKind = engine.isUserOnTheClock ? "user" : "cpu";
  clockTotal = clockKind === "user" ? USER_SECONDS : CPU_SECONDS;
  deadline = Date.now() + clockTotal * 1000;
  paintClock();
  loadPickInsight();
  tickTimer = setInterval(() => {
    paintClock();
    if (secondsLeft() <= 0) {
      stopClock();
      resolveExpired();
    }
  }, 200);
}

async function maybeSaveHistory() {
  if (!engine?.isComplete || historySaved || !access.unlocked) return;
  historySaved = true;
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
  try {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamCount: engine.settings.teamCount,
        rounds: engine.settings.rounds,
        scoring: engine.settings.scoring,
        franchise: engine.settings.franchise,
        picks: userPicks,
      }),
    });
  } catch {
    historySaved = false;
  }
}

async function loadPickInsight() {
  const el = document.getElementById("pick-insight");
  if (!el || !engine || !access.unlocked || !engine.isUserOnTheClock) {
    pickInsight = null;
    if (el) el.textContent = "";
    return;
  }
  try {
    const data = await fetch(`/api/history/insight?overall=${engine.nextOverall}`).then((res) => res.json());
    pickInsight = data.insight;
    if (el && engine.isUserOnTheClock) el.textContent = pickInsight?.text ?? "";
  } catch {
    pickInsight = null;
  }
}

function resolveExpired() {
  if (!engine || engine.isComplete || resolving) return;
  resolving = true;
  engine.autoPick();
  render();
  resolving = false;
  armClock();
}

function bind() {
  if (engine?.isComplete && recapOpen) {
    document.getElementById("reset")?.addEventListener("click", () => {
      stopClock();
      engine = null;
      pickInsight = null;
      recapOpen = true;
      render();
    });
    document.getElementById("view-board")?.addEventListener("click", () => {
      recapOpen = false;
      render();
    });
    return;
  }
  if (!engine) {
    root.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = window.__setup;
        const { group, value } = btn.dataset;
        if (group === "scoring") s.scoring = value;
        if (group === "pool") {
          s.poolMode = value;
          s.allTime = value !== "era";
        }
        if (group === "from") {
          s.poolMode = "era";
          s.allTime = false;
          s.fromDecade = Number(value);
          if (s.toDecade < s.fromDecade) s.toDecade = s.fromDecade;
        }
        if (group === "to") {
          s.poolMode = "era";
          s.allTime = false;
          s.toDecade = Number(value);
          if (s.fromDecade > s.toDecade) s.fromDecade = s.toDecade;
        }
        if (group === "teams") {
          s.teamCount = Number(value);
          if (s.draftSlot > s.teamCount) s.draftSlot = s.teamCount;
        }
        if (group === "slot") {
          if (value === "random") {
            s.randomSlot = true;
          } else {
            s.randomSlot = false;
            s.draftSlot = Number(value);
          }
        }
        if (group === "rounds") s.rounds = Number(value);
        render();
      });
    });
    root.querySelector("#start").addEventListener("click", async () => {
      if (!access.unlocked) {
        if (access.trialUsed) {
          access.notice = "paywall";
          render();
          return;
        }
        const trial = await fetch("/api/trial", { method: "POST" });
        if (trial.status === 402) {
          access.trialUsed = true;
          render();
          return;
        }
        access.trialUsed = true;
      }
      const s = window.__setup;
      const slot = s.randomSlot
        ? Math.floor(Math.random() * s.teamCount)
        : Math.min(Math.max(s.draftSlot, 1), s.teamCount) - 1;
      const franchise = s.poolMode === "franchise" ? s.franchise : null;
      engine = new SnakeDraftEngine({
        scoring: s.scoring,
        era: s.poolMode === "era" ? { startYear: s.fromDecade, endYear: s.toDecade + 9 } : { startYear: null, endYear: null },
        franchise,
        teamCount: s.teamCount,
        rounds: s.rounds,
        userTeamIndex: slot,
      }, players);
      search = "";
      positionFilter = null;
      historySaved = false;
      pickInsight = null;
      recapOpen = true;
      render();
      armClock();
    });
    document.getElementById("franchise")?.addEventListener("change", (event) => {
      window.__setup.franchise = event.target.value;
      window.__setup.poolMode = "franchise";
      render();
    });
    bindCheckout();
    return;
  }

  root.querySelector("#reset").addEventListener("click", () => {
    stopClock();
    engine = null;
    pickInsight = null;
    recapOpen = true;
    render();
  });
  document.getElementById("see-results")?.addEventListener("click", () => {
    recapOpen = true;
    render();
  });
  const searchEl = root.querySelector("#search");
  searchEl.addEventListener("input", () => {
    search = searchEl.value;
    render();
  });
  root.querySelectorAll("[data-group=pos]").forEach((btn) => {
    btn.addEventListener("click", () => {
      positionFilter = btn.dataset.value === "ALL" ? null : btn.dataset.value;
      render();
    });
  });
  root.querySelector("#undo").addEventListener("click", () => {
    engine.undoUserPick();
    render();
    armClock();
  });
  root.querySelector("#auto").addEventListener("click", () => {
    if (!engine.isUserOnTheClock) return;
    engine.autoPick();
    render();
    armClock();
  });
  root.querySelectorAll(".player").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!engine.isUserOnTheClock) return;
      engine.draft(btn.dataset.id);
      render();
      armClock();
    });
  });
}

function bindCheckout() {
  const button = document.getElementById("unlock-pay");
  if (!button) return;
  button.addEventListener("click", async () => {
    const errorEl = document.getElementById("unlock-error");
    button.disabled = true;
    button.textContent = "Redirecting to Stripe…";
    try {
      const response = await fetch("/api/checkout", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error ?? "Could not start checkout");
      window.location.href = data.url;
    } catch (err) {
      if (errorEl) errorEl.textContent = err instanceof Error ? err.message : "Checkout failed";
      button.disabled = false;
      button.textContent = `Unlock full access — ${priceLabel()}`;
    }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
