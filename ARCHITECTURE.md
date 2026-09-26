# Architecture — Tiered-Memory Fitness Coach (Hack Day, Sept 2026)

> **This file is the source of truth for the build.** It is written for a *demo*, not production.
> If a decision here makes the demo less impressive, change the decision — then update this file.

---

## 1. Goal

Build a one-page web app that demos, live and in about 3 minutes, **an AI fitness coach whose memory works like a good human coach's**:

- 🔒 **Core facts** (allergies, conditions, medications) — never forgotten, always respected.
- 🎯 **Goals** (half-marathon in November) — kept until done.
- 🌊 **Moments** (sore knee, flu, deadline week) — fade on their own; before forgetting anything that affects training, the coach **checks in first**.

It uses the user's **real Google Health data** (Fitbit / Pixel Watch) and **Gemini** for both LLMs.

**One-liner:** *"A coach that remembers what matters, forgets what doesn't, and asks before it lets go."*

### Why it stands out (for the pitch)
1. **It forgets on purpose.** Other coaches pile up memories forever. Ours lets temporary context expire, so advice stays current.
2. **It sends the first message.** Before a high-stakes memory expires, the coach asks "How's the knee?"
3. **It shows its reasoning.** Chips under every answer show which memories and which data shaped it.

---

## 2. Demo script (everything we build serves this)

| # | Beat | Presenter does | Audience sees |
|---|---|---|---|
| 1 | Hook (20s) | Says the problem line | — |
| 2 | Memory builds live (45s) | Types: *"Training for a half-marathon in November. I'm allergic to peanuts. Knee's been sore since Sunday's long run, and I slept terribly last night."* | 4 cards animate onto the board, each in the right tier with a lifespan ring: 🔒 peanut allergy · 🎯 half-marathon Nov · 🌊 sore knee · 🌊 bad sleep |
| 3 | Advice that respects memory (45s) | *"What should I do today, and what should I eat after?"* | Upper-body/easy day instead of a run, a snack without peanuts. Chips: `🔒 peanut allergy` `🌊 sore knee` `🎯 half-marathon` `📊 today` |
| 4 | Context zooms out (30s) | *"How's my sleep been lately?"* | Trace shows `fetching sleep · last 7 days…`, answer with real numbers + a mini chart |
| 5 | Fast-forward (45s) | Clicks **⏩ +7 days** | Bad-sleep card fades away. Knee card pulses amber, **coach messages first**: *"How's the knee?"* Presenter types *"All good now"* → knee card gets ✓ and slides to history. 🔒 and 🎯 cards don't move. |
| 6 | Close (10s) | Says the one-liner | — |

**Real vs. staged**

| Real (live) | Staged (fine for a demo) |
|---|---|
| Gemini extracts and sorts the memories | Data comes from one sync done before the demo |
| Gemini coach answers, calls tools, gets chips | "+7 days" only moves a simulated clock for memories |
| Tool calls read real Google Health data | Memory lifespans come from a fixed table in code |
| Check-in message and handling the reply | A **Reset** button restores the starting state |

---

## 3. Scope

**In:** one page, one hardcoded user, chat + memory board + fast-forward + check-ins, Google Health sync via a stored token, Gemini coach with 2 tools, sample-data fallback.

