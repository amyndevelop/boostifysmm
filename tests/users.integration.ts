import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import {Role} from '@prisma/client';
import {db} from '../src/lib/db';
import {saveManagedUser,adjustUserBalance} from '../src/lib/user-management';
import {placeOrder} from '../src/lib/orders';
test('gestión de usuarios y ajustes manuales de saldo',async t=>{
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'));
 const fixture=async(role:Role='CUSTOMER')=>db.user.create({data:{name:'User fixture',email:`${randomUUID()}@test.invalid`,role,passwordHash:'not-for-login',wallet:{create:{}}}});
 const owner=await fixture('SUPER_ADMIN');const admin=await fixture('ADMIN');const customer=await fixture();
 const request=(userId:string,amount='100.00',direction:'CREDIT'|'DEBIT'='CREDIT')=>({userId,amount,direction,reason:'Ajuste de prueba con motivo',idempotencyKey:randomUUID()});
 await t.test('crea cuentas con Argon2id y saldo cero; audita sin contraseñas',async()=>{
  const password=`${randomUUID()}Aa!`;const created=await saveManagedUser(owner.id,{name:'Cuenta creada',email:`${randomUUID()}@test.invalid`,role:'CUSTOMER',blocked:false,password,reason:'Alta de cuenta de prueba'});
  const user=await db.user.findUniqueOrThrow({where:{id:created.id},include:{wallet:true}});
  assert.ok(user.passwordHash.startsWith('$argon2id$'));assert.ok(await argon2.verify(user.passwordHash,password));assert.equal(user.wallet!.available.toString(),'0');
  const audit=await db.auditLog.findFirstOrThrow({where:{reference:user.id,action:'CREATE_USER'}});assert.ok(!JSON.stringify(audit.metadata).includes(password));assert.ok(!JSON.stringify(audit.metadata).includes(user.passwordHash));
 });
 await t.test('acredita y descuenta decimales exactos, con libro mayor y auditoría',async()=>{
  const user=await fixture();const credit=await adjustUserBalance(owner.id,request(user.id,'125.75'));const debit=await adjustUserBalance(owner.id,request(user.id,'25.25','DEBIT'));
  assert.equal(credit.balanceBefore.toString(),'0');assert.equal(debit.balanceAfter.toString(),'100.5');
  const wallet=await db.wallet.findUniqueOrThrow({where:{userId:user.id}});assert.equal(wallet.available.toFixed(2),'100.50');
  const entry=await db.walletTransaction.findUniqueOrThrow({where:{id:debit.transactionId}});assert.equal(entry.amount.toString(),'-25.25');assert.equal(entry.reservedDelta.toString(),'0');
  assert.equal(await db.auditLog.count({where:{reference:{in:[credit.id,debit.id]}}}),2);assert.equal(await db.notification.count({where:{userId:user.id}}),2);
 });
 await t.test('el mismo reintento concurrente acredita una sola vez',async()=>{
  const user=await fixture();const input=request(user.id,'300.10');const results=await Promise.all([adjustUserBalance(owner.id,input),adjustUserBalance(owner.id,input)]);
  assert.equal(results[0].id,results[1].id);assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).available.toString(),'300.1');
  await assert.rejects(adjustUserBalance(owner.id,{...input,amount:'900'}),/ya se utilizó/);
  await assert.rejects(adjustUserBalance(owner.id,{...input,userId:customer.id}),/ya se utilizó/);
 });
 await t.test('dos descuentos simultáneos no dejan saldo negativo',async()=>{
  const user=await fixture();await adjustUserBalance(owner.id,request(user.id,'100'));
  const results=await Promise.allSettled([adjustUserBalance(owner.id,request(user.id,'70','DEBIT')),adjustUserBalance(owner.id,request(user.id,'70','DEBIT'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).available.toString(),'30');
 });
 await t.test('un pedido y un descuento compiten por el mismo saldo disponible',async()=>{
  const user=await fixture();await adjustUserBalance(owner.id,request(user.id,'100'));
  const provider=await db.provider.create({data:{name:'Demo concurrency',kind:'DEMO',active:true}});
  const service=await db.service.create({data:{providerId:provider.id,externalId:randomUUID(),name:'Servicio test',description:'Servicio de prueba',originalName:'Test',network:'Instagram',category:'Demo',rate:'1000',cost:'500',min:1,max:1000,allowedHosts:['instagram.com'],active:true}});
  const results=await Promise.allSettled([adjustUserBalance(owner.id,request(user.id,'70','DEBIT')),placeOrder(user.id,{serviceId:service.id,quantity:70,link:'https://instagram.com/test',quotedPrice:'70.00',idempotencyKey:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).available.toString(),'30');
 });
 await t.test('no descuenta fondos reservados ni acepta importes inválidos',async()=>{
  const user=await fixture();await adjustUserBalance(owner.id,request(user.id,'100'));
  await db.$transaction(async tx=>{const wallet=await tx.wallet.update({where:{userId:user.id},data:{available:{decrement:'80'},reserved:{increment:'80'}}});await tx.walletTransaction.create({data:{walletId:wallet.id,key:randomUUID(),type:'RESERVE',amount:'-80',reservedDelta:'80',reference:'Reserva fixture'}});});
  await assert.rejects(adjustUserBalance(owner.id,request(user.id,'21','DEBIT')),/reservado/);
  for(const amount of ['','-1','0','1.001','1e3','10000001'])await assert.rejects(adjustUserBalance(owner.id,request(user.id,amount)));
  await assert.rejects(adjustUserBalance(owner.id,{...request(user.id),reason:' '}));
  assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).reserved.toString(),'80');
 });
 await t.test('clientes y admins bloqueados no ajustan saldos; admins no escalan privilegios',async()=>{
  await assert.rejects(adjustUserBalance(customer.id,request(customer.id)),/permisos/);
  await assert.rejects(adjustUserBalance(admin.id,request(owner.id)),/superadministrador/);
  const blocked=await fixture('ADMIN');await db.user.update({where:{id:blocked.id},data:{blocked:true}});await assert.rejects(adjustUserBalance(blocked.id,request(customer.id)),/permisos/);
  await assert.rejects(saveManagedUser(admin.id,{id:customer.id,version:1,name:'Cliente',email:customer.email,role:'SUPER_ADMIN',blocked:false,password:'',reason:'Intento de escalamiento'}),/permisos/);
 });
 await t.test('bloqueo, cambio de rol y contraseña revocan sesiones; rechaza versiones obsoletas',async()=>{
  const user=await fixture();const session=()=>db.session.create({data:{id:randomUUID(),userId:user.id,expiresAt:new Date(Date.now()+60000)}});await session();
  const profile={id:user.id,version:user.version,name:user.name,email:user.email,role:'CUSTOMER',blocked:true,password:'',reason:'Bloqueo solicitado'};
  await saveManagedUser(admin.id,profile);assert.equal(await db.session.count({where:{userId:user.id}}),0);
  await assert.rejects(saveManagedUser(admin.id,profile),/cambió/);
  let saved=await db.user.findUniqueOrThrow({where:{id:user.id}});await saveManagedUser(admin.id,{...profile,version:saved.version,blocked:false,role:'RESELLER'});await session();
  saved=await db.user.findUniqueOrThrow({where:{id:user.id}});const password=randomUUID()+'Aa!';await saveManagedUser(admin.id,{...profile,version:saved.version,blocked:false,role:'RESELLER',password});assert.equal(await db.session.count({where:{userId:user.id}}),0);
 });
 await t.test('no permite bloquearse ni demoverse; cambios cruzados preservan un superadmin',async()=>{
  const profile={id:owner.id,version:owner.version,name:owner.name,email:owner.email,role:'SUPER_ADMIN',blocked:true,password:'',reason:'Prueba de bloqueo propio'};
  await assert.rejects(saveManagedUser(owner.id,profile),/propio rol/);await assert.rejects(saveManagedUser(owner.id,{...profile,blocked:false,role:'CUSTOMER'}),/propio rol/);
  const a=await fixture('SUPER_ADMIN');const b=await fixture('SUPER_ADMIN');const data=(u:typeof a)=>({id:u.id,version:u.version,name:u.name,email:u.email,role:'CUSTOMER',blocked:false,password:'',reason:'Cambio concurrente de rol'});
  const results=await Promise.allSettled([saveManagedUser(a.id,data(b)),saveManagedUser(b.id,data(a))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await db.user.count({where:{id:{in:[a.id,b.id]},role:'SUPER_ADMIN',blocked:false}}),1);
 });
 await t.test('los ajustes financieros no se pueden editar ni borrar',async()=>{
  const user=await fixture();const adjustment=await adjustUserBalance(owner.id,request(user.id));
  await assert.rejects(db.walletAdjustment.update({where:{id:adjustment.id},data:{amount:'1'}}));await assert.rejects(db.walletAdjustment.delete({where:{id:adjustment.id}}));
 });
 await db.$disconnect();
});
