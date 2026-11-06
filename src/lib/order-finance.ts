import { Prisma,type Order } from '@prisma/client';
import { db } from './db';
export async function withOrderWallet<T>(id:string,fn:(tx:Prisma.TransactionClient,order:Order,wallet:{id:string;available:Prisma.Decimal;reserved:Prisma.Decimal})=>Promise<T>){
 const route=await db.order.findUniqueOrThrow({where:{id},select:{userId:true}});
 return db.$transaction(async tx=>{
  const wallets=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Wallet" WHERE "userId"=${route.userId} FOR UPDATE`;
  if(!wallets.length)throw new Error('Billetera no disponible.');
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
  const order=await tx.order.findUniqueOrThrow({where:{id}});const wallet=await tx.wallet.findUniqueOrThrow({where:{id:wallets[0].id}});
  return fn(tx,order,wallet);
 });
}
export async function captureOrder(tx:Prisma.TransactionClient,order:Order,wallet:{id:string;reserved:Prisma.Decimal}){
 if(order.financialState==='CAPTURED')return;
 if(order.financialState!=='RESERVED'||wallet.reserved.lt(order.price))throw new Error('El pedido requiere conciliación financiera.');
 await tx.wallet.update({where:{id:wallet.id},data:{reserved:{decrement:order.price}}});
 await tx.walletTransaction.create({data:{walletId:wallet.id,key:`capture:${order.id}`,type:'CAPTURE',amount:'0',reservedDelta:order.price.neg(),reference:order.id}});
 await tx.order.update({where:{id:order.id},data:{financialState:'CAPTURED'}});
}
export async function releaseOrder(tx:Prisma.TransactionClient,order:Order,wallet:{id:string;reserved:Prisma.Decimal},message:string){
 if(order.financialState==='RELEASED')return;
 if(order.financialState!=='RESERVED'||wallet.reserved.lt(order.price))throw new Error('La reserva requiere conciliación.');
 await tx.wallet.update({where:{id:wallet.id},data:{available:{increment:order.price},reserved:{decrement:order.price}}});
 await tx.walletTransaction.create({data:{walletId:wallet.id,key:`release:${order.id}`,type:'RELEASE',amount:order.price,reservedDelta:order.price.neg(),reference:order.id}});
 await tx.order.update({where:{id:order.id},data:{financialState:'RELEASED'}});
 await tx.notification.create({data:{userId:order.userId,message}});
}
export async function completedFinancials(){
 const [totals]=await db.$queryRaw<{price:Prisma.Decimal|null;cost:Prisma.Decimal|null}[]>`SELECT SUM(price-refunded) AS price,SUM(COALESCE("realCost","costSnapshot")) AS cost FROM "Order" WHERE status='COMPLETED'`;
 return {_sum:{price:totals?.price??null,costSnapshot:totals?.cost??null}};
}
