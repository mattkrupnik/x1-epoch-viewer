import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET /api/cache/epochs-metadata - Get epochs metadata (epoch -> endSlot)
router.get('/epochs-metadata', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT epoch, end_slot FROM epochs_metadata ORDER BY epoch DESC'
    );

    const data: Record<number, number> = {};
    for (const row of result.rows) {
      data[row.epoch] = parseInt(row.end_slot, 10);
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching epochs metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/cache/epochs-metadata - Save epochs metadata
router.post('/epochs-metadata', async (req, res) => {
  try {
    const { epochs } = req.body;

    if (!epochs || !Array.isArray(epochs)) {
      return res.status(400).json({ error: 'epochs array required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const { epoch, endSlot } of epochs) {
        await client.query(
          `INSERT INTO epochs_metadata (epoch, end_slot)
           VALUES ($1, $2)
           ON CONFLICT (epoch) DO NOTHING`,
          [epoch, endSlot]
        );
      }

      // Update cache metadata
      await client.query(
        `INSERT INTO cache_metadata (cache_key, last_updated, expires_at)
         VALUES ('epochs_metadata', NOW(), NOW() + INTERVAL '24 hours')
         ON CONFLICT (cache_key) DO UPDATE SET last_updated = NOW(), expires_at = NOW() + INTERVAL '24 hours'`
      );

      await client.query('COMMIT');
      res.json({ success: true, count: epochs.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving epochs metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
