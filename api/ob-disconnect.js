import { getAccessToken, gc, createSupabase } from './_gocardless.js';

// Removes the user's bank connection and revokes the GoCardless requisition.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.slice(7);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = decoded.sub;
    if (!userId) return res.status(401).json({ error: 'Cannot extract user ID from token' });

    const sb = await createSupabase();

    const { data: connection } = await sb
      .from('ob_connections')
      .select('requisition_id')
      .eq('user_id', userId)
      .single();

    // Best-effort revoke at GoCardless; never block local disconnect on it.
    if (connection?.requisition_id) {
      try {
        const access = await getAccessToken();
        await gc(`/requisitions/${connection.requisition_id}/`, access, { method: 'DELETE' });
      } catch (err) {
        console.warn('GoCardless requisition revoke failed:', err.message);
      }
    }

    await sb.from('ob_connections').delete().eq('user_id', userId);

    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
