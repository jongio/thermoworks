// web/app.mjs — Preact view for the BBQ Cook Monitor canvas.
//
// Shared cook state arrives over SSE (mountCanvas re-renders on every push);
// local UI bits (which target is being edited, graph hover) live in useState so
// a live push never clobbers a half-typed number or your cursor.
//
// The view is render-only: every mutation goes through invoke("<action>", …),
// the exact same handlers the agent calls. No fetch/exec here.

import {
  html,
  mountCanvas,
  useState,
  useEffect,
  useMemo,
  useRef,
  Icon,
  pollWhileVisible,
  relativeTime,
} from "/kit/client.mjs";

const STALL_LO = 148;
const STALL_HI = 168;

const PRESETS = [
  ["brisket", "Brisket"],
  ["pork", "Pulled Pork"],
  ["ribs", "Ribs"],
  ["chicken", "Chicken"],
  ["turkey", "Turkey"],
  ["steak", "Steak"],
];

const REFRESH_OPTS = [
  [0, "Off"],
  [2, "2s"],
  [4, "4s"],
  [10, "10s"],
  [30, "30s"],
];

// ─── pure formatting helpers ─────────────────────────────────────────────────

const fmtTemp = (v) => (v == null ? "--" : Math.round(v));

function fmtClock(totalMin) {
  const m = Math.max(0, Math.round(totalMin));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function etaMinutes(ch) {
  if (ch.value == null || ch.target == null) return null;
  if (ch.value >= ch.target) return 0;
  const rate = ch.rate ?? 0;
  if (!rate || rate <= 0.05) return null;
  return Math.round((ch.target - ch.value) / rate);
}

function progressPct(ch) {
  if (ch.value == null || ch.target == null) return 0;
  const start = 38; // fridge baseline
  const pct = ((ch.value - start) / (ch.target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

const ALARM_TONE = { none: "ok", high: "hot", low: "cold" };

// ─── interactive temperature graph ───────────────────────────────────────────

const VB_W = 1000;
const VB_H = 340;
const PLOT = { l: 46, r: 14, t: 14, b: 26 };

function buildGraph(channels, startedAt) {
  const withData = channels.filter((c) => c.history && c.history.length > 1);
  if (!withData.length) return null;

  // Unified, sorted time spine across all channels (handles demo = identical
  // timestamps and live = slightly offset timestamps alike).
  const tset = new Set();
  for (const c of withData) for (const p of c.history) tset.add(p.t);
  const spine = [...tset].sort((a, b) => a - b);
  const x0 = spine[0];
  const x1 = spine[spine.length - 1] || x0 + 1;

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of withData) {
    for (const p of c.history) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    if (c.target != null) hi = Math.max(hi, c.target);
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const pad = Math.max(8, (hi - lo) * 0.08);
  const y0 = Math.floor((lo - pad) / 10) * 10;
  const y1 = Math.ceil((hi + pad) / 10) * 10;

  const plotW = VB_W - PLOT.l - PLOT.r;
  const plotH = VB_H - PLOT.t - PLOT.b;
  const sx = (t) => PLOT.l + ((t - x0) / (x1 - x0 || 1)) * plotW;
  const sy = (v) => PLOT.t + (1 - (v - y0) / (y1 - y0 || 1)) * plotH;

  const startedMs = Date.parse(startedAt) || x0;

  const yticks = [];
  const TICKS = 4;
  for (let i = 0; i <= TICKS; i++) {
    const v = y0 + ((y1 - y0) * i) / TICKS;
    yticks.push({ v: Math.round(v), y: sy(v) });
  }
  const xticks = [];
  const XT = Math.min(5, spine.length);
  for (let i = 0; i < XT; i++) {
    const t = x0 + ((x1 - x0) * i) / (XT - 1 || 1);
    xticks.push({ x: sx(t), label: fmtClock((t - startedMs) / 60000) });
  }

  const series = withData.map((c) => {
    const byT = new Map(c.history.map((p) => [p.t, p.v]));
    const pts = spine.map((t) => {
      const v = byT.has(t) ? byT.get(t) : null;
      return v == null ? null : { x: sx(t), y: sy(v), v };
    });
    // Build a path that skips null gaps.
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
      pen = true;
    }
    const lastReal = [...pts].reverse().find(Boolean) || null;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      kind: c.kind,
      done: c.done,
      target: c.target,
      targetY: c.target != null ? sy(c.target) : null,
      d,
      pts,
      last: lastReal,
    };
  });

  const stall =
    y0 <= STALL_HI && y1 >= STALL_LO
      ? { top: sy(Math.min(STALL_HI, y1)), bot: sy(Math.max(STALL_LO, y0)) }
      : null;

  return { x0, x1, y0, y1, spine, sx, sy, yticks, xticks, series, startedMs, stall, plotW };
}

function TempGraph({ channels, startedAt }) {
  const [hover, setHover] = useState(null); // { i, leftFrac }
  const g = useMemo(() => buildGraph(channels, startedAt), [channels, startedAt]);

  if (!g) {
    return html`<div class="ck-empty"><${Icon} name="line-chart" size=${20} />No history yet.</div>`;
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const i = Math.round(frac * (g.spine.length - 1));
    setHover({ i, leftFrac: frac });
  };

  const hi = hover && g.spine[hover.i] != null ? hover.i : null;
  const hoverX = hi != null ? g.sx(g.spine[hi]) : null;
  const hoverElapsed = hi != null ? fmtClock((g.spine[hi] - g.startedMs) / 60000) : "";

  // Non-visual text equivalent (WCAG 1.1.1): each series' current value + target.
  const summaryText = g.series
    .map((s) => {
      const cur = s.last ? Math.round(s.last.v) : "—";
      return `${s.name}: ${cur}°${s.target != null ? ` (target ${Math.round(s.target)}°)` : ""}`;
    })
    .join("; ");
  const ariaLabel = `Temperature over time. ${summaryText}`;

  return html`
    <div class="bbq-graph-wrap" onMouseLeave=${() => setHover(null)}>
      <svg
        class="bbq-graph"
        viewBox="0 0 ${VB_W} ${VB_H}"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label=${ariaLabel}
        onMouseMove=${onMove}
      >
        <title>Temperature history</title>
        <desc>${summaryText}</desc>
        <defs>
          ${g.series.map(
            (s) => html`<linearGradient id="fill-${s.id}" key=${s.id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color=${s.color} stop-opacity="0.22" />
              <stop offset="100%" stop-color=${s.color} stop-opacity="0" />
            </linearGradient>`,
          )}
        </defs>

        ${g.stall
          ? html`<rect
              x=${PLOT.l}
              y=${g.stall.top}
              width=${VB_W - PLOT.l - PLOT.r}
              height=${Math.max(0, g.stall.bot - g.stall.top)}
              class="bbq-stall"
            />`
          : null}

        ${g.yticks.map(
          (yt) => html`<g key=${`y${yt.v}`}>
            <line x1=${PLOT.l} y1=${yt.y} x2=${VB_W - PLOT.r} y2=${yt.y} class="bbq-grid" />
            <text x=${PLOT.l - 6} y=${yt.y + 4} class="bbq-axis" text-anchor="end">${yt.v}°</text>
          </g>`,
        )}

        ${g.series.map((s) =>
          s.targetY != null
            ? html`<line
                key=${`t${s.id}`}
                x1=${PLOT.l}
                y1=${s.targetY}
                x2=${VB_W - PLOT.r}
                y2=${s.targetY}
                class="bbq-target"
                stroke=${s.color}
              />`
            : null,
        )}

        ${g.series.map(
          (s) => html`<g key=${`s${s.id}`}>
            <path
              d=${`${s.d}L${(VB_W - PLOT.r).toFixed(1)} ${(VB_H - PLOT.b).toFixed(1)} L${PLOT.l} ${(VB_H - PLOT.b).toFixed(1)} Z`}
              fill=${`url(#fill-${s.id})`}
              stroke="none"
            />
            <path d=${s.d} fill="none" stroke=${s.color} stroke-width="2.4" class="bbq-line" />
            ${s.last
              ? html`<circle cx=${s.last.x} cy=${s.last.y} r="4.5" fill=${s.color} class="bbq-now" />`
              : null}
          </g>`,
        )}

        ${g.xticks.map(
          (xt, i) => html`<text key=${`x${i}`} x=${xt.x} y=${VB_H - 8} class="bbq-axis" text-anchor="middle">${xt.label}</text>`,
        )}

        ${hoverX != null
          ? html`<g>
              <line x1=${hoverX} y1=${PLOT.t} x2=${hoverX} y2=${VB_H - PLOT.b} class="bbq-cross" />
              ${g.series.map((s) => {
                const p = s.pts[hi];
                return p ? html`<circle key=${s.id} cx=${p.x} cy=${p.y} r="3.5" fill=${s.color} stroke="#0d1117" stroke-width="1" />` : null;
              })}
            </g>`
          : null}
      </svg>

      ${hi != null
        ? html`<div
            class="bbq-tip"
            style=${`left:${(hover.leftFrac * 100).toFixed(1)}%`}
          >
            <div class="bbq-tip-time">${hoverElapsed}</div>
            ${g.series.map((s) => {
              const p = s.pts[hi];
              return html`<div class="bbq-tip-row" key=${s.id}>
                <span class="bbq-dot" style=${`background:${s.color}`}></span>
                <span class="bbq-tip-name">${s.name}</span>
                <span class="bbq-tip-val">${p ? `${fmtTemp(p.v)}°` : "--"}</span>
              </div>`;
            })}
          </div>`
        : null}
    </div>
  `;
}

// ─── animated fire header ────────────────────────────────────────────────────

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  left: 4 + (i * 6.7) % 92,
  delay: (i * 0.37) % 3.2,
  dur: 2.4 + ((i * 7) % 18) / 10,
  size: 3 + (i % 3),
}));

