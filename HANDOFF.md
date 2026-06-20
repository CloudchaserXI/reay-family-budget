# Handoff — Open Banking migration (TrueLayer → GoCardless)

Paste-ready brief for Claude Code in VSCode to finish and deploy.

## Status: code complete locally, needs commit + push + env vars

The open banking integration was migrated from TrueLayer (never worked — sandbox-only, no live access) to **GoCardless Bank Account Data** (free, works for individuals). All code changes are already written in this repo. Supabase backend was auto-paused and has been restored.

## Files already changed (just commit them)
- `api/_gocardless.js` — NEW shared helper (token + API calls; underscore = not a route)
- `api/ob-auth-url.js` — rewritten: creates GoCardless requisition (consent link)
- `api/ob-callback.js` — rewritten: handles `?ref=` redirect, stores linked accounts
- `api/ob-pull.js` — rewritten: pulls transactions; now works on the daily cron (GET + Bearer)
- `api/ob-disconnect.js` — updated: revokes the requisition at GoCardless
- `api/ob-institutions.js` — NEW: lists UK banks for the connect dropdown
- `index.html` — bank-picker dropdown added to Banking tab; connect passes chosen bank
- `OPEN_BANKING_SETUP.md` — full setup guide

## DB migration — ALREADY APPLIED to Supabase (do not re-run)
`ob_transactions.date` → `transaction_date`; added `requisition_id` + `institution_id` to `ob_connections`; made TrueLayer token columns nullable. (Migration `gocardless_open_banking_migration` is live.)

## What Claude Code should do
1. Review the diff, then commit and push to `master` (Vercel auto-deploys):
   ```
   git add -A && git commit -m "Migrate open banking from TrueLayer to GoCardless Bank Account Data" && git push
   ```
2. That's the only code action. No build step (CDN React).

## What only Jarryd can do (GoCardless = his account)
Add these in Vercel → reay-family-budget → Settings → Environment Variables (Production):
- `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY` — from https://bankaccountdata.gocardless.com (free signup → User Secrets)
- `CRON_SECRET` — any long random string (secures the daily pull)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API → service_role key
- `SUPABASE_URL` — `https://pajlrdnhldmixcxbfqis.supabase.co`
- `ANTHROPIC_API_KEY` — optional, enables AI auto-categorisation

## Test after deploy
Banking tab → pick "🧪 Sandbox Finance (test)" → Connect → approve → then POST `/api/ob-pull` with `{"userId":"<supabase-user-id>"}` to fetch fake transactions. Once that works, reconnect with the real bank. Consent lasts 90 days (UK rule); daily 6am cron pulls automatically.

## Known follow-ups (optional)
- `api/ob-categorise.js` uses model `claude-opus-4-1-20250805` — update if it errors as unknown.
- `ob-pull` trusts an on-demand `userId` (carried over from original) — tighten to verify the Supabase JWT if access ever widens.
