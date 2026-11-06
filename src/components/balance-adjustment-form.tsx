'use client';
import { useState,useTransition } from 'react';
import { Prisma } from '@prisma/client';
import { ArrowDownLeft,ArrowUpRight } from 'lucide-react';
import { adjustBalanceAction } from '@/app/admin/user-actions';
import { Button } from './ui/button';
import { Modal } from './modal';
import { money } from '@/lib/domain';
export function BalanceAdjustmentForm({userId,name,email,balance,reserved,initialKey}:{userId:string;name:string;email:string;balance:string;reserved:string;initialKey:string}){
 const [direction,setDirection]=useState<'CREDIT'|'DEBIT'>('CREDIT');const [amount,setAmount]=useState('');const [reason,setReason]=useState('');const [idempotencyKey,setKey]=useState(initialKey);const [confirm,setConfirm]=useState(false);const [pending,start]=useTransition();const [message,setMessage]=useState<{error?:string;success?:string}>({});
 let after:Prisma.Decimal|null=null;try{if(/^\d{1,8}(\.\d{1,2})?$/.test(amount)){const value=new Prisma.Decimal(amount);if(value.gt(0)&&value.lte(10000000))after=new Prisma.Decimal(balance).add(direction==='CREDIT'?value:value.neg());}}catch{/* Editable inputs are revalidated on submit. */}
 return <><form className="form-stack" onSubmit={e=>{e.preventDefault();setMessage({});if(!after||after.lt(0)||reason.trim().length<5){setMessage({error:'Revisá el importe, el motivo y el saldo disponible.'});return;}setConfirm(true);}}>
 <label>Tipo de ajuste<select value={direction} onChange={e=>setDirection(e.target.value as 'CREDIT'|'DEBIT')} disabled={pending}><option value="CREDIT">Cargar saldo · acreditar</option><option value="DEBIT">Restar saldo · descontar</option></select></label>
 <label>Importe en ARS<input type="number" step="0.01" min="0.01" max="10000000" value={amount} onChange={e=>setAmount(e.target.value)} required disabled={pending} placeholder="0,00"/></label>
 <label>Motivo del ajuste<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={500} required disabled={pending} rows={3} placeholder="Por ejemplo: acreditación por transferencia verificada"/></label><p className="small muted">El motivo queda en el historial y será visible para el usuario. Cada ajuste requiere confirmación.</p>
 <div className="adjustment-preview"><span>Saldo disponible actual <b>{money(balance)}</b></span><span>Saldo reservado <b>{money(reserved)}</b></span><span>Disponible estimado después del ajuste <strong>{after?money(after.toString()):'—'}</strong></span></div>
 {after?.lt(0)&&<p className="error" role="alert">No podés descontar más que el saldo disponible. Los fondos reservados no se modifican.</p>}
 <Button disabled={pending||!after||after.lt(0)}>{direction==='CREDIT'?<ArrowDownLeft size={18}/>:<ArrowUpRight size={18}/>} Revisar {direction==='CREDIT'?'acreditación':'descuento'}</Button>
 {message.error&&<p className="error" role="alert">{message.error}</p>}{message.success&&<p className="success" role="status">{message.success}</p>}
 </form>{confirm&&<Modal titleId="adjustment-title" onClose={()=>{if(!pending)setConfirm(false);}}><h2 id="adjustment-title">Confirmar {direction==='CREDIT'?'acreditación':'descuento'}</h2><p><b>{name}</b><br/>{email}</p><strong className={`dialog-price ${direction==='DEBIT'?'negative':''}`}>{direction==='CREDIT'?'+':'−'} {money(amount)}</strong><p className="preserve wrap">Motivo: {reason}</p><p>Se {direction==='CREDIT'?'sumará al':'descontará del'} saldo disponible de esta cuenta. El saldo reservado no cambia.</p><div className="flex"><Button variant="outline" disabled={pending} onClick={()=>setConfirm(false)}>Volver</Button><Button disabled={pending} onClick={()=>start(async()=>{
 try{const result=await adjustBalanceAction({userId,direction,amount,reason,idempotencyKey});setMessage(result);if(result.success){setConfirm(false);setAmount('');setReason('');setKey(crypto.randomUUID());}}
 catch{setMessage({error:'No pudimos confirmar la respuesta. Reintentá con los mismos datos; la confirmación se conserva para evitar duplicados.'});}
 })}>{pending?'Registrando…':`Confirmar ${direction==='CREDIT'?'acreditación':'descuento'}`}</Button></div>{message.error&&<p className="error" role="alert">{message.error}</p>}</Modal>}</>;
}
