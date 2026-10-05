import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function checkDatabase() {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ready: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ready: false, latencyMs: Date.now() - startedAt, code: error?.code || 'DATABASE_UNAVAILABLE' };
  }
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
