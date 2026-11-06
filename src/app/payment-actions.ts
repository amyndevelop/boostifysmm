'use server';
import {Prisma} from '@prisma/client';
import {reportDatabaseError} from '@/lib/database-errors';
import {db} from '@/lib/db';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {checkOrigin,requireUser,rateLimit} from '@/lib/auth';
import {savePaymentSettings} from '@/lib/payments/settings';
import {createTopUp,refreshTopUp} from '@/lib/payments/topups';
import type {ActionResult} from './actions';
export type CheckoutResult={error?:string;url?:string;topUpId?:string};
export async function startCheckout(input:unknown):Promise<CheckoutResult>{
 try{await checkOrigin();const user=await requireUser();await rateLimit(`mp-checkout:${user.id}`,15);const topUp=await createTopUp(user.id,input);revalidatePath('/');return {url:topUp.checkoutUrl??undefined,topUpId:topUp.id};}
 catch(error){if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;return {error:error instanceof z.ZodError?error.issues[0].message:reportDatabaseError(error)??(error instanceof Prisma.PrismaClientValidationError?'No pudimos completar la operación.':error instanceof Error?error.message:'No pudimos iniciar el pago.')};}
}
export async function savePayments(_:ActionResult,form:FormData):Promise<ActionResult>{
 try{await checkOrigin();const user=await requireUser(true);await rateLimit(`mp-config:${user.id}`,10);await savePaymentSettings(user.id,{minimum:form.get('minimum'),enabled:form.get('enabled')==='on',liveMode:form.get('mode')==='live',version:form.get('version'),accessToken:String(form.get('accessToken')??''),secret:String(form.get('secret')??'')});revalidatePath('/');revalidatePath('/admin/recargas');return {success:'Configuración guardada. El mínimo se aplica a Mercado Pago y transferencias.'};}
 catch(error){if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;return {error:error instanceof z.ZodError?error.issues[0].message:reportDatabaseError(error)??(error instanceof Prisma.PrismaClientValidationError?'No pudimos completar la operación.':error instanceof Error?error.message:'No pudimos guardar la configuración.')};}
}
export async function refreshPayment(_:ActionResult,form:FormData):Promise<ActionResult>{
 try{await checkOrigin();const user=await requireUser();await rateLimit(`mp-refresh:${user.id}`,30);const id=z.uuid().parse(form.get('topUpId'));const paymentId=z.string().regex(/^\d{1,30}$/).optional().parse(String(form.get('paymentId')??'')||undefined);await refreshTopUp(user.id,id,paymentId);revalidatePath('/');revalidatePath(`/recargas/${id}`);revalidatePath('/admin/recargas');return {success:'Consulta completada. El saldo se acredita únicamente con un pago aprobado y verificado.'};}
 catch(error){if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;return {error:error instanceof z.ZodError?'Identificador inválido.':reportDatabaseError(error)??(error instanceof Prisma.PrismaClientValidationError?'No pudimos completar la operación.':error instanceof Error?error.message:'No pudimos consultar el pago.')};}
}

export async function refreshAdminPayment(_:ActionResult,form:FormData):Promise<ActionResult>{
 try{await checkOrigin();const actor=await requireUser(true);await rateLimit(`mp-admin-sync:${actor.id}`,15);const id=z.uuid().parse(form.get('topUpId'));const topUp=await db.topUp.findUniqueOrThrow({where:{id}});await refreshTopUp(topUp.userId,id);revalidatePath('/admin/recargas');revalidatePath('/');return {success:'Pagos consultados y saldo actualizado si corresponde.'};}
 catch{return {error:'No pudimos consultar la recarga. Verificá la configuración y reintentá.'};}
}
