import {handleMercadoPagoWebhook} from '@/lib/payments/webhook';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){return handleMercadoPagoWebhook(request);}
