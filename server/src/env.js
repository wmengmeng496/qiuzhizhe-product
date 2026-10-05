import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolve configuration relative to the server package, not the caller's cwd.
dotenv.config({ path: path.join(serverDir, '.env'), override: false });
dotenv.config({ path: path.resolve(serverDir, '../.env'), override: false });
