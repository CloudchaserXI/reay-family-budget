import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { mappingId, action, categoryId } = req.body;
  if (!mappingId || !action) {
    return res.status(400).json({ error: 'mappingId and action required' });
  }

  const token = authHeader.slice(7);
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Verify user owns this mapping
    const { data: mapping } = await sb
      .from('ob_transaction_mappings')
      .select('user_id')
      .eq('id', mappingId)
      .single();

    if (!mapping) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    // Handle different actions
    if (action === 'confirm') {
      if (!categoryId) {
        return res.status(400).json({ error: 'categoryId required for confirm' });
      }

      await sb
        .from('ob_transaction_mappings')
        .update({ category_id: categoryId, confirmed: true })
        .eq('id', mappingId);
    } else if (action === 'ignore') {
      await sb
        .from('ob_transaction_mappings')
        .update({ ignored: true })
        .eq('id', mappingId);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).json({ error: err.message });
  }
}
