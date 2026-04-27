# Family Budget Tool — Feature Development Briefing

**From:** Jarryd  
**Date:** 26 April 2026  
**Re:** AI-Powered Savings Suggestions + Open Banking Integration

---

## Overview

This briefing covers two connected feature additions to the family budget tool, both building on the existing goals section. The intent is to make the tool progressively smarter over time — starting as a simple calculator and growing into something that gives genuinely useful, personalised financial guidance.

---

## Feature 1: AI-Powered Savings Suggestion Panel

### What it does

At the start of each month, after income and fixed outgoings are entered, the tool currently surfaces a disposable income figure. The new feature would add a **Suggested Savings panel** beneath this, which:

- Calculates the minimum monthly contribution required per goal to hit each target on time (based on goal amount, deadline, and amount already saved)
- Splits remaining disposable income across goals proportionally, weighted by urgency and size
- Recommends a discretionary spending buffer alongside the goal allocations
- Displays a short plain-English explanation of the reasoning — not just numbers

### How it gets smarter over time

The suggestion improves month-on-month as real spending data accumulates:

| Month | Intelligence level |
|---|---|
| Month 1 | Suggestions based on goals and estimates only |
| Months 2–3 | Real spending fed back in; patterns begin to emerge |
| Month 4+ | Model identifies consistent over/underspend categories and adjusts proactively |

By month 4–5, the panel might surface something like: *"You've underspent on eating out three months running — I've redirected £60 from that buffer toward your holiday fund."*

### How AI is plugged in

This is a web-based tool, so the **Anthropic API** can be called directly from the browser — no complex infrastructure needed. Each month at budget-setting time, the tool sends a structured payload containing:

- Current month income and fixed outgoings
- Each goal: name, target amount, deadline, and amount saved to date
- Historical spending by category (prior months)
- Previous months' suggested vs. actual savings figures

The API returns a structured JSON response with goal allocations, a recommended savings total, a discretionary buffer figure, and a plain-English rationale. The UI renders this as a clean, readable panel.

The key technical requirement is **storing monthly snapshots** — budgeted vs. actual per category, per month. The AI reads this history on each call. No machine learning infrastructure is required on our side.

---

## Feature 2: Open Banking Integration (Auto-populate Actual Spending)

### What it does

Rather than users manually entering what they actually spent each month, an Open Banking connection would **automatically populate the "Actual" column** by pulling real transaction data from the user's bank(s).

### How it works (UK context)

Open Banking is well-established in the UK under the FCA framework. The integration flow would be:

1. **User connects their bank** — a one-time authorisation via a regulated Open Banking provider (e.g. TrueLayer, Plaid, or Yapily). The user authenticates directly with their bank; we never see their credentials
2. **Transactions are pulled** — at the end of each month (or on demand), the tool fetches categorised transaction data for the period
3. **Actual column is populated** — transaction totals map to the budget categories and fill the Actual column automatically
4. **User reviews and confirms** — a lightweight review step lets the user override any figures before the month is locked

### Provider options

| Provider | Notes |
|---|---|
| TrueLayer | Strong UK coverage, good developer experience |
| Plaid | Broader international coverage if needed later |
| Yapily | Strong for multi-bank aggregation |

All three operate under Open Banking / PSD2 and handle FCA compliance on our behalf.

### Security and privacy considerations

**What makes it safe by design**

- The family never enters banking credentials into the tool. Authentication happens directly with their bank via the provider — the tool only ever receives a time-limited access token
- Access is strictly read-only. No provider can move money, initiate payments, or modify anything. The worst-case exposure is transaction history, not funds
- TrueLayer, Plaid, and Yapily are all FCA-regulated and carry their own security infrastructure, encryption standards, and compliance obligations — we are consumers of their secure API, not builders of one

**Where care is needed on our side**

