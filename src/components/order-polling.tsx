'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
export function OrderPolling({active}:{active:boolean}){
 const router=useRouter();
 useEffect(()=>{
  if(!active)return;let busy=false;let last=0;let disposed=false;const controller=new AbortController();
  const sync=async()=>{
   if(busy||document.visibilityState!=='visible'||Date.now()-last<15000)return;
   busy=true;last=Date.now();
   try{const response=await fetch('/api/orders/sync',{method:'POST',credentials:'same-origin',signal:controller.signal});if(response.ok&&!disposed)router.refresh();}catch{/* Keep the durable order state; the next refresh can resume read-only checks. */}finally{busy=false;}
  };
  const first=setTimeout(sync,3000);const interval=setInterval(sync,60000);const focus=()=>{void sync();};window.addEventListener('focus',focus);
  return()=>{disposed=true;controller.abort();clearTimeout(first);clearInterval(interval);window.removeEventListener('focus',focus);};
 },[active,router]);
 return null;
}
