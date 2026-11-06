import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptProviderKey, decryptProviderKey } from '../src/lib/providers/secrets';
import { validateProviderEndpoint } from '../src/lib/providers/endpoint';
test('cifrado autenticado, IV aleatorio y aislamiento por proveedor',() => {
 const original = process.env.PROVIDER_ENCRYPTION_KEY;
 process.env.PROVIDER_ENCRYPTION_KEY = randomBytes(32).toString('hex');
 try {
  const a = encryptProviderKey('fake-api-key','a'); const b = encryptProviderKey('fake-api-key','a');
  assert.notEqual(a,b); assert.ok(!a.includes('fake-api-key'));
  assert.equal(decryptProviderKey(a,'a'),'fake-api-key');
  assert.throws(() => decryptProviderKey(a,'b'));
  const parts = a.split('.'); parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptProviderKey(parts.join('.'),'a'));
  process.env.PROVIDER_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  assert.throws(() => decryptProviderKey(a,'a'));
 } finally { if (original === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY; else process.env.PROVIDER_ENCRYPTION_KEY = original; }
});
test('rechaza credenciales sin clave maestra',() => {
 const original = process.env.PROVIDER_ENCRYPTION_KEY; delete process.env.PROVIDER_ENCRYPTION_KEY;
 try { assert.throws(() => encryptProviderKey('secret','provider')); }
 finally { if (original !== undefined) process.env.PROVIDER_ENCRYPTION_KEY = original; }
});
test('no admite URLs locales, IPs, HTTP, credenciales, query ni redirecciones de puerto',() => {
 for (const url of ['http://provider.com/api','https://localhost/api','https://127.0.0.1/api','https://[::1]/api','https://169.254.169.254/api','https://metadata.internal/api','https://x:password@provider.com/api','https://provider.com/api?key=secret','https://provider.com:444/api','https://provider.com/api#fragment']) assert.throws(() => validateProviderEndpoint(url));
 assert.equal(validateProviderEndpoint('https://provider.com/custom-api'),'https://provider.com/custom-api');
});
