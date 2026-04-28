export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.slice(7);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = decoded.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Cannot extract user ID from token' });
    }

    const { data: connection, error: queryError } = await sb
      .from('ob_connections')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (queryError) {
      if (queryError.code === 'PGRST116') {
        return res.json({ connected: false });
      }
      throw queryError;
    }

    if (!connection) {
      return res.json({ connected: false });
    }

    const expiryDate = new Date(connection.consent_expiry);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    return res.json({
      connected: connection.status === 'connected',
      daysUntilExpiry,
      lastPullAt: connection.last_pull_at,
    });
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
