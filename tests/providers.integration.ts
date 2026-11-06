import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { saveProviderConfig, readProvider } from '../src/lib/providers/manage';
import { decryptProviderKey } from '../src/lib/providers/secrets';
test('varios proveedores persisten credenciales y catálogos aislados',async t => {
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'));
 process.env.PROVIDER_ENCRYPTION_KEY = randomBytes(32).toString('hex');
 const admin = await db.user.create({data:{email:`${randomUUID()}@test.invalid`,name:'Admin Test',passwordHash:'not-a-login',role:'ADMIN'}});
 const customer = await db.user.create({data:{email:`${randomUUID()}@test.invalid`,name:'Customer',passwordHash:'not-a-login'}});
 const config = {name:'Proveedor A',endpoint:'https://provider-a.com/api/v2',kind:'SMM_V2',apiKey:'key-a-not-real',active:false};
 await t.test('autoriza exclusivamente administradores',async () => { await assert.rejects(saveProviderConfig(customer.id,config),/permisos/); });
 const a = await saveProviderConfig(admin.id,config);
 const b = await saveProviderConfig(admin.id,{...config,name:'Proveedor B',endpoint:'https://provider-b.com/api',apiKey:'key-b-not-real'});
 const first = await db.provider.findUniqueOrThrow({where:{id:a.id}});
 await t.test('guarda cifrado y conserva o reemplaza la clave de cada proveedor',async () => {
  assert.notEqual(first.encryptedKey,config.apiKey);
  assert.equal(decryptProviderKey(first.encryptedKey!,a.id),config.apiKey);
  await saveProviderConfig(admin.id,{...config,id:a.id,version:first.version,name:'Proveedor A editado',apiKey:''});
  const edited = await db.provider.findUniqueOrThrow({where:{id:a.id}});
  assert.equal(edited.encryptedKey,first.encryptedKey);
  await assert.rejects(saveProviderConfig(admin.id,{...config,id:a.id,version:first.version}),/cambió/);
  await assert.rejects(saveProviderConfig(admin.id,{...config,id:a.id,version:edited.version,endpoint:'https://other-provider.com/api',apiKey:''}),/URL/);
  await saveProviderConfig(admin.id,{...config,id:a.id,version:edited.version,apiKey:'replacement-key'});
  assert.equal(decryptProviderKey((await db.provider.findUniqueOrThrow({where:{id:b.id}})).encryptedKey!,b.id),'key-b-not-real');
 });
 const transport: typeof fetch = async (url,init) => {
  const params = init!.body as URLSearchParams;
  const isA = String(url).includes('provider-a.com');
  assert.equal(params.get('key'),isA ? 'replacement-key' : 'key-b-not-real');
  if (params.get('action') === 'balance') return Response.json({balance:isA ? '12.34' : '56.78',currency:'USD'});
  assert.equal(params.get('action'),'services');
  return Response.json([{service:1,name:isA ? 'Catalog A' : 'Catalog B',type:'Default',category:'Test',rate:'0.90',min:'50',max:'10000',refill:true,cancel:false}]);
 };
 await t.test('conexión e importación usan el destino seleccionado aunque IDs externos coincidan',async () => {
  await readProvider(admin.id,a.id,'services',transport); await readProvider(admin.id,b.id,'services',transport);
  const catalog = await db.providerService.findMany({where:{providerId:{in:[a.id,b.id]}}});
  assert.equal(catalog.length,2);
  assert.equal(catalog.find(s => s.providerId === a.id)!.name,'Catalog A');
  assert.equal(catalog.find(s => s.providerId === b.id)!.name,'Catalog B');
  assert.equal(await db.service.count({where:{providerId:{in:[a.id,b.id]}}}),0);
  assert.equal((await db.provider.findUniqueOrThrow({where:{id:b.id}})).balance!.toString(),'56.78');
  await readProvider(admin.id,a.id,'services',transport);
  assert.equal(await db.providerService.count({where:{providerId:a.id}}),1);
 });
 await t.test('errores actualizan estado sin filtrar claves',async () => {
  await assert.rejects(readProvider(admin.id,a.id,'balance',async () => { throw new Error('replacement-key'); }),e => e instanceof Error && !e.message.includes('replacement-key'));
  assert.equal((await db.provider.findUniqueOrThrow({where:{id:a.id}})).connectionStatus,'ERROR');
 });
 await t.test('importa catálogos grandes en varios lotes sin duplicar servicios',async()=>{
  const transport:typeof fetch=async(_,init)=>Response.json((init!.body as URLSearchParams).get('action')==='balance'?{balance:'50',currency:'USD'}:Array.from({length:501},(_,i)=>({service:i+1,name:`Servicio ${i+1}`,category:'Catálogo amplio',type:'Default',rate:'0.90',min:'50',max:'10000',refill:true,cancel:false})));
  await readProvider(admin.id,b.id,'services',transport);
  assert.equal(await db.providerService.count({where:{providerId:b.id,available:true}}),501);
  assert.equal(await db.providerService.count({where:{providerId:a.id}}),1);
 });
 await db.$disconnect();
});
