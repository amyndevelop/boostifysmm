import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from './db';
import {captureOrder,releaseOrder,withOrderWallet} from './order-finance';
import {configuredProvider,credentialFingerprint} from './providers/configured';
import {synchronizeOrder} from './worker';
async function admin(actorId:string,tx:Prisma.TransactionClient=db,targetUserId?:string){
 const user=await tx.user.findUnique({where:{id:actorId}});
 if(!user||user.blocked||!['ADMIN','SUPER_ADMIN'].includes(user.role))throw new Error('No tenés permisos para conciliar pedidos.');
 if(targetUserId&&user.role!=='SUPER_ADMIN'){
  const target=await tx.user.findUniqueOrThrow({where:{id:targetUserId}});if(['ADMIN','SUPER_ADMIN'].includes(target.role))throw new Error('Solo un superadministrador puede conciliar cuentas administrativas.');
 }
 return user;
}
const confirmation={reason:z.string().trim().min(10,'Describí la verificación realizada (mínimo 10 caracteres).').max(1000),verified:z.literal(true,{error:'Confirmá que verificaste el resultado en el proveedor.'})};
export async function reconcileOrder(actorId:string,input:unknown,transport?:typeof fetch){
 const data=z.object({orderId:z.string().min(1),resolution:z.enum(['LINK','NOT_CREATED']),externalId:z.string().regex(/^[1-9]\d*$/).optional(),useCurrentConfiguration:z.boolean().optional(),...confirmation}).parse(input);
 await admin(actorId);const order=await db.order.findUniqueOrThrow({where:{id:data.orderId}});
 if(data.resolution==='LINK'){
  if(!data.externalId)throw new Error('Ingresá el ID externo verificado.');
  const adapter=await configuredProvider(order,{transport,allowChangedConfiguration:data.useCurrentConfiguration});await adapter.getOrderStatus(data.externalId);
 }
 await withOrderWallet(order.id,async(tx,fresh,wallet)=>{
  await admin(actorId,tx,fresh.userId);
  if(fresh.financialState!=='RESERVED'||fresh.status!=='REVIEW_REQUIRED')throw new Error('El pedido ya se resolvió o no tiene una reserva pendiente de conciliación.');
  const request=await tx.providerRequest.findUnique({where:{orderId:fresh.id}});
  if(data.resolution==='NOT_CREATED'){
   if(fresh.externalId||request?.externalId||request?.outcome==='ACCEPTED')throw new Error('Existe evidencia de un ID externo. Verificá y vinculá el pedido en lugar de liberar su saldo.');
   if(request&&request.createdAt.getTime()>Date.now()-60000)throw new Error('Esperá al menos un minuto desde el envío y verificá que el proveedor no lo haya creado.');
   await releaseOrder(tx,fresh,wallet,`Se confirmó que el pedido ${fresh.id} no fue creado y se liberó tu saldo.`);
   await tx.order.update({where:{id:fresh.id},data:{status:'FAILED',events:{create:{status:'FAILED',message:'Administración verificó que el proveedor no creó el pedido. Se liberó la reserva.'}}}});
  }else{
   if(request?.externalId&&request.externalId!==data.externalId)throw new Error('El envío registró otro ID externo. Revisá la evidencia antes de vincularlo.');
   await captureOrder(tx,fresh,wallet);
   const provider=await tx.provider.findUniqueOrThrow({where:{id:fresh.providerSnapshot}});
   await tx.order.update({where:{id:fresh.id},data:{externalId:data.externalId,status:'PROCESSING',nextSyncAt:new Date(),...(data.useCurrentConfiguration?{providerEndpointSnapshot:provider.endpoint,providerCredentialFingerprint:provider.encryptedKey?credentialFingerprint(provider.encryptedKey):null}:{}),events:{create:{status:'PROCESSING',message:'Administración vinculó el pedido confirmado en el proveedor. Se reanudó su seguimiento.'}}}});
   await tx.providerRequest.updateMany({where:{orderId:fresh.id},data:{outcome:'ACCEPTED',externalId:data.externalId}});
  }
  await tx.job.updateMany({where:{orderId:fresh.id},data:{state:'DONE',leaseToken:null}});
  await tx.auditLog.create({data:{actorId,action:data.resolution==='LINK'?'RECONCILE_ORDER_LINK':'RECONCILE_ORDER_NOT_CREATED',reference:fresh.id,metadata:{reason:data.reason,externalId:data.externalId??null,useCurrentConfiguration:data.useCurrentConfiguration??false}}});
 });
 if(data.resolution==='LINK')await synchronizeOrder(order.id,{transport,force:true});
}
export async function refundOrder(actorId:string,input:unknown){
 const data=z.object({orderId:z.string().min(1),amount:z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).refine(v=>new Prisma.Decimal(v).gt(0)),idempotencyKey:z.uuid(),...confirmation}).parse(input);
 return withOrderWallet(data.orderId,async(tx,order,wallet)=>{
  await admin(actorId,tx,order.userId);
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order-refund:${data.idempotencyKey}`},0))`;
  const previous=await tx.orderRefund.findUnique({where:{idempotencyKey:data.idempotencyKey}});
  const amount=new Prisma.Decimal(data.amount);
  if(previous){if(previous.orderId!==order.id||previous.actorId!==actorId||!previous.amount.eq(amount)||previous.reason!==data.reason)throw new Error('Esta confirmación ya se usó para otro reintegro.');return previous;}
  if(order.financialState!=='CAPTURED'||!['PARTIAL','CANCELLED','FAILED','REVIEW_REQUIRED'].includes(order.status))throw new Error('Solo se reintegran cargos de pedidos parciales, cancelados, fallidos o en revisión con devolución del proveedor verificada.');
  if(amount.gt(order.price.minus(order.refunded)))throw new Error('El reintegro supera el importe pendiente de devolver.');
  const refund=await tx.orderRefund.create({data:{orderId:order.id,actorId,amount,reason:data.reason,idempotencyKey:data.idempotencyKey}});
  await tx.wallet.update({where:{id:wallet.id},data:{available:{increment:amount}}});
  await tx.walletTransaction.create({data:{walletId:wallet.id,key:`refund:${data.idempotencyKey}`,type:'REFUND',amount,reference:`${order.id} · ${data.reason}`}});
  await tx.order.update({where:{id:order.id},data:{refunded:{increment:amount},events:{create:{status:order.status,message:`Se acreditó un reintegro de ARS ${amount.toFixed(2)} tras la verificación administrativa.`}}}});
  await tx.auditLog.create({data:{actorId,action:'REFUND_ORDER_CONFIRMED',reference:refund.id,metadata:{orderId:order.id,reason:data.reason,amount:amount.toFixed(2)}}});
  await tx.notification.create({data:{userId:order.userId,message:`Se acreditó un reintegro de ARS ${amount.toFixed(2)} por el pedido ${order.id}.`}});
  return refund;
 });
}
export async function reconcileOperation(actorId:string,input:unknown,transport?:typeof fetch){
 const data=z.object({operationId:z.string().min(1),resolution:z.enum(['LINK','NOT_CREATED']),externalId:z.string().regex(/^[1-9]\d*$/).optional(),...confirmation}).parse(input);
 await admin(actorId);const operation=await db.providerOperation.findUniqueOrThrow({where:{id:data.operationId},include:{order:true}});
 if(operation.status!=='REVIEW_REQUIRED')throw new Error('La solicitud no está pendiente de revisión.');
 if(data.resolution==='LINK'){
  const adapter=await configuredProvider(operation.order,{transport});
  if(operation.kind==='REFILL'){if(!data.externalId||!adapter.getRefillStatus)throw new Error('Ingresá el ID de reposición verificado.');await adapter.getRefillStatus(data.externalId);}else{if(!operation.order.externalId)throw new Error('Falta el ID del pedido.');await adapter.getOrderStatus(operation.order.externalId);}
 }else if(operation.createdAt.getTime()>Date.now()-60000)throw new Error('Esperá un minuto y verificá que el proveedor no recibió la solicitud.');
 await db.$transaction(async tx=>{
  await admin(actorId,tx,operation.order.userId);
  const won=await tx.providerOperation.updateMany({where:{id:operation.id,status:'REVIEW_REQUIRED'},data:{status:data.resolution==='LINK'?'REQUESTED':'REJECTED',externalId:data.externalId,leaseUntil:null,nextSyncAt:new Date()}});if(!won.count)throw new Error('La solicitud ya fue revisada.');
  await tx.order.update({where:{id:operation.orderId},data:{nextSyncAt:new Date()}});
  await tx.auditLog.create({data:{actorId,action:'RECONCILE_PROVIDER_OPERATION',reference:operation.id,metadata:{reason:data.reason,resolution:data.resolution,externalId:data.externalId??null}}});
 });
}
