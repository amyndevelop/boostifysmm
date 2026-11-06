import { randomUUID } from 'node:crypto';
import { OrderStatus,Prisma } from '@prisma/client';
import { db } from './db';
import { configuredProvider } from './providers/configured';
import { processOrderOperations } from './order-operations';
import { ProviderError } from './providers/smmtake';
import { captureOrder,releaseOrder,withOrderWallet } from './order-finance';
class UnverifiableProviderState extends Error{}
const terminal=new Set<OrderStatus>(['COMPLETED','PARTIAL','CANCELLED','FAILED']);
export function mapProviderStatus(raw:string):OrderStatus|null{
 const states:Record<string,OrderStatus>={'pending':'PROCESSING','in progress':'PROCESSING','processing':'PROCESSING','completed':'COMPLETED','partial':'PARTIAL','canceled':'CANCELLED','cancelled':'CANCELLED','failed':'FAILED','error':'FAILED'};
 return states[raw.trim().toLowerCase()]??null;
}
export async function recoverStaleSubmissions(userId?:string){
 const cutoff=new Date(Date.now()-5*60000);
 const jobs=await db.job.findMany({where:{state:'CLAIMED',claimedAt:{lt:cutoff},...(userId?{order:{userId}}:{})},select:{orderId:true},take:20});
 for(const job of jobs)await withOrderWallet(job.orderId,async(tx,order)=>{
  const won=await tx.job.updateMany({where:{orderId:order.id,state:'CLAIMED',claimedAt:{lt:cutoff}},data:{state:'REVIEW'}});
  if(!won.count)return;
  await tx.providerRequest.updateMany({where:{orderId:order.id,outcome:'INTENT'},data:{outcome:'UNCERTAIN',errorCode:'WORKER_INTERRUPTED'}});
  await tx.order.update({where:{id:order.id},data:{status:'REVIEW_REQUIRED',events:{create:{status:'REVIEW_REQUIRED',message:'El envío se interrumpió. Verificar en el proveedor antes de cualquier acción; no se reenvía automáticamente.'}}}});
 });
 return jobs.length;
}
export async function dispatchOrder(orderId?:string,transport?:typeof fetch){
 const token=randomUUID();
 const claimed=await db.$transaction(async tx=>{
  const jobs=orderId?await tx.$queryRaw<{id:string;orderId:string}[]>`SELECT j.id,j."orderId" FROM "Job" j JOIN "Order" o ON o.id=j."orderId" WHERE j.state='PENDING' AND j."orderId"=${orderId} AND o.status='PENDING' FOR UPDATE OF j SKIP LOCKED LIMIT 1`:await tx.$queryRaw<{id:string;orderId:string}[]>`SELECT j.id,j."orderId" FROM "Job" j JOIN "Order" o ON o.id=j."orderId" WHERE j.state='PENDING' AND o.status='PENDING' ORDER BY j."createdAt" FOR UPDATE OF j SKIP LOCKED LIMIT 1`;
  if(!jobs.length)return null;const job=jobs[0];
  await tx.job.update({where:{id:job.id},data:{state:'CLAIMED',leaseToken:token,claimedAt:new Date()}});
  await tx.providerRequest.create({data:{orderId:job.orderId,outcome:'INTENT'}});
  await tx.order.update({where:{id:job.orderId},data:{status:'SUBMITTING',events:{create:{status:'SUBMITTING',message:'Enviando el pedido al proveedor.'}}}});
  return job;
 });
 if(!claimed)return false;
 let started=false;let knownId:string|undefined;
 try{
  const order=await db.order.findUniqueOrThrow({where:{id:claimed.orderId}});
  if(process.env.ORDERS_ENABLED==='false')throw new Error('Pedidos pausados.');
  const adapter=await configuredProvider(order,{mutations:true,transport});
  started=true;
  const response=await adapter.createOrder({internalId:order.id,service:order.externalServiceId,quantity:order.quantity,link:order.link});
  if(!response.externalId)throw new ProviderError(true);knownId=response.externalId;
  await withOrderWallet(order.id,async(tx,fresh,wallet)=>{
   const won=await tx.job.updateMany({where:{id:claimed.id,state:'CLAIMED',leaseToken:token},data:{state:'DONE'}});
   if(!won.count)throw new Error('El envío requiere conciliación.');
   await captureOrder(tx,fresh,wallet);
   const demo=response.externalId.startsWith('demo-');
   const status=demo?'COMPLETED':'PROCESSING';
   await tx.order.update({where:{id:order.id},data:{externalId:response.externalId,status,nextSyncAt:new Date(Date.now()+30000),events:{create:{status,message:demo?'Simulación completada. Sin entrega externa.':'El proveedor aceptó el pedido. Estamos siguiendo su progreso.'}}}});
   await tx.providerRequest.update({where:{orderId:order.id},data:{outcome:'ACCEPTED',externalId:response.externalId}});
   await tx.notification.create({data:{userId:order.userId,message:demo?`Tu pedido demo ${order.id} fue completado.`:`Tu pedido ${order.id} fue enviado al proveedor.`}});
  });
 }catch(error){
  const safeRejection=!started||(error instanceof ProviderError&&!error.uncertain);
  try{await withOrderWallet(claimed.orderId,async(tx,order,wallet)=>{
   const won=await tx.job.updateMany({where:{id:claimed.id,state:'CLAIMED',leaseToken:token},data:{state:safeRejection?'DONE':'REVIEW'}});if(!won.count)return;
   const code=error instanceof ProviderError?error.code:started?'PERSISTENCE_UNCERTAIN':'CONFIGURATION';
   await tx.providerRequest.update({where:{orderId:order.id},data:{outcome:safeRejection?'REJECTED':'UNCERTAIN',errorCode:code,...(knownId?{externalId:knownId}:{})}});
   if(safeRejection)await releaseOrder(tx,order,wallet,`No se creó el pedido ${order.id}. El saldo reservado fue liberado.`);
   const status=safeRejection?'FAILED':'REVIEW_REQUIRED';
   await tx.order.update({where:{id:order.id},data:{status,events:{create:{status,message:safeRejection?'El pedido no fue aceptado. Se liberó el saldo reservado.':'El proveedor no confirmó el resultado del envío. El saldo sigue reservado. No repitas la compra; soporte debe conciliarla.'}}}});
  });}catch{console.error('BOOSTIFY_SUBMISSION_PERSISTENCE_ERROR',{orderId:claimed.orderId,externalIdKnown:Boolean(knownId)});throw new Error('No pudimos confirmar el envío. Consultá Mis pedidos antes de volver a comprar.');}
 }
 return true;
}
export async function synchronizeOrder(orderId:string,options:{transport?:typeof fetch;force?:boolean}={}){
 const now=new Date();
 const order=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
  const row=await tx.order.findUniqueOrThrow({where:{id:orderId}});
  const requested=await tx.providerOperation.count({where:{orderId:row.id,kind:'CANCEL',status:'REQUESTED'}});
  if(!row.externalId||row.financialState!=='CAPTURED'||row.externalId.startsWith('demo-')||(row.syncLeaseUntil&&row.syncLeaseUntil>now)||(!options.force&&((terminal.has(row.status)&&!requested)||row.nextSyncAt>now)))return null;
  await tx.order.update({where:{id:row.id},data:{syncLeaseUntil:new Date(Date.now()+60000),nextSyncAt:new Date(Date.now()+60000)}});return row;
 });
 if(!order)return false;
 try{
  const adapter=await configuredProvider(order,{transport:options.transport});const result=await adapter.getOrderStatus(order.externalId!);
  const mapped=mapProviderStatus(result.status);
  if(!mapped||!result.charge||!result.currency||result.remains===undefined)throw new UnverifiableProviderState('Estado sin información suficiente.');
  const charge=new Prisma.Decimal(result.charge);const remains=Number(result.remains);
  if(charge.lt(0)||!Number.isSafeInteger(remains)||remains<0||remains>order.quantity||result.currency!==order.providerCurrencySnapshot||!order.exchangeRateSnapshot||(mapped==='COMPLETED'&&remains!==0))throw new UnverifiableProviderState('El estado requiere conciliación.');
  const cost=charge.mul(order.exchangeRateSnapshot).toDecimalPlaces(4,Prisma.Decimal.ROUND_HALF_UP);
  await withOrderWallet(order.id,async(tx,fresh)=>{
   const cancellation=await tx.providerOperation.count({where:{orderId:fresh.id,kind:'CANCEL',status:'REQUESTED'}});
   const status=terminal.has(fresh.status)&&fresh.status!==mapped&&!(cancellation&&mapped==='CANCELLED')?'REVIEW_REQUIRED':mapped;
   const start=result.start_count===undefined?null:Number(result.start_count);
   await tx.order.update({where:{id:fresh.id},data:{status,providerCharge:charge,providerChargeCurrency:result.currency,realCost:cost,remains,startCount:start!==null&&Number.isSafeInteger(start)&&start<=2147483647?start:null,lastSyncedAt:new Date(),syncLeaseUntil:null,syncFailures:0,nextSyncAt:new Date(Date.now()+60000),...(status!==fresh.status?{events:{create:{status,message:status==='COMPLETED'?'El proveedor confirmó la finalización.':status==='PARTIAL'?'El proveedor informó una entrega parcial. Soporte revisará cualquier reintegro reconocido.':status==='CANCELLED'?'El proveedor confirmó la cancelación. El reintegro requiere conciliación.':status==='FAILED'?'El proveedor informó un fallo. Soporte revisará los importes reconocidos.':status==='REVIEW_REQUIRED'?'El proveedor cambió un resultado final. Se requiere conciliación.':'Estado actualizado desde el proveedor.'}}}:{})}});
   if(status!==fresh.status)await tx.notification.create({data:{userId:fresh.userId,message:`Se actualizó el estado de tu pedido ${fresh.id}. Consultá Mis pedidos.`}});
   if(['CANCELLED','FAILED','COMPLETED'].includes(status))await tx.providerOperation.updateMany({where:{orderId:fresh.id,kind:'CANCEL',status:'REQUESTED'},data:{status:'COMPLETED'}});
  });
 }catch(error){
  await withOrderWallet(order.id,async(tx,fresh)=>{
   const failures=fresh.syncFailures+1;const review=error instanceof UnverifiableProviderState||failures>=5;
   await tx.order.update({where:{id:fresh.id},data:{syncLeaseUntil:null,syncFailures:failures,nextSyncAt:new Date(Date.now()+Math.min(15,2**Math.min(failures,4))*60000),...(review&&!terminal.has(fresh.status)&&fresh.status!=='REVIEW_REQUIRED'?{status:'REVIEW_REQUIRED',events:{create:{status:'REVIEW_REQUIRED',message:'No pudimos verificar el estado del proveedor. Se mantiene el seguimiento y se requiere revisión; no se generan reintegros automáticos.'}}}:{})}});
  });
 }
 return true;
}
export async function processOrders(options:{userId?:string;transport?:typeof fetch;budgetMs?:number}={}){
 const deadline=Date.now()+(options.budgetMs??45000);let processed=0;processed+=await recoverStaleSubmissions(options.userId);
 const pending=await db.order.findMany({where:{status:'PENDING',...(options.userId?{userId:options.userId}:{})},select:{id:true},orderBy:{createdAt:'asc'},take:2});
 for(const order of pending){if(Date.now()>deadline-16000)break;if(await dispatchOrder(order.id,options.transport))processed++;}
 const due=await db.order.findMany({where:{externalId:{not:null},financialState:'CAPTURED',OR:[{status:{in:['PROCESSING','SUBMITTING','REVIEW_REQUIRED']}},{operations:{some:{kind:'CANCEL',status:'REQUESTED'}}}],nextSyncAt:{lte:new Date()},...(options.userId?{userId:options.userId}:{})},select:{id:true},orderBy:{nextSyncAt:'asc'},take:3});
 for(const order of due){if(Date.now()>deadline-16000)break;if(await synchronizeOrder(order.id,{transport:options.transport}))processed++;}
 processed+=await processOrderOperations({userId:options.userId,transport:options.transport,deadline});
 return processed;
}
export async function runOnce(){return (await processOrders())>0;}
