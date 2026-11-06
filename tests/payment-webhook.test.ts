import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {handleMercadoPagoWebhook} from '../src/lib/payments/webhook';
import {PaymentGatewayError} from '../src/lib/payments/mercadopago';
import {PaymentProcessingError} from '../src/lib/payments/errors';
import {POST as productionPost} from '../src/app/api/webhooks/mercadopago/route';
import {POST as legacyPost} from '../src/app/api/mercadopago/webhook/route';
const secret='test-webhook-secret-not-a-production-credential';
function notification(options:{id?:string;query?:string;signature?:string;body?:unknown}={}){
 const id=options.id??'123456';const ts=String(Math.floor(Date.now()/1000));const requestId='test-request';
 const signature=options.signature??`ts=${ts},v1=${createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')}`;
 return new Request(`https://boostifysmm.vercel.app/api/webhooks/mercadopago?${options.query??`data.id=${id}&type=payment`}`,{method:'POST',headers:{'x-signature':signature,'x-request-id':requestId,'Content-Type':'application/json'},body:JSON.stringify(options.body??{type:'payment',data:{id}})});
}
test('ruta de producción y alias exigen MERCADOPAGO_WEBHOOK_SECRET sin tocar la base',async t=>{
 t.mock.method(console,'error',()=>{});const previous=process.env.MERCADOPAGO_WEBHOOK_SECRET;
 try{delete process.env.MERCADOPAGO_WEBHOOK_SECRET;for(const post of [productionPost,legacyPost]){const result=await post(notification());assert.equal(result.status,503);assert.equal(result.headers.get('retry-after'),'60');}
 process.env.MERCADOPAGO_WEBHOOK_SECRET=secret;
 for(const post of [productionPost,legacyPost])assert.equal((await post(notification({signature:'invalid'}))).status,401);
 }finally{if(previous===undefined)delete process.env.MERCADOPAGO_WEBHOOK_SECRET;else process.env.MERCADOPAGO_WEBHOOK_SECRET=previous;}
});
test('rechaza IDs ausentes/duplicados y firmas inválidas antes de consultar pagos',async t=>{
 t.mock.method(console,'error',()=>{});let calls=0;const dependencies={secret:()=>secret,synchronize:async()=>{calls++;return {credited:false};}};
 for(const query of ['type=payment','data.id=1&data.id=2','data.id=https://attacker.invalid','data.id='])assert.equal((await handleMercadoPagoWebhook(notification({query}),dependencies)).status,400);
 assert.equal((await handleMercadoPagoWebhook(notification({signature:'ts=123,v1=bad'}),dependencies)).status,401);assert.equal(calls,0);
});
test('solo el ID firmado elige el pago; cuerpo y URL de recurso no deciden importes',async()=>{
 let seen='';const result=await handleMercadoPagoWebhook(notification({body:{type:'payment',data:{id:'999'},status:'approved',amount:9999999,resource:'https://attacker.invalid'}}),{secret:()=>secret,synchronize:async id=>{seen=id;return {credited:true};}});
 assert.equal(seen,'123456');assert.equal(result.status,200);assert.deepEqual(await result.json(),{received:true});assert.equal(result.headers.get('cache-control'),'no-store');
});
test('pagos repetidos, pendientes, ignorados y en revisión reciben confirmación 200',async t=>{
 t.mock.method(console,'error',()=>{});
 for(const value of [{credited:false},{ignored:true},{review:true},{test:true}]){
 const result=await handleMercadoPagoWebhook(notification(),{secret:()=>secret,synchronize:async()=>value});assert.equal(result.status,200);assert.deepEqual(await result.json(),{received:true});
 }
});
test('eventos firmados ajenos a payment se ignoran sin consultas ni acreditación',async()=>{
 let called=false;const result=await handleMercadoPagoWebhook(notification({query:'data.id=123456&type=merchant_order'}),{secret:()=>secret,synchronize:async()=>{called=true;return {credited:false};}});assert.equal(result.status,200);assert.equal(called,false);
});
test('asociación inválida confirmada se reconoce con 200; estados aún no persistidos se reintentan',async t=>{
 t.mock.method(console,'error',()=>{});
 for(const retryable of [false,true]){const result=await handleMercadoPagoWebhook(notification(),{secret:()=>secret,synchronize:async()=>{throw new PaymentProcessingError('TOP_UP_MISMATCH',retryable,'private details');}});assert.equal(result.status,retryable?503:200);}
});
test('fallos de API, timeout y base devuelven 503 y jamás exponen excepciones',async t=>{
 const logs:unknown[][]=[];t.mock.method(console,'error',(...args:unknown[])=>{logs.push(args);});
 const sensitive='Bearer private-token payer@example.invalid raw-response';
 for(const error of [new PaymentGatewayError('GATEWAY_HTTP_ERROR',503),new Error(sensitive),new Prisma.PrismaClientKnownRequestError(sensitive,{code:'P1001',clientVersion:'6.19.3'})]){
 const result=await handleMercadoPagoWebhook(notification(),{secret:()=>secret,synchronize:async()=>{throw error;}});assert.equal(result.status,503);const body=await result.text();assert.ok(!body.includes(sensitive));assert.ok(!body.includes(secret));assert.equal(result.headers.get('retry-after'),'60');
 }
 const serialized=JSON.stringify(logs);assert.ok(serialized.includes('DATABASE_ERROR'));assert.ok(serialized.includes('GATEWAY_HTTP_ERROR'));assert.ok(serialized.includes('reference'));assert.ok(!serialized.includes(sensitive));assert.ok(!serialized.includes(secret));
});
