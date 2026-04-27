import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get user's budget categories
    const { data: categories } = await sb
      .from('budget_categories')
      .select('id, name')
      .eq('user_id', userId);

    if (!categories || categories.length === 0) {
      return res.json({ message: 'No categories found' });
    }

    // Get unmapped transactions (batch of 20)
    const { data: unmappedTxs } = await sb
      .from('ob_transactions')
      .select('id, description, amount')
      .eq('user_id', userId)
      .not('id', 'in', `(
        SELECT transaction_id FROM ob_transaction_mappings WHERE user_id = '${userId}'
      )`)
      .limit(20);

    if (!unmappedTxs || unmappedTxs.length === 0) {
      return res.json({ message: 'No unmapped transactions' });
    }

    // Prepare prompt for Claude
    const categoryList = categories.map((c) => c.name).join(', ');
    const txList = unmappedTxs
      .map((tx) => `- "${tx.description}" (£${tx.amount})`)
      .join('\n');

    const prompt = `Categorize these bank transactions into these categories: ${categoryList}

Transactions:
${txList}

Return JSON array with objects: { description, category, confidence (0-1) }`;

    // Call Anthropic API
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:
          'You are a financial categorization assistant. Return only valid JSON, no markdown.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Anthropic API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawText =
      aiData.content && aiData.content[0] && aiData.content[0].text
        ? aiData.content[0].text
        : '';

    // Parse JSON (strip markdown if present)
    const jsonStr = rawText
      .trim()
      .replace(/^```json\n?|\n?```$/g, '')
      .trim();
    const categorizations = JSON.parse(jsonStr);

    // Store categorizations
    for (let i = 0; i < unmappedTxs.length; i++) {
      const tx = unmappedTxs[i];
      const cat = categorizations[i];

      if (!cat || !cat.category) continue;

      // Find category ID
      const categoryId = categories.find(
        (c) => c.name.toLowerCase() === cat.category.toLowerCase()
      )?.id;

      if (!categoryId) continue;

      const confidence = Math.min(cat.confidence || 0.5, 1);
      const autoConfirm = confidence >= 0.9;

      await sb.from('ob_transaction_mappings').insert({
        user_id: userId,
        transaction_id: tx.id,
        category_id: categoryId,
        confidence,
        source: 'ai',
        confirmed: autoConfirm,
      });
    }

    res.json({
      success: true,
      categorized: unmappedTxs.length,
      autoConfirmed: unmappedTxs.filter(
        (_, i) =>
          categorizations[i] &&
          categorizations[i].confidence >= 0.9
      ).length,
    });
  } catch (err) {
    console.error('Categorization error:', err);
    res.status(500).json({ error: err.message });
  }
}
