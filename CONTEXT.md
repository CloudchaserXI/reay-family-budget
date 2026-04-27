# Reay Family Budget — Project Context

> Created via Claude Cowork mode · Last updated: 27 April 2026  
> Pick this up in VSCode and continue from here.

---

## What This Is

A family budget tracking web app for the Reay family. It started as an Excel workbook (`Budget - Cadet Meadow Project.xlsm`) and is being rebuilt as a proper web app — accessible from any device, phone included.

**Live stack:**
- **Frontend:** Static HTML + React 18 (via ESM CDN — no build step required)
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Vercel (static site)

---

## Current State (27 April 2026)

### What's deployed at reay-family-budget.vercel.app

All Phase 1 features are complete and live. Phase 2 (AI Savings Panel) code is written and deployed, but **the app is currently rendering blank** — the page shows raw `\n` sequences instead of the UI. This is a known issue being actively debugged (see below).

### Known Issue: index.html blank page bug

**Symptom:** The deployed app at reay-family-budget.vercel.app shows `\n\n\n \n \n...` instead of the UI.

**Root cause:** `index.html` has a non-standard format inherited from how it was built — the JavaScript inside `<script type="module">` uses literal `\n` (two-character backslash-n) as line separators instead of actual newlines, and HTML attributes use `\"` (backslash-quote) instead of `"`. Browsers accept this quirk for the original minified code, but the new Privacy and AISavingsPanel components introduced a real newline inside a string literal (`.join('\n')` where `\n` was an actual newline, not the two-char escape) which broke JavaScript parsing.

**Status:** The file has been rebuilt from the clean Vercel base with all new components written to use the same `\n` two-char format. Awaiting deployment verification.

