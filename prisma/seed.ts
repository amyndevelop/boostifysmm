import { db } from '../src/lib/db';
async function main() {
 if (process.env.APP_MODE !== 'demo') throw new Error('El seed demo solo está permitido en APP_MODE=demo.');
 const provider = await db.provider.upsert({ where: { id: 'demo-provider' }, create: { id: 'demo-provider', name: 'Proveedor DEMO · sin entrega externa', kind: 'DEMO', active: true }, update: {} });
 const networks = [{ name: 'Instagram', hosts: ['instagram.com'] },{ name: 'TikTok', hosts: ['tiktok.com'] },{ name: 'YouTube', hosts: ['youtube.com','youtu.be'] },{ name: 'Facebook', hosts: ['facebook.com','fb.watch'] },{ name: 'WhatsApp', hosts: ['whatsapp.com','wa.me'] }];
 for (const network of networks) {
   const id = `demo-${network.name.toLowerCase()}`;
   await db.service.upsert({ where: { id }, create: { id, name: `${network.name} · Servicio demo`, originalName: 'Demonstration only', description: 'Simulación para conocer el panel. No genera seguidores, interacciones ni entregas reales.', network: network.name, category: 'Demostración', externalId: id, providerId: provider.id, rate: '5000', cost: '2500', manualProviderRate: '2500', min: 50, max: 100000, allowedHosts: network.hosts, active: true }, update: {} });
 }
 console.log('Catálogo demo preparado. No se crearon cuentas ni contraseñas predeterminadas.');
}
main().finally(() => db.$disconnect());
