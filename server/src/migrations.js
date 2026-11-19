import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(dirname, '../../database/migrations');
const checksum = (sql) => createHash('sha256').update(sql).digest('hex');

export async function applyMigrations(pool) {
  await pool.query('create table if not exists schema_migrations (version text primary key, checksum text not null, applied_at timestamptz not null default now())');
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = entries.filter((entry) => entry.isFile() && /^\d+_.+\.sql$/.test(entry.name)).map((entry) => entry.name).sort();
  for (const version of files) {
    const sql = await fs.readFile(path.join(migrationsDir, version), 'utf8');
    const digest = checksum(sql);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock($1)', [246813579]);
      const existing = await client.query('select checksum from schema_migrations where version=$1', [version]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== digest) throw new Error(`Migration checksum mismatch: ${version}`);
      } else {
        await client.query(sql);
        await client.query('insert into schema_migrations(version,checksum) values($1,$2)', [version, digest]);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
