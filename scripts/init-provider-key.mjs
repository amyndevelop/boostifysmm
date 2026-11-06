import { readFileSync, appendFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
const path = new URL('../.env',import.meta.url);
const values = parse(readFileSync(path));
if (values.PROVIDER_ENCRYPTION_KEY || process.env.PROVIDER_ENCRYPTION_KEY) {
 console.log('Clave maestra existente conservada.');
} else {
 appendFileSync(path,`\nPROVIDER_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`);
 chmodSync(path,0o600);
 console.log('Clave maestra generada en .env privado. Respaldala antes de cargar credenciales.');
}
