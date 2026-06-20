import { appUrl, eb, createSupabase } from './_enablebanking.js';

// Pulls transactions from Enable Banking for every connected user, stores them,
// triggers AI categorisation, and rolls confirmed amounts into month_actuals.
// Called by the daily Vercel cron (Bearer CRON_SECRET) or on-demand with { userId }.
export default async function handler(req, res) {
  try {
    // Vercel Cron calls this with GET + "Authorization: Bearer <CRON_SECRET>".
    // On-demand calls pass { userId } (POST) or ?userId= (GET).
    const cronSecret = process.env.CRON_SECRET;
    const isCron =
      (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) ||
      (cronSecret && req.headers['x-cron-secret'] === cronSecret);
    const onDemandUserId = req.body?.userId || req.query?.userId;
    if (!isCron && !onDemandUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sb = await createSupabase();

    let userIds = [];
    if (onDemandUserId) {
      userIds = [onDemandUserId];
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
      // Enable Banking date_from expects a plain YYYY-MM-DD date.
      const fromDate = (connection.last_pull_at
        ? new Date(connection.last_pull_at)
        : new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
      )
        .toISOString()
        .split('T')[0];

      let allTransactions = [];
      let accessExpired = false;

      for (const accountId of accountIds) {
        // Transactions are paginated via continuation_key; loop until exhausted.
        let continuationKey = null;
        let guard = 0;
        do {
          const qs = new URLSearchParams({ date_from: fromDate });
          if (continuationKey) qs.set('continuation_key', continuationKey);
          const r = await eb(`/accounts/${accountId}/transactions?${qs.toString()}`, { method: 'GET' });

          if (!r.ok) {
            const summary = JSON.stringify(r.body || {});
            // Consent/session expired -> flag the connection for re-consent.
            if (r.status === 401 || r.status === 403 || /expired|invalid|consent|session/i.test(summary)) {
              accessExpired = true;
              console.log(`Access expired for user ${userId} account ${accountId}`);
            } else {
              // 429 = rate limited (free tier allows a few pulls/account/day). Skip.
              console.error(`Failed to fetch transactions for ${accountId}: ${r.status} ${summary}`);
            }
            break;
          }

          for (const tx of r.body?.transactions || []) {
            // Booked only, to match the previous behaviour (skip pending entries).
            if (tx.status && tx.status !== 'BOOK') continue;
            const rawAmount = parseFloat(tx.transaction_amount?.amount);
            if (Number.isNaN(rawAmount)) continue;
            // Enable Banking returns a positive amount + a direction indicator;
            // store debits as negative so Math.abs() spend logic stays correct.
            const signed = tx.credit_debit_indicator === 'DBIT' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
            const description =
              (Array.isArray(tx.remittance_information)
                ? tx.remittance_information.join(' ').trim()
                : tx.remittance_information || '') ||
              tx.creditor?.name ||
              tx.debtor?.name ||
              tx.additional_information ||
              'Unknown';
            const date = (tx.booking_date || tx.value_date || tx.transaction_date || '').split('T')[0];
            // Prefer a bank-stable id; fall back to a deterministic composite so
            // re-pulls dedupe via the (user_id, provider_transaction_id) unique key.
            const provId =
              tx.entry_reference ||
              tx.transaction_id ||
              `${accountId}:${date}:${signed}:${description}`.slice(0, 255);

            allTransactions.push({
              user_id: userId,
              provider_transaction_id: provId,
              account_id: accountId,
              transaction_date: date,
              description,
              amount: signed,
              currency: tx.transaction_amount?.currency || 'GBP',
            });
          }

          continuationKey = r.body?.continuation_key || null;
          guard += 1;
        } while (continuationKey && guard < 20);

        if (accessExpired) break;
      }

      if (accessExpired) {
        await sb.from('ob_connections').update({ status: 'expired' }).eq('user_id', userId);
      }

      if (allTransactions.length === 0) continue;

      const { error: upsertError, data: savedTransactions } = await sb
        .from('ob_transactions')
        .upsert(allTransactions, { onConflict: 'user_id,provider_transaction_id' })
        .select('id');

      if (upsertError) {
        console.error('Error saving transactions:', upsertError);
        continue;
      }
      totalPulled += savedTransactions?.length || 0;

      // Find transactions that have no mapping yet, ready for AI categorisation.
      const { data: unmappedTxs } = await sb
        .from('ob_transactions')
        .select('id, description, amount, currency, transaction_date')
        .eq('user_id', userId)
        .not('id', 'in', `(select transaction_id from ob_transaction_mappings where user_id='${userId}')`);

      if (!unmappedTxs || unmappedTxs.length === 0) continue;

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
        try {
          const catResponse = await fetch(`${appUrl()}/api/ob-categorise`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: batch, items, userId, month: currentMonth }),
          });
          const catData = await catResponse.json();
          if (catResponse.ok) totalCategorized += catData.autoConfirmed || 0;
        } catch (err) {
          console.error('Error categorizing batch:', err.message);
        }
      }

      // Roll confirmed (auto or manual) mappings into the monthly actuals.
      const { data: confirmedMappings } = await sb
        .from('ob_transaction_mappings')
        .select('transaction_id, item_id, month_id')
        .eq('user_id', userId)
        .eq('confirmed', true)
        .is('ignored', false);

      for (const mapping of confirmedMappings || []) {
        if (!mapping.item_id) continue;
        const { data: transaction } = await sb
          .from('ob_transactions')
          .select('amount')
          .eq('id', mapping.transaction_id)
          .single();
        if (!transaction) continue;

        const amount = Math.abs(transaction.amount);
        const { data: existing } = await sb
          .from('month_actuals')
          .select('amount')
          .eq('month_id', mapping.month_id)
          .eq('item_id', mapping.item_id)
          .single();

        await sb.from('month_actuals').upsert({
          month_id: mapping.month_id,
          item_id: mapping.item_id,
          amount: (existing?.amount || 0) + amount,
          updated_at: new Date().toISOString(),
        });
      }

      await sb
        .from('ob_connections')
        .update({ last_pull_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    res.json({ success: true, usersProcessed: userIds.length, totalPulled, totalCategorized });
  } catch (err) {
    console.error('Pull error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
