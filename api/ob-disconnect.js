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

    if (!userId) {
      return res.status(401).json({ error: 'Cannot extract user ID from token' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    await sb.from('ob_connections').delete().eq('user_id', userId);

    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
