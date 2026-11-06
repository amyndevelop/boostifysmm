import { createHash } from 'node:crypto';
import type {Order} from '@prisma/client';
import {db} from '../db';
import {DemoProvider,type SmmProvider} from './index';
import {SmmtakeAdapter} from './smmtake';
import {decryptProviderKey} from './secrets';
export const credentialFingerprint=(encrypted:string)=>createHash('sha256').update(encrypted).digest('hex');
export type OrderRoute=Pick<Order,'providerSnapshot'|'providerEndpointSnapshot'|'providerCredentialFingerprint'>;
export async function configuredProvider(order:OrderRoute,options:{mutations?:boolean;transport?:typeof fetch;allowChangedConfiguration?:boolean}={}):Promise<SmmProvider>{
 const provider=await db.provider.findUniqueOrThrow({where:{id:order.providerSnapshot}});
 if(provider.kind==='DEMO'){
  if(process.env.APP_MODE!=='demo')throw new Error('El proveedor demo está deshabilitado.');
  return new DemoProvider();
 }
 if(process.env.APP_MODE==='demo')throw new Error('El modo demo no envía operaciones a proveedores reales.');
 if(process.env.APP_MODE==='test'&&!options.transport)throw new Error('Las pruebas necesitan un transporte simulado.');
 if(!['SMMTAKE','SMM_V2'].includes(provider.kind)||!provider.endpoint||!provider.encryptedKey)throw new Error('Proveedor no configurado.');
 if(options.mutations&&!provider.active)throw new Error('Proveedor desactivado.');
 if(!options.allowChangedConfiguration&&((order.providerEndpointSnapshot&&order.providerEndpointSnapshot!==provider.endpoint)||(order.providerCredentialFingerprint&&order.providerCredentialFingerprint!==credentialFingerprint(provider.encryptedKey))))throw new Error('Cambió la configuración del proveedor. Se requiere conciliación.');
 return new SmmtakeAdapter(decryptProviderKey(provider.encryptedKey,provider.id),options.transport??fetch,options.mutations??false,provider.endpoint);
}