**Out (don't build):** login/auth, multiple users, deployment, security hardening, retries/error handling beyond the demo path, mobile layout, notifications, claim-vs-data verification (explicitly rejected).

**Stretch (only if ahead of schedule), in priority order:**
1. "Without memory" toggle: same question answered by Gemini with no context, shown side by side (a strong cold open, cheap to build).
2. Pin/unpin a card to promote it to 🔒 Core.
3. History drawer for resolved memories.

---

## 4. Architecture overview

```
┌──────────────────────────── Web app (Next.js, one page) ────────────────────────────┐
│  Chat + answer chips + tool trace + mini charts  │  Memory board: 🔒 Core · 🎯 Goals · 🌊 Moments │
│  Top bar: data-source badge · [Sync] · sim date · [⏩ +7 days] · [Reset]                        │
└──────────────┬─────────────────────────────┬───────────────────────────┬──────────────────────┘
               │ POST /api/chat (SSE stream)  │ GET /api/state             │ POST /api/clock | /api/sync | /api/reset
               ▼                             ▼                           ▼
┌──────────────────────────────── Next.js API routes ──────────────────────────────────┐
│                                                                                       │
│  ① Coach  (gemini-3.8-flash, thinking: low)      ② Memory builder (gemini-3.8-flash)   │
│     system prompt = Core + Goals + live Moments      runs IN PARALLEL on each message     │
│       + pending check-ins + today's stats            in:  message + existing memories     │
│     tools: get_day, get_range  ──► ⑤ DB              out: JSON actions (structured output)│
│     tags used memories as [[m12]] → chips                  create / refresh / resolve     │
│                                                           │                             │
│  ③ Memory engine (plain TS, no LLM)  ◄────────────────────┘                             │
│     category → lifespan table, strength, states, tick(simNow)                           │
│     Active → Fading → Check-in → Resolved ✓ / Faded                                     │
│     triggers ⑥ check-in message (small Gemini call)                                     │
│                                                                                       │
│  ④ Google Health sync: refresh token from .env → last 30 days → daily_stats            │
└──────────────────────────────────────┬────────────────────────────────────────────────┘
                                       ▼
                ⑤ SQLite (data/app.db): daily_stats · memories · messages · app_state
                                       ▲
                     Google Health API v4 (health.googleapis.com)
```

---

## 5. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | Frontend and API in one repo, run locally |
| Styling | **Tailwind CSS** | |
| Animation | **motion** (Framer Motion) | Cards entering, fading, pulsing, sliding to history |
| Charts | **Recharts** | Mini sparkline under data answers |
| DB | **SQLite via better-sqlite3** | Single file `data/app.db`, synchronous, zero setup |
| LLM | **Gemini API via `@google/genai`** | Both roles on `gemini-3.8-flash`; swap via `.env` |
| Health data | **Google Health API v4** | REST + Google OAuth refresh token |
| Runtime | Presenter's laptop, `npm run dev` or `npm run build && npm start` | No deployment |

**Model choice:** `gemini-3.8-flash` (GA Sept 2, 2026) for both roles. It is newer than the latest Pro (`gemini-3.1-pro`, Feb 2026) and much faster, and speed matters on stage. The memory builder uses Flash, not Flash-Lite, because putting a memory in the wrong tier is the worst demo failure. If a coach answer feels weak in rehearsal, try `COACH_MODEL=gemini-3.1-pro`.

---

## 6. Project structure

```
/app
  page.tsx                  # the one page
  api/chat/route.ts         # SSE: runs coach + memory builder in parallel, streams events
  api/state/route.ts        # GET: memories, messages, sim date, data source, last sync
  api/clock/route.ts        # POST {days}: advance sim clock, tick engine, maybe check-in
  api/sync/route.ts         # POST: pull Google Health → daily_stats
  api/reset/route.ts        # POST: clear memories/messages, sim offset = 0
/components
  TopBar.tsx  Chat.tsx  MessageBubble.tsx  MemoryChips.tsx  ToolTrace.tsx  MiniChart.tsx
  MemoryBoard.tsx  MemoryCard.tsx  LifespanRing.tsx
/lib
  db.ts                     # better-sqlite3 connection + schema bootstrap
  clock.ts                  # simNow() = real now + sim_offset_days
  gemini.ts                 # client + model names from env
  coach.ts                  # system-prompt builder + streaming tool loop
  tools.ts                  # get_day, get_range (read daily_stats)
  memoryBuilder.ts          # extractor call + applyActions()
  memoryEngine.ts           # CATEGORY table, strength(), tick()
  checkin.ts                # generate check-in text
  googleHealth.ts           # token refresh, fetchers, mapping to daily_stats
/scripts
  google-auth.ts            # one-time OAuth → prints refresh token
  seed-sample.ts            # generates 30 days of sample data (fallback)
  gh-dump.ts                # dumps raw Google Health responses to /data/raw for mapping
/data                       # app.db, raw/ (gitignored)
.env.local
```

---

## 7. Data model (SQLite)

```sql
CREATE TABLE IF NOT EXISTS daily_stats (
  date          TEXT PRIMARY KEY,   -- YYYY-MM-DD, local time; sleep is attributed to the WAKE date
  sleep_min     INTEGER,
  deep_min      INTEGER,
  rem_min       INTEGER,
  sleep_start   TEXT,               -- ISO
  sleep_end     TEXT,               -- ISO
  steps         INTEGER,
  resting_hr    REAL,
  hrv_ms        REAL,
  workouts_json TEXT,               -- [{type, start, duration_min, distance_km, avg_hr}]
  source        TEXT                -- 'google_health' | 'sample'
);

CREATE TABLE IF NOT EXISTS memories (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tier              TEXT NOT NULL,          -- 'core' | 'goal' | 'moment'
  category          TEXT,                   -- moments only, see §8.5
  text              TEXT NOT NULL,          -- short label, e.g. "Sore knee since Sunday's long run"
  status            TEXT NOT NULL,          -- 'active' | 'fading' | 'checkin' | 'resolved' | 'faded'
  created_at        TEXT NOT NULL,          -- SIM time
  refreshed_at      TEXT NOT NULL,          -- SIM time
  ttl_days          REAL,                   -- moments only
  expires_at        TEXT,                   -- moments only, SIM time
  end_date          TEXT,                   -- explicit end given by user (trips etc.)
  needs_checkin     INTEGER DEFAULT 0,
  checkin_sent_at   TEXT,
  pinned            INTEGER DEFAULT 0,      -- stretch
  source_message_id INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  role            TEXT NOT NULL,            -- 'user' | 'coach'
  kind            TEXT DEFAULT 'chat',      -- 'chat' | 'checkin'
  text            TEXT NOT NULL,            -- stored with [[m12]] tags; UI strips them
  used_memory_ids TEXT,                     -- JSON array
  tool_calls_json TEXT,                     -- JSON array of {name, args, rows}
  created_at      TEXT NOT NULL             -- SIM time
);

CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);
-- keys: sim_offset_days ("0"), user_name, data_source ('google_health'|'sample'), last_sync_at
```

**Time rules (important):**
- **Memories and messages use sim time**: `simNow() = realNow + sim_offset_days`.
- **Health data uses real dates.** "Today" for the coach is the **latest date in `daily_stats`**. The fast-forward never invents health data.

---

## 8. Components

### 8.1 Google Health sync (④)

**One-time setup (by the person whose watch we use):**
1. Google Cloud project → enable **Google Health API** → OAuth consent screen in **Testing** mode → add their Google account as a **test user**.
2. Create an OAuth client (Desktop app) → put ID/secret in `.env.local`.
3. Run `npx tsx scripts/google-auth.ts`: local loopback OAuth with PKCE, prints a **refresh token** → paste into `.env.local` as `GOOGLE_REFRESH_TOKEN`.
   - Alternative: Google's open-source `ghealth` CLI does this setup; copy the token it stores under `~/.config/ghealth/`.
   - Scopes: `https://www.googleapis.com/auth/googlehealth.sleep.readonly`, `…/googlehealth.activity_and_fitness.readonly`, `…/googlehealth.health_metrics_and_measurements.readonly`.
   - Do **not** pass `include_granted_scopes=true` (it can mix legacy scopes into the token, which the API rejects).

**Sync (`POST /api/sync`):** exchange refresh token → access token, fetch the last 30 days, map to one `daily_stats` row per date, `source='google_health'`.

Base: `GET https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints`

| Field | Data type | Kind | Method | Mapping |
|---|---|---|---|---|
| `sleep_min`, `deep_min`, `rem_min`, start/end | `sleep` | session | list, filter `sleep.interval.end_time >= "<30d ago>"` | Sum main sleep session(s) by wake date; stages if present |
| `steps` | `steps` | interval | **dailyRollUp** | One value per day |
| `resting_hr` | `daily-resting-heart-rate` | daily | list, filter `daily_resting_heart_rate.date >= …` | Direct |
| `hrv_ms` | `heart-rate-variability` (or a daily HRV type if exposed) | sample | list | Average per night/day |
| `workouts_json` | `exercise` | session | list, filter on `interval.end_time` | type, start, duration, distance, avg HR |

⚠️ Exact filter field spellings and response shapes **must be confirmed** in the first-hour spike: run `scripts/gh-dump.ts` to save raw responses to `data/raw/*.json`, then write the mappers against those. Use daily data only. Intraday heart rate is ~8,700 points/day and not needed.

### 8.2 Sample data fallback

`npx tsx scripts/seed-sample.ts` writes 30 days to `daily_stats` with `source='sample'`, telling the demo story:
- Normal baseline: ~7h sleep, HRV ~60 ms, resting HR ~54, 8–10k steps, runs 3×/week.
- A **long run (~18 km) on the most recent Sunday**, a **bad last night** (~4h50, low deep sleep), and an **HRV dip today (~14% under baseline)**.
- A slight downward sleep trend over the last 7 days (so beat 4 has something to say).

Build this **first**. It unblocks everyone while OAuth is being set up, and it's the backup on demo day. The top bar shows a badge `📡 Google Health · Pixel Watch` or `🧪 Sample data`.

### 8.3 Coach (①)

**Model:** `COACH_MODEL` (default `gemini-3.8-flash`), thinking level **low**, streaming, function calling.

**Each turn we rebuild the full input.** Don't rely on server-side conversation state, because memories change between turns. Input = system instruction (below) + the last **12** messages + the new user message.

**System instruction template:**
```
You are {user_name}'s personal fitness coach. Be warm, direct, and brief: 2–5 sentences, optional short bullet list.

HARD RULES
- Never suggest anything that conflicts with a CORE fact (e.g. allergens, conditions, medications).
- Only quote numbers that appear in TODAY'S DATA or in tool results. If you need more history, call a tool.
- When your answer relies on a memory, tag it inline like [[m12]]. When it relies on today's data, tag [[today]].
- Not medical advice; suggest a professional for anything beyond fitness.

CORE (never forget)
[m3] Allergic to peanuts
GOALS
[m1] Half-marathon in November
MOMENTS (temporary; days left in brackets)
[m4] Sore knee since Sunday's long run (6 days left)
PENDING CHECK-INS (you asked about these; interpret the user's reply)
[m4] Sore knee …

TODAY'S DATA ({latest_date})
sleep 4h50 (deep 38m) · HRV 52 ms (7-day avg 60) · resting HR 57 · steps 3,100 · last workout: run 18.2 km, Sun
```

**Tools** (both read `daily_stats` only):

| Tool | Params | Returns |
|---|---|---|
| `get_day` | `date: "YYYY-MM-DD"` | That day's row |
| `get_range` | `metrics: ("sleep"|"deep_sleep"|"hrv"|"resting_hr"|"steps"|"workouts")[]`, `days: 7|14|30` | Daily rows + average + min/max per metric |

**Tool loop:** stream → on function-call step: run the tool, emit a `tool` SSE event (with rows, for the trace + mini chart), send the function result back → continue streaming. Max 3 tool rounds.

**Chips:** the client strips `[[m12]]` / `[[today]]` from displayed text and renders chips:
- `[[mN]]` → memory chip with tier icon and days left (`🌊 sore knee · 6d left`)
- `[[today]]` → `📊 today`
- each tool call → `📊 sleep · last 7 days`

Note: memories created *in the same turn* can't be tagged (they don't have IDs yet). That's fine, because the user's own message already holds the fact.

