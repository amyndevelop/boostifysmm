import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { visibleCatalogWhere } from '@/lib/catalog';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Home() {
 const user = await requireUser();
 const [wallet, services, orders, deposits, tickets, notifications, bank] = await Promise.all([
 db.wallet.findUniqueOrThrow({ where: { userId: user.id }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 100 } } }),
 db.service.findMany({ where: visibleCatalogWhere(), include: { source:true,categoryRef:true }, orderBy: [{ categoryRef:{sortOrder:'asc'} },{sortOrder:'asc'},{name:'asc'}] }),
 db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { events: { orderBy: { createdAt: 'asc' } } } }),
 db.depositRequest.findMany({ where: { userId: user.id }, select: { id: true, amount: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
 db.supportTicket.findMany({ where: { userId: user.id }, include: { messages: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
 db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 15 }),
 db.appSetting.findUnique({ where: { key: 'bankDetails' } })]);
 return <Dashboard user={{ name: user.name, email: user.email, role: user.role, theme: user.theme }} demo={process.env.APP_MODE === 'demo'} balance={wallet.available.toString()} reserved={wallet.reserved.toString()} services={services.map(s => ({ id: s.id, name: s.name, network: s.network, category: s.category, linkType: s.linkType, description: s.description, rate: s.rate.toString(), min: Math.max(s.min,s.source?.min ?? s.min), max: Math.min(s.max,s.source?.max ?? s.max), allowedHosts: s.allowedHosts }))} orders={orders.map(o => ({ id: o.id, serviceId: o.serviceId, serviceName: o.serviceName, network: o.network, quantity: o.quantity, price: o.price.toString(), link: o.link, status: o.status, createdAt: o.createdAt.toISOString(), events: o.events.map(e => ({ status: e.status, message: e.message, createdAt: e.createdAt.toISOString() })) }))} movements={wallet.transactions.map(t => ({ id: t.id, type: t.type, amount: t.amount.toString(), reference: t.reference, createdAt: t.createdAt.toISOString() }))} deposits={deposits.map(d => ({ ...d, amount: d.amount.toString(), createdAt: d.createdAt.toISOString() }))} tickets={tickets.map(t => ({ id: t.id, subject: t.subject, status: t.status, messages: t.messages.map(m => ({ id: m.id, body: m.body, own: m.authorId === user.id })) }))} notifications={notifications.map(n => ({ id: n.id, message: n.message }))} bankDetails={bank?.value ?? null}/>;
}
