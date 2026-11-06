'use server';
import { z } from 'zod';
import argon2 from 'argon2';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { reportDatabaseError } from '@/lib/database-errors';
import { checkOrigin, createSession, digest, rateLimit, requireUser } from '@/lib/auth';
import { approveDeposit, placeOrder } from '@/lib/orders';
export type ActionResult = { error?: string; success?: string; orderId?:string };
async function safely(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try { await checkOrigin(); return await fn(); }
  catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    const databaseError = reportDatabaseError(e);
    if (databaseError) return { error: databaseError };
    if (e instanceof Error && e.message.startsWith('NEXT_REDIRECT')) throw e;
    return { error: e instanceof Error ? e.message : 'No pudimos completar la operación.' };
  }
}
const credentials = z.object({ email: z.email('Ingresá un email válido.').max(254).transform(s => s.toLowerCase()), password: z.string().min(12, 'Usá al menos 12 caracteres.').max(128) });
export async function authenticate(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const data = credentials.parse(Object.fromEntries(form));
    await rateLimit(`auth:${digest(data.email)}`);
    const user = await db.user.findUnique({ where: { email: data.email } });
    const valid = user ? await argon2.verify(user.passwordHash, data.password) : await argon2.hash(data.password).then(() => false);
    if (!user || !valid || user.blocked) return { error: 'Email o contraseña incorrectos.' };
    await createSession(user.id); redirect('/');
  });
}
export async function register(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const data = credentials.extend({ name: z.string().trim().min(2).max(80) }).parse(Object.fromEntries(form));
    await rateLimit('registration', 30);
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await db.user.create({ data: { email: data.email, name: data.name, passwordHash, wallet: { create: {} } } });
    await createSession(user.id); redirect('/');
  });
}
export async function logout() {
  await checkOrigin();
  const token = (await cookies()).get('boostify_session')?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  (await cookies()).delete('boostify_session'); redirect('/login');
}
export async function submitOrder(input: unknown): Promise<ActionResult> {
 return safely(async()=>{
  const user=await requireUser();await rateLimit(`orders:${user.id}`,60);
  const order=await placeOrder(user.id,input);
  const {dispatchOrder}=await import('@/lib/worker');
  try{await dispatchOrder(order.id);}catch{/* The stored queue/request state is authoritative; never resend an uncertain claim. */}
  const result=await db.order.findUniqueOrThrow({where:{id:order.id}});
  revalidatePath('/');revalidatePath('/admin/pedidos');
  if(result.status==='REVIEW_REQUIRED'||result.status==='SUBMITTING')return {orderId:order.id,error:'El resultado del envío necesita revisión. Tu saldo sigue reservado. No repitas la compra; consultá Mis pedidos o soporte.'};
  if(result.status==='FAILED')return {orderId:order.id,error:'El proveedor no aceptó el pedido. El saldo reservado fue liberado. Revisá Mis pedidos.'};
  return {orderId:order.id,success:result.status==='PENDING'?`Pedido ${order.id} recibido y en cola de envío.`:`Pedido ${order.id} recibido y enviado. Podés seguirlo en Mis pedidos.`};
 });
}
export async function requestDeposit(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser(); await rateLimit(`deposits:${user.id}`, 10);
    const bank = await db.appSetting.findUnique({ where: { key: 'bankDetails' } });
    if (!bank?.value) throw new Error('Las transferencias aún no están habilitadas. Contactá a soporte.');
    const amount = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Ingresá un importe válido.').parse(form.get('amount'));
    if (new Prisma.Decimal(amount).lt(1000) || new Prisma.Decimal(amount).gt(10000000)) throw new Error('El importe debe estar entre $1.000 y $10.000.000.');
    const reference = z.string().trim().min(4).max(120).parse(form.get('reference'));
    const file = form.get('receipt');
    if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) throw new Error('Adjuntá una imagen PNG o JPEG de hasta 2 MB.');
    const buffer = Buffer.from(await file.arrayBuffer());
    const png = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if ((!png && !jpeg) || file.type !== (png ? 'image/png' : 'image/jpeg')) throw new Error('El comprobante debe ser PNG o JPEG válido.');
    await db.depositRequest.create({ data: { userId: user.id, amount, reference, receipt: buffer, mimeType: png ? 'image/png' : 'image/jpeg' } });
    revalidatePath('/'); return { success: 'Comprobante enviado. El saldo se acreditará después de la revisión.' };
  });
}
export async function reviewDeposit(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser(true); const id = z.string().min(1).parse(form.get('id'));
    const decision = z.enum(['approve','reject']).parse(form.get('decision'));
    if (decision === 'approve') await approveDeposit(user.id, id);
    else await db.$transaction(async tx => {
      const changed = await tx.depositRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', reviewedBy: user.id } });
      if (!changed.count) throw new Error('La solicitud ya fue revisada.');
      await tx.auditLog.create({ data: { actorId: user.id, action: 'REJECT_DEPOSIT', reference: id } });
      const deposit = await tx.depositRequest.findUniqueOrThrow({ where: { id } });
      await tx.notification.create({ data: { userId: deposit.userId, message: 'Tu solicitud de saldo fue rechazada. Contactá a soporte.' } });
    });
    revalidatePath('/admin'); revalidatePath('/'); return { success: 'Solicitud revisada.' };
  });
}
export async function saveBank(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser(true);
    const value = z.string().trim().min(10).max(500).parse(form.get('bankDetails'));
    await db.$transaction([db.appSetting.upsert({ where: { key: 'bankDetails' }, create: { key: 'bankDetails', value }, update: { value } }), db.auditLog.create({ data: { actorId: user.id, action: 'UPDATE_BANK', reference: 'bankDetails' } })]);
    revalidatePath('/'); revalidatePath('/admin'); return { success: 'Datos bancarios guardados.' };
  });
}
export async function saveTheme(theme: string) {
  await checkOrigin(); const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { theme: z.enum(['dark','light']).parse(theme) } });
}
export async function openTicket(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser(); await rateLimit(`tickets:${user.id}`, 10);
    const data = z.object({ subject: z.string().trim().min(5).max(120), category: z.enum(['Pedido','Servicio','Saldo','Facturación','Otro']), body: z.string().trim().min(10).max(4000), orderId: z.string().optional() }).parse(Object.fromEntries(form));
    if (data.orderId && !await db.order.findFirst({ where: { id: data.orderId, userId: user.id } })) throw new Error('Pedido no encontrado.');
    await db.supportTicket.create({ data: { userId: user.id, subject: data.subject, category: data.category, orderId: data.orderId || null, messages: { create: { authorId: user.id, body: data.body } } } });
    revalidatePath('/'); return { success: 'Tu consulta fue enviada.' };
  });
}
export async function replyTicket(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser(); await rateLimit(`reply:${user.id}`, 30);
    const id = z.string().parse(form.get('id')); const body = z.string().trim().min(1).max(4000).parse(form.get('body'));
    const admin = ['ADMIN','SUPER_ADMIN'].includes(user.role);
    const ticket = await db.supportTicket.findFirst({ where: { id, ...(admin ? {} : { userId: user.id }) } });
    if (!ticket) throw new Error('Consulta no encontrada.');
    await db.$transaction(async tx => {
      await tx.ticketMessage.create({ data: { ticketId: id, authorId: user.id, body } });
      await tx.supportTicket.update({ where: { id }, data: { status: admin ? 'ANSWERED' : 'OPEN' } });
      if (admin) await tx.notification.create({ data: { userId: ticket.userId, message: `Respondimos tu consulta: ${ticket.subject}` } });
    });
    revalidatePath('/'); revalidatePath('/admin'); return { success: 'Respuesta enviada.' };
  });
}
export async function saveProvider(_: ActionResult, form: FormData): Promise<ActionResult> {
 return safely(async () => {
   const actor = await requireUser(true); await rateLimit(`provider-config:${actor.id}`,30);
   const { saveProviderConfig } = await import('@/lib/providers/manage');
   await saveProviderConfig(actor.id,{id:String(form.get('id') || '') || undefined,version:form.get('version') || undefined,name:form.get('name'),kind:form.get('kind'),endpoint:form.get('endpoint'),apiKey:String(form.get('apiKey') || ''),active:form.get('active') === 'on'});
   revalidatePath('/admin'); revalidatePath('/admin/proveedores');
   return {success:'Proveedor guardado. Podés probar la conexión o importar sus servicios.'};
 });
}
export async function providerRead(_: ActionResult, form: FormData): Promise<ActionResult> {
 return safely(async () => {
   const actor = await requireUser(true); await rateLimit(`provider:${actor.id}`,20);
   const operation = z.enum(['balance','services']).parse(form.get('operation'));
   const id = z.string().min(1).parse(form.get('providerId'));
   const { readProvider } = await import('@/lib/providers/manage');
   const success = await readProvider(actor.id,id,operation);
   revalidatePath('/admin'); revalidatePath('/admin/proveedores');
   return {success};
 });
}
