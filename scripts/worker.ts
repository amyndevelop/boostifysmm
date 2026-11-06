import { runOnce } from '../src/lib/worker';
import { db } from '../src/lib/db';
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
process.on('SIGINT', () => { stopped = true; });
async function main() {
 console.log('BOOSTIFY worker iniciado.');
 while (!stopped) {
  try { if (await runOnce()) continue; } catch { console.error('Error de infraestructura en el worker; se reintentará la consulta, sin reenviar trabajos reclamados.'); }
  await new Promise(r => setTimeout(r, 2000));
 }
 await db.$disconnect();
}
main().catch(() => { process.exitCode = 1; });
