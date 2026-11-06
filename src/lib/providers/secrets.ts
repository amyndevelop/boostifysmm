import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function masterKey() {
 const key = process.env.PROVIDER_ENCRYPTION_KEY;
 if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Falta configurar la clave maestra de cifrado del servidor.');
 return Buffer.from(key,'hex');
}
export function encryptProviderKey(secret: string, providerId: string) {
 const iv = randomBytes(12);
 const cipher = createCipheriv('aes-256-gcm',masterKey(),iv);
 cipher.setAAD(Buffer.from(`boostify:provider:${providerId}`));
 const ciphertext = Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),ciphertext.toString('base64')].join('.');
}
export function decryptProviderKey(encrypted: string, providerId: string) {
 try {
  const [version,iv,tag,data,...rest] = encrypted.split('.');
  if (version !== 'v1' || !iv || !tag || !data || rest.length) throw new Error();
  const decipher = createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(iv,'base64'));
  decipher.setAAD(Buffer.from(`boostify:provider:${providerId}`));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
 } catch { throw new Error('No se pudo descifrar la credencial del proveedor. Revisá la clave maestra del servidor.'); }
}
