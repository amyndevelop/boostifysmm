import {z} from 'zod';
import {db} from './db';
import {configuredProvider} from './providers/configured';
import {ProviderError} from './providers/smmtake';
export async function requestOrderOperation(userId:string,input:unknown,transport?:typeof fetch){
 const data=z.object({orderId:z.string().min(1),kind:z.enum(['REFILL','CANCEL']),idempotencyKey:z.uuid()}).parse(input);
 const {operation,send}=await db.$transaction(async tx=>{
  const user=await tx.user.findUniqueOrThrow({where:{id:userId}});if(user.blocked)throw new Error('Cuenta bloqueada.');
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${data.orderId} AND "userId"=${userId} FOR UPDATE`;
  const order=await tx.order.findFirst({where:{id:data.orderId,userId}});if(!order)throw new Error('Pedido no encontrado.');
  const existing=await tx.providerOperation.findUnique({where:{orderId_idempotencyKey:{orderId:order.id,idempotencyKey:data.idempotencyKey}}});
  if(existing){if(existing.kind!==data.kind)throw new Error('La confirmación ya se utilizó para otra operación.');return {operation:existing,send:false};}
  const active=await tx.providerOperation.findFirst({where:{orderId:order.id,kind:data.kind,status:{in:['SUBMITTING','REQUESTED','REVIEW_REQUIRED']}}});if(active)return {operation:active,send:false};
  if(!order.externalId||order.financialState!=='CAPTURED')throw new Error('El pedido todavía no tiene un envío confirmado.');
  if(data.kind==='REFILL'&&(!order.refunded.eq(0)||!order.refillSupportedSnapshot||!['COMPLETED','PARTIAL'].includes(order.status)))throw new Error('Este pedido no admite reposición en su estado actual.');
  if(data.kind==='CANCEL'&&(!order.cancelSupportedSnapshot||!['PROCESSING','PARTIAL','REVIEW_REQUIRED'].includes(order.status)))throw new Error('Este pedido no admite una solicitud de cancelación.');
  const operation=await tx.providerOperation.create({data:{orderId:order.id,kind:data.kind,idempotencyKey:data.idempotencyKey,leaseUntil:new Date(Date.now()+60000)}});return {operation,send:true};
 });
 if(!send)return operation;
 let started=false;
 try{
  const order=await db.order.findUniqueOrThrow({where:{id:data.orderId}});const adapter=await configuredProvider(order,{mutations:true,transport});
  if(data.kind==='REFILL'&&!adapter.requestRefill)throw new Error('El proveedor no admite reposición.');
  if(data.kind==='CANCEL'&&!adapter.requestCancellation)throw new Error('El proveedor no admite cancelación.');
  started=true;let externalId:string|undefined;
  if(data.kind==='REFILL')externalId=(await adapter.requestRefill!(order.externalId!)).id;else await adapter.requestCancellation!(order.externalId!);
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
   const changed=await tx.providerOperation.updateMany({where:{id:operation.id,status:'SUBMITTING'},data:{status:'REQUESTED',externalId,leaseUntil:null,nextSyncAt:new Date(Date.now()+60000)}});if(!changed.count)throw new Error('La solicitud requiere revisión.');
   await tx.order.update({where:{id:order.id},data:{nextSyncAt:new Date(),events:{create:{status:order.status,message:data.kind==='REFILL'?'Se solicitó reposición al proveedor.':'Se solicitó cancelación al proveedor. La solicitud no garantiza la cancelación ni un reintegro inmediato.'}}}});
  });
 }catch(error){
  const rejected=!started||(error instanceof ProviderError&&!error.uncertain);
  await db.providerOperation.updateMany({where:{id:operation.id,status:'SUBMITTING'},data:{status:rejected?'REJECTED':'REVIEW_REQUIRED',leaseUntil:null}});
 }
 return db.providerOperation.findUniqueOrThrow({where:{id:operation.id}});
}
export async function processOrderOperations(options:{userId?:string;transport?:typeof fetch;deadline?:number}={}){
 const stale=await db.providerOperation.updateMany({where:{status:'SUBMITTING',leaseUntil:{lt:new Date()},...(options.userId?{order:{userId:options.userId}}:{})},data:{status:'REVIEW_REQUIRED',leaseUntil:null}});
 const operations=await db.providerOperation.findMany({where:{kind:'REFILL',status:'REQUESTED',externalId:{not:null},nextSyncAt:{lte:new Date()},...(options.userId?{order:{userId:options.userId}}:{})},include:{order:true},take:2,orderBy:{nextSyncAt:'asc'}});let count=stale.count;
 for(const op of operations){
  if(options.deadline&&Date.now()>options.deadline-16000)break;
  const won=await db.providerOperation.updateMany({where:{id:op.id,status:'REQUESTED',nextSyncAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},data:{leaseUntil:new Date(Date.now()+60000),nextSyncAt:new Date(Date.now()+60000)}});if(!won.count)continue;
  try{
   const adapter=await configuredProvider(op.order,{transport:options.transport});if(!adapter.getRefillStatus)throw new Error();
   const response=await adapter.getRefillStatus(op.externalId!);const normalized=response.status.trim().toLowerCase();const status=normalized==='completed'?'COMPLETED':normalized==='rejected'?'REJECTED':['pending','processing','in progress'].includes(normalized)?'REQUESTED':'REVIEW_REQUIRED';
   await db.$transaction(async tx=>{await tx.providerOperation.update({where:{id:op.id},data:{status,leaseUntil:null}});if(status!=='REQUESTED'){
    await tx.orderEvent.create({data:{orderId:op.orderId,status:op.order.status,message:status==='COMPLETED'?'El proveedor confirmó la reposición.':status==='REJECTED'?'El proveedor rechazó la solicitud de reposición.':'El estado de la reposición requiere revisión administrativa.'}});
    await tx.notification.create({data:{userId:op.order.userId,message:`Tu solicitud de reposición del pedido ${op.orderId} fue actualizada.`}});
   }});
  }catch{await db.providerOperation.update({where:{id:op.id},data:{leaseUntil:null,nextSyncAt:new Date(Date.now()+300000)}});}
  count++;
 }
 return count;
}
