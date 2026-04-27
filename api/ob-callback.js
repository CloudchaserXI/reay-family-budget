import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect('/index.html?ob=error');
  }

  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI;
  const apiUrl = process.env.TRUELAYER_API_URL;

  try {
    console.log('OAuth callback: code received:', code?.substring(0, 20));

    // Exchange code for tokens
    const baseUrl = process.env.TRUELAYER_BASE_URL;
    console.log('Exchanging code with baseUrl:', baseUrl);

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

    console.log('Token response status:', tokenResponse.status);
    const tokenData = await tokenResponse.json();
    console.log('Token data keys:', Object.keys(tokenData));

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    console.log('Got tokens, access_token length:', access_token?.length);

    // Get user from JWT in access token (TrueLayer embeds user_id in token)
    const parts = access_token.split('.');
    console.log('JWT parts:', parts.length);

    const tokenPayload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString()
    );
    console.log('Token payload keys:', Object.keys(tokenPayload));

    const userId = tokenPayload.sub; // TrueLayer uses 'sub' for user ID
    console.log('User ID extracted:', userId);

    // Store in Supabase
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const tokenExpiry = new Date(Date.now() + expires_in * 1000);
    const consentExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    const { error } = await sb
      .from('ob_connections')
      .upsert(
        {
          user_id: userId,
          access_token,
          refresh_token,
          token_expiry: tokenExpiry.toISOString(),
          consent_expiry: consentExpiry.toISOString(),
          account_ids: [], // Will be populated on first pull
          status: 'connected',
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    // Redirect back to app with success
    res.redirect('/?ob=connected');
  } catch (err) {
    console.error('OAuth callback error:', err.message, err.stack);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