function FireHeader({ state, anyAlarm }) {
  const meats = state.channels.filter((c) => c.kind === "meat");
  const doneCount = meats.filter((c) => c.done).length;
  return html`
    <div class=${`bbq-hero ${anyAlarm ? "is-alarm" : ""}`}>
      <div class="bbq-flames" aria-hidden="true">
        <div class="bbq-flame f1"></div>
        <div class="bbq-flame f2"></div>
        <div class="bbq-flame f3"></div>
        ${EMBERS.map(
          (e, i) => html`<span
            class="bbq-ember"
            key=${i}
            style=${`left:${e.left}%;width:${e.size}px;height:${e.size}px;animation-delay:${e.delay}s;animation-duration:${e.dur}s`}
          ></span>`,
        )}
      </div>
      <div class="bbq-hero-body">
        <div class="bbq-hero-top">
          <span class="bbq-logo" aria-hidden="true">🔥</span>
          <div class="bbq-titles">
            <h1>${state.cookName}</h1>
            <div class="bbq-sub">
              <${Icon} name="timer" size=${13} />
              <span>${fmtClock(state.elapsedMin)} elapsed</span>
              <span class="bbq-sep">·</span>
              <span>${meats.length} probe${meats.length === 1 ? "" : "s"}</span>
              ${doneCount
                ? html`<span class="bbq-sep">·</span><span class="bbq-done-pill">${doneCount} ready 🍖</span>`
                : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── pit + probe cards ───────────────────────────────────────────────────────

function TargetEditor({ value, onSave, onCancel, label = "target" }) {
  const [v, setV] = useState(String(value ?? ""));
  return html`
    <span class="bbq-edit">
      <input
        class="ck-input bbq-edit-input"
        type="number"
        aria-label=${`Set ${label} temperature in °F`}
        value=${v}
        autofocus
        onInput=${(e) => setV(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === "Enter") onSave(Number(v));
          if (e.key === "Escape") onCancel();
        }}
      />
      <button class="ck-btn ck-btn-sm ck-btn-primary" aria-label=${`Save ${label}`} onClick=${() => onSave(Number(v))}>
        <${Icon} name="check" size=${13} />
      </button>
      <button class="ck-btn ck-btn-sm" aria-label="Cancel" onClick=${onCancel}><${Icon} name="x" size=${13} /></button>
    </span>
  `;
}

function PitCard({ pit, invoke }) {
  const [editing, setEditing] = useState(false);
  if (!pit) return null;
  const tone = ALARM_TONE[pit.alarm] ?? "ok";
  const rate = pit.rate ?? 0;
  return html`
    <div class=${`bbq-pit tone-${tone}`}>
      <div class="bbq-pit-left">
        <div class="bbq-pit-label"><${Icon} name="flame" size=${16} /> ${pit.name}</div>
        <div class="bbq-pit-temp">
          <span class="bbq-big">${fmtTemp(pit.value)}</span><span class="bbq-deg">°${pit.units}</span>
        </div>
        <div class="bbq-rate">
          <${Icon} name=${rate >= 0 ? "trending-up" : "trending-down"} size=${13} />
          ${rate > 0 ? `+${rate}` : rate}°/min
          ${pit.alarm === "high" ? html`<span class="bbq-tag hot">running hot</span>` : null}
          ${pit.alarm === "low" ? html`<span class="bbq-tag cold">running cold</span>` : null}
        </div>
      </div>
      <div class="bbq-pit-right">
        <span class="bbq-target-label">target</span>
        ${editing
          ? html`<${TargetEditor}
              value=${pit.target}
              label="pit"
              onCancel=${() => setEditing(false)}
              onSave=${(n) => {
                setEditing(false);
                if (Number.isFinite(n)) invoke("set_pit_target", { value: n });
              }}
            />`
          : html`<button class="bbq-target-btn" onClick=${() => setEditing(true)} aria-label="Edit pit target temperature">
              ${fmtTemp(pit.target)}°<${Icon} name="pencil" size=${12} />
            </button>`}
      </div>
    </div>
  `;
}

function ProbeCard({ ch, units, invoke, canRemove }) {
  const [editing, setEditing] = useState(false);
  const eta = etaMinutes(ch);
  const pct = progressPct(ch);
  const tone = ch.done ? "done" : ALARM_TONE[ch.alarm] ?? "ok";
  return html`
    <div class=${`bbq-card tone-${tone} ${ch.done ? "is-done" : ""}`}>
      <div class="bbq-card-head">
        <span class="bbq-swatch" style=${`background:${ch.color}`}></span>
        <span class="bbq-card-name" title=${ch.name}>${ch.name}</span>
        ${ch.done
          ? html`<span class="bbq-ready">READY 🍖</span>`
          : eta != null
            ? html`<span class="bbq-eta">~${fmtClock(eta)} left</span>`
            : html`<span class="bbq-eta dim">cooking…</span>`}
      </div>

      <div class="bbq-card-temp">
        <span class="bbq-big" style=${`color:${ch.done ? "var(--ck-success)" : "inherit"}`}>${fmtTemp(ch.value)}</span>
        <span class="bbq-deg">°${units}</span>
        <span class="bbq-card-rate">
          <${Icon} name=${(ch.rate ?? 0) >= 0 ? "trending-up" : "trending-down"} size=${12} />
          ${(ch.rate ?? 0) > 0 ? `+${ch.rate}` : ch.rate ?? 0}°/min
        </span>
      </div>

      <div class="bbq-progress" role="progressbar" aria-valuenow=${pct} aria-valuemin="0" aria-valuemax="100" aria-label=${`${ch.name} progress to target`}>
        <div class="bbq-progress-bar" style=${`width:${pct}%;background:${ch.done ? "var(--ck-success)" : ch.color}`}></div>
      </div>

      <div class="bbq-card-foot">
        <span class="bbq-target-label">target</span>
        ${editing
          ? html`<${TargetEditor}
              value=${ch.target}
              label=${ch.name}
              onCancel=${() => setEditing(false)}
              onSave=${(n) => {
                setEditing(false);
                if (Number.isFinite(n)) invoke("set_probe_target", { id: ch.id, value: n });
              }}
            />`
          : html`<button class="bbq-target-btn" onClick=${() => setEditing(true)} aria-label=${`Edit ${ch.name} target temperature`}>
              ${fmtTemp(ch.target)}°<${Icon} name="pencil" size=${12} />
            </button>`}
        <span class="ck-grow"></span>
        ${canRemove
          ? html`<button
              class="ck-btn ck-btn-sm ck-btn-danger"
              aria-label=${`Remove ${ch.name}`}
              onClick=${() => invoke("remove_probe", { id: ch.id })}
            >
              <${Icon} name="trash-2" size=${13} />
            </button>`
          : null}
      </div>
    </div>
  `;
}

// ─── controls ────────────────────────────────────────────────────────────────

function Controls({ state, invoke }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("165");

  const addProbe = () => {
    const n = name.trim();
    invoke("add_probe", { name: n || undefined, target: Number(target) || 165 });
    setName("");
    setTarget("165");
    setAdding(false);
  };

  return html`
    <div class="bbq-controls">
      <div class="ck-tabs" role="group" aria-label="Data mode">
        ${["demo", "live"].map(
          (m) => html`<button
            class="ck-tab"
            key=${m}
            aria-pressed=${String(state.mode === m)}
            onClick=${() => invoke("set_mode", { mode: m })}
          >
            <${Icon} name=${m === "demo" ? "sparkles" : "radio"} size=${13} /> ${m}
          </button>`,
        )}
      </div>

      <label class="bbq-field">
        <${Icon} name="utensils-crossed" size=${13} />
        <select
          class="ck-select bbq-select"
          aria-label="Cook preset"
          value=${state.preset ?? "brisket"}
          onChange=${(e) => invoke("start_cook", { preset: e.target.value })}
        >
          ${PRESETS.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
        </select>
      </label>

      <label class="bbq-field">
        <${Icon} name="refresh-cw" size=${13} />
        <select
          class="ck-select bbq-select"
          aria-label="Auto-refresh interval"
          value=${String(state.autoRefreshSec ?? 0)}
          onChange=${(e) => invoke("set_auto_refresh", { seconds: Number(e.target.value) })}
        >
          ${REFRESH_OPTS.map(([v, l]) => html`<option key=${String(v)} value=${String(v)}>${l}</option>`)}
        </select>
      </label>

      <button class="ck-btn ck-btn-sm" onClick=${() => invoke("refresh")} title="Refresh now">
        <${Icon} name="rotate-cw" size=${14} /> Tick
      </button>

      ${state.mode === "demo"
        ? adding
          ? html`<span class="bbq-add">
              <input class="ck-input bbq-add-name" aria-label="New probe name" placeholder="Probe name" value=${name} onInput=${(e) => setName(e.target.value)} />
              <input class="ck-input bbq-add-tgt" aria-label="New probe target temperature" type="number" value=${target} onInput=${(e) => setTarget(e.target.value)} />
              <button class="ck-btn ck-btn-sm ck-btn-primary" aria-label="Add probe" onClick=${addProbe}><${Icon} name="check" size=${13} /></button>
              <button class="ck-btn ck-btn-sm" aria-label="Cancel" onClick=${() => setAdding(false)}><${Icon} name="x" size=${13} /></button>
            </span>`
          : html`<button class="ck-btn ck-btn-sm" onClick=${() => setAdding(true)}>
              <${Icon} name="plus" size=${14} /> Probe
            </button>`
        : null}
    </div>
  `;
}

// ─── pit master chat ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "How's my cook looking?",
  "Why is my brisket stalling?",
  "Should I wrap it now?",
  "When will it be done?",
  "Is my pit temp okay?",
];

function ChatPanel({ state, invoke }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null); // the in-flight question (optimistic)
  const listRef = useRef(null);
  const chat = state.chat ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, pending]);

  async function send(q) {
    const text = (q ?? draft).trim();
    if (!text || pending) return;
    setDraft("");
    setPending(text);
    try {
      await invoke("ask_coach", { question: text });
    } catch {
      /* error is surfaced by the handler into a coach reply */
    } finally {
      setPending(null);
    }
  }

  const empty = chat.length === 0 && !pending;

  return html`
    <div class="bbq-chat-card">
      <div class="bbq-chat-head">
        <div class="ck-row" style="gap:7px">
          <span class="bbq-coach-ava" aria-hidden="true">🔥</span>
          <div>
            <strong>Ask the Pit Master</strong>
            <div class="ck-caption">Smokey knows your live temps</div>
          </div>
        </div>
        ${chat.length
          ? html`<button class="ck-btn ck-btn-sm" aria-label="Clear chat" onClick=${() => invoke("clear_chat")}>
              <${Icon} name="eraser" size=${13} /> Clear
            </button>`
          : null}
      </div>

      <div class="bbq-chat-list" ref=${listRef} role="log" aria-label="Pit master chat" aria-live="polite" tabindex="0">
        ${empty
          ? html`<div class="bbq-chat-hello">
              <p class="ck-muted">👋 I'm Smokey — your AI pit master. Ask me anything about this cook.</p>
            </div>`
          : null}
        ${chat.map(
          (m) => html`<div class=${`bbq-msg ${m.role === "user" ? "is-user" : "is-coach"}`} key=${m.id}>
            ${m.role === "coach" ? html`<span class="bbq-coach-ava sm" aria-hidden="true">🔥</span>` : null}
            <div class="bbq-bubble"><span class="bbq-sr">${m.role === "user" ? "You: " : "Smokey: "}</span>${m.text}</div>
          </div>`,
        )}
        ${pending
          ? html`<div class="bbq-msg is-user"><div class="bbq-bubble"><span class="bbq-sr">You: </span>${pending}</div></div>
              <div class="bbq-msg is-coach" role="status">
                <span class="bbq-coach-ava sm" aria-hidden="true">🔥</span>
                <div class="bbq-bubble bbq-thinking">
                  <span class="bbq-typing" aria-hidden="true"><i></i><i></i><i></i></span> Smokey is thinking…
                </div>
              </div>`
          : null}
      </div>

      ${empty
        ? html`<div class="bbq-suggest">
            ${SUGGESTIONS.map(
              (s) => html`<button class="bbq-chip" key=${s} onClick=${() => send(s)}>${s}</button>`,
            )}
          </div>`
        : null}

      <div class="bbq-chat-input">
        <input
          class="ck-input"
          aria-label="Ask the pit master about your cook"
          placeholder=${pending ? "Smokey is replying…" : "Ask about your cook…"}
          value=${draft}
          disabled=${!!pending}
          onInput=${(e) => setDraft(e.target.value)}
          onKeyDown=${(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button
          class="ck-btn ck-btn-primary"
          disabled=${!draft.trim() || !!pending}
          onClick=${() => send()}
          aria-label="Send message"
        >
          ${pending
            ? html`<${Icon} name="loader-circle" class="ck-spinner" size=${15} />`
            : html`<${Icon} name="send" size=${15} />`}
        </button>
      </div>
    </div>
  `;
}

// ─── live sign-in ────────────────────────────────────────────────────────────

function SignInCard({ state, invoke, checking }) {
  const [email, setEmail] = useState(state.liveEmail ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    try {
      await invoke("sign_in", { email: email.trim(), password });
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return html`
    <div class="bbq-signin">
      <div class="bbq-signin-head">
        <span class="bbq-coach-ava">🔥</span>
        <div>
          <strong>Connect ThermoWorks Cloud</strong>
          <div class="ck-caption">Sign in to watch your real devices — no terminal needed.</div>
        </div>
      </div>

      ${checking
        ? html`<div class="bbq-probe-note">
            <${Icon} name="loader-circle" class="ck-spinner" size=${14} />
            <span>Checking for a saved sign-in…</span>
          </div>`
        : null}

      ${state.error
        ? html`<div class="ck-callout ck-error" role="alert"><${Icon} name="circle-x" size=${16} /><span>${state.error}</span></div>`
        : null}

      <label class="bbq-field-lbl">Email
        <input
          class="ck-input"
          type="email"
          autocomplete="username"
          placeholder="you@example.com"
          value=${email}
          disabled=${busy}
          onInput=${(e) => setEmail(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter") connect(); }}
        />
      </label>

      <label class="bbq-field-lbl">Password
        <span class="bbq-pw">
          <input
            class="ck-input"
            type=${show ? "text" : "password"}
            autocomplete="current-password"
            placeholder="••••••••"
            value=${password}
            disabled=${busy}
            onInput=${(e) => setPassword(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter") connect(); }}
          />
          <button class="bbq-pw-toggle" type="button" aria-label=${show ? "Hide password" : "Show password"} aria-pressed=${String(show)} onClick=${() => setShow((s) => !s)}>
            <${Icon} name=${show ? "eye-off" : "eye"} size=${15} />
          </button>
        </span>
      </label>

      <div class="ck-row" style="gap:8px; margin-top:2px">
        <button class="ck-btn ck-btn-primary" disabled=${!email.trim() || !password || busy} onClick=${connect}>
          ${busy
            ? html`<${Icon} name="loader-circle" class="ck-spinner" size=${15} /> Connecting…`
            : html`<${Icon} name="plug-zap" size=${15} /> Connect`}
        </button>
        <button class="ck-btn" onClick=${() => invoke("set_mode", { mode: "demo" })}>
          <${Icon} name="sparkles" size=${14} /> Back to demo
        </button>
      </div>

      <div class="bbq-signin-foot">
        <${Icon} name="shield-check" size=${13} />
        <span>Your password is used only to sign in to ThermoWorks Cloud and is kept in memory for this session — never written to disk.</span>
      </div>

      <div class="bbq-signin-alt">
        Prefer the CLI?
        <button class="bbq-link" onClick=${() => invoke("open_terminal_login")}>
          <${Icon} name="terminal" size=${13} /> Open a terminal & run <code>thermoworks auth login</code>
        </button>
      </div>
    </div>
  `;
}

// ─── device / session picker (live mode) ─────────────────────────────────────

function DevicePicker({ state, invoke }) {
  const devices = state.liveDevices ?? [];
  const selected = state.selectedSerial ?? "all";
  if (!devices.length) return null;
  return html`
    <div class="bbq-devices">
      <div class="bbq-devices-head">
        <${Icon} name="thermometer" size=${14} />
        <span>Device / session</span>
        <span class="ck-caption">${devices.length} device${devices.length === 1 ? "" : "s"}</span>
      </div>
      <div class="bbq-devices-chips">
        ${devices.length > 1
          ? html`<button
              class=${`bbq-devchip ${selected === "all" ? "is-sel" : ""}`}
              aria-pressed=${String(selected === "all")}
              onClick=${() => invoke("select_device", { serial: "all" })}
            >
              <${Icon} name="layers" size=${13} /> All
            </button>`
          : null}
        ${devices.map(
          (d) => html`<button
            class=${`bbq-devchip ${selected === d.serial ? "is-sel" : ""}`}
            key=${d.serial}
            aria-pressed=${String(selected === d.serial)}
            title=${d.sessionLabel ? `${d.label} — ${d.sessionLabel}` : d.label}
            onClick=${() => invoke("select_device", { serial: d.serial })}
          >
            <span class=${`bbq-devdot ${d.status === "online" ? "on" : "off"}`} aria-hidden="true"></span>
            <span class="bbq-devname">${d.sessionLabel || d.label}</span>
            <span class="bbq-sr">${d.status === "online" ? " (online)" : " (offline)"}</span>
            <span class="bbq-devmeta">${d.channelCount}ch</span>
          </button>`,
        )}
      </div>
    </div>
  `;
}

// ─── root ────────────────────────────────────────────────────────────────────

function App({ state, invoke, connected }) {
  const mode = state?.mode;
  const liveStatus = state?.liveStatus;
  const liveReady = mode === "demo" || (mode === "live" && liveStatus === "authed");
  // Treat a missing status (e.g. state persisted before this feature) as "check".
  const liveChecking = mode === "live" && (liveStatus === "checking" || liveStatus == null);

  // Auto-refresh only when there's something to refresh (demo, or signed-in live).
  const pollSec = liveReady ? state?.autoRefreshSec || 0 : 0;
  useEffect(() => pollWhileVisible(() => invoke("refresh"), pollSec), [pollSec]);

  // Probe for existing keychain/session credentials ONCE each time we enter live
  // mode (covers a fresh switch, a reload into live, and stale persisted errors).
  // A ref guard avoids re-probing on the needs_auth/authed state changes the
  // probe itself produces; it resets when we leave live so re-entry re-probes.
  const liveProbed = useRef(false);
  useEffect(() => {
    if (mode !== "live") {
      liveProbed.current = false;
      return;
    }
    if (liveStatus === "authed" || liveProbed.current) return;
    liveProbed.current = true;
    invoke("connect_live");
  }, [mode, liveStatus]);

  if (!state) return html`<p class="ck-muted">Firing up the pit…</p>`;

  const pit = state.channels.find((c) => c.kind === "pit");
  const meats = state.channels.filter((c) => c.kind === "meat");
  const anyAlarm = state.channels.some((c) => c.alarm === "high" || c.alarm === "low");
  const canRemove = state.mode === "demo";
  const showGate = mode === "live" && liveStatus !== "authed";

  return html`
    <div class="bbq-app">
      <${FireHeader} state=${state} anyAlarm=${anyAlarm} />

      <div class="bbq-statusbar">
        <span class=${`ck-status`}>
          <span class=${`ck-dot ${connected ? "ck-dot-live" : "ck-dot-off"}`}></span>
          ${connected ? "live" : "reconnecting…"}
        </span>
        <span class="ck-caption">
          ${state.mode === "live"
            ? html`ThermoWorks Cloud${state.liveStatus === "authed" && state.liveEmail ? html` · <b>${state.liveEmail}</b>` : ""}`
            : "simulator"}
          ${state.mode === "live" && state.liveStatus === "authed"
            ? html` · <button class="bbq-link sm" onClick=${() => invoke("sign_out")}>sign out</button>`
            : html` · updated ${relativeTime(state.lastRefresh, { fallback: "just now" })}`}
        </span>
      </div>

      <${Controls} state=${state} invoke=${invoke} />

      ${showGate
        ? html`<${SignInCard} state=${state} invoke=${invoke} checking=${liveChecking} />`
        : html`
            ${mode === "live" && (state.liveDevices?.length ?? 0) > 0
              ? html`<${DevicePicker} state=${state} invoke=${invoke} />`
              : null}

            ${state.error
              ? html`<div class=${`ck-callout ${state.mode === "live" ? "ck-error" : ""}`}>
                  <${Icon} name=${state.mode === "live" ? "circle-x" : "info"} size=${16} />
                  <span>${state.error}</span>
                </div>`
              : null}

            <${PitCard} pit=${pit} invoke=${invoke} />

            <div class="bbq-grid-cards">
              ${meats.length
                ? meats.map((c) => html`<${ProbeCard} key=${c.id} ch=${c} units=${state.units} invoke=${invoke} canRemove=${canRemove} />`)
                : html`<div class="ck-empty"><${Icon} name="thermometer" size=${20} />No meat probes yet.</div>`}
            </div>

            <div class="bbq-graph-card">
              <div class="bbq-graph-head">
                <div class="ck-row" style="gap:6px"><${Icon} name="line-chart" size=${16} /><strong>Temperature history</strong></div>
                <div class="bbq-legend">
                  ${state.channels
                    .filter((c) => c.history && c.history.length > 1)
                    .map((c) => html`<span class="bbq-leg" key=${c.id}><span class="bbq-dot" style=${`background:${c.color}`}></span>${c.name}</span>`)}
                </div>
              </div>
              <${TempGraph} channels=${state.channels} startedAt=${state.startedAt} />
              <div class="bbq-graph-foot ck-caption">
                <span><span class="bbq-stall-key"></span> stall zone (${STALL_LO}–${STALL_HI}°)</span>
                <span>dashed line = target · hover for values</span>
              </div>
            </div>

            <${ChatPanel} state=${state} invoke=${invoke} />
          `}
    </div>
  `;
}

mountCanvas({ view: (model) => html`<${App} ...${model} />` });
