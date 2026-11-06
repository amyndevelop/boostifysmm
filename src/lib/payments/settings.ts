import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from '../db';
import {encryptProviderKey,decryptProviderKey} from '../providers/secrets';
import {PaymentProcessingError} from './errors';
import {MercadoPago} from './mercadopago';
export const MAX_TOP_UP='10000000.00';
const configSchema=z.object({version:z.string(),enabled:z.boolean(),collectorId:z.string(),liveMode:z.boolean(),token:z.string(),webhookSecret:z.string()});
export async function paymentConfig(){const row=await db.appSetting.findUnique({where:{key:'mercadoPago'}});return row?configSchema.parse(JSON.parse(row.value)):null;}
export async function depositMinimum(){const row=await db.appSetting.findUnique({where:{key:'depositMinimum'}});return row?.value??'1000.00';}
export function parseTopUpAmount(input:unknown,minimum:string){const value=z.string().regex(/^\d{1,8}(\.\d{1,2})?$/,'Ingresá un importe en ARS con hasta dos decimales.').parse(input);const amount=new Prisma.Decimal(value);if(amount.lt(minimum)||amount.gt(MAX_TOP_UP))throw new PaymentProcessingError('AMOUNT_OUT_OF_RANGE',false,`El importe debe estar entre ARS ${minimum} y ARS ${MAX_TOP_UP}.`);return amount;}
export function gateway(config:NonNullable<Awaited<ReturnType<typeof paymentConfig>>>,transport?:typeof fetch){return new MercadoPago(decryptProviderKey(config.token,'mercadopago:access'),transport);}
export function webhookSecret(config:NonNullable<Awaited<ReturnType<typeof paymentConfig>>>){return decryptProviderKey(config.webhookSecret,'mercadopago:webhook');}
export async function publicPaymentSettings(){const [minimum,config]=await Promise.all([depositMinimum(),paymentConfig()]);return {minimum,enabled:Boolean(config?.enabled)&&Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim())&&process.env.APP_MODE!=='demo',testMode:config?!config.liveMode:false};}
export async function savePaymentSettings(actorId:string,input:unknown,transport?:typeof fetch){
 const data=z.object({minimum:z.string(),enabled:z.boolean(),liveMode:z.boolean(),version:z.string(),accessToken:z.string().trim().max(1000),secret:z.string().trim().max(1000)}).parse(input);
 const actor=await db.user.findUniqueOrThrow({where:{id:actorId}});if(actor.blocked||actor.role!=='SUPER_ADMIN')throw new Error('Solo un superadministrador puede configurar los cobros.');
 const minimum=parseTopUpAmount(data.minimum,'1.00').toFixed(2);const previous=await paymentConfig();
 let config=previous;
 if(data.accessToken||data.secret){
  const token=data.accessToken|| (previous?decryptProviderKey(previous.token,'mercadopago:access'):'');const secret=process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()||data.secret|| (previous?webhookSecret(previous):'');
  if(!token||secret.length<16)throw new Error('Cargá el Access Token y configurá MERCADOPAGO_WEBHOOK_SECRET en Vercel (mínimo 16 caracteres).');
  const account=await new MercadoPago(token,transport).account();
  config={version:randomUUID(),enabled:data.enabled,liveMode:data.liveMode,collectorId:account.id,token:encryptProviderKey(token,'mercadopago:access'),webhookSecret:encryptProviderKey(secret,'mercadopago:webhook')};
 }
 if(data.enabled&&!process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim())throw new Error('Configurá MERCADOPAGO_WEBHOOK_SECRET en Vercel y volvé a desplegar antes de habilitar los cobros.');
 if(data.enabled&&!config)throw new Error('Configurá las credenciales antes de habilitar Mercado Pago.');
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(7731201)`;
  const fresh=await tx.appSetting.findUnique({where:{key:'mercadoPago'}});const current=fresh?configSchema.parse(JSON.parse(fresh.value)):null;
  if((current?.version??'')!==data.version)throw new Error('La configuración cambió. Actualizá la página.');
  const actor=await tx.user.findUniqueOrThrow({where:{id:actorId}});if(actor.blocked||actor.role!=='SUPER_ADMIN')throw new Error('No tenés permisos.');
  if(config&&current&&(config.collectorId!==current.collectorId||data.liveMode!==current.liveMode)&&await tx.topUp.count())throw new Error('No se puede cambiar la cuenta o el modo después de crear recargas. Usá una base separada para pruebas.');
  if(config)await tx.appSetting.upsert({where:{key:'mercadoPago'},create:{key:'mercadoPago',value:JSON.stringify({...config,enabled:data.enabled,liveMode:data.liveMode,version:randomUUID()})},update:{value:JSON.stringify({...config,enabled:data.enabled,liveMode:data.liveMode,version:randomUUID()})}});
  await tx.appSetting.upsert({where:{key:'depositMinimum'},create:{key:'depositMinimum',value:minimum},update:{value:minimum}});
  await tx.auditLog.create({data:{actorId,action:'UPDATE_PAYMENT_SETTINGS',reference:'mercadopago',metadata:{minimum,enabled:data.enabled,liveMode:data.liveMode,credentialsChanged:Boolean(data.accessToken||data.secret)}}});
 });
}
