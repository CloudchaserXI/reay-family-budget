import { eb } from './_enablebanking.js';

// Lists banks (ASPSPs) available for connection in a country (default GB), so
// the front-end can show a picker. GET /api/ob-institutions?country=gb
// Returns public bank metadata only (no secrets).
//
// Enable Banking identifies a bank by its `name` (+ country) rather than an id,
// so we use the name as the picker value. The front-end passes it back as
// `institution`, which ob-auth-url uses as aspsp.name.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const country = (req.query.country || 'GB').toUpperCase();
    const r = await eb(`/aspsps?country=${country}`, { method: 'GET' });

    if (!r.ok) {
      throw new Error(`ASPSP lookup failed: ${r.status} ${JSON.stringify(r.body)}`);
    }

    // A bank can appear multiple times (different auth methods / psu types);
    // dedupe by name so the picker shows each bank once.
    const seen = new Set();
    const banks = [];
    for (const a of r.body?.aspsps || []) {
      if (!a?.name || seen.has(a.name)) continue;
      seen.add(a.name);
      banks.push({ id: a.name, name: a.name, logo: a.logo || null, country: a.country });
    }
    banks.sort((a, b) => a.name.localeCompare(b.name));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.json({ institutions: banks });
  } catch (err) {
    console.error('Institutions error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
