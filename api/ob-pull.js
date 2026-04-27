import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get all active connections
    const { data: connections, error: connError } = await sb
      .from('ob_connections')
      .select('user_id, access_token, account_ids')
      .eq('status', 'connected');

    if (connError) throw connError;

    let totalPulled = 0;
    const errors = [];

    for (const conn of connections || []) {
      try {
        await pullUserTransactions(conn, sb);
        totalPulled++;
      } catch (err) {
        errors.push({ user: conn.user_id, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Pulled transactions for ${totalPulled} users`,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (err) {
    console.error('Cron pull error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function pullUserTransactions(connection, sb) {
  const apiUrl = process.env.TRUELAYER_API_URL;
  const { user_id, access_token, account_ids } = connection;

  // Fetch accounts if not cached
  let accounts = account_ids || [];
  if (!accounts.length) {
    const accountsResp = await fetch(`${apiUrl}/data/v1/accounts`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!accountsResp.ok) {
      if (accountsResp.status === 401) {
        // Token expired, mark connection as expired
        await sb
          .from('ob_connections')
          .update({ status: 'expired' })
          .eq('user_id', user_id);
      }
      throw new Error(`Failed to fetch accounts: ${accountsResp.status}`);
    }

    const accountsData = await accountsResp.json();
    accounts = accountsData.results.map((a) => a.account_id);

    // Update cached account IDs
    await sb
      .from('ob_connections')
      .update({ account_ids: accounts })
      .eq('user_id', user_id);
  }

  // Fetch transactions for each account (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allTransactions = [];
  for (const accountId of accounts) {
    const txResp = await fetch(
      `${apiUrl}/data/v1/accounts/${accountId}/transactions?from=${thirtyDaysAgo.toISOString().split('T')[0]}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!txResp.ok) continue;

    const txData = await txResp.json();
    const transactions = txData.results || [];

    // Insert/deduplicate transactions
    for (const tx of transactions) {
      await sb.from('ob_transactions').upsert(
        {
          user_id,
          provider_transaction_id: tx.transaction_id,
          account_id: accountId,
          date: tx.timestamp.split('T')[0],
          description: tx.description,
          amount: Math.abs(+tx.amount), // Store as positive for expenses
          currency: tx.currency,
          transaction_type: tx.transaction_type,
        },
        { onConflict: 'user_id,provider_transaction_id' }
      );

      allTransactions.push(tx);
    }
  }

  // Trigger categorization if there are new unmapped transactions
  if (allTransactions.length > 0) {
    const { data: unmapped } = await sb
      .from('ob_transaction_mappings')
      .select('id')
      .eq('user_id', user_id)
      .is('item_id', null);

    if (!unmapped || unmapped.length > 0) {
      // Call categorization endpoint
      await fetch(new URL('/api/ob-categorise', process.env.VERCEL_URL).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user_id }),
      });
    }
  }

  // Update last_pull_at
  await sb
    .from('ob_connections')
    .update({ last_pull_at: new Date().toISOString() })
    .eq('user_id', user_id);
}
