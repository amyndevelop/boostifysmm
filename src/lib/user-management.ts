import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
export const roleLabels:Record<Role,string>={SUPER_ADMIN:'Superadministrador',ADMIN:'Administrador',CUSTOMER:'Cliente',RESELLER:'Revendedor'};
const password=z.string().max(128).refine(v=>v===''||v.length>=12,'La contraseña debe tener al menos 12 caracteres.');
export const managedUserSchema=z.object({id:z.string().optional(),version:z.coerce.number().int().positive().optional(),name:z.string().trim().min(2).max(80),email:z.email('Ingresá un email válido.').max(254).transform(v=>v.toLowerCase()),role:z.enum(Role),blocked:z.boolean(),password,reason:z.string().trim().min(5,'Ingresá el motivo del cambio.').max(500)});
export const adjustmentSchema=z.object({userId:z.string().min(1),direction:z.enum(['CREDIT','DEBIT']),amount:z.string().regex(/^\d{1,8}(\.\d{1,2})?$/,'Ingresá un importe positivo con hasta 2 decimales.').refine(v=>new Prisma.Decimal(v).gt(0)&&new Prisma.Decimal(v).lte(10000000),'El importe debe ser mayor que cero y hasta $10.000.000.'),reason:z.string().trim().min(5,'Ingresá un motivo de al menos 5 caracteres.').max(500),idempotencyKey:z.uuid()});
async function authorizedActor(tx:Prisma.TransactionClient,actorId:string,targetRole?:Role){
 const actor=await tx.user.findUnique({where:{id:actorId}});
 if(!actor||actor.blocked||!['ADMIN','SUPER_ADMIN'].includes(actor.role))throw new Error('No tenés permisos para gestionar usuarios y saldos.');
 if(targetRole&&actor.role!=='SUPER_ADMIN'&&['ADMIN','SUPER_ADMIN'].includes(targetRole))throw new Error('Solo un superadministrador puede gestionar cuentas administrativas.');
 return actor;
}
export async function saveManagedUser(actorId:string,input:unknown){
 const data=managedUserSchema.parse(input);
 if(!data.id&&!data.password)throw new Error('Ingresá una contraseña inicial de al menos 12 caracteres.');
 const passwordHash=data.password?await argon2.hash(data.password,{type:argon2.argon2id}):undefined;
 return db.$transaction(async tx=>{
  // All role/status changes serialize, preserving an active superadministrator.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(71374264)`;
  const previous=data.id?await tx.user.findUniqueOrThrow({where:{id:data.id}}):null;
  const actor=await authorizedActor(tx,actorId,previous?.role);
  if(actor.role!=='SUPER_ADMIN'&&['ADMIN','SUPER_ADMIN'].includes(data.role))throw new Error('No podés asignar permisos administrativos.');
  if(previous&&(!data.version||data.version!==previous.version))throw new Error('La cuenta cambió. Actualizá la pantalla antes de guardar.');
  if(previous?.id===actorId&&(data.blocked||data.role!==actor.role))throw new Error('No podés bloquearte ni cambiar tu propio rol desde este panel.');
  if(previous?.role==='SUPER_ADMIN'&&!previous.blocked&&(data.role!=='SUPER_ADMIN'||data.blocked)){
   if(await tx.user.count({where:{role:'SUPER_ADMIN',blocked:false}})<=1)throw new Error('Debe quedar al menos un superadministrador activo.');
  }
  const fields={name:data.name,email:data.email,role:data.role,blocked:data.blocked,...(passwordHash?{passwordHash}:{})};
  const user=previous?await tx.user.update({where:{id:previous.id},data:{...fields,version:{increment:1}}}):await tx.user.create({data:{...fields,passwordHash:passwordHash!,wallet:{create:{}}}});
  if(previous&&(passwordHash||data.blocked||data.role!==previous.role))await tx.session.deleteMany({where:{userId:user.id}});
  await tx.auditLog.create({data:{actorId,action:previous?'UPDATE_USER':'CREATE_USER',reference:user.id,metadata:{reason:data.reason,before:previous?{name:previous.name,email:previous.email,role:previous.role,blocked:previous.blocked}:null,after:{name:user.name,email:user.email,role:user.role,blocked:user.blocked},passwordChanged:Boolean(passwordHash)}}});
  return {id:user.id};
 });
}
export async function adjustUserBalance(actorId:string,input:unknown){
 const data=adjustmentSchema.parse(input);
 const amount=new Prisma.Decimal(data.amount).toDecimalPlaces(2);
 const fingerprint=createHash('sha256').update(JSON.stringify({userId:data.userId,direction:data.direction,amount:amount.toFixed(2),reason:data.reason})).digest('hex');
 return db.$transaction(async tx=>{
  const target=await tx.user.findUniqueOrThrow({where:{id:data.userId}});
  await authorizedActor(tx,actorId,target.role);
  // Serialize retries even if the same key is reused against another wallet.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`wallet-adjustment:${actorId}:${data.idempotencyKey}`},0))`;
  const wallets=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Wallet" WHERE "userId"=${data.userId} FOR UPDATE`;
  if(!wallets.length)throw new Error('La cuenta no tiene una billetera disponible.');
  const previous=await tx.walletAdjustment.findUnique({where:{actorId_idempotencyKey:{actorId,idempotencyKey:data.idempotencyKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Esta confirmación ya se utilizó para un ajuste diferente. Actualizá el historial antes de continuar.');return previous;}
  const wallet=await tx.wallet.findUniqueOrThrow({where:{id:wallets[0].id}});
  if(wallet.currency!=='ARS')throw new Error('Solo se admiten ajustes manuales en billeteras ARS.');
  if(data.direction==='DEBIT'&&wallet.available.lt(amount))throw new Error('El saldo disponible no alcanza para descontar ese importe. El saldo reservado no se puede descontar.');
  const signed=data.direction==='CREDIT'?amount:amount.neg();const balanceAfter=wallet.available.add(signed);
  if(balanceAfter.gt('9999999999999999.99'))throw new Error('El saldo resultante supera el límite admitido.');
  const transaction=await tx.walletTransaction.create({data:{walletId:wallet.id,key:`manual:${actorId}:${data.idempotencyKey}`,type:data.direction==='CREDIT'?'MANUAL_CREDIT':'MANUAL_DEBIT',amount:signed,reference:data.reason}});
  await tx.wallet.update({where:{id:wallet.id},data:{available:balanceAfter}});
  const adjustment=await tx.walletAdjustment.create({data:{userId:target.id,actorId,walletId:wallet.id,transactionId:transaction.id,idempotencyKey:data.idempotencyKey,fingerprint,direction:data.direction,amount,balanceBefore:wallet.available,balanceAfter,reason:data.reason}});
  await tx.auditLog.create({data:{actorId,action:data.direction==='CREDIT'?'MANUAL_BALANCE_CREDIT':'MANUAL_BALANCE_DEBIT',reference:adjustment.id,metadata:{userId:target.id,reason:data.reason,amount:amount.toFixed(2),balanceBefore:wallet.available.toFixed(2),balanceAfter:balanceAfter.toFixed(2)}}});
  await tx.notification.create({data:{userId:target.id,message:`${data.direction==='CREDIT'?'Se acreditaron':'Se descontaron'} ARS ${amount.toFixed(2)} de tu saldo por un ajuste administrativo. Motivo: ${data.reason}`}});
  return adjustment;
 });
}