- **Data storage and encryption** — the tool will accumulate months of personal spending data. Must be encrypted at rest and in transit, and covered by a clear, plain-English privacy policy under UK GDPR
- **Token expiry handling** — Open Banking consent tokens typically expire after 90 days. The tool must handle re-consent gracefully (prompting the user in good time) rather than silently failing
- **Minimum data scope** — only request transaction and balance read permissions. Do not request account management permissions even if the provider makes them available
- **Family access model** — if multiple family members access the tool, define clearly who can see which accounts, particularly where accounts are held individually rather than jointly

**Required before go-live**

- Privacy policy drafted and in place
- Data retention policy defined (how long is transaction history kept, and can the user delete it)
- Token storage and expiry approach scoped and tested
- Family access permissions model agreed

---

## Feature 3: AI-Assisted Transaction Categorisation

### What it does

Raw bank transactions (e.g. *"AMZN MKTP GB"*, *"TFL TRAVEL"*, *"JUST EAT"*) need to map to budget categories (Groceries, Transport, Eating Out, etc.). The AI layer handles this automatically.

### How it works

Each transaction description is passed to the Anthropic API with the user's list of budget categories. The model returns a suggested category with a confidence score:

- **High confidence matches** (e.g. TFL → Transport) are applied automatically
- **Lower confidence matches** are flagged for user confirmation with a suggested category pre-selected
- **Unknown merchants** prompt a one-time user decision, which is then remembered for future months

### Example

| Raw transaction | AI suggested category | Confidence |
|---|---|---|
| AMZN MKTP GB | Shopping | High — auto-applied |
| COSTA COFFEE | Eating Out | High — auto-applied |
| DD VGYHJ2291 | Unknown | Low — user prompted |
| BUPA MEDICAL | Healthcare | Medium — pre-selected for confirmation |

---

## Feature 4: Goal Priority Grading

### What it does

Not all goals carry equal weight. The tool should allow each goal to be assigned a **priority grade**, which the AI savings suggestion engine uses to intelligently allocate funds.

### Suggested grading structure

| Grade | Label | Meaning |
|---|---|---|
| 1 | Must | Non-negotiable. Always funded first, even in tight months |
| 2 | Should | Important but can absorb a small shortfall temporarily |
| 3 | Could | Funded only when surplus allows; paused if money is tight |
| 4 | Nice to have | Aspirational — only receives allocation in strong months |

### How the AI factors this in

- **Strong months** (disposable income above average): all grades receive allocation, including Grade 4
- **Average months**: Grades 1 and 2 fully funded; Grades 3 and 4 receive a reduced or token allocation
- **Tight months** (e.g. high utility bills): Grade 1 goals protected in full; Grades 2–4 scaled back proportionally

The plain-English rationale surfaces this clearly — e.g. *"This is a tighter month, so I've paused your city break fund for now and protected your emergency fund and car savings in full."*

The engine also factors in cumulative progress: a Grade 2 goal significantly behind schedule may be temporarily elevated; a Grade 1 goal ahead of schedule can have its contribution slightly reduced to free allocation elsewhere. This rebalancing is shown transparently.

### User experience

- Grades set per goal at creation, editable at any time
- Visual indicator (colour coding or label) shows each goal's grade
- Suggestion panel groups goals by grade so the user can see what is being protected and what is being flexed

---

## Feature 5: AI Monthly Review — Triggered at Month Close

### The trigger point

The existing "Move to Next Month" button closes off the previous month and carries the budget forward. This is the ideal moment for an AI-generated monthly review — the data set is complete, Open Banking has populated actuals, and the user is already in a reflective, forward-looking mindset.

The review appears **as part of the month-close flow** — a modal or panel that opens before the new month begins.

### What the review covers

**1. Month in numbers** — headline snapshot: total income, total spent, total saved, and whether the month landed better or worse than the suggestion panel predicted.

**2. Goal progress update** — each goal with its current trajectory (on track, ahead, or behind), with any grade-based context.

**3. Spending habits — what went well** — categories that came in under budget, consistently or for the first time. Tone should be encouraging, not clinical.

**4. Spending habits — areas to watch** — categories that overspent, with context on whether this is a one-off or an emerging pattern.

