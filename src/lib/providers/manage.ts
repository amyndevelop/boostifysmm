import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { encryptProviderKey, decryptProviderKey } from './secrets';
import { validateProviderEndpoint } from './endpoint';
import { SmmtakeAdapter } from './smmtake';
export const providerConfigSchema = z.object({
 id: z.string().max(100).optional(),
 version: z.coerce.number().int().positive().optional(),
 name: z.string().trim().min(2,'Ingresá un nombre de proveedor.').max(100),
 endpoint: z.string().trim().max(2048).transform(validateProviderEndpoint),
 kind: z.enum(['SMMTAKE','SMM_V2']),
 apiKey: z.string().trim().max(2000).optional(),
 active: z.boolean(),
});
async function admin(actorId: string) {
 const user = await db.user.findUnique({where:{id:actorId}});
 if (!user || user.blocked || !['ADMIN','SUPER_ADMIN'].includes(user.role)) throw new Error('No tenés permisos para gestionar proveedores.');
}
export async function saveProviderConfig(actorId: string, input: unknown) {
 await admin(actorId);
 const data = providerConfigSchema.parse(input);
 const id = data.id || randomUUID();
 return db.$transaction(async tx => {
  const previous = data.id ? await tx.provider.findUnique({where:{id}}) : null;
  if (data.id && (!previous || previous.kind === 'DEMO')) throw new Error('Proveedor no editable.');
  if (!previous && !data.apiKey) throw new Error('Ingresá la clave API del nuevo proveedor.');
  if (previous && previous.endpoint !== data.endpoint && !data.apiKey) throw new Error('Al cambiar la URL, volvé a cargar la clave API para ese destino.');
  const encryptedKey = data.apiKey ? encryptProviderKey(data.apiKey,id) : previous?.encryptedKey;
  const changed = !previous || !!data.apiKey || previous.endpoint !== data.endpoint || previous.kind !== data.kind;
  const fields = { name:data.name,endpoint:data.endpoint,kind:data.kind,active:data.active,encryptedKey, ...(changed ? {connectionStatus:'UNTESTED',lastCheckedAt:null,balance:null,lastSyncAt:null} : {}) };
  if (previous) {
    const result = await tx.provider.updateMany({where:{id,version:data.version},data:{...fields,version:{increment:1}}});
    if (!data.version || !result.count) throw new Error('El proveedor cambió. Actualizá la pantalla antes de guardar.');
  } else await tx.provider.create({data:{id,...fields}});
  await tx.auditLog.create({data:{actorId,action:previous ? 'UPDATE_PROVIDER' : 'CREATE_PROVIDER',reference:id}});
  return {id};
 });
}
export async function readProvider(actorId: string, id: string, operation: 'balance' | 'services', transport?: typeof fetch) {
 await admin(actorId);
 const provider = await db.provider.findUnique({where:{id}});
 if (!provider || !['SMMTAKE','SMM_V2'].includes(provider.kind) || !provider.endpoint || !provider.encryptedKey) throw new Error('Configurá primero la URL y la clave API del proveedor.');
 const adapter = new SmmtakeAdapter(decryptProviderKey(provider.encryptedKey,id),transport ?? fetch,false,provider.endpoint);
 try {
  const balance = await adapter.getBalance();
  const services = operation === 'services' ? await adapter.getServices() : [];
  await db.$transaction(async tx => {
    // Serialize configuration edits/imports and avoid overwriting a newer credential's state.
    await tx.$queryRaw`SELECT id FROM "Provider" WHERE id = ${id} FOR UPDATE`;
    const result = await tx.provider.updateMany({where:{id,version:provider.version},data:{connectionStatus:'CONNECTED',lastCheckedAt:new Date(),balance:balance.balance,currency:balance.currency,...(operation === 'services' ? {lastSyncAt:new Date()} : {})}});
    if (!result.count) throw new Error('La configuración cambió durante la consulta.');
    for (const s of services) {
      const data = {name:s.name,category:s.category,type:s.type,rate:s.rate,currency:balance.currency,min:s.min,max:s.max,refill:s.refill,cancel:s.cancel,importedAt:new Date()};
      await tx.providerService.upsert({where:{providerId_externalId:{providerId:id,externalId:s.id}},create:{providerId:id,externalId:s.id,...data},update:data});
    }
    await tx.auditLog.create({data:{actorId,action:operation === 'services' ? 'IMPORT_PROVIDER_SERVICES' : 'TEST_PROVIDER_CONNECTION',reference:id}});
  },{timeout:60000});
  return operation === 'balance' ? `Conexión verificada. Saldo: ${balance.balance} ${balance.currency}.` : `${services.length} servicios importados y ocultos. Los precios comerciales se conservaron.`;
 } catch {
  await db.provider.updateMany({where:{id,version:provider.version},data:{connectionStatus:'ERROR',lastCheckedAt:new Date()}});
  throw new Error('No pudimos completar la consulta. Revisá URL, clave, compatibilidad de la API y acceso de red; luego probá nuevamente.');
 }
}