**Recommended fix in VSCode:** Rewrite `index.html` from scratch as a properly formatted file with real newlines and standard HTML — the codebase is small enough for a clean rewrite. See `FEATURES.md` for the full feature spec and the existing `index.html` for all component logic (it's all there, just badly formatted). Alternatively, deploy the current file and check if the rebuild fixed the blank page.

### Files changed since last stable deployment

- `index.html` — Added: Privacy component, AISavingsPanel component, footer Privacy link, privacy router entry, AISavingsPanel in Goals page
- `api/ai-savings.js` — New: Vercel serverless function proxying Anthropic API (keeps key server-side)
- `vercel.json` — Reverted to simple SPA rewrite (API routes take priority automatically in Vercel)
- `manifest.json` — PWA manifest (Maverick, dark navy theme)
- `sw.js` — Service worker (cache-first, Supabase bypassed)
- `icons/` — Five PNG icon sizes (16, 32, 180, 192, 512px) from Top Gun military badge SVG

### Environment variables needed in Vercel

- `ANTHROPIC_API_KEY` — Required for the AI Savings Panel (`/api/ai-savings`). Add in Vercel dashboard → Settings → Environment Variables. Not yet added.

---

## Project Structure

```
Budget Tool/
├── index.html          ← The entire web app (React via CDN, no bundler)
├── vercel.json         ← Vercel SPA routing config
├── package.json        ← Minimal marker (no actual npm deps — CDN only)
├── CONTEXT.md          ← This file
└── Budget - Cadet Meadow Project.xlsm  ← Original Excel file (keep for reference)
```

---

## How the App Works

`index.html` is a single-file React SPA. It uses:

| Library | Version | How loaded |
|---|---|---|
| React + ReactDOM | 18.3.1 | `https://esm.sh/react@18.3.1` via `<script type="importmap">` |
| Supabase JS | 2.45.4 | `https://esm.sh/@supabase/supabase-js@2.45.4` |
| Recharts | 2.12.7 | `https://esm.sh/recharts@2.12.7` |
| Tailwind CSS | CDN | `https://cdn.tailwindcss.com` |

No `npm install`, no build step. Just open or deploy `index.html`.

**Pages:**
- **Dashboard** — KPI cards (income, outgoings, surplus, savings rate), spending donut chart, category bar chart, top items, summary table
- **Budget** — Full budget by category, collapsible sections, click any actual cell to enter spending for a month
- **History** — Month-by-month bar charts + month cards (income vs expenses vs surplus)
- **Goals** — Progress bars, add/update goals, estimated months to completion

---

## Supabase Database

**Project:** Agentsee  
**Project ID:** `pajlrdnhldmixcxbfqis`  
**Region:** eu-west-2  
**URL:** `https://pajlrdnhldmixcxbfqis.supabase.co`  
**Anon key (safe to use client-side):**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhamxyZG5obGRtaXhjeGJmcWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MzUwOTAsImV4cCI6MjA5MTQxMTA5MH0.1PhX8qrOHhWB426EeoXrXi-WQBvg9f5tjJUoJeO8DmQ
```

**Note:** This Supabase project (`Agentsee`) also has unrelated tables from another app (property/real estate). The budget tables are clearly namespaced with `budget_` prefix.

### Tables

#### `budget_categories`
Groups of budget items.
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text | Income, Fixed, Variable, Pets, Savings |
| sort_order | int | Display order |
| color | text | Hex colour for charts |

#### `budget_items`
Individual line items (e.g. Mortgage, Energy, Spotify).
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| category_id | int FK → budget_categories | |
| name | text | Item name |
| budget_amount | numeric(10,2) | Monthly budget |
| sort_order | int | |
| is_active | bool | |

**Current items (seeded from Excel):**
- **Income:** Salary 1 (£4,200), Salary 2 (£4,350), Other Income (£0) → Total: £8,550/mo
- **Fixed (21 items):** Mortgage £2,200, Energy £162, Nursery £1,122, Cars £651, Kitchen £426.42, Council Tax £334, EE £91, Car Parking £90, Water £66, Home Insurance £72.74, Life Insurance £43.75, Happy Tiddlers £53.72, Sport £55, Vet Success £16.50, TV License £15, Pet Insurance £35, Sky Mobile £5, Internet £34, Prime £12, Spotify £20, Tech Pack £15 → Total: ~£5,129/mo
- **Variable (5 items):** Food £600, Travel £600, Petrol £100, Doggy Day Care £100, Cleaner £70 → Total: £1,470/mo
- **Pets (3 items):** Charlie Hair £128.30, Leia Food £100, Leia Groom £32.50 → Total: £260.80/mo
- **Savings (3 items):** Savings Transfer £800, Goals Funding £400, Investments £0 → Total: £1,200/mo

**Grand outgoings budget: ~£8,060/mo | Surplus: ~£490/mo**

#### `budget_months`
One row per month tracked.
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| month_label | text UNIQUE | e.g. "Nov 2025" |
| month_date | date | First day of that month |
| start_date | date | Closest working day to the 25th of prior month (payday proxy) |
| notes | text | Optional |

**Seeded months:** Nov 2025, May 2026

#### `month_actuals`
Actual spend per line item per month.
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| month_id | int FK → budget_months | |
| item_id | int FK → budget_items | |
| actual_amount | numeric(10,2) | |
| UNIQUE | (month_id, item_id) | Upsert safe |

#### `month_budgets`
Per-month budget overrides — allows editing a line item's budget for a specific month without changing the master `budget_items` record.
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| month_id | int FK → budget_months | |
| item_id | int FK → budget_items | |
| budget_amount | numeric(10,2) | Overrides item.budget_amount for that month |
| UNIQUE | (month_id, item_id) | Upsert safe |

#### `month_adhoc_income`
One-off income entries that don't belong to a standard budget line item (bonuses, overtime, etc.).
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| month_id | int FK → budget_months | |
| description | text | e.g. "Quarterly bonus" |
| amount | numeric(10,2) | |
| created_at | timestamptz | |

#### Views

**`budget_monthly_summary`** — per-category totals per month (budget, actual, variance). Primary feed for AI analysis.  
**`budget_monthly_item_detail`** — per-item breakdown per month. Used for granular AI analysis and future auto-categorisation.

Both views use `COALESCE(month_budgets.budget_amount, budget_items.budget_amount)` so they always show the correct effective budget even if no override exists. On month rollover, the closing month's budgets are also frozen into `month_budgets` to prevent drift if master amounts change later.

---

#### `budget_goals`
Savings goals.
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text | e.g. "Family Holiday" |
| target_amount | numeric | |
| current_amount | numeric | |
| target_date | date | Optional |
| emoji | text | e.g. "✈️" |
| is_active | bool | |
| sort_order | int | |

**Seeded goals:** Emergency Fund £10k, Family Holiday £5k (Aug 2026), Home Improvement £8k, New Car £15k

---

## Vercel Deployment

**Team ID:** `team_t8LHg59LvFIQ8Tb4pAC3fJSe`  
**Org slug:** see Vercel dashboard

`vercel.json` is configured for SPA routing (all paths → index.html).

To deploy manually:
```bash
npx vercel --prod
```
Or connect the folder to a Vercel project via the Vercel dashboard (Import from local / GitHub).

---

## Roadmap / What's Next

> Full feature spec in `FEATURES.md` — read that for detail on each item.

### Done ✅
- [x] Excel workbook with VBA archive macro
- [x] Supabase schema + seeded data
- [x] React web app (Dashboard, Budget, History, Goals)
- [x] **Authentication** — Supabase Auth email/password login; UI is gated behind login
- [x] **Month rollover workflow** — "Add month" button copies budgets from previous month automatically
- [x] **Per-month budget overrides** — Inline edit of budget amounts per month (stored in `month_budgets`)
- [x] **Adhoc income** — Add one-off income entries per month (stored in `month_adhoc_income`)

### Phase 1 — Foundation (no external dependencies) ✅
- [x] **Goal Priority Grading** — four-grade system (Must / Should / Could / Nice to have) on goals data model and UI
- [x] **Monthly snapshot storage** — budgets frozen on month rollover; `budget_monthly_summary` and `budget_monthly_item_detail` views created for AI queries
- [x] **PWA configuration** — manifest.json (short_name: Maverick), sw.js (cache-first, Supabase bypassed), badge icon set at 5 sizes, iOS/Android meta tags all wired into index.html
- [x] **Privacy and data retention policies** — UK GDPR in-app policy page, 9 sections, 2-year rolling retention for actuals, footer link

### Phase 2 — AI Savings Suggestion Panel
- [x] **AI Savings Suggestion panel** — Vercel Edge Function proxies Anthropic API (key server-side); `AISavingsPanel` component on Goals page; on-demand generation; structured JSON response with per-goal allocation, headline, and rationale; weighted by priority grade + urgency
- [ ] **Test across scenarios** — tight / average / strong month; validate grade-based prioritisation; requires `ANTHROPIC_API_KEY` env var in Vercel

### Phase 3 — Open Banking
- [ ] **Token storage and 90-day re-consent flow** — scoped and tested
- [ ] **Family access permissions model** — who can see which accounts (especially individual vs. joint)
- [ ] **Open Banking integration** — TrueLayer (recommended for UK); read-only transaction pull
- [ ] **Actual column auto-population** — transactions mapped to categories; user review + confirm before month locked
- [ ] **Tighten RLS** — per-user row-level security policies once Open Banking data is live

### Phase 4 — AI Categorisation and Monthly Review
- [ ] **AI transaction categorisation** — merchant names → budget categories via Anthropic API; high-confidence auto-applied, lower-confidence flagged; corrections stored
- [ ] **AI Monthly Review** — triggered at month-close; structured plain-English review covering month summary, goal progress, spending habits, trends, and next-month focus; dismissible but persistent

### Nice to Have
- [ ] Export month to PDF/Excel
- [ ] Dark mode
- [ ] Multi-currency support (for South Africa travel spend)
- [ ] Shared view link (read-only) for partner
- [ ] "Re-categorise this month" button for manual transaction corrections

---

## How to Develop Locally

Since there's no build step:

```bash
# Option 1: Python simple server
cd "Budget Tool"
python -m http.server 3000
# Open http://localhost:3000

# Option 2: Node http-server
npx http-server . -p 3000 -o

# Option 3: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

The app reads/writes directly to the live Supabase database. For a dev/prod split, create a second Supabase project and swap the URL/key.

---

## Excel File Reference

The original `Budget - Cadet Meadow Project.xlsm` contains:
- **Dashboard sheet** — Charts, KPIs, month selector dropdown, quick navigation links
- **Budget sheet** — Monthly budget with conditional formatting
- **History sheet** — Month-by-month archive columns (one column pair per month)
- **Goals sheet** — Savings goals tracker
- **Investments sheet** — Investment portfolio tracker
- **MonthList sheet** (hidden) — Feeds month selector dropdown
- **VBA macro** — `ArchiveCurrentMonth` — copies current month actuals into a new History column

The Excel file lives at:  
`E:\Vaab Coding\Budget Tool\Budget - Cadet Meadow Project.xlsx`

---

## Key Decisions Made

1. **No build step** — CDN-only React means the app is a single HTML file. Easy to edit, deploy anywhere, no Node.js toolchain needed. When the app grows, migrate to Vite + npm.
2. **Supabase over local storage** — Data persists and syncs across devices (phone + desktop).
3. **RLS is open** — Row Level Security is enabled but policies allow public read/write. Once auth is added, tighten policies to `auth.uid() = user_id`.
4. **Budget amounts on items, actuals on months** — Clean separation: budget_items hold the "plan", month_actuals hold reality. Variance = budget − actual.
