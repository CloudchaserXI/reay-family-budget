# Open Banking Setup — Enable Banking

The open banking integration uses **Enable Banking** (https://enablebanking.com). We moved to it because GoCardless Bank Account Data (formerly Nordigen) **closed to new signups in 2025**, and the earlier TrueLayer attempt only ever gave sandbox access. Enable Banking has open, self-serve signup, a free tier for personal use, and covers 2,500+ UK & EU banks — including **Halifax** (and the rest of Lloyds Banking Group).

This file is the part left for *you*: create a free Enable Banking application, add a few environment variables in Vercel, redeploy, and connect Halifax.

---

## How it works (so the steps make sense)

Enable Banking doesn't use a simple API key. Your app authenticates by signing a short-lived **JWT** with an **RSA private key** you generate in their control panel. The app's identity is an **Application ID** (used as the JWT `kid`). So the two secrets you'll add to Vercel are the **Application ID** and the **private key** — the code mints the token itself on every request.

---

## What changed in the code

| File | Change |
|---|---|
| `api/_enablebanking.js` | **New** — shared helpers: signs the RS256 JWT, makes authed calls, Supabase client. Not a route. |
| `api/ob-institutions.js` | Lists Enable Banking ASPSPs for a country (`GET /aspsps?country=GB`) for the bank picker. |
| `api/ob-auth-url.js` | Starts authorization (`POST /auth`) and returns the bank-consent URL. |
| `api/ob-callback.js` | Handles the `?code=&state=` redirect, exchanges the code for a session (`POST /sessions`), stores the linked account IDs. |
| `api/ob-pull.js` | Pulls transactions (`GET /accounts/{uid}/transactions`, paginated); runs on the daily cron and on-demand. |
| `api/ob-disconnect.js` | Deletes the Enable Banking session (`DELETE /sessions/{id}`). |
| `api/ob-status.js`, `api/ob-categorise.js`, `api/ob-confirm.js` | Unchanged (provider-agnostic). |
| `index.html` | Unchanged — the existing bank picker already passes the chosen bank through. |
| Database | `ob_connections` gained `session_id` + `authorization_id`; `token_expiry` made nullable; `account_ids` defaults to `{}`. Migration already applied. |
| `api/_gocardless.js` | **Removed.** |

---

## Step 1 — Create a free Enable Banking application

1. Go to **https://enablebanking.com/** and sign up (free).
2. Open the **Control Panel** and **create an application**.
   - Give it a name (e.g. "Reay Family Budget").
   - Choose the live/own-account option — Enable Banking calls this **Restricted Production**: it lets an individual connect *their own* bank accounts for free, without a commercial licence. (There's also a pure sandbox if you want to dry-run first.)
   - When you create the app it generates an **RSA key pair**. **Download the private key** (a `.pem` file) — you only get it once.
   - Note the **Application ID** shown for the app.
3. In the app settings, add the **redirect URL** (must match exactly):
   ```
   https://reay-family-budget.vercel.app/api/ob-callback
   ```
4. If you picked Restricted Production, add **your Halifax account** to the app's allowed/whitelisted accounts (the consent screen later confirms it).

> If anything in the control panel is labelled differently, the things you must walk away with are: the **Application ID**, the **private key file**, the **redirect URL registered**, and (for live data) your **own account whitelisted**.

---

## Step 2 — Add environment variables in Vercel

Vercel dashboard → project **reay-family-budget** → **Settings → Environment Variables**. Add these for the **Production** environment:

| Variable | Value |
|---|---|
| `ENABLEBANKING_APP_ID` | the Application ID from Step 1 |
| `ENABLEBANKING_PRIVATE_KEY` | the full contents of the private-key `.pem` file (include the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines) |
| `CRON_SECRET` | any long random string (secures the daily pull) |
| `SUPABASE_URL` | `https://pajlrdnhldmixcxbfqis.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → `service_role` key |
| `ANTHROPIC_API_KEY` | *(optional)* enables AI auto-categorisation of transactions |

Notes:
- Paste the **whole** private key. Vercel accepts multi-line values; the code also tolerates a single-line value with literal `\n` in place of newlines, so either form works.
- The first five are required. Without `ANTHROPIC_API_KEY`, transactions still pull and store — they just won't be auto-categorised (you'd categorise them in the Banking tab).
- `APP_URL` is optional — it defaults to `https://reay-family-budget.vercel.app`. Set it only for a custom domain.

---

## Step 3 — Redeploy

Environment variables only apply to **new** deployments. Either:
- Vercel → **Deployments** → latest → **⋯ → Redeploy**, or
- push any commit (Vercel auto-deploys `master`).

---

## Step 4 — Connect Halifax

1. Open the app → **Banking** tab → **Connect Bank**.
2. Pick **Halifax** from the dropdown.
3. Click **Connect Bank** → you'll be sent to Halifax's secure login to approve **read-only** access.
4. You should land back on the app with **✓ Bank connected**.
5. Pull transactions (the daily 6am cron does this automatically, or trigger it now):
   ```
   curl -X POST https://reay-family-budget.vercel.app/api/ob-pull \
     -H "Content-Type: application/json" \
     -d '{"userId":"<your-supabase-user-id>"}'
   ```
   (Your user ID is the `sub` in your login session, or find it in Supabase → Authentication → Users.)
6. Confirm transactions appear in the Banking tab.

> Want a dry run first? Repeat Step 4 but choose a **sandbox/mock** bank if one appears in the dropdown — it accepts test logins and returns fake transactions.

---

## Good to know

- **Consent lasts ~90 days.** UK open banking rules require re-approval; the app tracks `consent_expiry`, flips the status to `expired`, and you just reconnect when prompted. The actual granted window is read back from Enable Banking and stored.
- **Rate limits.** The free tier allows a limited number of pulls per account per day — plenty for the once-daily cron. Avoid hammering `ob-pull` while testing.
- **Amounts.** Enable Banking returns a positive amount plus a `credit_debit_indicator` (`DBIT`/`CRDT`). The code stores debits as negative and the app treats the absolute value as spend — matching the previous behaviour.
- **Security note.** `ob-pull` trusts a `userId` passed on-demand (carried over from the original design). Fine for a private 2-person app with open RLS; tighten to verify the Supabase JWT if you ever widen access.
- **AI model.** `api/ob-categorise.js` references a Claude model string. If categorisation errors on an unknown model, update that string to a current model.
- **Pricing caveat.** Enable Banking's free/Restricted Production tier is intended exactly for personal/own-account use; confirm the current limits during signup.
