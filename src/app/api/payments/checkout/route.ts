import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {currentUser,rateLimit} from '@/lib/auth';
import {createTopUp} from '@/lib/payments/topups';
import {PaymentProcessingError} from '@/lib/payments/errors';
export const runtime='nodejs';
export const maxDuration=60;
function response(body:Record<string,unknown>,status:number){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 if(!process.env.APP_URL||request.headers.get('origin')!==new URL(process.env.APP_URL).origin)return response({error:'Origen no permitido.'},403);
 try{
  const user=await currentUser();if(!user)return response({error:'Tu sesión venció. Iniciá sesión nuevamente.'},401);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response({error:'Formato de solicitud inválido.'},415);
  const text=await request.text();if(text.length>2048)return response({error:'Solicitud demasiado grande.'},413);
  let input:unknown;try{input=JSON.parse(text);}catch{return response({error:'Solicitud inválida.'},400);}
  try{await rateLimit(`mp-checkout:${user.id}`,15);}catch(error){if(error instanceof Error&&error.message==='Demasiados intentos. Probá en 15 minutos.')return response({error:error.message},429);throw error;}
  const topUp=await createTopUp(user.id,input);
  if(!topUp.checkoutUrl)throw new Error('Missing checkout URL');
  return response({url:topUp.checkoutUrl,topUpId:topUp.id},200);
 }catch(error){
  if(error instanceof z.ZodError)return response({error:error.issues[0].message},400);
  if(error instanceof PaymentProcessingError)return response({error:error.message},error.retryable?503:400);
  const reference=randomUUID();console.error('BOOSTIFY_CHECKOUT_REQUEST_ERROR',{reference,code:'REQUEST_FAILED'});
  return response({error:`No pudimos iniciar el pago. Revisá tus recargas antes de reintentar. Referencia: ${reference}.`},503);
 }
}
