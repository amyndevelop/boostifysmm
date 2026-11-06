import { z } from 'zod';
import { validateProviderEndpoint, validateProviderDestination } from './endpoint';
import type { SmmProvider } from './index';
// Contract supplied by the user: SMMTAKE API documentation and PHP sample.
// Unlike that sample, HTTPS certificate/hostname verification stays enabled.
const numericId = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).transform(String);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const statusSchema = z.object({ charge: decimal, start_count: z.string(), status: z.string(), remains: z.string(), currency: z.string().length(3) });
const serviceSchema = z.object({ service: numericId, name: z.string(), type: z.string(), category: z.string(), rate: decimal, min: z.string().regex(/^\d+$/), max: z.string().regex(/^\d+$/), refill: z.boolean(), cancel: z.boolean() });
export class ProviderError extends Error {
 constructor(public readonly uncertain: boolean) { super(uncertain ? 'Respuesta del proveedor incierta. Requiere conciliación.' : 'El proveedor rechazó la solicitud o devolvió una respuesta no válida.'); }
}
export class SmmtakeAdapter implements SmmProvider {
 static readonly endpoint = 'https://smmtake.com/api/v2';
 constructor(private readonly key: string, private readonly transport: typeof fetch = fetch, private readonly allowMutations = false, private readonly endpoint = SmmtakeAdapter.endpoint) {
   this.endpoint = validateProviderEndpoint(endpoint);
   if (!key) throw new Error('Falta la clave API del proveedor.');
 }
 private async request(action: string, params: Record<string,string> = {}, mutation = false): Promise<unknown> {
   if (mutation && !this.allowMutations) throw new Error('Las operaciones con costo o cambios están deshabilitadas.');
   try {
     if (this.transport === fetch) await validateProviderDestination(this.endpoint);
     const response = await this.transport(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key: this.key, action, ...params }), signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
     if (!response.ok) throw new ProviderError(mutation);
     const text = await response.text();
     if (text.length > 5_000_000) throw new ProviderError(mutation);
     const body: unknown = JSON.parse(text);
     if (body && typeof body === 'object' && 'error' in body) throw new ProviderError(false);
     return body;
   } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError(mutation); }
 }
 async getServices() { return z.array(serviceSchema).parse(await this.request('services')).map(s => ({ ...s, id: s.service, min: Number(s.min), max: Number(s.max) })); }
 async getBalance() { return z.object({ balance: decimal, currency: z.string().length(3) }).parse(await this.request('balance')); }
 async createOrder(order: { service: string; quantity: number; link: string }) {
   const service = numericId.parse(order.service);
   const quantity = z.number().int().positive().parse(order.quantity);
   const link = z.url().parse(order.link);
   const body = await this.request('add', { service, quantity: String(quantity), link }, true);
   const result = z.object({ order: numericId }).safeParse(body);
   if (!result.success) throw new ProviderError(true);
   return { externalId: result.data.order };
 }
 async getOrderStatus(id: string) { return statusSchema.parse(await this.request('status', { order: numericId.parse(id) })); }
 async getMultipleOrderStatuses(ids: string[]) {
   const orders = z.array(numericId).min(1).max(100).parse(ids).join(',');
   return z.record(z.string(), z.union([statusSchema, z.object({ error: z.string() })])).parse(await this.request('status', { orders }));
 }
 async requestRefill(id: string) { const result = z.object({ refill: numericId }).parse(await this.request('refill', { order: numericId.parse(id) }, true)); return { id: result.refill }; }
 async getRefillStatus(id: string) { return z.object({ status: z.string() }).parse(await this.request('refill_status', { refill: numericId.parse(id) })); }
 async requestCancellation(id: string) {
   const result = z.array(z.object({ order: numericId, cancel: z.union([z.literal(1), z.object({ error: z.string() })]) })).parse(await this.request('cancel', { orders: numericId.parse(id) }, true));
   if (result.length !== 1 || result[0].order !== id || result[0].cancel !== 1) throw new ProviderError(false);
 }
}
