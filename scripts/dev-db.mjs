import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
const envPath = new URL('../.env',import.meta.url);
if (!existsSync(envPath)) {
 const password = randomBytes(24).toString('hex');
 writeFileSync(envPath,`DATABASE_URL=postgresql://boostify:${password}@localhost:5432/boostify\nAPP_URL=http://localhost:3000\nAPP_MODE=demo\n`,{mode:0o600,flag:'wx'});
}
const values = parse(readFileSync(envPath));
const url = new URL(values.DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname) || values.APP_MODE !== 'demo') throw new Error('dev-db only manages the local demo database; existing external configuration was preserved.');
const env = { ...process.env };
for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete env[key];
const docker = args => spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8'});
const health = docker(['info','--format','{{.ServerVersion}}']);
if (health.status !== 0) throw new Error('Managed Docker daemon is unavailable. Restore the environment; do not start a competing daemon.');
const existing = docker(['container','inspect','--format','{{.State.Running}}','boostify-postgres']);
if (existing.status === 0) {
 if (existing.stdout.trim() !== 'true' && docker(['start','boostify-postgres']).status !== 0) throw new Error('Could not start local database.');
} else {
 const dir = mkdtempSync(join(tmpdir(),'boostify-pg-'));
 try {
   const path = join(dir,'postgres.env');
   writeFileSync(path,`POSTGRES_USER=${decodeURIComponent(url.username)}\nPOSTGRES_PASSWORD=${decodeURIComponent(url.password)}\nPOSTGRES_DB=${url.pathname.slice(1)}\n`,{mode:0o600});
   const run = docker(['run','-d','--name','boostify-postgres','--env-file',path,'-p','127.0.0.1:5432:5432','-v','boostify-pgdata:/var/lib/postgresql/data','postgres:16@sha256:933463a6c8eba2b9f5cd414138738cd8d5519cd2c471214c222652f547a66a32']);
   if (run.status !== 0) throw new Error('Could not create local PostgreSQL. Check Docker/network access.');
 } finally { rmSync(dir,{recursive:true,force:true}); }
}
for (let i=0;i<30;i++) {
 if (docker(['exec','boostify-postgres','pg_isready','-U',decodeURIComponent(url.username),'-d',url.pathname.slice(1)]).status === 0) { console.log('PostgreSQL demo ready.'); process.exit(0); }
 await new Promise(r => setTimeout(r,1000));
}
throw new Error('Database did not become ready within 30 seconds.');
