'use server';
import {revalidatePath} from 'next/cache';
import {checkOrigin,requireUser,rateLimit} from '@/lib/auth';
import {requestOrderOperation} from '@/lib/order-operations';
import {reportDatabaseError} from '@/lib/database-errors';
import {z} from 'zod';
import type {ActionResult} from './actions';
export async function orderOperationAction(input:unknown):Promise<ActionResult>{
 try{
  await checkOrigin();const user=await requireUser();await rateLimit(`order-operation:${user.id}`,15);
  const operation=await requestOrderOperation(user.id,input);revalidatePath('/');revalidatePath('/admin/pedidos');
  if(operation.status==='REVIEW_REQUIRED')return {error:'No se confirmó la respuesta del proveedor. La solicitud quedó en revisión y no se volverá a enviar automáticamente.'};
  if(operation.status==='REJECTED')return {error:'El proveedor no aceptó la solicitud. Consultá a soporte.'};
  return {success:operation.kind==='REFILL'?'Solicitud de reposición registrada. Podés seguirla en Mis pedidos.':'Solicitud de cancelación registrada. Esperaremos la confirmación del proveedor; no implica un reintegro inmediato.'};
 }catch(error){
  if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;
  if(error instanceof z.ZodError)return {error:'Revisá los datos de la solicitud.'};
  return {error:reportDatabaseError(error)??(error instanceof Error?error.message:'No pudimos registrar la solicitud.')};
 }
}
