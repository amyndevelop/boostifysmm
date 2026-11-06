export type ProviderService = { id: string; name: string; rate: string; currency?: string; min: number; max: number };
export interface SmmProvider {
 getServices(): Promise<ProviderService[]>;
 getBalance(): Promise<{ balance: string; currency: string }>;
 createOrder(order: { internalId: string; service: string; quantity: number; link: string }): Promise<{ externalId: string }>;
 getOrderStatus(id: string): Promise<{ status: string }>;
 getMultipleOrderStatuses(ids: string[]): Promise<Record<string, { status: string } | { error: string }>>;
 requestRefill?: (id: string) => Promise<{ id: string }>;
 requestCancellation?: (id: string) => Promise<void>;
}
export class DemoProvider implements SmmProvider {
 private assertDemo() { if (process.env.APP_MODE !== 'demo') throw new Error('El adaptador demo está deshabilitado.'); }
 async getServices() { this.assertDemo(); return []; }
 async getBalance() { this.assertDemo(); return { balance: '0.00', currency: 'ARS' }; }
 async createOrder(order: { internalId: string }) { this.assertDemo(); return { externalId: `demo-${order.internalId}` }; }
 async getOrderStatus() { this.assertDemo(); return { status: 'COMPLETED' }; }
 async getMultipleOrderStatuses(ids: string[]) { this.assertDemo(); return Object.fromEntries(ids.map(id => [id, { status: 'COMPLETED' }])); }
}
// No endpoint, payload or status mappings are assumed for SMMTAKE.
// A production adapter must be added only after official documentation is verified.
export function providerFor(kind: string): SmmProvider {
 if (kind === 'DEMO' && process.env.APP_MODE === 'demo') return new DemoProvider();
 throw new Error('Proveedor real pendiente de documentación y configuración.');
}
