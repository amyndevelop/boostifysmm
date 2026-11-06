import {currentUser,checkOrigin,rateLimit} from '@/lib/auth';
import {processOrders} from '@/lib/worker';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(){
 try{await checkOrigin();}catch{return Response.json({error:'Origen no permitido'},{status:403});}
 try{
  const user=await currentUser();if(!user)return Response.json({error:'No autorizado'},{status:401});
  await rateLimit(`order-sync:${user.id}`,60);const processed=await processOrders({userId:user.id});
  return Response.json({processed},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'No pudimos actualizar los pedidos. Reintentaremos más tarde.'},{status:503});}
}
