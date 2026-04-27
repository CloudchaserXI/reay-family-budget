import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get user from token
    const { data: { user }, error: userError } = await sb.auth.admin.getUserById(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Delete connection (cascades to transactions and mappings)
    const { error } = await sb
      .from('ob_connections')
      .delete()
      .eq('user_id', user.id);

    if (error) throw error;

    res.json({ success: true, message: 'Bank connection removed' });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: err.message });
  }
}
