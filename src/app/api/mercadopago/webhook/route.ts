import {paymentConfig,webhookSecret} from '@/lib/payments/settings';
import {verifyWebhook} from '@/lib/payments/mercadopago';
import {synchronizePayment} from '@/lib/payments/topups';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 try{
  const config=await paymentConfig();if(!config)return Response.json({error:'No configurado'},{status:503});
  const url=new URL(request.url);const ids=url.searchParams.getAll('data.id');const id=ids.length===1?ids[0]:'';
  if(!verifyWebhook(webhookSecret(config),id,request.headers.get('x-request-id'),request.headers.get('x-signature')))return Response.json({error:'Firma inválida'},{status:401});
  // Never use body amounts/statuses or resource URLs. Only the signed numeric ID
  // selects a read from the fixed Mercado Pago API host.
  await synchronizePayment(id);return Response.json({received:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'No se pudo verificar el pago. Reintentar notificación.'},{status:503});}
}
