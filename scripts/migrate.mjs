import 'dotenv/config';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(71374263)");
 await client.query('CREATE TABLE IF NOT EXISTS "BoostifyMigration" (name text PRIMARY KEY, checksum text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now())');
 const dirs = (await readdir(new URL('../prisma/migrations/',import.meta.url),{withFileTypes:true})).filter(d => d.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
 for (const dir of dirs) {
   const sql = await readFile(new URL(`../prisma/migrations/${dir.name}/migration.sql`,import.meta.url),'utf8');
   const checksum = createHash('sha256').update(sql).digest('hex');
   const row = await client.query('SELECT checksum FROM "BoostifyMigration" WHERE name=$1',[dir.name]);
   if (row.rowCount) { if (row.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${dir.name}`); continue; }
   await client.query(sql);
   await client.query('INSERT INTO "BoostifyMigration" (name,checksum) VALUES ($1,$2)',[dir.name,checksum]);
   console.log(`Applied ${dir.name}`);
 }
 await client.query('COMMIT');
 console.log('Migrations verified.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
