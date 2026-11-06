export type ProviderService = { id: string; name: string; rate: string; currency?: string; min: number; max: number };
export type ProviderOrderStatus={status:string;charge?:string;currency?:string;remains?:string;start_count?:string};
export interface SmmProvider {
 getServices(): Promise<ProviderService[]>;
 getBalance(): Promise<{ balance: string; currency: string }>;
 createOrder(order: { internalId: string; service: string; quantity: number; link: string }): Promise<{ externalId: string }>;
 getOrderStatus(id: string): Promise<ProviderOrderStatus>;
 getMultipleOrderStatuses(ids: string[]): Promise<Record<string, ProviderOrderStatus | { error: string }>>;
 requestRefill?: (id: string) => Promise<{ id: string }>;
 requestCancellation?: (id: string) => Promise<void>;
 getRefillStatus?: (id:string)=>Promise<{status:string}>;
}
export class DemoProvider implements SmmProvider {
 private assertDemo() { if (process.env.APP_MODE !== 'demo') throw new Error('El adaptador demo está deshabilitado.'); }
 async getServices() { this.assertDemo(); return []; }
 async getBalance() { this.assertDemo(); return { balance: '0.00', currency: 'ARS' }; }
 async createOrder(order: { internalId: string }) { this.assertDemo(); return { externalId: `demo-${order.internalId}` }; }
 async getOrderStatus() { this.assertDemo(); return { status: 'COMPLETED' }; }
 async getMultipleOrderStatuses(ids: string[]) { this.assertDemo(); return Object.fromEntries(ids.map(id => [id, { status: 'COMPLETED' }])); }
}
// Demo factory retained for isolated development. Configured real providers use configured.ts.
export function providerFor(kind: string): SmmProvider {
 if (kind === 'DEMO' && process.env.APP_MODE === 'demo') return new DemoProvider();
 throw new Error('Usá la fábrica de proveedores configurados para una API real.');
}
