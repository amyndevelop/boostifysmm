import { z } from 'zod';
import { validateProviderEndpoint, validateProviderDestination } from './endpoint';
import type { SmmProvider } from './index';
// Contract supplied by the user: SMMTAKE API documentation and PHP sample.
// Unlike that sample, HTTPS certificate/hostname verification stays enabled.
const numericId = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).transform(String);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const statusNumber=z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative()]).transform(String);
const statusDecimal=z.union([decimal,z.number().finite().nonnegative()]).transform(String);
const statusSchema = z.object({ charge: statusDecimal, start_count: statusNumber.optional(), status: z.string().trim().min(1).max(100), remains: statusNumber, currency: z.string().length(3).transform(s=>s.toUpperCase()) });
const serviceInteger = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(Number).refine(n=>Number.isSafeInteger(n)&&n<=2147483647);
const serviceRate = z.union([decimal,z.number().finite().nonnegative()]).transform(String).refine(s=>/^\d+(\.\d+)?$/.test(s));
// Capabilities may be absent or encoded as 0/1. Only explicitly true values
// advertise a capability; unknown/missing values never enable it.
const capability = z.unknown().default(false).transform(value=>value===true||value===1||value==='1'||(typeof value==='string'&&value.toLowerCase()==='true'));
const serviceSchema = z.object({ service: numericId, name: z.string().min(1), type: z.string().default('Unknown'), category: z.string().default('Sin categoría del proveedor'), rate: serviceRate, min: serviceInteger, max: serviceInteger, refill: capability, cancel: capability });
export type ProviderFailureCode = 'PROVIDER_ERROR'|'HTTP_ERROR'|'TIMEOUT'|'NETWORK_ERROR'|'INVALID_JSON'|'RESPONSE_TOO_LARGE'|'PROVIDER_REJECTED'|'SERVICES_FORMAT';
export class ProviderError extends Error {
 constructor(public readonly uncertain: boolean, public readonly code:ProviderFailureCode='PROVIDER_ERROR',public readonly httpStatus?:number,public readonly fields:string[]=[]) { super(uncertain ? 'Respuesta del proveedor incierta. Requiere conciliación.' : 'El proveedor rechazó la solicitud o devolvió una respuesta no válida.'); }
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
     const response = await this.transport(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key: this.key, action, ...params }), signal: AbortSignal.timeout(action==='services'?30000:15000), redirect: 'error', cache: 'no-store' });
     if (!response.ok) throw new ProviderError(mutation,'HTTP_ERROR',response.status);
     const text = await response.text();
     if (text.length > 5_000_000) throw new ProviderError(mutation,'RESPONSE_TOO_LARGE');
     let body:unknown;
     try{body=JSON.parse(text);}catch{throw new ProviderError(mutation,'INVALID_JSON');}
     if (body && typeof body === 'object' && 'error' in body) throw new ProviderError(mutation&&'order' in body,'PROVIDER_REJECTED');
     return body;
   } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError(mutation,error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'TIMEOUT':'NETWORK_ERROR'); }
 }
 async getServices() {
   const result=z.array(serviceSchema).safeParse(await this.request('services'));
   if(!result.success){
     const allowed=new Set(['service','name','type','category','rate','min','max','refill','cancel']);
     const fields=[...new Set(result.error.issues.flatMap(i=>i.path.filter((p):p is string=>typeof p==='string'&&allowed.has(p))))];
     throw new ProviderError(false,'SERVICES_FORMAT',undefined,fields);
   }
   return result.data.map(s=>({...s,id:s.service}));
 }
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
 async requestRefill(id: string) { const parsed=z.object({refill:numericId}).safeParse(await this.request('refill',{order:numericId.parse(id)},true)); if(!parsed.success)throw new ProviderError(true);return {id:parsed.data.refill}; }
 async getRefillStatus(id: string) { return z.object({ status: z.string() }).parse(await this.request('refill_status', { refill: numericId.parse(id) })); }
 async requestCancellation(id: string) {
   const parsed=z.array(z.object({order:numericId,cancel:z.union([z.literal(1),z.literal('1'),z.object({error:z.string()})])})).safeParse(await this.request('cancel',{orders:numericId.parse(id)},true));
   if(!parsed.success||parsed.data.length!==1||parsed.data[0].order!==id)throw new ProviderError(true);
   if(typeof parsed.data[0].cancel==='object')throw new ProviderError(false,'PROVIDER_REJECTED');
 }
}
