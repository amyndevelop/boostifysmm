'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser, checkOrigin, rateLimit } from '@/lib/auth';
import { reportDatabaseError } from '@/lib/database-errors';
import { saveCategoryConfig,saveCatalogService,removeCategory,removeCatalogService } from '@/lib/catalog';
import type { ActionResult } from '@/app/actions';
async function run(fn:(id:string)=>Promise<string>):Promise<ActionResult>{
 try {
  await checkOrigin();const user=await requireUser(true);await rateLimit(`catalog:${user.id}`,120);
  const success=await fn(user.id);
  for(const path of ['/','/admin','/admin/servicios','/admin/categorias'])revalidatePath(path);
  return {success};
 } catch(e) {
  if(e instanceof Error && e.message.startsWith('NEXT_REDIRECT'))throw e;
  if(e instanceof z.ZodError)return {error:e.issues[0].message};
  return {error:reportDatabaseError(e) ?? (e instanceof Error?e.message:'No pudimos guardar los cambios.')};
 }
}
function fields(form:FormData){return {...Object.fromEntries(form),id:String(form.get('id')||'')||undefined,version:form.get('version')||undefined,sourceId:String(form.get('sourceId')||'')||undefined,active:form.get('active')==='on'};}
export async function saveCategoryAction(_:ActionResult,form:FormData){return run(async id=>{await saveCategoryConfig(id,fields(form));return 'Categoría guardada.';});}
export async function saveCatalogAction(_:ActionResult,form:FormData){
 let serviceId='';
 const result=await run(async id=>{serviceId=await saveCatalogService(id,fields(form));revalidatePath(`/admin/servicios/${serviceId}`);return 'Servicio guardado.';});
 if(result.success)redirect(`/admin/servicios/${serviceId}?saved=1`);
 return result;
}
export async function deleteCategoryAction(_:ActionResult,form:FormData){return run(async id=>{if(form.get('confirm')!=='on')throw new Error('Confirmá la eliminación.');await removeCategory(id,z.string().min(1).parse(form.get('id')));return 'Categoría eliminada.';});}
export async function deleteServiceAction(_:ActionResult,form:FormData){
 const result=await run(async id=>{if(form.get('confirm')!=='on')throw new Error('Confirmá la eliminación.');await removeCatalogService(id,z.string().min(1).parse(form.get('id')));return 'Servicio eliminado.';});
 if(result.success)redirect('/admin/servicios?deleted=1');
 return result;
}
export async function publishCatalogAction(_:ActionResult,form:FormData){return run(async id=>{
 const {setCatalogPublished}=await import('@/lib/catalog');
 const active=z.enum(['true','false']).parse(form.get('publish'))==='true';
 await setCatalogPublished(id,z.string().min(1).parse(form.get('id')),active);
 return active?'Servicio publicado.':'Servicio oculto.';
});}
