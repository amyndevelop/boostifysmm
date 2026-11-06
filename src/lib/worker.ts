import { db } from './db';
import { providerFor } from './providers';
export async function runOnce() {
 // Stale claims are uncertain: never resend blindly, even after a worker crash.
 const cutoff = new Date(Date.now() - 5 * 60000);
 const stale = await db.job.findMany({ where: { state: 'CLAIMED', claimedAt: { lt: cutoff } }, take: 100 });
 for (const job of stale) await db.$transaction(async tx => {
   const won = await tx.job.updateMany({ where: { id: job.id, state: 'CLAIMED', claimedAt: { lt: cutoff } }, data: { state: 'REVIEW' } });
   if (!won.count) return;
   await tx.order.update({ where: { id: job.orderId }, data: { status: 'REVIEW_REQUIRED', events: { create: { status: 'REVIEW_REQUIRED', message: 'Trabajo interrumpido. Conciliar antes de cualquier reenvío.' } } } });
 });
 const job = await db.$transaction(async tx => {
   const jobs = await tx.$queryRaw<{ id: string; orderId: string }[]>`SELECT id, "orderId" FROM "Job" WHERE state = 'PENDING' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
   if (!jobs.length) return null;
   const row = jobs[0];
   await tx.job.update({ where: { id: row.id }, data: { state: 'CLAIMED', claimedAt: new Date() } });
   await tx.order.update({ where: { id: row.orderId }, data: { status: 'SUBMITTING', events: { create: { status: 'SUBMITTING', message: 'Worker inició el procesamiento.' } } } });
   return row;
 });
 if (!job) return false;
 try {
   const order = await db.order.findUniqueOrThrow({ where: { id: job.orderId } });
   const provider = await db.provider.findUniqueOrThrow({ where: { id: order.providerSnapshot } });
   if (!provider.active) throw new Error('Proveedor deshabilitado');
   const adapter = providerFor(provider.kind);
   const result = await adapter.createOrder({ internalId: order.id, service: order.externalServiceId, quantity: order.quantity, link: order.link });
   if (!result.externalId) throw new Error('Respuesta sin identificador');
   // Only demo is implemented. Real submission/status/capture must be added together.
   await db.$transaction(async tx => {
     const won = await tx.job.updateMany({ where: { id: job.id, state: 'CLAIMED' }, data: { state: 'DONE' } });
     if (!won.count) throw new Error('El trabajo requiere conciliación.');
     const wallet = await tx.wallet.update({ where: { userId: order.userId }, data: { reserved: { decrement: order.price } } });
     await tx.walletTransaction.create({ data: { walletId: wallet.id, key: `capture:${order.id}`, type: 'CAPTURE', amount: '0', reservedDelta: order.price.neg(), reference: order.id } });
     await tx.order.update({ where: { id: order.id }, data: { externalId: result.externalId, status: 'COMPLETED', events: { create: { status: 'COMPLETED', message: 'Simulación completada. Sin entrega externa.' } } } });
     await tx.notification.create({ data: { userId: order.userId, message: `Tu pedido demo ${order.id} fue completado.` } });
   });
 } catch {
   await db.$transaction(async tx => {
     await tx.job.update({ where: { id: job.id }, data: { state: 'REVIEW' } });
     await tx.order.update({ where: { id: job.orderId }, data: { status: 'REVIEW_REQUIRED', events: { create: { status: 'REVIEW_REQUIRED', message: 'Respuesta incierta o proveedor no configurado. Revisión manual requerida; no se reenvía ni reintegra automáticamente.' } } } });
   });
 }
 return true;
}
