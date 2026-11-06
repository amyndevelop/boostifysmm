import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestCheckout} from '../src/lib/payments/checkout-client';
const input={amount:'5000',idempotencyKey:'bb8d8019-dd3e-4c56-b916-d7d89656874b'};
test('checkout usa una ruta fija sin IDs de Server Actions y conserva la confirmación',async()=>{
 let calls=0;const transport:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'/api/payments/checkout');assert.equal(init?.method,'POST');assert.equal(init?.credentials,'same-origin');assert.equal(new Headers(init?.headers).get('next-action'),null);assert.deepEqual(JSON.parse(String(init?.body)),input);return Response.json({url:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=test',topUpId:'local-topup'});};
 assert.ok((await requestCheckout(input,transport)).url);await requestCheckout(input,transport);assert.equal(calls,2);
});
test('errores de sesión o proveedor se muestran sin convertirlos en un fallo genérico',async()=>{
 for(const status of [401,400,503])assert.deepEqual(await requestCheckout(input,async()=>Response.json({error:'Referencia segura de soporte'},{status})),{error:'Referencia segura de soporte'});
});
test('errores de red, HTML de despliegue y destinos inesperados nunca redirigen ni reintentan solos',async()=>{
 for(const transport of [async()=>{throw new Error('private transport details');},async()=>new Response('<html>deployment changed</html>',{status:500}),async()=>Response.json({url:'https://attacker.invalid',topUpId:'test'})]){const result=await requestCheckout(input,transport);assert.ok(result.error);assert.equal(result.url,undefined);assert.ok(!result.error.includes('private transport details'));}
});
