import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {PaymentProcessingError} from './errors';
import {db} from '../db';
import {gateway,paymentConfig,parseTopUpAmount} from './settings';
import {PaymentGatewayError} from './mercadopago';
const keySchema=z.object({amount:z.string(),idempotencyKey:z.uuid()});
export async function createTopUp(userId:string,input:unknown,transport?:typeof fetch){
 const data=keySchema.parse(input);const config=await paymentConfig();if(!config?.enabled)throw new PaymentProcessingError('CHECKOUT_DISABLED',false,'Mercado Pago todavía no está habilitado.');
 if(!process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim())throw new PaymentProcessingError('WEBHOOK_SECRET_MISSING',true,'Mercado Pago todavía no tiene configurada la firma del webhook.');
 if(process.env.APP_MODE==='demo')throw new PaymentProcessingError('DEMO_MODE',false,'El modo demo no permite iniciar pagos externos.');
 const amount=parseTopUpAmount(data.amount,'1.00');const origin=new URL(process.env.APP_URL??'');
 if(origin.protocol!=='https:'&&process.env.APP_MODE!=='test')throw new PaymentProcessingError('APP_URL_INVALID',true,'Mercado Pago requiere configurar APP_URL con HTTPS.');
 const {topUp,send}=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(7731201)`;
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId"=${userId} FOR UPDATE`;
  const user=await tx.user.findUniqueOrThrow({where:{id:userId}});if(user.blocked)throw new PaymentProcessingError('ACCOUNT_BLOCKED',false,'Cuenta bloqueada.');
  const existing=await tx.topUp.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:data.idempotencyKey}}});
  if(existing){if(!existing.amount.eq(amount))throw new PaymentProcessingError('IDEMPOTENCY_CONFLICT',false,'Esta confirmación se usó para otro importe.');return {topUp:existing,send:false};}
  const current=await tx.appSetting.findUnique({where:{key:'mercadoPago'}});if(!current||JSON.parse(current.value).version!==config.version)throw new PaymentProcessingError('CONFIGURATION_CHANGED',false,'La configuración de pagos cambió. Actualizá la página.');
  const minimum=await tx.appSetting.findUnique({where:{key:'depositMinimum'}});parseTopUpAmount(amount.toFixed(2),minimum?.value??'1000.00');
  return {topUp:await tx.topUp.create({data:{id:randomUUID(),userId,amount,idempotencyKey:data.idempotencyKey,collectorId:config.collectorId,liveMode:config.liveMode}}),send:true};
 });
 if(!send){if(topUp.checkoutUrl)return topUp;throw new PaymentProcessingError('CHECKOUT_PENDING',true,'La recarga está registrada pero aún no tiene un enlace confirmado. Revisá su estado o iniciá una nueva recarga.');}
 try{
  const result=await gateway(config,transport).preference({items:[{id:topUp.id,title:'Recarga de saldo BOOSTIFY',quantity:1,currency_id:'ARS',unit_price:amount.toNumber()}],external_reference:topUp.id,metadata:{topup_id:topUp.id},back_urls:{success:`${origin.origin}/recargas/${topUp.id}`,pending:`${origin.origin}/recargas/${topUp.id}`,failure:`${origin.origin}/recargas/${topUp.id}`},auto_return:'approved',notification_url:`${origin.origin}/api/webhooks/mercadopago`,binary_mode:false,expires:true,expiration_date_to:new Date(Date.now()+24*3600000).toISOString()},topUp.id,config.liveMode);
  if(result.collectorId&&result.collectorId!==topUp.collectorId)throw new Error('La cuenta de cobro no coincide.');
  return await db.topUp.update({where:{id:topUp.id},data:{status:'PENDING',preferenceId:result.id,checkoutUrl:result.url}});
 }catch(error){const reference=randomUUID();console.error('BOOSTIFY_CHECKOUT_ERROR',{reference,topUpId:topUp.id,code:error instanceof PaymentGatewayError?error.code:'CHECKOUT_PERSISTENCE_OR_CONFIGURATION',...(error instanceof PaymentGatewayError&&error.httpStatus?{httpStatus:error.httpStatus}:{})});await db.topUp.updateMany({where:{id:topUp.id,status:'CREATING'},data:{status:'CHECKOUT_UNCERTAIN'}});throw new PaymentProcessingError('CHECKOUT_UNCERTAIN',true,`No pudimos confirmar el enlace de pago. No se acreditó saldo; revisá tus recargas antes de reintentar. Referencia: ${reference}.`);}
}
export async function synchronizePayment(paymentId:string,options:{transport?:typeof fetch;expectedTopUpId?:string}={}){
 if(!/^\d{1,30}$/.test(paymentId))throw new Error('Identificador de pago inválido.');
 const config=await paymentConfig();if(!config)throw new PaymentProcessingError('PAYMENT_CONFIGURATION_MISSING',true,'Mercado Pago no está configurado.');
 const api=gateway(config,options.transport);const payment=await api.payment(paymentId);
 if(payment.id!==paymentId)throw new PaymentProcessingError('PAYMENT_ID_MISMATCH',false,'El identificador de pago no coincide.');
 if(!payment.external_reference)return {ignored:true};
 const topUp=await db.topUp.findUnique({where:{id:payment.external_reference}});
 if(!topUp)return {ignored:true};
 if(options.expectedTopUpId&&options.expectedTopUpId!==topUp.id)throw new PaymentProcessingError('TOP_UP_MISMATCH',false,'El pago no corresponde a esta recarga.');
 if(payment.collector_id!==topUp.collectorId||config.collectorId!==topUp.collectorId||payment.live_mode!==topUp.liveMode)throw new PaymentProcessingError('ACCOUNT_MODE_MISMATCH',false,'La cuenta o el modo del pago no coincide.');
 if(!topUp.preferenceId)throw new PaymentProcessingError('PREFERENCE_NOT_READY',true,'El enlace de esta recarga todavía no está confirmado.');
 const merchant=payment.order&&['mercadopago','merchant_order'].includes(payment.order.type)?await api.merchantOrder(payment.order.id):null;
 const amount=new Prisma.Decimal(payment.transaction_amount);const refunded=new Prisma.Decimal(payment.transaction_amount_refunded);
 const mismatch=payment.currency_id!=='ARS'||!amount.eq(topUp.amount)||!merchant||merchant.preference_id!==topUp.preferenceId||!merchant.payments.some(p=>p.id===payment.id)||refunded.lt(0)||refunded.gt(amount);
 return db.$transaction(async tx=>{
  const wallets=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Wallet" WHERE "userId"=${topUp.userId} FOR UPDATE`;
  if(!wallets.length)throw new PaymentProcessingError('WALLET_NOT_FOUND',true,'Billetera no encontrada.');
  await tx.$queryRaw`SELECT id FROM "TopUp" WHERE id=${topUp.id} FOR UPDATE`;
  const fresh=await tx.topUp.findUniqueOrThrow({where:{id:topUp.id}});const previous=await tx.mercadoPagoPayment.findUnique({where:{id:payment.id}});
  if(previous&&previous.topUpId!==fresh.id)throw new PaymentProcessingError('PAYMENT_ALREADY_ASSOCIATED',false,'El pago ya está asociado a otra recarga.');
  if(previous&&previous.providerUpdatedAt>payment.date_last_updated)return {ignored:true};
  const priorReversal=previous&&(['refunded','charged_back'].includes(previous.status)||previous.refunded.gt(0));
  const reason=priorReversal&&payment.status==='approved'?'STATUS_REVERSAL_REVIEW':mismatch?'PAYMENT_MISMATCH':payment.status==='approved'&&refunded.gt(0)?'PAYMENT_REFUNDED':fresh.creditedPaymentId&&fresh.creditedPaymentId!==payment.id&&payment.status==='approved'?'EXTRA_APPROVED_PAYMENT':fresh.creditedPaymentId===payment.id&&(payment.status!=='approved'||refunded.gt(0))?'CREDIT_REVERSAL_REVIEW':null;
  await tx.mercadoPagoPayment.upsert({where:{id:payment.id},create:{id:payment.id,topUpId:fresh.id,status:payment.status,amount,refunded,reviewReason:reason,providerUpdatedAt:payment.date_last_updated},update:{status:payment.status,amount,refunded,reviewReason:reason,providerUpdatedAt:payment.date_last_updated}});
  if(reason){
   await tx.topUp.update({where:{id:fresh.id},data:{status:'REVIEW_REQUIRED'}});
   if(previous?.reviewReason!==reason){await tx.auditLog.create({data:{actorId:fresh.userId,action:'MERCADOPAGO_REVIEW_REQUIRED',reference:fresh.id,metadata:{paymentId:payment.id,reason}}});await tx.notification.create({data:{userId:fresh.userId,message:`La recarga ${fresh.id} requiere revisión de soporte. No se generó una nueva acreditación.`}});}
   return {review:true};
  }
  if(payment.status==='approved'&&!fresh.creditedAt){
   // Sandbox approvals never become spendable funds, even on a production host.
   if(!fresh.liveMode){await tx.topUp.update({where:{id:fresh.id},data:{status:'TEST_APPROVED'}});return {test:true};}
   const wallet=await tx.wallet.findUniqueOrThrow({where:{userId:fresh.userId}});if(wallet.currency!=='ARS')throw new PaymentProcessingError('WALLET_CURRENCY_MISMATCH',false,'Moneda de billetera incompatible.');
   await tx.walletTransaction.create({data:{walletId:wallet.id,key:`mp:${payment.id}`,type:'DEPOSIT',amount:fresh.amount,reference:`Mercado Pago · ${fresh.id} · ${payment.id}`}});
   await tx.wallet.update({where:{id:wallet.id},data:{available:{increment:fresh.amount}}});
   await tx.topUp.update({where:{id:fresh.id},data:{status:'APPROVED',creditedAt:new Date(),creditedPaymentId:payment.id}});
   await tx.auditLog.create({data:{actorId:fresh.userId,action:'MERCADOPAGO_AUTO_CREDIT',reference:fresh.id,metadata:{paymentId:payment.id,amount:fresh.amount.toFixed(2)}}});
   await tx.notification.create({data:{userId:fresh.userId,message:`Acreditamos ARS ${fresh.amount.toFixed(2)} de tu pago aprobado en Mercado Pago.`}});return {credited:true};
  }
  if(!fresh.creditedAt&&fresh.status!=='REVIEW_REQUIRED')await tx.topUp.update({where:{id:fresh.id},data:{status:['pending','in_process','authorized','in_mediation'].includes(payment.status)?'PENDING':['rejected','cancelled','refunded','charged_back'].includes(payment.status)?payment.status.toUpperCase():'REVIEW_REQUIRED'}});
  return {credited:false};
 });
}
export async function refreshTopUp(userId:string,id:string,paymentId?:string,transport?:typeof fetch){
 const topUp=await db.topUp.findFirst({where:{id,userId},include:{payments:{select:{id:true},take:5}}});if(!topUp)throw new Error('Recarga no encontrada.');
 if(paymentId)await synchronizePayment(paymentId,{expectedTopUpId:id,transport});
 else {const config=await paymentConfig();if(config){const found=await gateway(config,transport).searchPayments(topUp.id);const candidate=found[0]??topUp.payments[0]?.id;if(candidate)await synchronizePayment(candidate,{expectedTopUpId:id,transport});}}
 return db.topUp.findUniqueOrThrow({where:{id}});
}
