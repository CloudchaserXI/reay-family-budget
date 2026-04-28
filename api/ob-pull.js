export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET && req.body?.userId === undefined) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    let userIds = [];

    if (req.body?.userId) {
      userIds = [req.body.userId];
    } else {
      const { data: connections } = await sb
        .from('ob_connections')
        .select('user_id')
        .eq('status', 'connected');
      userIds = connections?.map((c) => c.user_id) || [];
    }

    let totalPulled = 0;
    let totalCategorized = 0;

    for (const userId of userIds) {
      const { data: connection } = await sb
        .from('ob_connections')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!connection) continue;

      const accountIds = connection.account_ids || [];
      const lastPullAt = connection.last_pull_at ? new Date(connection.last_pull_at) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      let allTransactions = [];

      for (const accountId of accountIds) {
        try {
          const txResponse = await fetch(
            `${process.env.TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions?from=${lastPullAt.toISOString()}`,
            {
              headers: { Authorization: `Bearer ${connection.access_token}` },
            }
          );

          if (txResponse.status === 401) {
            await sb
              .from('ob_connections')
              .update({ status: 'expired' })
              .eq('user_id', userId);
            console.log(`Token expired for user ${userId}`);
            break;
          }

          if (!txResponse.ok) {
            console.error(`Failed to fetch transactions for account ${accountId}:`, await txResponse.text());
            continue;
          }

          const txData = await txResponse.json();
          const transactions = txData.results || [];

          allTransactions.push(
            ...transactions.map((tx) => ({
              user_id: userId,
              provider_transaction_id: tx.transaction_id,
              account_id: accountId,
              transaction_date: tx.timestamp.split('T')[0],
              description: tx.description,
              amount: parseFloat(tx.amount),
              currency: tx.currency,
            }))
          );
        } catch (err) {
          console.error(`Error fetching transactions for account ${accountId}:`, err.message);
        }
      }

      if (allTransactions.length === 0) {
        continue;
      }

      const { error: upsertError, data: savedTransactions } = await sb
        .from('ob_transactions')
        .upsert(allTransactions, { onConflict: 'user_id,provider_transaction_id' })
        .select('id');

      if (upsertError) {
        console.error('Error saving transactions:', upsertError);
        continue;
      }

      totalPulled += savedTransactions?.length || 0;

      const { data: unmappedTxs } = await sb
        .from('ob_transactions')
        .select('id, description, amount, currency, transaction_date')
        .eq('user_id', userId)
        .not('id', 'in', `(select transaction_id from ob_transaction_mappings where user_id='${userId}')`);

      if (!unmappedTxs || unmappedTxs.length === 0) {
        continue;
      }

      const { data: items } = await sb.from('budget_items').select('id, name');
      const { data: currentMonth } = await sb
        .from('budget_months')
        .select('*')
        .order('month_date', { ascending: false })
        .limit(1)
        .single();

      if (!currentMonth || !items) continue;

      for (let i = 0; i < unmappedTxs.length; i += 20) {
        const batch = unmappedTxs.slice(i, i + 20);
        const batchWithIds = batch.map((tx) => ({
          ...tx,
          id: tx.id,
        }));

        try {
          const catResponse = await fetch(`${process.env.VERCEL_URL || 'https://reay-family-budget.vercel.app'}/api/ob-categorise`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transactions: batchWithIds,
              items,
              userId,
              month: currentMonth,
            }),
          });

          const catData = await catResponse.json();
          if (catResponse.ok) {
            totalCategorized += catData.autoConfirmed || 0;
          }
        } catch (err) {
          console.error('Error categorizing batch:', err.message);
        }
      }

      const { data: confirmedMappings } = await sb
        .from('ob_transaction_mappings')
        .select('transaction_id, item_id, month_id')
        .eq('user_id', userId)
        .eq('confirmed', true)
        .is('ignored', false);

      for (const mapping of confirmedMappings || []) {
        const { data: transaction } = await sb
          .from('ob_transactions')
          .select('amount, transaction_date')
          .eq('id', mapping.transaction_id)
          .single();

        if (!transaction) continue;

        const amount = Math.abs(transaction.amount);
        const { data: existing } = await sb
          .from('month_actuals')
          .select('*')
          .eq('month_id', mapping.month_id)
          .eq('item_id', mapping.item_id)
          .single();

        const currentAmount = existing?.amount || 0;

        await sb.from('month_actuals').upsert({
          month_id: mapping.month_id,
          item_id: mapping.item_id,
          amount: currentAmount + amount,
          updated_at: new Date().toISOString(),
        });
      }

      await sb
        .from('ob_connections')
        .update({ last_pull_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    res.json({
      success: true,
      usersProcessed: userIds.length,
      totalPulled,
      totalCategorized,
    });
  } catch (err) {
    console.error('Pull error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
