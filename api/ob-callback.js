export default async function handler(req, res) {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/?ob=error');

    const baseUrl = process.env.TRUELAYER_BASE_URL;
    const response = await fetch(`${baseUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.TRUELAYER_CLIENT_ID,
        client_secret: process.env.TRUELAYER_CLIENT_SECRET,
        redirect_uri: process.env.TRUELAYER_REDIRECT_URI,
      }),
    });

    if (!response.ok) return res.redirect('/?ob=error');

    const data = await response.json();
    if (!data.access_token) throw new Error('No access_token in response');

    const token = data.access_token;
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (!payload.sub) throw new Error('No sub in JWT payload');

    console.log('Supabase URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (' + process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...)' : 'MISSING');

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { error: upsertError } = await sb.from('ob_connections').upsert({
      user_id: payload.sub,
      access_token: token,
      refresh_token: data.refresh_token,
      token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      consent_expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      account_ids: [],
      status: 'connected',
    });

    if (upsertError) throw new Error(`Supabase error: ${upsertError.message}`);

    res.redirect('/?ob=connected');
  } catch (err) {
    console.error('Callback error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
}
