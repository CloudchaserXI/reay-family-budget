import { appUrl, getAccessToken, gc, createSupabase } from './_gocardless.js';

// Builds a GoCardless requisition (bank-consent link) and returns its URL.
// GET /api/ob-auth-url?userId=<uuid>&institution=<institution_id>
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, institution } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!institution) return res.status(400).json({ error: 'institution (bank) required' });

    const access = await getAccessToken();
    const redirect = `${appUrl()}/api/ob-callback`;

    // Optional end-user agreement: request 90 days of history + 90 days of access,
    // read-only (balances, details, transactions). Fall back to defaults if the
    // bank rejects the requested window.
    let agreementId;
    const agreement = await gc('/agreements/enduser/', access, {
      method: 'POST',
      body: JSON.stringify({
        institution_id: institution,
        max_historical_days: 90,
        access_valid_for_days: 90,
        access_scope: ['balances', 'details', 'transactions'],
      }),
    });
    if (agreement.ok && agreement.body?.id) {
      agreementId = agreement.body.id;
    } else {
      console.warn('Agreement creation failed, continuing with defaults:', agreement.status, agreement.body);
    }

    // The requisition is the actual consent link. reference = userId lets the
    // callback map the redirect back to this user.
    const reqBody = {
      redirect,
      institution_id: institution,
      reference: String(userId),
      user_language: 'EN',
    };
    if (agreementId) reqBody.agreement = agreementId;

    const requisition = await gc('/requisitions/', access, {
      method: 'POST',
      body: JSON.stringify(reqBody),
    });

    if (!requisition.ok || !requisition.body?.link) {
      throw new Error(`Requisition failed: ${requisition.status} ${JSON.stringify(requisition.body)}`);
    }

    // Record a pending connection so the callback and status checks can find it.
    const sb = await createSupabase();
    const { error: upsertError } = await sb.from('ob_connections').upsert(
      {
        user_id: userId,
        requisition_id: requisition.body.id,
        institution_id: institution,
        status: 'pending',
        consent_expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (upsertError) throw new Error(`DB error: ${upsertError.message}`);

    res.json({ url: requisition.body.link });
  } catch (err) {
    console.error('Auth URL generation error:', err);
    res.status(500).json({ error: err.message });
  }
}
