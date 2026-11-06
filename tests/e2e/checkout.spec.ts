import {test,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {db} from '../../src/lib/db';
test('checkout HTTP estable exige sesión y origen, valida JSON y no crea recargas inválidas',async({request})=>{
 const endpoint='/api/payments/checkout';
 expect((await request.post(endpoint,{headers:{Origin:'https://attacker.invalid'},data:{}})).status()).toBe(403);
 expect((await request.post(endpoint,{headers:{Origin:'http://localhost:3000'},data:{}})).status()).toBe(401);
 const user=await db.user.create({data:{name:'Checkout transport test',email:`checkout-http-${randomUUID()}@example.invalid`,passwordHash:'fixture-no-login',wallet:{create:{}}}});const token=randomUUID();await db.session.create({data:{id:createHash('sha256').update(token).digest('hex'),userId:user.id,expiresAt:new Date(Date.now()+3600000)}});
 const headers={Origin:'http://localhost:3000',Cookie:`boostify_session=${token}`,'Content-Type':'application/json'};
 expect((await request.post(endpoint,{headers,data:'not json'})).status()).toBe(400);
 expect((await request.post(endpoint,{headers,data:'x'.repeat(2100)})).status()).toBe(413);
 const invalid=await request.post(endpoint,{headers,data:{amount:'5000',idempotencyKey:'invalid'}});expect(invalid.status()).toBe(400);expect((await invalid.json()).error).toBeTruthy();expect(invalid.headers()['cache-control']).toBe('no-store');
 expect(await db.topUp.count({where:{userId:user.id}})).toBe(0);await db.$disconnect();
});
