import { db } from '../src/lib/db';
const email = process.argv[2]?.toLowerCase();
if (!email) throw new Error('Uso: npx tsx --env-file=.env scripts/admin.ts email');
async function main() {
 const user = await db.user.update({ where: { email }, data: { role: 'SUPER_ADMIN' } });
 await db.auditLog.create({ data: { actorId: user.id, action: 'BOOTSTRAP_SUPER_ADMIN_CLI', reference: user.id } });
 console.log('Rol administrativo asignado a la cuenta existente.');
}
main().finally(() => db.$disconnect());