**5. Trend observations** — as months accumulate, this section becomes the most valuable. Examples:
- *"Grocery spending has increased 18% over the last three months."*
- *"You've underspent on eating out four months in a row — your budget here may be set too high."*
- *"Utility costs are tracking higher than this time last year — worth reviewing direct debits."*

**6. Suggested focus for next month** — one or two specific, actionable callouts drawn directly from the data.

### Tone and format

Plain English, specific, and constructive — like a knowledgeable friend reviewing the numbers with you. Roughly the length of a page; structured but readable. The user should be able to scan it in under two minutes.

### UX consideration

The review should be dismissible but persistent — if the user closes it quickly, it remains accessible from the previous month's view. A "reviewed" indicator on closed months helps track engagement.

---

## Feature 6: Progressive Web App (PWA) Configuration

### What it does

Converting the web tool into a PWA gives the family an app-like experience on any device — home screen icon, full screen without browser chrome, offline viewing of existing data, and push notifications — without a native app build or app store submission.

### What needs to be added

1. **Web app manifest** — JSON file declaring the app name, icon set, theme colour, and full-screen launch behaviour
2. **Service worker** — background script enabling offline capability and push notifications
3. **Icon set** — correctly sized icons for Android and iOS home screens

### Cross-device compatibility

**Android (Chrome or Edge):** Full PWA support. The "Add to phone" option installs it properly — full screen, no browser bar, notifications supported.

**iPhone (Safari):** Apple supports PWAs but with limitations:
- Must be added via **Safari specifically** — Chrome and Edge on iOS cannot install PWAs
- Push notifications supported on iOS 16.4+, but the user must add the PWA to home screen first before notifications can be enabled
- Install prompt does not appear automatically — user taps **Share** then **"Add to Home Screen"**

### Icon options

- **Brief a designer** — Fiverr or 99designs, £30–100. Best result.
- **AI image generation** — Midjourney, Firefly, or DALL-E from a text prompt. Fast and free; needs refinement.
- **Designed in-session** — Claude can generate an SVG icon directly as part of the build.

**Required sizes:**
- 512x512px and 192x192px (Android)
- 180x180px (iOS)
- 32x32px and 16x16px (favicon)

### App name

Worth deciding before the PWA is configured — it appears under the home screen icon and in the browser install prompt. *"Family Budget"* works, or something more personal if preferred.

---

## Build Phases

### Phase 1 — Foundation (no external dependencies)

1. **Goal Priority Grading** — add four-grade system to goals data model and UI
2. **Monthly snapshot storage** — confirm budgeted vs. actual figures are stored reliably as historical record per category, per month
3. **PWA configuration** — web app manifest, service worker, icon set; agree app name and logo first
4. **Privacy and data retention policies** — drafted and in place before any external data is connected

### Phase 2 — AI Savings Suggestion Panel

5. **AI Savings Suggestion panel** — Anthropic API call at month-open with income, outgoings, goals, grades, and historical snapshots; returns structured savings split with plain-English rationale
6. **Testing with dummy data** — validate suggestion quality across tight / average / strong month scenarios; confirm grade-based prioritisation

### Phase 3 — Open Banking

7. **Token storage and expiry approach** — scoped, built, and tested including 90-day re-consent flow
8. **Family access permissions model** — agreed and implemented before connection goes live
9. **Open Banking provider integration** — TrueLayer recommended for UK; user connects bank via authorisation flow
10. **Actual column auto-population** — transactions mapped to budget categories; user review and confirm step before month is locked

### Phase 4 — AI Categorisation and Monthly Review

11. **AI transaction categorisation** — merchant names passed to Anthropic API with category list; high-confidence auto-applied, lower-confidence flagged; user corrections stored and reused
12. **AI Monthly Review** — triggered by "Move to Next Month"; full closed month data produces structured plain-English review; dismissible but persistent

---

## Open Questions

- Should Open Banking be optional (manual entry remains the fallback) or required?
- What is the preferred consent and data storage approach for transaction history?
- The AI API calls require a valid Anthropic API key — confirm whether this sits server-side or is handled via the existing tool setup
- Consider a "re-categorise this month" button so users can trigger a fresh AI pass after adding/editing transactions manually
