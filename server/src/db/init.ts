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

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}
