import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {PaymentGatewayError,verifyWebhook} from './mercadopago';
import {PaymentProcessingError} from './errors';
import {synchronizePayment} from './topups';

type WebhookResult=Awaited<ReturnType<typeof synchronizePayment>>;
type Dependencies={secret?:()=>string|undefined;synchronize?:(id:string)=>Promise<WebhookResult>};
function report(code:string,stage:'configuration'|'validation'|'processing',paymentId?:string,httpStatus?:number){
 const reference=randomUUID();
 // Do not log exceptions, URLs, headers, bodies, credentials or payer data.
 console.error('BOOSTIFY_MERCADOPAGO_WEBHOOK',{reference,stage,code,...(paymentId?{paymentId}:{}),...(httpStatus?{httpStatus}:{})});
 return reference;
}
function response(body:Record<string,unknown>,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store',...(status===503?{'Retry-After':'60'}:{})}});}
/** Both routes share this handler. Dependencies are injected only by local tests. */
export async function handleMercadoPagoWebhook(request:Request,dependencies:Dependencies={}){
 const secret=(dependencies.secret??(()=>process.env.MERCADOPAGO_WEBHOOK_SECRET))()?.trim();
 if(!secret){const reference=report('WEBHOOK_SECRET_MISSING','configuration');return response({error:'Webhook no configurado.',reference},503);}
 const url=new URL(request.url);const ids=url.searchParams.getAll('data.id');const id=ids[0]??'';
 if(ids.length!==1||!/^\d{1,30}$/.test(id)){
  const reference=report('INVALID_PAYMENT_ID','validation');return response({error:'Identificador de pago inválido.',reference},400);
 }
 if(!verifyWebhook(secret,id,request.headers.get('x-request-id'),request.headers.get('x-signature'))){
  const reference=report('INVALID_SIGNATURE','validation',id);return response({error:'Firma inválida.',reference},401);
 }
 const types=url.searchParams.getAll('type');const topics=url.searchParams.getAll('topic');
 if(types.length>1||topics.length>1)return response({error:'Tipo de notificación ambiguo.'},400);
 if([...types,...topics].some(type=>type!=='payment'))return response({received:true});
 // Only the signed query ID selects a read from the fixed official API host.
 // Neither browser returns nor unsigned body fields can decide an accreditation.
 try{
  const result=await (dependencies.synchronize??synchronizePayment)(id);
  if('review' in result&&result.review)report('PAYMENT_REVIEW_REQUIRED','processing',id);
  return response({received:true});
 }catch(error){
  const code=error instanceof PaymentProcessingError?error.code:error instanceof PaymentGatewayError?error.code:error instanceof Prisma.PrismaClientKnownRequestError?'DATABASE_ERROR':'PROCESSING_ERROR';
  const reference=report(code,'processing',id,error instanceof PaymentGatewayError?error.httpStatus:undefined);
  // A known invalid association cannot be repaired by retrying the notification.
  if(error instanceof PaymentProcessingError&&!error.retryable)return response({received:true});
  // Infrastructure/API failures must be retried. Never acknowledge a lost credit.
  return response({error:'No se pudo verificar el pago. Reintentar notificación.',reference},503);
 }
}
