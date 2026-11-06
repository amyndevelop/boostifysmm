import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { placeOrder, approveDeposit } from '../src/lib/orders';
import { runOnce } from '../src/lib/worker';
const suffix = randomUUID();
test('flujos transaccionales con PostgreSQL real', async t => {
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'));
 const provider = await db.provider.create({ data: { name: 'Integration demo', kind:'DEMO', active:true } });
 const service = await db.service.create({ data: { providerId: provider.id, name:'Integration service', description:'Integration test', originalName:'Test', network:'Instagram', category:'Test', externalId:suffix, rate:'5000', cost:'2500', min:50, max:50000, allowedHosts:['instagram.com'], active:true } });
 const makeUser = async (available = '10000', role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER') => {
   const user = await db.user.create({ data: { name:'Integration', email:`${randomUUID()}@integration.invalid`, passwordHash:'not-a-login-hash', role, wallet:{create:{}} } });
   if (available !== '0') await db.$transaction(async tx => {
     const wallet = await tx.wallet.update({ where: { userId: user.id }, data: { available } });
     await tx.walletTransaction.create({ data: { walletId: wallet.id, key:randomUUID(), type:'TEST_CREDIT', amount:available, reference:'Test fixture' } });
   });
   return user;
 };
 const input = (quantity = 350) => ({ serviceId:service.id, quantity, link:'https://instagram.com/integration', quotedPrice:(quantity * 5).toFixed(2), idempotencyKey:randomUUID() });
 await t.test('cantidades manuales obligatorias y precios históricos',async () => {
   const user = await makeUser('100000');
   for (const q of [125,350,750,1250,12500]) { const o = await placeOrder(user.id,input(q)); assert.equal(o.quantity,q); assert.equal(o.price.toFixed(2),(q * 5).toFixed(2)); }
 });
 await t.test('rechaza mínimos, máximos, vacío, decimales, negativos y saldo insuficiente',async () => {
   const user = await makeUser('0');
   for (const q of [49,50001,0,-1,1.5]) await assert.rejects(placeOrder(user.id,input(q)));
   await assert.rejects(placeOrder(user.id,{...input(),quantity:''}));
   await assert.rejects(placeOrder(user.id,input(125)),/Saldo insuficiente/);
 });
 await t.test('dos compras simultáneas no gastan el mismo saldo',async () => {
   const user = await makeUser('1000');
   const results = await Promise.allSettled([placeOrder(user.id,input(125)),placeOrder(user.id,input(125))]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
   const wallet = await db.wallet.findUniqueOrThrow({where:{userId:user.id}});
   assert.equal(wallet.available.toString(),'375'); assert.equal(wallet.reserved.toString(),'625');
 });
 await t.test('reintentos concurrentes son idempotentes y rechazan reutilización distinta',async () => {
   const user = await makeUser(); const request = input();
   const orders = await Promise.all([placeOrder(user.id,request),placeOrder(user.id,request)]);
   assert.equal(orders[0].id,orders[1].id);
   assert.equal(await db.walletTransaction.count({where:{key:`reserve:${orders[0].id}`}}),1);
   await assert.rejects(placeOrder(user.id,{...request,quantity:750,quotedPrice:'3750.00'}));
 });
 await t.test('no acepta precio frontend ni modifica el histórico al editar tarifa',async () => {
   const user = await makeUser(); const o = await placeOrder(user.id,input());
   await assert.rejects(placeOrder(user.id,{...input(),quotedPrice:'0.01'}));
   await db.service.update({where:{id:service.id},data:{rate:'6000'}});
   assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).rateSnapshot.toString(),'5000');
   await assert.rejects(placeOrder(user.id,input()),/precio cambió/);
   await db.service.update({where:{id:service.id},data:{rate:'5000'}});
 });
 await t.test('acreditación única y autorización administrativa',async () => {
   const user = await makeUser('0'); const admin = await makeUser('0','ADMIN');
   const d = await db.depositRequest.create({data:{userId:user.id,amount:'2000',reference:'Fixture',receipt:Buffer.from('test'),mimeType:'image/png'}});
   await assert.rejects(approveDeposit(user.id,d.id),/Sin permisos/);
   const results = await Promise.allSettled([approveDeposit(admin.id,d.id),approveDeposit(admin.id,d.id)]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
   assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).available.toString(),'2000');
 });
 await t.test('el libro mayor rechaza modificaciones y la base rechaza saldo negativo',async () => {
   const user = await makeUser(); const wallet = await db.wallet.findUniqueOrThrow({where:{userId:user.id}});
   const entry = await db.walletTransaction.findFirstOrThrow({where:{walletId:wallet.id}});
   await assert.rejects(db.walletTransaction.update({where:{id:entry.id},data:{amount:'1'}}));
   await assert.rejects(db.wallet.update({where:{id:wallet.id},data:{available:'-1'}}));
 });
 await t.test('worker demo liquida una sola vez y trabajos inciertos nunca se reenvían',async () => {
   const user = await makeUser(); const o = await placeOrder(user.id,input());
   for (let i=0;i<40;i++) if (!await runOnce()) break;
   assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).status,'COMPLETED');
   assert.equal(await db.walletTransaction.count({where:{key:`capture:${o.id}`}}),1);
   const uncertain = await placeOrder(user.id,input());
   await db.job.update({where:{orderId:uncertain.id},data:{state:'CLAIMED',claimedAt:new Date(0)}});
   await runOnce(); await runOnce();
   const order = await db.order.findUniqueOrThrow({where:{id:uncertain.id}});
   assert.equal(order.status,'REVIEW_REQUIRED'); assert.equal(order.externalId,null);
 });
 await db.$disconnect();
});
