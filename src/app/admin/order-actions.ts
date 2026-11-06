'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {checkOrigin,requireUser,rateLimit} from '@/lib/auth';
import {reconcileOrder,refundOrder,reconcileOperation} from '@/lib/order-admin';
import {processOrders,synchronizeOrder} from '@/lib/worker';
import {reportDatabaseError} from '@/lib/database-errors';
import type{ActionResult}from '@/app/actions';
async function run(fn:(actorId:string)=>Promise<string>,orderId?:string):Promise<ActionResult>{
 try{await checkOrigin();const user=await requireUser(true);await rateLimit(`order-admin:${user.id}`,30);const success=await fn(user.id);for(const path of ['/','/admin','/admin/pedidos','/admin/usuarios',...(orderId?[`/admin/pedidos/${orderId}`]:[])])revalidatePath(path);return {success};}
 catch(error){if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;if(error instanceof z.ZodError)return {error:error.issues[0].message};return {error:reportDatabaseError(error)??(error instanceof Error?error.message:'No pudimos completar la operación.')};}
}
function fields(form:FormData){return {...Object.fromEntries(form),externalId:String(form.get('externalId')||'')||undefined,verified:form.get('verified')==='on',useCurrentConfiguration:form.get('useCurrentConfiguration')==='on'};}
export async function processQueueAction(_:ActionResult,form:FormData){return run(async()=>{await processOrders();return 'Cola procesada y estados consultados. Actualizá la lista para revisar los cambios.';},String(form.get('orderId')||''));}
export async function syncOrderAction(_:ActionResult,form:FormData){const id=z.string().min(1).parse(form.get('orderId'));return run(async()=>{const changed=await synchronizeOrder(id,{force:true});return changed?'Consulta completada. Revisá el estado, historial y última sincronización.':'El pedido no tiene un ID externo confirmado o ya hay una consulta en curso.';},id);}
export async function reconcileOrderAction(_:ActionResult,form:FormData){const id=String(form.get('orderId')||'');return run(async actor=>{await reconcileOrder(actor,fields(form));return 'Conciliación registrada.';},id);}
export async function refundOrderAction(_:ActionResult,form:FormData){const id=String(form.get('orderId')||'');return run(async actor=>{await refundOrder(actor,fields(form));return 'Reintegro acreditado y auditado.';},id);}
export async function reconcileOperationAction(_:ActionResult,form:FormData){return run(async actor=>{await reconcileOperation(actor,fields(form));return 'Solicitud conciliada sin reenviarla.';},String(form.get('orderId')||''));}
