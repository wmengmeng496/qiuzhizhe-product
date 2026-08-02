import { pool } from './db.js';
import { applySchema } from './schema.js';

await applySchema();
await pool.end();
console.log('[db] schema applied');
