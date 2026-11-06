import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {money} from '@/lib/domain';
import {topUpLabels} from '@/lib/payments/labels';
export default async function TopUps(){const user=await requireUser();const rows=await db.topUp.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:50});return <main className="admin-shell"><Link href="/">← Volver al panel</Link><h1>Mis recargas con Mercado Pago</h1><p>Últimas 50 recargas. El saldo se acredita solo al verificar un pago aprobado.</p>{rows.map(t=><article className="card padded" key={t.id}><h2>{money(t.amount.toString())}</h2><p>{topUpLabels[t.status]??t.status}</p><Link href={`/recargas/${t.id}`}>Ver recarga →</Link></article>)}{!rows.length&&<p>Todavía no iniciaste recargas con Mercado Pago.</p>}</main>;}
