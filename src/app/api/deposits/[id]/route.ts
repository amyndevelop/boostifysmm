import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
 const user = await currentUser();
 if (!user) return new Response('No autorizado', { status: 401 });
 const { id } = await params;
 const deposit = await db.depositRequest.findFirst({ where: { id, ...(['ADMIN','SUPER_ADMIN'].includes(user.role) ? {} : { userId: user.id }) } });
 if (!deposit) return new Response('No encontrado', { status: 404 });
 return new Response(new Uint8Array(deposit.receipt), { headers: { 'Content-Type': deposit.mimeType, 'Content-Disposition': `attachment; filename="comprobante.${deposit.mimeType === 'image/png' ? 'png' : 'jpg'}"`, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
}
