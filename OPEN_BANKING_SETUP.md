# Open Banking Setup — GoCardless Bank Account Data

The open banking integration has been migrated from **TrueLayer** to **GoCardless Bank Account Data** (formerly Nordigen). GoCardless is free for personal use, lets individuals access their own bank data without a business/regulatory approval, and covers 2,300+ UK & EU banks.

This file is the only thing left for *you* to do: get free GoCardless keys, add a few environment variables in Vercel, and deploy.

---

## What changed in the code

| File | Change |
|---|---|
| `api/_gocardless.js` | **New** — shared helpers (token, API calls). Not a route. |
| `api/ob-auth-url.js` | Rewritten — creates a GoCardless *requisition* (consent link) for the chosen bank. |
| `api/ob-callback.js` | Rewritten — handles the `?ref=` redirect, stores the linked account IDs. |
| `api/ob-pull.js` | Rewritten — pulls transactions from GoCardless; now also runs on the daily cron (GET + Bearer). |
| `api/ob-disconnect.js` | Updated — also revokes the requisition at GoCardless. |
| `api/ob-institutions.js` | **New** — lists UK banks for the connect dropdown. |
| `api/ob-status.js` | Unchanged. |
| `api/ob-categorise.js`, `api/ob-confirm.js` | Unchanged (provider-agnostic). |
| `index.html` | Bank picker added to the Banking tab; connect button passes the chosen bank. |
| Database | `ob_transactions.date` renamed to `transaction_date` (matches the app code); `requisition_id` + `institution_id` added to `ob_connections`. Migration already applied. |

---

## Step 1 — Create a free GoCardless account

1. Go to **https://bankaccountdata.gocardless.com/** and sign up (free, no business required).
2. Open the **Developers / User Secrets** section.
3. Create a new secret — you'll get a **Secret ID** and a **Secret Key**. Copy both (the key is shown once).

---

## Step 2 — Add environment variables in Vercel

Vercel dashboard → project **reay-family-budget** → **Settings → Environment Variables**. Add these for the **Production** environment:

| Variable | Value |
|---|---|
| `GOCARDLESS_SECRET_ID` | from Step 1 |
| `GOCARDLESS_SECRET_KEY` | from Step 1 |
| `CRON_SECRET` | any long random string (secures the daily pull) |
| `SUPABASE_URL` | `https://pajlrdnhldmixcxbfqis.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → `service_role` key |
| `ANTHROPIC_API_KEY` | *(optional)* enables AI auto-categorisation of transactions |

`APP_URL` is optional — it defaults to `https://reay-family-budget.vercel.app`. Set it only if you use a custom domain.

> The first four are required. Without `ANTHROPIC_API_KEY`, transactions still pull and store; they just won't be auto-categorised (you'd categorise them in the Banking tab instead).

---

## Step 3 — Deploy

Push the changed files to GitHub (`master`) and Vercel auto-deploys, or run `npx vercel --prod` from the project folder. (Happy to do the commit/push for you — just say so.)

---

## Step 4 — Test the whole flow with the sandbox first

GoCardless provides a fake test bank so you can prove the end-to-end flow before touching a real account.

1. Open the app → **Banking** tab → **Connect Bank**.
2. In the bank dropdown choose **🧪 Sandbox Finance (test)**.
3. Click **Connect Bank**, complete the consent screen (sandbox accepts test logins).
4. You should land back on the app with **✓ Bank connected**.
5. Trigger a pull to fetch the sandbox's fake transactions:
   ```
   curl -X POST https://reay-family-budget.vercel.app/api/ob-pull \
     -H "Content-Type: application/json" \
     -d '{"userId":"<your-supabase-user-id>"}'
   ```
   (Your user ID is the `sub` in your login session, or find it in Supabase → Authentication → Users.)
6. Confirm transactions appear in the Banking tab.

---

## Step 5 — Connect your real bank

Once the sandbox works, repeat Step 4 but pick your actual UK bank from the dropdown. You'll be sent to your bank's secure login to approve read-only access. After consent, the daily 6am cron pulls new transactions automatically.

---

## Good to know

- **Consent lasts 90 days.** UK open banking rules require re-approval every 90 days — the app tracks this (`consent_expiry`) and the status flips to `expired`; just reconnect when prompted.
- **Rate limits.** The free tier allows a few transaction pulls per account per day, which is plenty for the once-daily cron. Avoid hammering `ob-pull` during testing.
- **Amounts.** GoCardless returns signed amounts (debits negative). The app treats the absolute value as spend, matching the previous behaviour.
- **Security note.** `ob-pull` currently trusts a `userId` passed on-demand (carried over from the original design). Fine for a private 2-person app with open RLS; tighten to verify the Supabase JWT if you ever widen access.
- **AI model.** `api/ob-categorise.js` references `claude-opus-4-1-20250805`. If categorisation errors on an unknown model, update that string to a current model.

---

*Migration done via Cowork · backend restored from Supabase auto-pause at the same time.*
