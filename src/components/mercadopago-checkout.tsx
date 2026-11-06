'use client';
import {useState,useTransition} from 'react';
import Link from 'next/link';
import {startCheckout} from '@/app/payment-actions';
import {money} from '@/lib/domain';
export function MercadoPagoCheckout({minimum,testMode}:{minimum:string;testMode:boolean}){
 const [amount,setAmount]=useState('');const [key,setKey]=useState<string>();const [error,setError]=useState('');const [pending,start]=useTransition();
 return <section className="mp-checkout"><h3>Mercado Pago</h3><p>Pagá en Mercado Pago. Cuando el pago esté aprobado, acreditaremos el importe en tu billetera.</p>{testMode&&<p className="error">Modo de prueba: los pagos simulados no acreditan saldo utilizable.</p>}<form className="form-stack" onSubmit={event=>{event.preventDefault();const id=key??crypto.randomUUID();setKey(id);setError('');start(async()=>{try{const result=await startCheckout({amount,idempotencyKey:id});if(result.error)setError(result.error);else if(result.url)window.location.assign(result.url);}catch{setError('No pudimos confirmar el enlace. Revisá tus recargas antes de volver a intentar.');}});}}><label>Importe a cargar en ARS<input type="number" inputMode="decimal" min={minimum} max="10000000" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setKey(undefined);}} disabled={pending} required/></label><small>Mínimo de carga: {money(minimum)}. Acreditamos el importe pagado en ARS.</small>{error&&<p className="error" role="alert">{error}</p>}<button className="button primary" disabled={pending}>{pending?'Preparando pago…':'Continuar a Mercado Pago'}</button></form><p className="small muted">Podés revisar tus recargas en el historial. Volver del checkout no confirma un pago.</p><Link href="/recargas">Ver mis recargas →</Link></section>;
}
