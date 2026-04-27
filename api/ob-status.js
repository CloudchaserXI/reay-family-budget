import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);

  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify token and get user
    const { data: { user }, error: userError } = await sb.auth.admin.getUserById(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get connection status
    const { data: connection, error } = await sb
      .from('ob_connections')
      .select('status, consent_expiry, last_pull_at')
      .eq('user_id', user.id)
      .single();

    if (error || !connection) {
      return res.json({
        connected: false,
        status: 'not_connected',
        daysUntilExpiry: null,
      });
    }

    const expiryDate = new Date(connection.consent_expiry);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

    res.json({
      connected: connection.status === 'connected',
      status: connection.status,
      daysUntilExpiry,
      lastPullAt: connection.last_pull_at,
      consentExpiry: connection.consent_expiry,
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
