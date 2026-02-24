import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initDatabase(): Promise<void> {
  try {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);

    // Migrations for existing databases
    await pool.query(
      `ALTER TABLE validators ADD COLUMN IF NOT EXISTS is_tracked BOOLEAN NOT NULL DEFAULT true`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS address_keys (
        key VARCHAR(16) PRIMARY KEY,
        validators TEXT[] NOT NULL DEFAULT '{}',
        wallets TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP,
        use_count INTEGER NOT NULL DEFAULT 0
      )`
    );

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}
