import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
// Exercise deployment artifacts, not the full development node_modules directory.
for (const route of ['registro','login','admin','admin/proveedores']) {
 const tracePath = `.next/server/app/${route}/page.js.nft.json`;
 const trace = JSON.parse(readFileSync(tracePath,'utf8'));
 for (const asset of ['query_compiler_bg.js','query_compiler_bg.wasm']) {
  const entry = trace.files.find(file => file.endsWith(`/.prisma/client/${asset}`));
  if (!entry || !existsSync(resolve(dirname(tracePath),entry))) throw new Error(`Missing Prisma deployment asset ${asset} for /${route}`);
 }
}
console.log('Prisma deployment assets verified.');
