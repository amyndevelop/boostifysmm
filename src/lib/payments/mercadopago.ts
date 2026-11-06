import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
export class PaymentGatewayError extends Error {constructor(readonly code='GATEWAY_RESPONSE_INVALID',readonly httpStatus?:number){super('No pudimos consultar Mercado Pago. Reintentá en unos minutos.');}}
function gatewayError(error:unknown){return error instanceof PaymentGatewayError?error:new PaymentGatewayError();}
const identifier=z.union([z.string().regex(/^\d+$/),z.number().int().positive().refine(Number.isSafeInteger)]).transform(String);
const decimal=z.union([z.number().finite(),z.string().regex(/^\d+(\.\d+)?$/)]).transform(String);
export const paymentSchema=z.object({id:identifier,date_last_updated:z.iso.datetime({offset:true}).transform(v=>new Date(v)),status:z.string(),currency_id:z.string(),transaction_amount:decimal,transaction_amount_refunded:decimal.default('0'),collector_id:identifier,live_mode:z.boolean(),external_reference:z.string().nullable(),metadata:z.record(z.string(),z.unknown()).optional(),order:z.object({id:identifier,type:z.string()}).optional()});
export class MercadoPago {
 constructor(private token:string,private transport:typeof fetch=fetch){if(process.env.APP_MODE==='test'&&transport===fetch)throw new PaymentGatewayError();}
 async request(path:string,body?:unknown,key?:string):Promise<unknown>{
  try{const response=await this.transport(`https://api.mercadopago.com${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new PaymentGatewayError('GATEWAY_HTTP_ERROR',response.status);return await response.json();}catch(error){throw error instanceof PaymentGatewayError?error:new PaymentGatewayError('GATEWAY_NETWORK_OR_JSON_ERROR');}
 }
 async account(){try{return z.object({id:identifier,site_id:z.literal('MLA')}).parse(await this.request('/users/me'));}catch(error){throw gatewayError(error);}}
 async preference(body:unknown,key:string,liveMode:boolean){
  try{const value=z.object({id:z.string().min(1),init_point:z.url().optional(),sandbox_init_point:z.url().optional(),collector_id:identifier.optional()}).parse(await this.request('/checkout/preferences',body,key));const chosen=liveMode?value.init_point:value.sandbox_init_point;if(!chosen)throw new Error();const url=new URL(chosen);if(url.protocol!=='https:'||url.username||url.password||url.port||!['www.mercadopago.com.ar','mercadopago.com.ar','sandbox.mercadopago.com.ar'].includes(url.hostname))throw new Error();return {id:value.id,url:url.href,collectorId:value.collector_id};}catch(error){throw gatewayError(error);}
 }
 async payment(id:string){try{return paymentSchema.parse(await this.request(`/v1/payments/${encodeURIComponent(id)}`));}catch(error){throw gatewayError(error);}}
 async searchPayments(reference:string){try{return z.object({results:z.array(z.object({id:identifier}))}).parse(await this.request(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc&limit=3`)).results.map(p=>p.id);}catch(error){throw gatewayError(error);}}
 async merchantOrder(id:string){try{return z.object({id:identifier,preference_id:z.string(),payments:z.array(z.object({id:identifier}))}).parse(await this.request(`/merchant_orders/${encodeURIComponent(id)}`));}catch(error){throw gatewayError(error);}}
}
export function verifyWebhook(secret:string,id:string,requestId:string|null,signature:string|null,now=Date.now()){
 if(!/^\d{1,30}$/.test(id)||!requestId||requestId.length>200||!signature||signature.length>1000)return false;
 const parts=signature.split(',').map(p=>p.trim().split('='));const timestamps=parts.filter(([k])=>k==='ts');const hashes=parts.filter(([k])=>k==='v1');if(timestamps.length!==1||!hashes.length)return false;
 const ts=timestamps[0][1];if(!/^\d{10,13}$/.test(ts))return false;const time=Number(ts)*(ts.length===13?1:1000);if(Math.abs(now-time)>10*60000)return false;
 const expected=createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest();return hashes.some(([,value])=>/^[a-f0-9]{64}$/i.test(value??'')&&timingSafeEqual(expected,Buffer.from(value,'hex')));
}
