import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { onnotice: () => {} });
await sql.unsafe(readFileSync(join(here, 'schema.sql'), 'utf8'));
await sql.end();
console.log('Schema applied.');
