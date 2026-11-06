import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,6})?$/, 'Ingresá un importe válido con hasta 6 decimales.');
const positiveDecimal = decimal.refine(s => new Prisma.Decimal(s).gt(0),'El importe debe ser mayor que cero.');
const integer = z.coerce.number().int().min(0).max(100000000);
export const categorySchema = z.object({id:z.string().optional(),version:z.coerce.number().int().positive().optional(),name:z.string().trim().min(2).max(100),network:z.string().trim().min(2).max(50),description:z.string().trim().max(1000),active:z.boolean(),sortOrder:integer});
export const serviceSchema = z.object({
 id:z.string().optional(),version:z.coerce.number().int().positive().optional(),sourceId:z.string().optional(),providerId:z.string().min(1),externalId:z.string().trim().min(1).max(100),
 categoryId:z.string().min(1,'Elegí una categoría.'),name:z.string().trim().min(3).max(150),description:z.string().trim().min(5).max(4000),
 rate:z.string().regex(/^\d{1,10}(\.\d{1,2})?$/,'Ingresá el precio de venta en ARS, con hasta 2 decimales.').refine(s=>new Prisma.Decimal(s).gt(0),'El precio de venta debe ser positivo.'),
 manualCost:decimal.optional(),costCurrency:z.string().regex(/^[A-Z]{3}$/),exchangeRate:positiveDecimal,
 min:integer.refine(n=>n>0),max:integer.refine(n=>n>0),sortOrder:integer,linkType:z.enum(['profile','post','video','any']),
 allowedHosts:z.string().trim().min(3).max(1000),active:z.boolean(),
});
export async function requireCatalogAdmin(actorId:string,tx:Prisma.TransactionClient = db) {
 const user = await tx.user.findUnique({where:{id:actorId}});
 if(!user || user.blocked || !['ADMIN','SUPER_ADMIN'].includes(user.role)) throw new Error('No tenés permisos para administrar el catálogo.');
}
export function parseAllowedHosts(raw:string) {
 const hosts = [...new Set(raw.split(/[\s,]+/).filter(Boolean).map(h=>h.toLowerCase()))];
 if(!hosts.length || hosts.length>20 || hosts.some(h=>! /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(h))) throw new Error('Ingresá dominios sin https, rutas ni comodines, separados por comas.');
 return hosts;
}
export function convertedCost(rate:string|Prisma.Decimal,currency:string,exchange:string|Prisma.Decimal) {
 const fx = new Prisma.Decimal(exchange);
 if(fx.lte(0) || (currency==='ARS' && !fx.eq(1))) throw new Error('Para ARS la conversión debe ser 1. Para otra moneda ingresá cuántos ARS vale una unidad.');
 return new Prisma.Decimal(rate).mul(fx).toDecimalPlaces(4,Prisma.Decimal.ROUND_HALF_UP);
}
export async function saveCategoryConfig(actorId:string,input:unknown) {
 const data=categorySchema.parse(input);
 return db.$transaction(async tx=>{
  await requireCatalogAdmin(actorId,tx);
  let category;
  if(data.id) {
   await tx.$queryRaw`SELECT id FROM "ServiceCategory" WHERE id=${data.id} FOR UPDATE`;
   const previous=await tx.serviceCategory.findUniqueOrThrow({where:{id:data.id}});
   if(!data.version || previous.version!==data.version) throw new Error('La categoría cambió. Actualizá la pantalla.');
   if(previous.network!==data.network && await tx.service.count({where:{categoryId:data.id}})) throw new Error('Para cambiar la red, primero mové sus servicios a otra categoría.');
   category=await tx.serviceCategory.update({where:{id:data.id},data:{name:data.name,network:data.network,description:data.description,active:data.active,sortOrder:data.sortOrder,version:{increment:1}}});
   await tx.service.updateMany({where:{categoryId:data.id},data:{category:data.name,version:{increment:1}}});
  } else category=await tx.serviceCategory.create({data:{name:data.name,network:data.network,description:data.description,active:data.active,sortOrder:data.sortOrder}});
  await tx.auditLog.create({data:{actorId,action:data.id?'UPDATE_CATEGORY':'CREATE_CATEGORY',reference:category.id}});
  return category.id;
 });
}
export async function removeCategory(actorId:string,id:string) {
 return db.$transaction(async tx=>{
  await requireCatalogAdmin(actorId,tx);
  await tx.$queryRaw`SELECT id FROM "ServiceCategory" WHERE id=${id} FOR UPDATE`;
  if(await tx.service.count({where:{categoryId:id}})) throw new Error('La categoría tiene servicios. Movelos a otra categoría antes de eliminarla, o desactivala.');
  await tx.serviceCategory.delete({where:{id}});
  await tx.auditLog.create({data:{actorId,action:'DELETE_CATEGORY',reference:id}});
 });
}
export async function saveCatalogService(actorId:string,input:unknown) {
 const data=serviceSchema.parse(input);
 if(data.max<data.min) throw new Error('El máximo debe ser mayor o igual al mínimo.');
 const allowedHosts=parseAllowedHosts(data.allowedHosts);
 return db.$transaction(async tx=>{
  await requireCatalogAdmin(actorId,tx);
  await tx.$queryRaw`SELECT id FROM "ServiceCategory" WHERE id=${data.categoryId} FOR SHARE`;
  const category=await tx.serviceCategory.findUniqueOrThrow({where:{id:data.categoryId}});
  const source=data.sourceId ? await tx.providerService.findUniqueOrThrow({where:{id:data.sourceId}}) : await tx.providerService.findUnique({where:{providerId_externalId:{providerId:data.providerId,externalId:data.externalId}}});
  const providerId=source?.providerId ?? data.providerId;
  const provider=await tx.provider.findUniqueOrThrow({where:{id:providerId}});
  if(source && (source.providerId!==data.providerId || source.externalId!==data.externalId)) throw new Error('El ID externo y el proveedor deben coincidir con el servicio importado.');
  if(source && (data.min<source.min || data.max>source.max)) throw new Error(`Los límites deben estar dentro del rango del proveedor: ${source.min}–${source.max}.`);
  if(data.active && (!category.active || !provider.active || (source && (!source.available || source.type.toLowerCase()!=='default')))) throw new Error('Para publicar, activá la categoría y el proveedor y elegí un servicio disponible de tipo Default.');
  const currency=source?.currency ?? data.costCurrency;
  if(currency!==data.costCurrency) throw new Error('La moneda del proveedor cambió. Revisá la conversión y guardá de nuevo.');
  if(!source && data.manualCost===undefined) throw new Error('Ingresá el costo original del proveedor.');
  const rawCost=source?.rate ?? new Prisma.Decimal(data.manualCost ?? '0');
  const cost=convertedCost(rawCost,currency,data.exchangeRate);
  const values={name:data.name,description:data.description,categoryId:category.id,category:category.name,network:category.network,providerId,externalId:source?.externalId ?? data.externalId,sourceId:source?.id ?? null,originalName:source?.name ?? data.name,rate:data.rate,cost,manualProviderRate:source?'0':rawCost,costCurrency:currency,exchangeRate:data.exchangeRate,currency:'ARS',min:data.min,max:data.max,linkType:data.linkType,allowedHosts,active:data.active,sortOrder:data.sortOrder};
  let service;
  if(data.id) {
   const changed=await tx.service.updateMany({where:{id:data.id,version:data.version},data:{...values,version:{increment:1}}});
   if(!data.version || !changed.count) throw new Error('El servicio cambió. Actualizá la pantalla antes de guardar.');
   service=await tx.service.findUniqueOrThrow({where:{id:data.id}});
  } else service=await tx.service.create({data:values});
  await tx.auditLog.create({data:{actorId,action:data.id?'UPDATE_SERVICE':'CREATE_SERVICE',reference:service.id}});
  return service.id;
 });
}
export async function removeCatalogService(actorId:string,id:string) {
 return db.$transaction(async tx=>{
  await requireCatalogAdmin(actorId,tx);
  if(await tx.order.count({where:{serviceId:id}})) throw new Error('Este servicio tiene pedidos históricos. Podés ocultarlo, pero no eliminarlo.');
  await tx.service.delete({where:{id}});
  await tx.auditLog.create({data:{actorId,action:'DELETE_SERVICE',reference:id}});
 });
}
export const visibleCatalogWhere = ():Prisma.ServiceWhereInput=>({
 active:true,provider:{active:true,...(process.env.APP_MODE==='demo'?{}:{kind:{not:'DEMO'}})},
 AND:[{OR:[{categoryId:null},{categoryRef:{active:true}}]},{OR:[{sourceId:null},{source:{available:true}}]}],
});
export async function setCatalogPublished(actorId:string,id:string,active:boolean) {
 await requireCatalogAdmin(actorId);
 const service=await db.service.findUniqueOrThrow({where:{id}});
 if(!service.categoryId) throw new Error('Asigná primero una categoría desde Editar.');
 return saveCatalogService(actorId,{...service,id,version:service.version,sourceId:service.sourceId||undefined,categoryId:service.categoryId,rate:service.rate.toFixed(2),manualCost:service.manualProviderRate.toString(),costCurrency:service.costCurrency,exchangeRate:service.exchangeRate.toString(),allowedHosts:service.allowedHosts.join(', '),active});
}
