'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireUser,checkOrigin,rateLimit } from '@/lib/auth';
import { saveManagedUser,adjustUserBalance } from '@/lib/user-management';
import { reportDatabaseError } from '@/lib/database-errors';
import { money } from '@/lib/domain';
import type { ActionResult } from '@/app/actions';
function failure(error:unknown):ActionResult{
 if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;
 if(error instanceof z.ZodError)return {error:error.issues[0].message};
 if(error instanceof Prisma.PrismaClientValidationError||error instanceof Prisma.PrismaClientUnknownRequestError)return {error:'No pudimos guardar el cambio. Contactá al administrador del sistema.'};
 return {error:reportDatabaseError(error)??(error instanceof Error?error.message:'No pudimos completar la operación.')};
}
function refresh(userId:string){for(const path of ['/','/admin','/admin/usuarios',`/admin/usuarios/${userId}`])revalidatePath(path);}
export async function saveUserAction(_:ActionResult,form:FormData):Promise<ActionResult>{
 let userId='';
 try{
  await checkOrigin();const actor=await requireUser(true);await rateLimit(`user-config:${actor.id}`,60);
  const result=await saveManagedUser(actor.id,{...Object.fromEntries(form),id:String(form.get('id')||'')||undefined,version:form.get('version')||undefined,blocked:form.get('blocked')==='on'});
  userId=result.id;refresh(userId);
 }catch(error){return failure(error);}
 redirect(`/admin/usuarios/${userId}?saved=1`);
}
export async function adjustBalanceAction(input:unknown):Promise<ActionResult>{
 try{
  await checkOrigin();const actor=await requireUser(true);await rateLimit(`balance-adjustment:${actor.id}`,60);
  const adjustment=await adjustUserBalance(actor.id,input);refresh(adjustment.userId);
  return {success:`${adjustment.direction==='CREDIT'?'Acreditación':'Descuento'} de ${money(adjustment.amount.toString())} registrado. Saldo disponible después del ajuste: ${money(adjustment.balanceAfter.toString())}.`};
 }catch(error){return failure(error);}
}
