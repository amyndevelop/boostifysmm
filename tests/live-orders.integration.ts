import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {db} from '../src/lib/db';
import {saveProviderConfig} from '../src/lib/providers/manage';
import {placeOrder} from '../src/lib/orders';
import {dispatchOrder,synchronizeOrder,recoverStaleSubmissions} from '../src/lib/worker';
import {reconcileOrder,refundOrder,reconcileOperation} from '../src/lib/order-admin';
import {requestOrderOperation,processOrderOperations} from '../src/lib/order-operations';
import {adjustUserBalance} from '../src/lib/user-management';
test('flujo real con API simulada: envío, seguimiento, cancelación, reposición y reintegros',async t=>{
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'));
 process.env.APP_MODE='test';process.env.PROVIDER_ENCRYPTION_KEY=randomBytes(32).toString('hex');
 const owner=await db.user.create({data:{name:'Live test admin',email:`${randomUUID()}@test.invalid`,passwordHash:'test',role:'SUPER_ADMIN'}});
 const user=await db.user.create({data:{name:'Live test user',email:`${randomUUID()}@test.invalid`,passwordHash:'test',wallet:{create:{}}}});
 await adjustUserBalance(owner.id,{userId:user.id,direction:'CREDIT',amount:'100000',reason:'Saldo para tests simulados',idempotencyKey:randomUUID()});
 const provider=await saveProviderConfig(owner.id,{name:'Simulated SMMTAKE',endpoint:'https://simulated-provider.com/api/v2',kind:'SMMTAKE',apiKey:'test-key-never-real',active:true});
 const source=await db.providerService.create({data:{providerId:provider.id,externalId:'1',name:'Test',category:'Test',type:'Default',rate:'0.90',currency:'USD',min:50,max:10000,refill:true,cancel:true}});
 const service=await db.service.create({data:{providerId:provider.id,sourceId:source.id,name:'Servicio de prueba',description:'Prueba sin tráfico real',network:'Instagram',category:'Test',externalId:'1',originalName:'Test',rate:'5000',cost:'900',costCurrency:'USD',exchangeRate:'1000',active:true,min:50,max:10000,allowedHosts:['instagram.com']}});
 let sequence=1000;let addCalls=0;let cancelCalls=0;let refillCalls=0;
 const status=new Map<string,{status:string;charge:string;remains:string}>();
 const transport:typeof fetch=async(url,init)=>{
  assert.equal(String(url),'https://simulated-provider.com/api/v2');const params=init!.body as URLSearchParams;assert.equal(params.get('key'),'test-key-never-real');
  switch(params.get('action')){
   case 'add':{addCalls++;assert.equal(params.get('quantity'),'350');const id=String(++sequence);status.set(id,{status:'In progress',charge:'0.315',remains:'350'});return Response.json({order:Number(id)});}
   case 'status':return Response.json({...status.get(params.get('order')!)!,currency:'USD',start_count:'10'});
   case 'cancel':cancelCalls++;return Response.json([{order:Number(params.get('orders')),cancel:1}]);
   case 'refill':refillCalls++;return Response.json({refill:String(++sequence)});
   case 'refill_status':return Response.json({status:'Completed'});
   default:throw new Error('Unexpected action');
  }
 };
 const create=()=>placeOrder(user.id,{serviceId:service.id,quantity:350,link:'https://instagram.com/test',quotedPrice:'1750.00',idempotencyKey:randomUUID()});
 const available=async()=> (await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).available;
 await t.test('envía una sola vez aunque dos workers reclamen el mismo pedido',async()=>{
  const order=await create();const calls=addCalls;await Promise.all([dispatchOrder(order.id,transport),dispatchOrder(order.id,transport)]);
  const saved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.status,'PROCESSING');assert.equal(saved.financialState,'CAPTURED');assert.ok(saved.externalId);assert.equal(addCalls,calls+1);
  assert.equal(await db.walletTransaction.count({where:{key:`capture:${order.id}`}}),1);assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).reserved.toString(),'0');
  status.set(saved.externalId!,{status:'Completed',charge:'0.315',remains:'0'});await synchronizeOrder(order.id,{transport,force:true});await synchronizeOrder(order.id,{transport,force:true});
  const completed=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(completed.status,'COMPLETED');assert.equal(completed.realCost!.toString(),'315');assert.equal(completed.providerCharge!.toString(),'0.315');assert.equal(await db.walletTransaction.count({where:{key:`capture:${order.id}`}}),1);
 });
 await t.test('rechazo explícito libera la reserva una sola vez',async()=>{
  const before=await available();const order=await create();let calls=0;const reject:typeof fetch=async()=>{calls++;return Response.json({error:'Rejected private text'});};
  await dispatchOrder(order.id,reject);await dispatchOrder(order.id,reject);assert.equal(calls,1);assert.ok((await available()).eq(before));
  const saved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.status,'FAILED');assert.equal(saved.financialState,'RELEASED');assert.equal(await db.walletTransaction.count({where:{key:`release:${order.id}`}}),1);
 });
 await t.test('timeout incierto no reenvía ni reintegra; conciliación puede vincular el ID existente',async()=>{
  const order=await create();let calls=0;const timeout:typeof fetch=async()=>{calls++;throw new DOMException('test timeout','TimeoutError');};await dispatchOrder(order.id,timeout);await dispatchOrder(order.id,timeout);
  assert.equal(calls,1);let saved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.status,'REVIEW_REQUIRED');assert.equal(saved.financialState,'RESERVED');
  const externalId=String(++sequence);status.set(externalId,{status:'In progress',charge:'0.315',remains:'350'});
  await reconcileOrder(owner.id,{orderId:order.id,resolution:'LINK',externalId,reason:'Verificado en panel de prueba del proveedor',verified:true},transport);
  saved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.externalId,externalId);assert.equal(saved.financialState,'CAPTURED');assert.equal(await dispatchOrder(order.id,transport),false);
 });
 await t.test('conciliación de no creado libera fondos sin generar otra compra',async()=>{
  const before=await available();const order=await create();await dispatchOrder(order.id,async()=>{throw new Error('lost response');});await db.providerRequest.update({where:{orderId:order.id},data:{createdAt:new Date(0)}});
  const calls=addCalls;await reconcileOrder(owner.id,{orderId:order.id,resolution:'NOT_CREATED',reason:'El proveedor confirmó que no recibió el pedido',verified:true});assert.equal(addCalls,calls);assert.ok((await available()).eq(before));
  await assert.rejects(reconcileOrder(owner.id,{orderId:order.id,resolution:'NOT_CREATED',reason:'Intento repetido de liberar reserva',verified:true}));
 });
 await t.test('worker interrumpido pasa a revisión y nunca vuelve a enviar',async()=>{
  const order=await create();await db.job.update({where:{orderId:order.id},data:{state:'CLAIMED',claimedAt:new Date(0),leaseToken:randomUUID()}});await db.providerRequest.create({data:{orderId:order.id,createdAt:new Date(0)}});await db.order.update({where:{id:order.id},data:{status:'SUBMITTING'}});
  await recoverStaleSubmissions(user.id);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).status,'REVIEW_REQUIRED');assert.equal(await dispatchOrder(order.id,transport),false);
  await reconcileOrder(owner.id,{orderId:order.id,resolution:'NOT_CREATED',reason:'Proveedor revisado sin pedido creado',verified:true});
 });
 await t.test('cancelación solicitada no reintegra hasta confirmación y aprobación administrativa',async()=>{
  const order=await create();await dispatchOrder(order.id,transport);const sent=await db.order.findUniqueOrThrow({where:{id:order.id}});const before=await available();const key=randomUUID();const count=cancelCalls;
  await requestOrderOperation(user.id,{orderId:order.id,kind:'CANCEL',idempotencyKey:key},transport);await requestOrderOperation(user.id,{orderId:order.id,kind:'CANCEL',idempotencyKey:randomUUID()},transport);assert.equal(cancelCalls,count+1);assert.ok((await available()).eq(before));
  status.set(sent.externalId!,{status:'Canceled',charge:'0',remains:'350'});await synchronizeOrder(order.id,{transport,force:true});assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).status,'CANCELLED');assert.ok((await available()).eq(before));
  const refund={orderId:order.id,amount:'1750.00',idempotencyKey:randomUUID(),reason:'Devolución confirmada en el proveedor de prueba',verified:true};await Promise.all([refundOrder(owner.id,refund),refundOrder(owner.id,refund)]);assert.ok((await available()).eq(before.add('1750')));assert.equal(await db.orderRefund.count({where:{orderId:order.id}}),1);
  await assert.rejects(refundOrder(owner.id,{...refund,idempotencyKey:randomUUID(),amount:'0.01'}),/supera/);
 });
 await t.test('entrega parcial conserva costo real y admite solo devolución reconocida dentro del precio',async()=>{
  const order=await create();await dispatchOrder(order.id,transport);const sent=await db.order.findUniqueOrThrow({where:{id:order.id}});status.set(sent.externalId!,{status:'Partial',charge:'0.225',remains:'100'});await synchronizeOrder(order.id,{transport,force:true});
  const partial=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(partial.realCost!.toString(),'225');assert.equal(partial.status,'PARTIAL');assert.equal(partial.refunded.toString(),'0');
  await refundOrder(owner.id,{orderId:order.id,amount:'500',idempotencyKey:randomUUID(),reason:'Reconocimiento de devolución parcial verificado',verified:true});assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).refunded.toString(),'500');
  await assert.rejects(requestOrderOperation(user.id,{orderId:order.id,kind:'REFILL',idempotencyKey:randomUUID()},transport),/reposición/);
 });
 await t.test('reposición idempotente usa capacidades y consulta su estado sin compras nuevas',async()=>{
  const order=await create();await dispatchOrder(order.id,transport);const sent=await db.order.findUniqueOrThrow({where:{id:order.id}});status.set(sent.externalId!,{status:'Completed',charge:'0.315',remains:'0'});await synchronizeOrder(order.id,{transport,force:true});const calls=refillCalls;const before=await available();
  const op=await requestOrderOperation(user.id,{orderId:order.id,kind:'REFILL',idempotencyKey:randomUUID()},transport);await requestOrderOperation(user.id,{orderId:order.id,kind:'REFILL',idempotencyKey:randomUUID()},transport);assert.equal(refillCalls,calls+1);assert.ok((await available()).eq(before));
  await db.providerOperation.update({where:{id:op.id},data:{nextSyncAt:new Date(0)}});await processOrderOperations({userId:user.id,transport});assert.equal((await db.providerOperation.findUniqueOrThrow({where:{id:op.id}})).status,'COMPLETED');
 });
 await t.test('operación incierta no se repite y puede conciliarse con un ID de reposición',async()=>{
  const order=await create();await dispatchOrder(order.id,transport);const sent=await db.order.findUniqueOrThrow({where:{id:order.id}});status.set(sent.externalId!,{status:'Completed',charge:'0.315',remains:'0'});await synchronizeOrder(order.id,{transport,force:true});let calls=0;
  const lost:typeof fetch=async()=>{calls++;throw new Error('unknown result');};const op=await requestOrderOperation(user.id,{orderId:order.id,kind:'REFILL',idempotencyKey:randomUUID()},lost);await requestOrderOperation(user.id,{orderId:order.id,kind:'REFILL',idempotencyKey:randomUUID()},lost);assert.equal(calls,1);assert.equal(op.status,'REVIEW_REQUIRED');
  await reconcileOperation(owner.id,{operationId:op.id,resolution:'LINK',externalId:String(++sequence),reason:'Reposición identificada en el panel del proveedor',verified:true},transport);assert.equal((await db.providerOperation.findUniqueOrThrow({where:{id:op.id}})).status,'REQUESTED');
 });
 await t.test('configuración inválida antes del envío no consume saldo y no usa la red',async()=>{
  const before=await available();const order=await create();await db.provider.update({where:{id:provider.id},data:{active:false}});let calls=0;await dispatchOrder(order.id,async()=>{calls++;throw new Error();});assert.equal(calls,0);assert.ok((await available()).eq(before));await db.provider.update({where:{id:provider.id},data:{active:true}});
 });
 await t.test('estados o moneda no reconocidos requieren revisión sin créditos automáticos',async()=>{
  const order=await create();await dispatchOrder(order.id,transport);const before=await available();await synchronizeOrder(order.id,{force:true,transport:async()=>Response.json({status:'Unknown future state',charge:'0.315',currency:'USD',remains:'0',start_count:'0'})});
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).status,'REVIEW_REQUIRED');assert.ok((await available()).eq(before));
 });
 await t.test('no permite operaciones sobre pedidos ajenos ni reembolsos sin autorización',async()=>{
  const other=await db.user.create({data:{name:'Other',email:`${randomUUID()}@test.invalid`,passwordHash:'test'}});const order=await create();await dispatchOrder(order.id,transport);
  await assert.rejects(requestOrderOperation(other.id,{orderId:order.id,kind:'CANCEL',idempotencyKey:randomUUID()},transport),/encontrado/);
  await assert.rejects(refundOrder(user.id,{orderId:order.id,amount:'10',idempotencyKey:randomUUID(),reason:'No tiene permiso de administración',verified:true}),/permisos/);
 });
 await t.test('el seguimiento del cliente no procesa pedidos de otro usuario',async()=>{
  const other=await db.user.create({data:{name:'Scoped user',email:`${randomUUID()}@test.invalid`,passwordHash:'test'}});
  const order=await create();const calls=addCalls;const {processOrders}=await import('../src/lib/worker');await processOrders({userId:other.id,transport});assert.equal(addCalls,calls);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).status,'PENDING');await dispatchOrder(order.id,transport);
 });
 await db.$disconnect();
});
