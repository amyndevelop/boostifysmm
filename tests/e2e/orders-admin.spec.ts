import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/lib/db';
import {placeOrder} from '../../src/lib/orders';
import {dispatchOrder} from '../../src/lib/worker';
import {adjustUserBalance} from '../../src/lib/user-management';
test('conciliación de reintegro desde administración sin llamadas reales',async({page})=>{
 const email=`order-review-${randomUUID()}@example.invalid`;
 await page.goto('/registro');await page.getByLabel('Tu nombre').fill('Admin Pedidos Demo');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(randomUUID()+'Aa!');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Crear mi cuenta'}).click();await expect(page.getByRole('heading',{name:/¡Hola, Admin/})).toBeVisible();
 const user=await db.user.update({where:{email},data:{role:'SUPER_ADMIN'}});
 await adjustUserBalance(user.id,{userId:user.id,direction:'CREDIT',amount:'10000',reason:'Saldo de demostración para prueba de reintegro',idempotencyKey:randomUUID()});
 const order=await placeOrder(user.id,{serviceId:'demo-instagram',quantity:350,link:'https://instagram.com/test',quotedPrice:'1750.00',idempotencyKey:randomUUID()});await dispatchOrder(order.id);
 await db.order.update({where:{id:order.id},data:{status:'CANCELLED',realCost:'0',providerCharge:'0',providerChargeCurrency:'ARS',events:{create:{status:'CANCELLED',message:'Cancelación simulada para la prueba de interfaz.'}}}});
 await page.goto(`/admin/pedidos/${order.id}`);await expect(page.getByRole('heading',{name:'Registrar reintegro reconocido'})).toBeVisible();
 await page.getByLabel('Importe a devolver en ARS').fill('1750');await page.getByLabel('Motivo y reconocimiento del proveedor').fill('Devolución reconocida en la simulación del proveedor');await page.getByRole('checkbox',{name:'Verifiqué el reintegro reconocido y confirmo la acreditación'}).check();await page.getByRole('button',{name:'Confirmar y acreditar reintegro'}).click();await expect(page.getByRole('heading',{name:'Registrar reintegro reconocido'})).toHaveCount(0);
 expect((await db.order.findUniqueOrThrow({where:{id:order.id}})).refunded.toFixed(2)).toBe('1750.00');expect((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).available.toFixed(2)).toBe('10000.00');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await db.$disconnect();
});
test('seguimiento requiere sesión y origen; el cron requiere autenticación',async({request})=>{
 const response=await request.post('/api/orders/sync',{headers:{Origin:'http://localhost:3000'}});expect(response.status()).toBe(401);
 const crossOrigin=await request.post('/api/orders/sync',{headers:{Origin:'https://untrusted.example.com'}});expect(crossOrigin.status()).toBe(403);
 const cron=await request.get('/api/cron/orders');expect([401,503]).toContain(cron.status());
});
