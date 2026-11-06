import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
// Exercise deployment artifacts, not the full development node_modules directory.
for (const route of ['registro','login','admin','admin/proveedores','admin/servicios','admin/categorias','admin/servicios/[id]','admin/usuarios','admin/usuarios/[id]','admin/pedidos','admin/pedidos/[id]']) {
 const tracePath = `.next/server/app/${route}/page.js.nft.json`;
 const trace = JSON.parse(readFileSync(tracePath,'utf8'));
 for (const asset of ['query_compiler_bg.js','query_compiler_bg.wasm']) {
  const entry = trace.files.find(file => file.endsWith(`/.prisma/client/${asset}`));
  if (!entry || !existsSync(resolve(dirname(tracePath),entry))) throw new Error(`Missing Prisma deployment asset ${asset} for /${route}`);
 }
}
console.log('Prisma deployment assets verified.');

for(const route of ['orders/sync','cron/orders']){const path=`.next/server/app/api/${route}/route.js.nft.json`;const files=JSON.parse(readFileSync(path,'utf8')).files;if(!files.some(file=>file.endsWith('/.prisma/client/query_compiler_bg.wasm')))throw new Error(`Missing Prisma WASM for API ${route}`);}
