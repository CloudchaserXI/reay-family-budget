export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transactions, items, userId, month } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'No transactions provided' });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'No budget items provided' });
    }

    const itemList = items.map((item) => `- ${item.name} (ID: ${item.id})`).join('\n');

    const txList = transactions
      .map((tx) => `- ${tx.transaction_date}: ${tx.description} (${tx.currency} ${Math.abs(tx.amount).toFixed(2)})`)
      .join('\n');

    const prompt = `You are a transaction categorizer. I have bank transactions and a list of budget categories.
For each transaction, respond with ONLY valid JSON (no markdown, no extra text).

Budget categories available:
${itemList}

Transactions to categorize:
${txList}

For each transaction (in the same order), respond with this JSON structure:
[
  { "index": 0, "itemId": <ID or null>, "confidence": <0.0-1.0> },
  { "index": 1, "itemId": <ID or null>, "confidence": <0.0-1.0> }
]

Rules:
1. If you can confidently match a transaction to a category, set itemId to that category's ID
2. If uncertain or no match, set itemId to null
3. Confidence 0.0-1.0: 0.90+ means auto-confirm, <0.90 requires user review
4. Debits (negative amounts) are expenses; credits (positive) are income
5. Return ONLY the JSON array, nothing else`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const categorizations = JSON.parse(data.content[0].text);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const mappings = [];
    for (const cat of categorizations) {
      const tx = transactions[cat.index];
      const { error: insertError } = await sb.from('ob_transaction_mappings').upsert(
        {
          transaction_id: tx.id,
          user_id: userId,
          item_id: cat.itemId,
          month_id: month.id,
          confidence: cat.confidence,
          source: 'ai',
          confirmed: cat.confidence >= 0.9,
        },
        { onConflict: 'transaction_id' }
      );

      if (insertError) throw insertError;
      mappings.push({
        transactionId: tx.id,
        itemId: cat.itemId,
        confidence: cat.confidence,
        autoConfirmed: cat.confidence >= 0.9,
      });
    }

    res.json({ success: true, mapped: mappings.length, autoConfirmed: mappings.filter((m) => m.autoConfirmed).length });
  } catch (err) {
    console.error('Categorize error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
