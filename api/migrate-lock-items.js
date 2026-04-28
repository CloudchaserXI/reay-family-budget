import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let pgClient;
  try {
    // Use Supabase connection string to execute raw SQL
    const connectionString = `postgresql://postgres:Lionshead2019!@db.pajlrdnhldmixcxbfqis.supabase.co:5432/postgres`;
    pgClient = new Client({ connectionString });
    await pgClient.connect();

    // Add is_locked column if it doesn't exist
    await pgClient.query(`
      ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
    `);
    console.log('✓ Added is_locked column');

    // Mark critical items as locked
    await pgClient.query(`
      UPDATE budget_items SET is_locked = TRUE
      WHERE name IN ('Goals Funding', 'Salary 1', 'Salary 2', 'Other Income');
    `);
    console.log('✓ Marked critical items as locked');

    await pgClient.end();

    res.json({
      success: true,
      message: 'Migration complete: is_locked column added and critical items locked'
    });
  } catch (err) {
    console.error('Migration error:', err.message);
    if (pgClient) await pgClient.end().catch(() => {});
    res.status(500).json({ error: err.message });
  }
}
