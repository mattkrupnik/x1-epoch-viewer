import { randomBytes } from 'crypto';
import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_ADDRESSES_TOTAL = 200;
const KEY_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KEY_LENGTH = 10;
const KEY_RETRY_LIMIT = 5;

function normalizeAddresses(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const deduped = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  for (const address of deduped) {
    if (!BASE58_RE.test(address)) {
      throw new Error(`Invalid address in ${fieldName}`);
    }
  }

  return deduped;
}

function generateKey(): string {
  const bytes = randomBytes(KEY_LENGTH);
  let result = '';
  for (let i = 0; i < KEY_LENGTH; i += 1) {
    result += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return result;
}

router.post('/', async (req, res) => {
  try {
    const validators = normalizeAddresses(req.body?.validators, 'validators');
    const wallets = normalizeAddresses(req.body?.wallets, 'wallets');

    if (validators.length + wallets.length > MAX_ADDRESSES_TOTAL) {
      return res.status(400).json({ error: `Too many addresses. Max ${MAX_ADDRESSES_TOTAL}.` });
    }

    for (let attempt = 0; attempt < KEY_RETRY_LIMIT; attempt += 1) {
      const key = generateKey();
      try {
        const result = await pool.query(
          `INSERT INTO address_keys (key, validators, wallets)
           VALUES ($1, $2, $3)
           RETURNING key, created_at`,
          [key, validators, wallets]
        );

        return res.json({
          key: result.rows[0].key,
          validatorsCount: validators.length,
          walletsCount: wallets.length,
          createdAt: result.rows[0].created_at,
        });
      } catch (error: any) {
        if (error?.code === '23505') {
          continue;
        }
        throw error;
      }
    }

    return res.status(500).json({ error: 'Failed to generate unique key' });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('must be an array')) {
      return res.status(400).json({ error: error.message });
    }
    if (typeof error?.message === 'string' && error.message.includes('Invalid address')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating address key:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || key.length > 32) {
      return res.status(400).json({ error: 'Invalid key format' });
    }

    const result = await pool.query(
      `UPDATE address_keys
       SET last_used_at = NOW(), use_count = use_count + 1
       WHERE key = $1
       RETURNING key, validators, wallets, created_at, updated_at`,
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const row = result.rows[0];
    return res.json({
      key: row.key,
      validators: row.validators || [],
      wallets: row.wallets || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Error fetching address key:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || key.length > 32) {
      return res.status(400).json({ error: 'Invalid key format' });
    }

    const validators = normalizeAddresses(req.body?.validators, 'validators');
    const wallets = normalizeAddresses(req.body?.wallets, 'wallets');

    if (validators.length + wallets.length > MAX_ADDRESSES_TOTAL) {
      return res.status(400).json({ error: `Too many addresses. Max ${MAX_ADDRESSES_TOTAL}.` });
    }

    const result = await pool.query(
      `UPDATE address_keys
       SET validators = $2, wallets = $3, updated_at = NOW()
       WHERE key = $1
       RETURNING key, updated_at`,
      [key, validators, wallets]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }

    return res.json({
      key: result.rows[0].key,
      validatorsCount: validators.length,
      walletsCount: wallets.length,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('must be an array')) {
      return res.status(400).json({ error: error.message });
    }
    if (typeof error?.message === 'string' && error.message.includes('Invalid address')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating address key:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
