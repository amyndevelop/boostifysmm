import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {money} from '@/lib/domain';
import {ActionForm} from '@/components/action-form';
import {PaymentStatusPolling} from '@/components/payment-status';
import {refreshPayment} from '@/app/payment-actions';
import {topUpLabels} from '@/lib/payments/labels';
export const maxDuration=60;
export default async function TopUp({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const user=await requireUser();const {id}=await params;const query=await searchParams;const paymentId=typeof query.payment_id==='string'&&/^\d{1,30}$/.test(query.payment_id)?query.payment_id:undefined;const row=await db.topUp.findFirst({where:{id,userId:user.id}});if(!row)notFound();const pending=['CREATING','PENDING','CHECKOUT_UNCERTAIN'].includes(row.status);
 return <main className="admin-shell"><PaymentStatusPolling id={id} paymentId={paymentId} active={pending}/><Link href="/">← Volver al panel</Link><section className="card padded"><span className="eyebrow">MERCADO PAGO</span><h1>Tu recarga de {money(row.amount.toString())}</h1><p role="status">{topUpLabels[row.status]??row.status}</p><p>Volver del checkout no acredita saldo: verificamos el pago con Mercado Pago. Si está pendiente, podés consultar nuevamente.</p>{row.status==='TEST_APPROVED'&&<p className="error">Pago de prueba. No se acreditó saldo utilizable.</p>}{row.status==='REVIEW_REQUIRED'&&<p className="error">Contactá a soporte con el identificador de esta recarga.</p>}<p className="small wrap">Recarga {row.id}</p><ActionForm action={refreshPayment} label="Actualizar estado"><input name="topUpId" type="hidden" value={id}/><input name="paymentId" type="hidden" value={paymentId??''}/></ActionForm>{pending&&row.checkoutUrl&&<a className="button outline" href={row.checkoutUrl}>Continuar el pago en Mercado Pago ↗</a>}<Link className="button outline" href="/recargas">Ver mis recargas</Link></section></main>;
}
