import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect('/?ob=error');
    }

    const baseUrl = process.env.TRUELAYER_BASE_URL;
    const clientId = process.env.TRUELAYER_CLIENT_ID;
    const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
    const redirectUri = process.env.TRUELAYER_REDIRECT_URI;

    const tokenResponse = await fetch(`${baseUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return res.redirect('/?ob=error');
    }

    const { access_token, expires_in } = tokenData;
    const tokenPayload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64').toString());
    const userId = tokenPayload.sub;

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    await sb.from('ob_connections').upsert({
      user_id: userId,
      access_token,
      refresh_token: tokenData.refresh_token,
      token_expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
      consent_expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      account_ids: [],
      status: 'connected',
    });

    return res.redirect('/?ob=connected');
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/?ob=error');
  }
}
