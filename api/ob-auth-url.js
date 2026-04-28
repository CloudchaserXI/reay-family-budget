export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI;
  const baseUrl = process.env.TRUELAYER_BASE_URL;

  if (!clientId || !clientSecret || !redirectUri || !baseUrl) {
    return res.status(500).json({ error: 'Missing TrueLayer config' });
  }

  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const payload = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'info accounts balance',
      state: userId,
      data_use_description: 'We will use your transaction data to auto-populate your budget spending',
      provider_id: 'mock',
    };

    console.log('Calling TrueLayer authuri:', { baseUrl, payload });

    const authUriResponse = await fetch(`${baseUrl}/v1/authuri`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseData = await authUriResponse.json();
    console.log('TrueLayer authuri response:', { status: authUriResponse.status, responseData });

    if (!authUriResponse.ok) {
      throw new Error(`TrueLayer authuri failed: ${authUriResponse.status} - ${JSON.stringify(responseData)}`);
    }

    console.log('Full TrueLayer response:', responseData);
    const authUrl = responseData.result || responseData.uri;
    if (!authUrl) {
      const msg = `No auth URL in TrueLayer response. Keys: ${Object.keys(responseData).join(', ')}. Full response: ${JSON.stringify(responseData)}`;
      console.error(msg);
      return res.status(500).json({ error: msg });
    }
    console.log('Auth URL generated:', authUrl);
    res.json({ url: authUrl });
  } catch (err) {
    console.error('Auth URL generation error:', err);
    res.status(500).json({ error: err.message });
  }
}
