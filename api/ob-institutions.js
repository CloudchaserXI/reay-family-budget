import { getAccessToken, gc } from './_gocardless.js';

// Lists banks available for connection in a country (default GB), so the
// front-end can show a picker. GET /api/ob-institutions?country=gb
// Returns public bank metadata only (no secrets), so no auth required.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const country = (req.query.country || 'gb').toLowerCase();
    const access = await getAccessToken();
    const r = await gc(`/institutions/?country=${country}`, access);

    if (!r.ok) {
      throw new Error(`Institutions lookup failed: ${r.status} ${JSON.stringify(r.body)}`);
    }

    // GoCardless sandbox bank for end-to-end testing (use test credentials).
    const sandbox = { id: 'SANDBOXFINANCE_SFIN0000', name: '🧪 Sandbox Finance (test)', logo: null };

    const banks = (r.body || []).map((i) => ({ id: i.id, name: i.name, logo: i.logo }));
    banks.sort((a, b) => a.name.localeCompare(b.name));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.json({ institutions: [sandbox, ...banks] });
  } catch (err) {
    console.error('Institutions error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
