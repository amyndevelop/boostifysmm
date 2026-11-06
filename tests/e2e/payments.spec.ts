import {test,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {db} from '../../src/lib/db';
test('mínimo editable desde administración y aplicado al formulario del cliente',async({page})=>{
 const previous=await db.appSetting.findUnique({where:{key:'depositMinimum'}});
 const user=await db.user.create({data:{name:'Admin pagos demo',email:`payments-ui-${randomUUID()}@example.invalid`,passwordHash:'no-login-fixture',role:'SUPER_ADMIN',wallet:{create:{}}}});const token=randomUUID();await db.session.create({data:{id:createHash('sha256').update(token).digest('hex'),userId:user.id,expiresAt:new Date(Date.now()+3600000)}});await page.context().addCookies([{name:'boostify_session',value:token,url:'http://localhost:3000',httpOnly:true,sameSite:'Lax'}]);
 try{
 await page.goto('/admin/recargas');await expect(page.getByRole('navigation',{name:'Menú de administración'}).getByRole('link',{name:'Recargas y pagos'})).toHaveAttribute('aria-current','page');
 await page.getByLabel('Mínimo de carga en ARS').fill('1250.50');await page.getByRole('button',{name:'Guardar configuración'}).click();await expect(page.getByRole('status')).toContainText('Configuración guardada');expect((await db.appSetting.findUniqueOrThrow({where:{key:'depositMinimum'}})).value).toBe('1250.50');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/payments-mobile.png'});
 await page.goto('/');await page.getByRole('button',{name:'Cargar saldo',exact:true}).first().click();await expect(page.getByText('Elegí cómo cargar saldo.',{exact:false})).toContainText('1.250,50');
 await page.goto('/recargas/not-owned');await expect(page.getByRole('heading',{name:'Esta página no está disponible.'})).toBeVisible();
 }finally{if(previous)await db.appSetting.upsert({where:{key:'depositMinimum'},create:previous,update:{value:previous.value}});else await db.appSetting.deleteMany({where:{key:'depositMinimum'}});await db.$disconnect();}
});
