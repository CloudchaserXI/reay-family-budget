export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.slice(7);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = decoded.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Cannot extract user ID from token' });
    }

    const { mappingId, itemId, confirmed, ignored } = req.body;

    if (!mappingId) {
      return res.status(400).json({ error: 'mappingId required' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: mapping } = await sb
      .from('ob_transaction_mappings')
      .select('*')
      .eq('id', mappingId)
      .eq('user_id', userId)
      .single();

    if (!mapping) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    const updates = {
      confirmed: confirmed !== undefined ? confirmed : mapping.confirmed,
      ignored: ignored !== undefined ? ignored : mapping.ignored,
      item_id: itemId !== undefined ? itemId : mapping.item_id,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await sb
      .from('ob_transaction_mappings')
      .update(updates)
      .eq('id', mappingId);

    if (updateError) throw updateError;

    if (updates.confirmed && !updates.ignored) {
      const { data: transaction } = await sb
        .from('ob_transactions')
        .select('amount')
        .eq('id', mapping.transaction_id)
        .single();

      const amount = Math.abs(transaction.amount);
      const { data: existing } = await sb
        .from('month_actuals')
        .select('amount')
        .eq('month_id', mapping.month_id)
        .eq('item_id', updates.item_id)
        .single();

      const currentAmount = existing?.amount || 0;

      await sb.from('month_actuals').upsert({
        month_id: mapping.month_id,
        item_id: updates.item_id,
        amount: currentAmount + amount,
        updated_at: new Date().toISOString(),
      });

      if (mapping.item_id && mapping.item_id !== updates.item_id) {
        const { data: prevTransaction } = await sb
          .from('ob_transactions')
          .select('amount')
          .eq('id', mapping.transaction_id)
          .single();

        const prevAmount = Math.abs(prevTransaction.amount);
        const { data: prevExisting } = await sb
          .from('month_actuals')
          .select('amount')
          .eq('month_id', mapping.month_id)
          .eq('item_id', mapping.item_id)
          .single();

        const prevCurrentAmount = prevExisting?.amount || 0;

        await sb.from('month_actuals').update({
          amount: Math.max(0, prevCurrentAmount - prevAmount),
          updated_at: new Date().toISOString(),
        });
      }
    } else if (updates.ignored || !updates.confirmed) {
      if (mapping.confirmed && mapping.item_id) {
        const { data: transaction } = await sb
          .from('ob_transactions')
          .select('amount')
          .eq('id', mapping.transaction_id)
          .single();

        const amount = Math.abs(transaction.amount);
        const { data: existing } = await sb
          .from('month_actuals')
          .select('amount')
          .eq('month_id', mapping.month_id)
          .eq('item_id', mapping.item_id)
          .single();

        const currentAmount = existing?.amount || 0;

        await sb.from('month_actuals').update({
          amount: Math.max(0, currentAmount - amount),
          updated_at: new Date().toISOString(),
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Confirm error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
