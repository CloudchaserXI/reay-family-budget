import { eb, createSupabase } from './_enablebanking.js';

// Enable Banking redirects the user back here after they consent at their bank:
//   /api/ob-callback?code=<code>&state=<userId>   (or ?error=... on failure)
export default async function handler(req, res) {
  try {
    const { code, state, error } = req.query;
    if (error) {
      console.error('Callback error from Enable Banking:', error);
      return res.redirect('/?ob=error');
    }
    if (!code || !state) return res.redirect('/?ob=error');

    const userId = String(state);
    const sb = await createSupabase();

    // Exchange the one-time code for a session listing the linked accounts.
    const session = await eb('/sessions', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!session.ok || !session.body?.session_id) {
      throw new Error(`Session creation failed: ${session.status} ${JSON.stringify(session.body)}`);
    }

    // `accounts` may be uid strings or objects depending on the bank; normalise
    // to the account UID used by GET /accounts/{uid}/transactions.
    const accountIds = (session.body.accounts || [])
      .map((a) => (typeof a === 'string' ? a : a.uid || a.account_id || a.identification_hash))
      .filter(Boolean);

    const validUntil = session.body.access?.valid_until || null;
    const linked = accountIds.length > 0;

    const update = {
      session_id: session.body.session_id,
      account_ids: accountIds,
      status: linked ? 'connected' : 'pending',
      updated_at: new Date().toISOString(),
    };
    if (validUntil) update.consent_expiry = validUntil;

    const { error: updateError } = await sb
      .from('ob_connections')
      .update(update)
      .eq('user_id', userId);
    if (updateError) throw new Error(`DB error: ${updateError.message}`);

    res.redirect(linked ? '/?ob=connected' : '/?ob=error');
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect('/?ob=error');
  }
}
