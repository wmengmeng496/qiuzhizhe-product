import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(dirname, '../../database/schema.sql');

export async function applySchema() {
  const sql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(sql);
}
