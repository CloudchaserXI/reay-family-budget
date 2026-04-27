export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI;
  const baseUrl = process.env.TRUELAYER_BASE_URL;

  if (!clientId || !redirectUri || !baseUrl) {
    return res.status(500).json({ error: 'Missing TrueLayer config' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'accounts transactions balance',
    state: Math.random().toString(36).substring(7),
  });

  const authUrl = `${baseUrl}/authorize?${params.toString()}`;
  res.json({ url: authUrl });
}
