'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {refreshPayment} from '@/app/payment-actions';
export function PaymentStatusPolling({id,paymentId,active}:{id:string;paymentId?:string;active:boolean}){
 const router=useRouter();
 useEffect(()=>{if(!active)return;let busy=false;let attempts=0;let disposed=false;const sync=async()=>{if(busy||disposed||document.visibilityState!=='visible'||attempts>=5)return;busy=true;attempts++;try{const form=new FormData();form.set('topUpId',id);if(paymentId)form.set('paymentId',paymentId);await refreshPayment({},form);if(!disposed)router.refresh();}catch{}finally{busy=false;}};const first=setTimeout(sync,1500);const interval=setInterval(sync,15000);return()=>{disposed=true;clearTimeout(first);clearInterval(interval);};},[id,paymentId,active,router]);return null;
}
