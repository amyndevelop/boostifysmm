import {timingSafeEqual} from 'node:crypto';
import {processOrders} from '@/lib/worker';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret)return Response.json({error:'Planificador no configurado.'},{status:503});
 const expected=Buffer.from(`Bearer ${secret}`);const received=Buffer.from(request.headers.get('authorization')??'');
 if(expected.length!==received.length||!timingSafeEqual(expected,received))return Response.json({error:'No autorizado'},{status:401});
 try{return Response.json({processed:await processOrders()},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'No se pudo completar el procesamiento.'},{status:503});}
}
