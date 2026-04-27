export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    console.log('Callback: code received');

    if (!code) {
      return res.redirect('/?ob=error');
    }

    console.log('Code:', code.substring(0, 20));
    return res.redirect('/?ob=connected');
  } catch (err) {
    console.error('Callback error:', err);
    return res.status(500).json({ error: err.message });
  }
}
