import { db } from '../src/lib/db';
async function main() {
 if (process.env.APP_MODE !== 'demo') throw new Error('Solo disponible en demo.');
 const email = process.argv[2]?.toLowerCase();
 if (!email) throw new Error('Indicá el email de una cuenta existente.');
 await db.$transaction(async tx => {
  const user = await tx.user.findUniqueOrThrow({ where: { email } });
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${user.id} FOR UPDATE`;
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  const key = `demo-credit:${user.id}`;
  if (await tx.walletTransaction.findUnique({ where: { key } })) return;
  await tx.walletTransaction.create({ data: { walletId: wallet.id, key, type: 'DEMO_CREDIT', amount: '25000', reference: 'Saldo de prueba sin valor real' } });
  await tx.wallet.update({ where: { id: wallet.id }, data: { available: { increment: '25000' } } });
 });
 console.log('Crédito demo único verificado.');
}
main().finally(() => db.$disconnect());
