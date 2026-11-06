import { Prisma } from '@prisma/client';
import { z } from 'zod';
export const quantitySchema = z.coerce.number().int('Ingresá una cantidad entera.').positive('La cantidad debe ser mayor que cero.').max(100000000);
export function calculatePrice(quantity: number, rate: Prisma.Decimal | string) {
  quantitySchema.parse(quantity);
  return new Prisma.Decimal(rate).mul(quantity).div(1000).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
export function validateOrderLink(link: string, hosts: string[]) {
  const url = new URL(z.url().max(2048).parse(link));
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) throw new Error('Usá un enlace HTTPS de la red seleccionada.');
  return url.toString();
}
export const statusLabels: Record<string, string> = { PENDING: 'Pendiente', SUBMITTING: 'Enviando', PROCESSING: 'En proceso', COMPLETED: 'Completado', PARTIAL: 'Parcial', CANCELLED: 'Cancelado', FAILED: 'Fallido', REVIEW_REQUIRED: 'En revisión' };
export const money = (value: string | number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(value));