**SDK:** use `@google/genai`. The current docs show the **Interactions API** (`client.interactions.create({ model, input, tools, stream, response_format, previous_interaction_id })`, function calls come back as `function_call` steps, results are sent as `function_result`, and the SDK handles Gemini 3 thought signatures automatically). ⚠️ The field names for **system instruction** and **thinking level** weren't in the examples. Confirm them in the first-hour spike. If the Interactions API causes friction, `ai.models.generateContentStream` is an acceptable fallback.

### 8.4 Memory builder (②)

**Model:** `MEMORY_MODEL` (default `gemini-3.8-flash`), **structured JSON output**, not streamed. It runs **in parallel** with the coach on every user message.

**Input:** current sim date · all non-faded memories `(id, tier, category, text, status)` · pending check-ins · the coach's previous message (so it can read a reply to a check-in) · the new user message.

**Output schema:**
```json
{
  "actions": [
    { "op": "create",  "tier": "core|goal|moment", "category": "injury|illness|travel|stress|poor_sleep|fatigue|other|null",
      "text": "short label, <= 8 words", "end_date": "YYYY-MM-DD|null" },
    { "op": "refresh", "memory_id": 4 },
    { "op": "resolve", "memory_id": 4 },
    { "op": "update",  "memory_id": 4, "text": "new label" }
  ]
}
```

