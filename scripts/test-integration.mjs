import 'dotenv/config';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Integration runner only provisions a local test database.');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
const found = await client.query("SELECT 1 FROM pg_database WHERE datname = 'boostify_test'");
if (!found.rowCount) await client.query('CREATE DATABASE boostify_test');
await client.end();
url.pathname = '/boostify_test';
const env = { ...process.env, DATABASE_URL: url.toString(), APP_MODE: 'demo' };
for (const [cmd,args] of [['node',['scripts/migrate.mjs']],['node',['--import','tsx','--test','--test-concurrency=1','tests/flows.integration.ts','tests/providers.integration.ts','tests/catalog.integration.ts','tests/users.integration.ts','tests/live-orders.integration.ts','tests/payments.integration.ts']]]) {
 const run = spawnSync(cmd,args,{env,stdio:'inherit'});
 if (run.status !== 0) process.exit(run.status ?? 1);
}
