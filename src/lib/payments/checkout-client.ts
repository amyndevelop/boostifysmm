export type CheckoutResponse={error?:string;url?:string;topUpId?:string};
/** Stable HTTP transport: independent of generated Next Server Action IDs. */
export async function requestCheckout(input:{amount:string;idempotencyKey:string},transport:typeof fetch=fetch):Promise<CheckoutResponse>{
 try{
  const response=await transport('/api/payments/checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(55000)});
  const value:unknown=await response.json();if(!value||typeof value!=='object')throw new Error();
  const result=value as Record<string,unknown>;
  if(typeof result.error==='string')return {error:result.error};
  if(!response.ok||typeof result.url!=='string'||typeof result.topUpId!=='string')throw new Error();
  const url=new URL(result.url);if(url.protocol!=='https:'||url.username||url.password||url.port||!['www.mercadopago.com.ar','mercadopago.com.ar','sandbox.mercadopago.com.ar'].includes(url.hostname))throw new Error();
  return {url:url.href,topUpId:result.topUpId};
 }catch{return {error:'No pudimos confirmar el enlace. Revisá tus recargas antes de volver a intentar. Si acabás de actualizar el sitio, recargá la página.'};}
}
