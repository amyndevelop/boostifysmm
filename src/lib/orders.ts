import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { calculatePrice, quantitySchema, validateOrderLink } from './domain';
export const orderSchema = z.object({ serviceId: z.string().min(1), quantity: quantitySchema, link: z.string(), idempotencyKey: z.uuid(), quotedPrice: z.string().regex(/^\d+\.\d{2}$/) });
export async function placeOrder(userId: string, input: unknown) {
  const data = orderSchema.parse(input);
  const fingerprint = createHash('sha256').update(JSON.stringify({ serviceId: data.serviceId, quantity: data.quantity, link: data.link, quotedPrice: data.quotedPrice })).digest('hex');
  return db.$transaction(async tx => {
    // Lock wallet before reading idempotency or funds; all competing purchases serialize.
    const wallets = await tx.$queryRaw<{id: string}[]>`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    if (!wallets.length) throw new Error('Billetera no disponible.');
    const previous = await tx.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: data.idempotencyKey } } });
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('La clave ya se usó para otro pedido.');
      return previous;
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.blocked) throw new Error('Cuenta bloqueada.');
    const service = await tx.service.findUnique({ where: { id: data.serviceId }, include: { provider: true } });
    if (!service?.active || !service.provider.active) throw new Error('El servicio no está disponible.');
    if (service.provider.kind === 'DEMO' && process.env.APP_MODE !== 'demo') throw new Error('Servicio exclusivo de demostración.');
    if (service.currency !== 'ARS' || service.provider.currency !== 'ARS') throw new Error('Conversión de moneda pendiente de configuración.');
    if (data.quantity < service.min || data.quantity > service.max) throw new Error(`Ingresá entre ${service.min} y ${service.max} unidades.`);
    const link = validateOrderLink(data.link, service.allowedHosts);
    const price = calculatePrice(data.quantity, service.rate);
    if (price.lte(0) || !price.eq(data.quotedPrice)) throw new Error('El precio cambió. Actualizá y confirmá nuevamente.');
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (wallet.currency !== service.currency || wallet.available.lt(price)) throw new Error('Saldo insuficiente. Cargá saldo para continuar.');
    const order = await tx.order.create({ data: { userId, serviceId: service.id, idempotencyKey: data.idempotencyKey, fingerprint, quantity: data.quantity, link, price, rateSnapshot: service.rate, costSnapshot: new Prisma.Decimal(service.cost).mul(data.quantity).div(1000), serviceName: service.name, network: service.network, providerSnapshot: service.providerId, externalServiceId: service.externalId, currency: service.currency, events: { create: { status: 'PENDING', message: 'Pedido recibido; saldo reservado.' } }, job: { create: {} } } });
    await tx.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: price }, reserved: { increment: price } } });
    await tx.walletTransaction.create({ data: { walletId: wallet.id, key: `reserve:${order.id}`, type: 'RESERVE', amount: price.neg(), reservedDelta: price, reference: order.id } });
    await tx.notification.create({ data: { userId, message: `Recibimos tu pedido ${order.id}.` } });
    return order;
  });
}
export async function approveDeposit(actorId: string, depositId: string) {
  return db.$transaction(async tx => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    if (actor.blocked || !['ADMIN','SUPER_ADMIN'].includes(actor.role)) throw new Error('Sin permisos.');
    const changed = await tx.depositRequest.updateMany({ where: { id: depositId, status: 'PENDING' }, data: { status: 'APPROVED', reviewedBy: actorId } });
    if (!changed.count) throw new Error('La solicitud ya fue revisada.');
    const deposit = await tx.depositRequest.findUniqueOrThrow({ where: { id: depositId } });
    const wallet = await tx.wallet.update({ where: { userId: deposit.userId }, data: { available: { increment: deposit.amount } } });
    await tx.walletTransaction.create({ data: { walletId: wallet.id, key: `deposit:${deposit.id}`, type: 'DEPOSIT', amount: deposit.amount, reference: deposit.id } });
    await tx.auditLog.create({ data: { actorId, action: 'APPROVE_DEPOSIT', reference: deposit.id } });
    await tx.notification.create({ data: { userId: deposit.userId, message: 'Tu carga de saldo fue acreditada.' } });
  });
}
