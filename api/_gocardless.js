// Shared GoCardless Bank Account Data (formerly Nordigen) helpers.
// Files prefixed with "_" are NOT deployed as routes by Vercel, so this is
// import-only. https://bankaccountdata.gocardless.com/api/v2

export const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

// The public app URL, used to build the OAuth redirect back to /api/ob-callback.
export function appUrl() {
  return (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://reay-family-budget.vercel.app')
  );
}

// Exchange the secret id/key for a short-lived access token (valid ~24h).
export async function getAccessToken() {
  const secret_id = process.env.GOCARDLESS_SECRET_ID;
  const secret_key = process.env.GOCARDLESS_SECRET_KEY;
  if (!secret_id || !secret_key) {
    throw new Error('Missing GoCardless config (GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY)');
  }
  const res = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_id, secret_key }),
  });
  const data = await res.json();
  if (!res.ok || !data.access) {
    throw new Error(`GoCardless token error: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.access;
}

// Thin authenticated GET/POST/DELETE helper against the GoCardless API.
export async function gc(path, access, options = {}) {
  const res = await fetch(`${GC_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export function createSupabase() {
  return import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
