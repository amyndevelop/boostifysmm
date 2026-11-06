import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { saveCategoryConfig,saveCatalogService,setCatalogPublished,removeCategory,removeCatalogService,visibleCatalogWhere } from '../src/lib/catalog';
import { saveProviderConfig,readProvider } from '../src/lib/providers/manage';
import { placeOrder } from '../src/lib/orders';
test('catálogo publicable, categorías, precios propios e historia financiera',async t=>{
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'));
 process.env.PROVIDER_ENCRYPTION_KEY=randomBytes(32).toString('hex');
 const admin=await db.user.create({data:{name:'Catalog admin',email:`${randomUUID()}@test.invalid`,passwordHash:'test',role:'ADMIN'}});
 const customer=await db.user.create({data:{name:'Customer',email:`${randomUUID()}@test.invalid`,passwordHash:'test',wallet:{create:{}}}});
 await db.$transaction(async tx=>{const w=await tx.wallet.update({where:{userId:customer.id},data:{available:'10000'}});await tx.walletTransaction.create({data:{walletId:w.id,key:randomUUID(),type:'TEST_CREDIT',amount:'10000',reference:'Test fixture'}});});
 const categoryId=await saveCategoryConfig(admin.id,{name:`Premium ${randomUUID()}`,network:'Instagram',description:'Servicios premium',active:true,sortOrder:4});
 const provider=await db.provider.create({data:{name:'Catalog DEMO',kind:'DEMO',currency:'USD',active:true}});
 const source=await db.providerService.create({data:{providerId:provider.id,externalId:'100',name:'Technical provider name',category:'Original category',type:'Default',rate:'0.90',currency:'USD',min:50,max:10000,refill:true,cancel:false}});
 const data={sourceId:source.id,providerId:provider.id,externalId:source.externalId,categoryId,name:'Nombre comercial',description:'Descripción propia para clientes.',rate:'2000',costCurrency:'USD',exchangeRate:'1200',min:100,max:5000,sortOrder:3,linkType:'profile',allowedHosts:'instagram.com, instagr.am',active:false};
 let serviceId='';
 await t.test('el cliente no puede administrar categorías ni publicar servicios',async()=>{
  await assert.rejects(saveCategoryConfig(customer.id,{name:'No autorizado',network:'Instagram',description:'',active:true,sortOrder:0}),/permisos/);
  await assert.rejects(saveCatalogService(customer.id,data),/permisos/);
 });
 await t.test('importación no publica; el precio comercial es independiente del costo USD',async()=>{
  serviceId=await saveCatalogService(admin.id,data);
  const s=await db.service.findUniqueOrThrow({where:{id:serviceId}});
  assert.equal(s.rate.toString(),'2000');assert.equal(s.cost.toString(),'1080');assert.equal(s.currency,'ARS');
  assert.equal(s.originalName,'Technical provider name');
  assert.equal(await db.service.count({where:{AND:[visibleCatalogWhere(),{id:serviceId}]}}),0);
  await setCatalogPublished(admin.id,serviceId,true);
  assert.equal(await db.service.count({where:{AND:[visibleCatalogWhere(),{id:serviceId}]}}),1);
 });
 await t.test('rechaza límites fuera del proveedor, dominios inválidos y ediciones obsoletas',async()=>{
  const s=await db.service.findUniqueOrThrow({where:{id:serviceId}});
  await assert.rejects(saveCatalogService(admin.id,{...data,id:serviceId,version:s.version,min:10}),/límites/);
  await assert.rejects(saveCatalogService(admin.id,{...data,id:serviceId,version:s.version,allowedHosts:'https://instagram.com/path'}),/dominios/);
  await assert.rejects(saveCatalogService(admin.id,{...data,id:serviceId,version:1}),/cambió/);
 });
 let orderId='';
 await t.test('guarda cotización, costo nativo y convertido en el pedido',async()=>{
  const order=await placeOrder(customer.id,{serviceId,quantity:350,link:'https://instagram.com/test',quotedPrice:'700.00',idempotencyKey:randomUUID()});orderId=order.id;
  assert.equal(order.price.toString(),'700');assert.equal(order.costSnapshot.toString(),'378');assert.equal(order.providerCostSnapshot?.toString(),'0.315');assert.equal(order.providerCurrencySnapshot,'USD');assert.equal(order.exchangeRateSnapshot?.toString(),'1200');
 });
 await t.test('editar precio, categoría y proveedor no altera pedidos previos',async()=>{
  const newCategory=await saveCategoryConfig(admin.id,{name:`Nueva ${randomUUID()}`,network:'Instagram',description:'Nueva categoría',active:true,sortOrder:0});
  const s=await db.service.findUniqueOrThrow({where:{id:serviceId}});
  await saveCatalogService(admin.id,{...data,id:serviceId,version:s.version,categoryId:newCategory,rate:'3500',name:'Nombre nuevo',active:true});
  const order=await db.order.findUniqueOrThrow({where:{id:orderId}});
  assert.equal(order.rateSnapshot.toString(),'2000');assert.equal(order.serviceName,'Nombre comercial');assert.equal(order.providerCostSnapshot?.toString(),'0.315');
  await assert.rejects(removeCatalogService(admin.id,serviceId),/históricos/);
  const category=await db.serviceCategory.findUniqueOrThrow({where:{id:newCategory}});
  await saveCategoryConfig(admin.id,{...category,description:'Actualizada',active:false});
  assert.equal(await db.service.count({where:{AND:[visibleCatalogWhere(),{id:serviceId}]}}),0);
  await assert.rejects(placeOrder(customer.id,{serviceId,quantity:350,link:'https://instagram.com/test',quotedPrice:'1225.00',idempotencyKey:randomUUID()}),/disponible/);
  await assert.rejects(removeCategory(admin.id,newCategory),/tiene servicios/);
 });
 await t.test('sincroniza costo sin sobrescribir nombre, categoría ni venta; oculta ausentes',async()=>{
  const p=await saveProviderConfig(admin.id,{name:'API test',endpoint:'https://catalog-provider.com/api',kind:'SMM_V2',apiKey:'fake-catalog-key',active:true});
  let rate='0.90';let present=true;
  const transport:typeof fetch=async(_,init)=>{const action=(init!.body as URLSearchParams).get('action');return Response.json(action==='balance'?{balance:'100',currency:'USD'}:present?[{service:1,name:'Original name',category:'Original cat',type:'Default',rate,min:'50',max:'10000',refill:true,cancel:false}]:[]);};
  await readProvider(admin.id,p.id,'services',transport);
  const imported=await db.providerService.findFirstOrThrow({where:{providerId:p.id}});
  const id=await saveCatalogService(admin.id,{...data,sourceId:imported.id,providerId:p.id,externalId:'1',active:true});
  rate='1.40';await readProvider(admin.id,p.id,'services',transport);
  const s=await db.service.findUniqueOrThrow({where:{id}});
  assert.equal(s.cost.toString(),'1680');assert.equal(s.rate.toString(),'2000');assert.equal(s.name,'Nombre comercial');assert.equal(s.categoryId,categoryId);
  present=false;await readProvider(admin.id,p.id,'services',transport);
  assert.equal(await db.service.count({where:{AND:[visibleCatalogWhere(),{id}]}}),0);
 });
 await t.test('un servicio manual conserva su costo nativo al volver a publicarlo',async()=>{
  const id=await saveCatalogService(admin.id,{...data,sourceId:undefined,externalId:`manual-${randomUUID()}`,manualCost:'2',costCurrency:'USD',exchangeRate:'1000',rate:'5000',active:false});
  await setCatalogPublished(admin.id,id,true);
  const service=await db.service.findUniqueOrThrow({where:{id}});
  assert.equal(service.manualProviderRate.toString(),'2');assert.equal(service.cost.toString(),'2000');
 });
 await t.test('las categorías vacías pueden eliminarse y las pobladas no',async()=>{await removeCategory(admin.id,categoryId).then(()=>assert.fail('debe proteger categoría poblada'),()=>{});const empty=await saveCategoryConfig(admin.id,{name:`Vacía ${randomUUID()}`,network:'YouTube',description:'',active:true,sortOrder:0});await removeCategory(admin.id,empty);assert.equal(await db.serviceCategory.count({where:{id:empty}}),0);});
 await db.$disconnect();
});
