# Handoff — Open Banking on Enable Banking

## Status: code complete + deployed; needs Enable Banking signup + env vars

The open banking integration has been migrated **TrueLayer → GoCardless → Enable Banking**.

- **TrueLayer** never worked (sandbox-only, no live access for individuals).
- **GoCardless Bank Account Data** was built and deployed, then turned out to be a dead end: GoCardless **closed Bank Account Data to new signups in 2025** (no waitlist, no reopening), so a new account can't be created.
- **Enable Banking** is the replacement: open self-serve signup, free tier for personal use, covers **Halifax** (Jarryd's bank) and 2,500+ UK/EU banks.

All Enable Banking code is committed and live on `master` (Vercel auto-deploys). The remaining work is Jarryd's: create a free Enable Banking app and add env vars.

## What's in the repo now
- `api/_enablebanking.js` — NEW shared helper. Signs the RS256 JWT (Application ID = `kid`, private key signs it), makes authed calls, Supabase client. Underscore = not a route.
- `api/ob-institutions.js` — lists ASPSPs (`GET /aspsps?country=GB`); the bank's **name** is the picker value.
- `api/ob-auth-url.js` — starts authorization (`POST /auth`), returns the consent URL; `state` carries the userId.
- `api/ob-callback.js` — handles `?code=&state=`, exchanges via `POST /sessions`, stores account UIDs + `session_id`.
- `api/ob-pull.js` — pulls transactions (`GET /accounts/{uid}/transactions`, paginated); daily cron + on-demand.
- `api/ob-disconnect.js` — deletes the session (`DELETE /sessions/{id}`).
- `api/_gocardless.js` — REMOVED.
- `index.html` — unchanged; existing picker already passes the chosen bank.
- `OPEN_BANKING_SETUP.md` — full setup guide (do this).

## DB migration — ALREADY APPLIED (do not re-run)
Migration `enablebanking_open_banking_migration` is live on Supabase: added `session_id` + `authorization_id` to `ob_connections`, made `token_expiry` nullable, defaulted `account_ids` to `{}`. (`ob_transactions.transaction_date` was already in place from the prior migration.)

## What Jarryd needs to do (see OPEN_BANKING_SETUP.md for detail)
1. Sign up free at **https://enablebanking.com**, create an application (Restricted Production for own-account live access), **download the private key**, note the **Application ID**, and register the redirect URL `https://reay-family-budget.vercel.app/api/ob-callback`.
2. Add env vars in Vercel (Production): `ENABLEBANKING_APP_ID`, `ENABLEBANKING_PRIVATE_KEY`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `ANTHROPIC_API_KEY`.
3. Redeploy (or push any commit).
4. Banking tab → pick **Halifax** → approve read-only access → transactions flow in (daily 6am cron, or trigger `POST /api/ob-pull` with `{"userId":"<supabase-user-id>"}`).

## Known follow-ups (optional)
- `api/ob-categorise.js` references a Claude model string — update if it errors as unknown.
- `ob-pull` trusts an on-demand `userId` — tighten to verify the Supabase JWT if access ever widens.
- The Enable Banking account-UID and transaction field handling is defensive (handles string-or-object accounts, multiple date/description fields). If a real Halifax pull shows odd descriptions or missing IDs, check the raw shape in the Vercel logs and adjust the mapping in `api/ob-pull.js`.
