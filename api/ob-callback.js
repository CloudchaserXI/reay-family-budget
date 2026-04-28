export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.redirect('/?ob=error');

    const userId = state;
    if (!userId) throw new Error('Invalid state parameter');

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

    if (!response.ok) throw new Error('Token exchange failed');

    const data = await response.json();
    if (!data.access_token) throw new Error('No access_token in response');

    const accountsResponse = await fetch(`${process.env.TRUELAYER_API_URL}/data/v1/accounts`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    let accountIds = [];
    if (accountsResponse.ok) {
      const accountsData = await accountsResponse.json();
      accountIds = (accountsData.results || []).map((acc) => acc.account_id);
    }

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { error: upsertError } = await sb.from('ob_connections').upsert({
      user_id: userId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      consent_expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      account_ids: accountIds,
      status: 'connected',
    });

    if (upsertError) throw new Error(`DB error: ${upsertError.message}`);

    res.redirect('/?ob=connected');
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect('/?ob=error');
  }
}
