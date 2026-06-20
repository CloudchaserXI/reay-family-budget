import { appUrl, eb, createSupabase } from './_enablebanking.js';

// Starts an Enable Banking authorization (bank-consent flow) and returns its URL.
// GET /api/ob-auth-url?userId=<uuid>&institution=<aspsp name>[&country=GB]
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, institution } = req.query;
    const country = (req.query.country || 'GB').toUpperCase();
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!institution) return res.status(400).json({ error: 'institution (bank) required' });

    const redirect = `${appUrl()}/api/ob-callback`;
    // Request ~90 days of access (UK open banking max). Banks cap this; we read
    // the granted window back from the session in ob-callback and store that.
    const validUntil = new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString();

    // state carries the userId so the callback can map the redirect back to us.
    const auth = await eb('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: institution, country },
        state: String(userId),
        redirect_url: redirect,
        psu_type: 'personal',
      }),
    });

    if (!auth.ok || !auth.body?.url) {
      throw new Error(`Auth start failed: ${auth.status} ${JSON.stringify(auth.body)}`);
    }

    // Record a pending connection so the callback and status checks can find it.
    const sb = await createSupabase();
    const { error: upsertError } = await sb.from('ob_connections').upsert(
      {
        user_id: userId,
        institution_id: institution,
        authorization_id: auth.body.authorization_id || null,
        status: 'pending',
        consent_expiry: validUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (upsertError) throw new Error(`DB error: ${upsertError.message}`);

    res.json({ url: auth.body.url });
  } catch (err) {
    console.error('Auth URL generation error:', err);
    res.status(500).json({ error: err.message });
  }
}
