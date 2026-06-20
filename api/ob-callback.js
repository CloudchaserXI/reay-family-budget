import { getAccessToken, gc, createSupabase } from './_gocardless.js';

// GoCardless redirects the user back here after they consent at their bank:
//   /api/ob-callback?ref=<userId>   (or ?error=... on failure)
export default async function handler(req, res) {
  try {
    const { ref, error } = req.query;
    if (error) {
      console.error('Callback error from GoCardless:', error);
      return res.redirect('/?ob=error');
    }
    if (!ref) return res.redirect('/?ob=error');

    const userId = String(ref);
    const sb = await createSupabase();

    // Find the pending connection we created in ob-auth-url.
    const { data: connection } = await sb
      .from('ob_connections')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!connection || !connection.requisition_id) {
      throw new Error('No pending requisition found for user');
    }

    const access = await getAccessToken();

    // Fetch the requisition to read the linked account IDs. status "LN" = linked.
    const requisition = await gc(`/requisitions/${connection.requisition_id}/`, access);
    if (!requisition.ok) {
      throw new Error(`Requisition lookup failed: ${requisition.status} ${JSON.stringify(requisition.body)}`);
    }

    const accountIds = requisition.body.accounts || [];
    const linked = requisition.body.status === 'LN' && accountIds.length > 0;

    const { error: updateError } = await sb
      .from('ob_connections')
      .update({
        account_ids: accountIds,
        status: linked ? 'connected' : 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (updateError) throw new Error(`DB error: ${updateError.message}`);

    res.redirect(linked ? '/?ob=connected' : '/?ob=error');
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect('/?ob=error');
  }
}
