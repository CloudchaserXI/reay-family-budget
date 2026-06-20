// Shared Enable Banking (enablebanking.com) helpers.
// Files prefixed with "_" are NOT deployed as routes by Vercel, so this is
// import-only. Enable Banking replaces GoCardless Bank Account Data, which
// stopped onboarding new users in 2025. https://enablebanking.com/docs/
import crypto from 'crypto';

export const EB_BASE = 'https://api.enablebanking.com';

// The public app URL, used to build the OAuth redirect back to /api/ob-callback.
export function appUrl() {
  return (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://reay-family-budget.vercel.app')
  );
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Enable Banking authenticates with a short-lived JWT (RS256) signed by the
// application's private key. `kid` is the Application ID from the control panel.
// We mint a fresh JWT per invocation (cheap, and avoids storing any token) and
// send it as a Bearer header on every request.
export function getJWT() {
  const appId = process.env.ENABLEBANKING_APP_ID;
  const pem = (process.env.ENABLEBANKING_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!appId || !pem) {
    throw new Error('Missing Enable Banking config (ENABLEBANKING_APP_ID / ENABLEBANKING_PRIVATE_KEY)');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600, // 1 hour; Enable Banking allows up to 24h
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(pem);
  return `${signingInput}.${base64url(signature)}`;
}

// Thin authenticated GET/POST/DELETE helper against the Enable Banking API.
// The JWT is minted per call, so callers just pass the path + options.
export async function eb(path, options = {}) {
  const jwt = getJWT();
  const res = await fetch(`${EB_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
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
