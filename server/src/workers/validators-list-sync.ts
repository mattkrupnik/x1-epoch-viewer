import pool from '../db/connection.js';
import { fetchValidatorsList } from '../lib/xen-api.js';

const REFRESH_INTERVAL_MS = 6 * 60 * 60_000; // 6 hours (4 times/day)

async function needsRefresh(): Promise<boolean> {
  const result = await pool.query(
    `SELECT expires_at FROM cache_metadata WHERE cache_key = 'validators_list'`
  );
  if (result.rows.length === 0) return true;
  return new Date(result.rows[0].expires_at) < new Date();
}

async function syncValidatorsList(): Promise<void> {
  try {
    if (!(await needsRefresh())) {
      console.log('[validators-list-sync] Cache still valid, skipping');
      return;
    }

    console.log('[validators-list-sync] Fetching validators list from xen.network...');
    const validators = await fetchValidatorsList();
    console.log(`[validators-list-sync] Fetched ${validators.length} validators`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < validators.length; i += 100) {
        const chunk = validators.slice(i, i + 100);
        const values: any[] = [];
        const placeholders: string[] = [];

        chunk.forEach((v: any, idx: number) => {
          const offset = idx * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(v.votePubkey || null, v.nodePubkey || null, v.name || null, v.iconUrl || null);
        });

        await client.query(
          `INSERT INTO validators_list (vote_pubkey, node_pubkey, name, icon_url)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (vote_pubkey) DO UPDATE SET
             node_pubkey = EXCLUDED.node_pubkey,
             name = EXCLUDED.name,
             icon_url = EXCLUDED.icon_url`,
          values
        );
      }

      // Remove validators that are no longer in the list
      const allPubkeys = validators.map((v: any) => v.votePubkey).filter(Boolean);
      if (allPubkeys.length > 0) {
        await client.query(
          'DELETE FROM validators_list WHERE vote_pubkey != ALL($1)',
          [allPubkeys]
        );
      }

      const refreshIntervalSec = REFRESH_INTERVAL_MS / 1000;
      await client.query(
        `INSERT INTO cache_metadata (cache_key, last_updated, expires_at)
         VALUES ('validators_list', NOW(), NOW() + $1 * INTERVAL '1 second')
         ON CONFLICT (cache_key) DO UPDATE SET
           last_updated = NOW(),
           expires_at = NOW() + $1 * INTERVAL '1 second'`,
        [refreshIntervalSec]
      );

      await client.query('COMMIT');
      console.log(`[validators-list-sync] Saved ${validators.length} validators to DB`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[validators-list-sync] Error syncing validators list:', error);
  }
}

export function startValidatorsListSync(): void {
  syncValidatorsList();
  setInterval(syncValidatorsList, REFRESH_INTERVAL_MS);
}
