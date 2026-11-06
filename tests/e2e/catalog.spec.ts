import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/lib/db';
test('administrar categorías, publicar un importado y editar el precio comercial',async({page})=>{
 const saveEditor=async()=>{
  const version=page.locator('input[name="version"]');const previous=await version.count()?await version.inputValue():null;
  await page.getByRole('button',{name:'Guardar servicio',exact:true}).click();
  if(previous)await expect(version).not.toHaveValue(previous);else await expect(page).toHaveURL(/\/admin\/servicios\/(?!nuevo)[^?]+\?saved=1/);
  await expect(page.getByRole('button',{name:'Guardar servicio',exact:true})).toBeEnabled();await expect(page.getByRole('status')).toContainText('Servicio guardado');
 };
 const suffix=randomUUID().slice(0,8);const email=`catalog-admin-${suffix}@example.invalid`;const categoryName=`Premium E2E ${suffix}`;const sourceName=`Origen E2E ${suffix}`;const serviceName=`Servicio comercial ${suffix}`;
 let sourceId:string|undefined;let categoryId:string|undefined;let serviceId:string|undefined;
 try{
  await page.goto('/registro');await page.getByLabel('Tu nombre').fill('Admin Catálogo');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(randomUUID()+'Aa!');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Crear mi cuenta'}).click();await expect(page.getByRole('heading',{name:/¡Hola, Admin/})).toBeVisible();
  await db.user.update({where:{email},data:{role:'ADMIN'}});
  const source=await db.providerService.create({data:{providerId:'demo-provider',externalId:`e2e-${suffix}`,name:sourceName,category:'Original E2E',type:'Default',rate:'0.90',currency:'USD',min:50,max:10000,refill:true,cancel:false}});sourceId=source.id;
  await page.goto('/admin/categorias');const create=page.getByRole('region',{name:'Nueva categoría'});await create.getByLabel('Nombre',{exact:true}).fill(categoryName);await create.getByLabel('Red social').fill('Instagram');await create.getByLabel('Descripción').fill('Categoría de prueba');await create.getByRole('button',{name:'Crear categoría'}).click();await expect(page.getByRole('heading',{name:categoryName,exact:true})).toBeVisible();
  categoryId=(await db.serviceCategory.findFirstOrThrow({where:{name:categoryName}})).id;
  await page.goto(`/admin/servicios?tab=importados&q=${encodeURIComponent(sourceName)}`);await page.getByRole('link',{name:'Configurar publicación'}).click();
  await page.getByLabel('Nombre comercial').fill(serviceName);await page.getByLabel('Categoría',{exact:true}).selectOption(categoryId);await page.getByLabel('Descripción comercial').fill('Una descripción comercial de prueba para el cliente.');await expect(page.getByText('0.9 USD',{exact:true})).toBeVisible();
  await page.getByLabel('Conversión: ARS por 1 USD').fill('1200');await page.getByLabel('Tu precio de venta por 1.000 (ARS)').fill('2000');await page.getByLabel('Dominios admitidos').fill('instagram.com');await page.getByLabel('Publicar en el catálogo del cliente').check();await saveEditor();
  const stored=await db.service.findFirstOrThrow({where:{name:serviceName}});serviceId=stored.id;expect(stored.cost.toString()).toEqual('1080');expect(stored.rate.toString()).toEqual('2000');expect(stored.active).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Servicios',exact:true}).first().click();await page.getByLabel('Categoría',{exact:true}).selectOption(categoryName);await expect(page.getByRole('heading',{name:serviceName})).toBeVisible();await expect(page.getByText(/0\.9 USD/)).toHaveCount(0);
  await page.goto(`/admin/servicios/${serviceId}`);await page.getByLabel('Tu precio de venta por 1.000 (ARS)').fill('2500');await saveEditor();await page.reload();await expect(page.getByLabel('Tu precio de venta por 1.000 (ARS)')).toHaveValue('2500.00');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/catalog-editor-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.getByLabel('Publicar en el catálogo del cliente').uncheck();await saveEditor();await page.goto('/');await page.getByRole('button',{name:'Servicios',exact:true}).first().click();await expect(page.getByRole('heading',{name:serviceName})).toHaveCount(0);
 }finally{
  if(serviceId)await db.service.delete({where:{id:serviceId}});if(sourceId)await db.providerService.delete({where:{id:sourceId}});if(categoryId)await db.serviceCategory.delete({where:{id:categoryId}});await db.$disconnect();
 }
});
