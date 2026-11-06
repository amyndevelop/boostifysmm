import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ProviderError } from './smmtake';
export type ProviderStage='BALANCE'|'SERVICES'|'DATABASE';
export function reportProviderFailure(error:unknown,stage:ProviderStage){
 const reference=randomUUID();
 const databaseCode=error instanceof Prisma.PrismaClientKnownRequestError&&/^P\d{4}$/.test(error.code)?error.code:undefined;
 const code=error instanceof ProviderError?error.code:databaseCode??(error instanceof z.ZodError?'RESPONSE_FORMAT':'UNEXPECTED');
 const fields=error instanceof ProviderError?error.fields.filter(f=>['service','name','type','category','rate','min','max','refill','cancel'].includes(f)):[];
 // Never serialize the exception or any upstream response: both can contain keys.
 console.error('BOOSTIFY_PROVIDER_ERROR',{reference,stage,code,httpStatus:error instanceof ProviderError?error.httpStatus:undefined,fields});
 let message=stage==='DATABASE'?'La API respondió, pero no pudimos guardar el catálogo en la base de datos.':'No pudimos completar la consulta al proveedor.';
 if(code==='SERVICES_FORMAT')message=`El proveedor devolvió un formato de servicios no admitido${fields.length?` en: ${fields.join(', ')}`:''}.`;
 if(code==='TIMEOUT')message='El proveedor no respondió dentro del tiempo disponible para descargar el catálogo.';
 if(code==='HTTP_ERROR'&&error instanceof ProviderError)message=`El proveedor respondió HTTP ${error.httpStatus} al consultar ${stage==='SERVICES'?'el catálogo':'el saldo'}.`;
 if(code==='INVALID_JSON')message='El proveedor devolvió una respuesta que no es JSON válido.';
 if(code==='PROVIDER_REJECTED')message='El proveedor rechazó la operación solicitada.';
 if(code==='RESPONSE_TOO_LARGE')message='El catálogo supera el tamaño de respuesta admitido.';
 if(databaseCode==='P2021'||databaseCode==='P2022')message='Faltan tablas o columnas del catálogo. Verificá que el último despliegue haya aplicado las migraciones.';
 return `${message} Código: ${code}. Referencia: ${reference}.`;
}
