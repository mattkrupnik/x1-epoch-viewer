import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET /api/epoch-timestamps - Get all cached epoch timestamps
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT epoch, timestamp_str FROM epoch_timestamps ORDER BY epoch DESC'
    );

    const data: Record<number, string> = {};
    for (const row of result.rows) {
      data[row.epoch] = row.timestamp_str;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching epoch timestamps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