**Prompt rules (summary):**
- **core** = stable facts that must never be violated or forgotten: allergies, chronic conditions, medications, dietary rules, permanent injuries/surgeries.
- **goal** = something the user is working toward, with or without a date.
- **moment** = a temporary state; pick the closest `category`. Set `end_date` only if the user states an end.
- A mention of an existing memory → `refresh` (don't create a duplicate). "Better now / gone / done" → `resolve`.
- A reply to a pending check-in: still true → `refresh`; better → `resolve`.
- Trivial chit-chat → `{"actions": []}`.
- Include 6–8 few-shot examples in the prompt, **including the exact demo-script sentences**, so the demo classification is locked in.

`applyActions()` in `memoryBuilder.ts` writes to the DB via the engine (which sets lifespans), then the route emits one `memory` SSE event per change.

### 8.5 Memory engine (③)

Plain TypeScript. **The LLM picks the category; code decides the lifespan.** This keeps the demo deterministic.

| Category | Lifespan | Check-in before fading? |
|---|---|---|
| `injury` | 7 days | ✅ yes |
| `illness` | 7 days | ✅ yes |
| `travel` | until `end_date`, else 5 days | no |
| `stress` | 5 days | no |
| `poor_sleep` | 2 days | no |
| `fatigue` | 2 days | no |
| `other` | 3 days | no |

- **create (moment):** `ttl_days` from the table; `expires_at = end_date ?? simNow + ttl_days`; `needs_checkin` from the table.
- **refresh:** `ttl_days = min(ttl_days × 1.5, 21)`, `refreshed_at = simNow`, `expires_at = simNow + ttl_days`, `status='active'`, clear `checkin_sent_at`. (The ring refills and the lifespan grows.)
- **resolve:** `status='resolved'` (card gets ✓ and moves to history).
- **strength** = `clamp((expires_at − simNow) / ttl_days, 0, 1)` → drives the ring. Core and goals are always 1.

**`tick(simNow)`** runs on every `/api/state`, `/api/clock`, and before each chat turn:

| Memory | Condition | New status |
|---|---|---|
| moment, no check-in | strength > 0.3 | `active` |
| | 0 < strength ≤ 0.3 | `fading` (dimmed) |
| | strength = 0 | `faded` (animates off the board, kept in DB) |
| moment, check-in | strength > 0.3 | `active` |
| | strength ≤ 0.3 **or expired**, no check-in sent yet | `checkin` → generate **one** check-in message covering all such memories |
| | `checkin` for > 3 sim days with no answer | `faded` |
| goal / core | always | `active` |

With the demo script, **+7 days** gives: bad sleep (2d) → faded; knee (injury, 7d) → check-in; goal + core → unchanged. ✅

### 8.6 Check-in (⑥)

When `tick` moves memories to `checkin`, `checkin.ts` makes a small Gemini call: *"Write one friendly 1–2 sentence check-in for {user_name} asking whether these still apply: {texts}. Offer to stop planning around them if not."* It saves a `messages` row with `role='coach'`, `kind='checkin'` and sets `checkin_sent_at`. If the call fails, fall back to the template `"Hey {name}, how's the {text}? Should I keep planning around it?"`. The user's reply is a normal chat turn, and the memory builder resolves or refreshes the memory.

### 8.7 API routes

| Route | Does | Returns |
|---|---|---|
| `GET /api/state` | `tick()`, then read everything | `{ simDate, userName, dataSource, lastSyncAt, memories[], history[], messages[] }` |
| `POST /api/chat` `{text}` | Save user message → `tick()` → run **coach and memory builder in parallel** | **SSE stream** of events (below) |
| `POST /api/clock` `{days: 7}` | `sim_offset_days += days` → `tick()` → maybe a check-in | `{ simDate, memories[], newMessages[] }` |
| `POST /api/sync` | Google Health → `daily_stats` | `{ days, source, lastSyncAt }` |
| `POST /api/reset` | Delete memories + messages, `sim_offset_days = 0` (keeps `daily_stats`) | `{ ok }` |

**SSE events from `/api/chat`** (in whatever order they happen):
```
{ "type": "memory", "op": "create|refresh|resolve|update", "memory": {…} }
{ "type": "tool",   "name": "get_range", "label": "sleep · last 7 days", "rows": [...] }
{ "type": "text",   "delta": "..." }
{ "type": "done",   "messageId": 42, "usedMemoryIds": [3,4], "toolCalls": [...] }
```

### 8.8 UI

One page, two columns (~60/40), desktop only.

- **Top bar:** app name · data badge (`📡 Google Health · Pixel Watch` / `🧪 Sample data`) · `Synced 2 min ago` + **Sync** · **sim date** (`Fri, Oct 3` highlighted when fast-forwarded) · **⏩ +7 days** · **Reset**.
- **Chat (left):** bubbles; while streaming, a **tool trace** line (`🔎 fetching sleep · last 7 days…`); under coach replies, **chips** plus a **mini chart** when `get_range` ran. Check-in messages get a subtle `💬 check-in` label so it's clear the coach started the conversation.
- **Memory board (right):** three stacked sections: 🔒 Core · 🎯 Goals · 🌊 Moments. Each card shows icon, label, and a **lifespan ring** (full for Core/Goals, draining for Moments) plus `Nd left`.
  - Enter: scale + fade in, with a brief glow ("just learned").
  - Fading: 50% opacity, ring amber.
  - Check-in: amber **pulse**.
  - Resolved: ✓, then slides into a collapsed "History" row.
  - Faded: shrink + fade out.
  - Refresh: ring animates back to full.
- On **+7 days**: animate the sim date changing, then apply memory transitions staggered ~150ms apart so the audience can follow each one.

---

## 9. Key flows

**Chat turn**
1. Client `POST /api/chat` → server saves user message (sim time) → `tick()`.
2. In parallel: **memory builder** (→ `applyActions` → `memory` events) and **coach** (→ `tool` events → `text` deltas).
3. Coach finishes → save message with `used_memory_ids` + `tool_calls_json` → `done`.
4. Client strips tags, renders chips + chart; board has already updated from `memory` events.

**Fast-forward**
1. Client `POST /api/clock {days:7}` → offset += 7 → `tick()` → faded/fading/check-in transitions → check-in message created.
2. Client animates board transitions, then shows the check-in bubble ~1s later (so the coach looks like it's typing).

**Check-in reply**
The user replies "All good now" → normal chat turn → memory builder returns `resolve m4` → card ✓ → history. The coach replies with something like "Great, back to the normal plan."

**Reset**
`POST /api/reset` → empty board, empty chat, sim date = today. Health data kept.

---

## 10. Environment (`.env.local`)

```
GEMINI_API_KEY=
COACH_MODEL=gemini-3.8-flash
MEMORY_MODEL=gemini-3.8-flash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
USER_NAME=Alex
TZ=America/New_York
```

---

## 11. Build plan

**Hour 0–1: spikes + skeleton (in parallel)**
- S1: Next.js + Tailwind scaffold, `db.ts` schema, `seed-sample.ts`, `/api/state`, static page layout.
- S2: Gemini spike: one streaming call with one tool round trip and one structured-output call. Confirm the system-instruction and thinking-level field names. Write findings into §8.3.
- S3: Google Health spike: OAuth setup, `google-auth.ts`, `gh-dump.ts` → raw JSON in `data/raw/`.

**Milestones**
| M | Done when | Owner stream |
|---|---|---|
| M1 | Chat streams a coach answer that uses `get_range` on sample data; trace + chips render | A |
| M2 | Demo sentence 2 produces the 4 correct cards on the board, live | B + C |
| M3 | ⏩ +7 days produces fade + check-in + resolve exactly as in the script | B + C |
| M4 | Sync fills `daily_stats` with real Google Health data; badge switches | D |
| M5 | Polish animations, mini chart, reset; full rehearsal ×3; record backup video | all |

**Workstreams** (merge streams if the team is smaller):
- **A: Coach:** `gemini.ts`, `coach.ts`, `tools.ts`, `/api/chat` streaming.
- **B: Memory:** `memoryBuilder.ts` (prompt + few-shots), `memoryEngine.ts`, `checkin.ts`, `/api/clock`, `/api/reset`.
- **C: UI:** page, board, cards, rings, chips, trace, chart, animations.
- **D: Data + demo:** Google Health OAuth/sync, sample data, demo script adapted to real data, rehearsal, backup recording.

**Cut list if behind (cut from the top):** stretch features → mini chart → history drawer (just remove resolved cards) → Google Health (run on sample data, show the "Synced" badge only if real).

---

## 12. Gaps found and how this doc resolves them

| # | Gap | Resolution |
|---|---|---|
| 1 | Team size / hours unknown | Plan split into 4 workstreams + milestones + cut list; merge streams for smaller teams |
| 2 | Unknown whose watch/data we use | Sample data is first-class and built first; badge shows the source |
| 3 | **Script vs. real data mismatch** (script says "Sunday's long run", "slept terribly"; real data may disagree) | Morning of demo: sync, look at the real last 7 days, **rewrite script lines to match reality**; or switch to sample data |
| 4 | What "today" means after fast-forward | Health "today" = latest synced date; sim clock only ages memories |
| 5 | LLM might pick a lifespan that breaks the +7-day beat | LLM picks a category; code owns lifespans (§8.5) |
| 6 | Check-in must fire before a high-stakes memory vanishes | Check-in triggers at ≤30% strength *or* expiry; the memory can't fade until answered or 3 days pass |
| 7 | Duplicate memories on repeated mentions | Builder sees existing memories; must `refresh`, not `create` |
| 8 | How chips know what was used | Coach tags `[[mN]]` / `[[today]]`; tool calls add data chips |
| 9 | Memories from the same turn can't be cited | Accepted; the user's own words cover it |
| 10 | Board updates while the coach streams | Both run in one request; memory events share the SSE stream (no polling) |
| 11 | Demo classification might vary | Exact demo sentences are few-shot examples in the builder prompt |
| 12 | Gemini SDK field names (system instruction, thinking level) not confirmed | Hour-0 spike S2 |
| 13 | Google Health filter names / response shapes not confirmed | Hour-0 spike S3, map against saved raw JSON |
| 14 | Medical-safety framing | One line in the coach prompt; not diagnostic |
| 15 | Cold-open "generic bot" comparison dropped from the script | Stretch #1: "Without memory" toggle |

---

## 13. Demo-day checklist

- [ ] Sync Google Health that morning; check the badge and the last 7 days look sensible.
- [ ] Adapt script lines to the real data (gap #3); do 3 full rehearsals with **Reset** between them.
- [ ] Record a clean backup video of the full run.
- [ ] Check the Gemini API key's quota; have a second key in `.env.local` ready.
- [ ] Laptop: stop it sleeping, notifications off, browser zoom ~125%, close other tabs.
- [ ] Click **Reset** right before going on stage.

---

## References
- Gemini 3.8 Flash: https://ai.google.dev/gemini-api/docs/latest-model
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Gemini structured output (Interactions API): https://ai.google.dev/gemini-api/docs/interactions/structured-output
- Google Health API data types: https://developers.google.com/health/data-types
- Google Health API REST reference: https://developers.google.com/health/reference/rest
- Google Health API developer walkthrough (Terra): https://tryterra.co/blog/everything-you-need-to-know-about-google-health-new-api
