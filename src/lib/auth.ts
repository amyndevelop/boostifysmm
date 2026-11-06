import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function currentUser() {
  const token = (await cookies()).get('boostify_session')?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: digest(token) }, include: { user: true } });
  return session && session.expiresAt > new Date() && !session.user.blocked ? session.user : null;
}
export async function requireUser(admin = false) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (admin && !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) throw new Error('No tenés permisos para esta acción.');
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({ data: { id: digest(token), userId, expiresAt } });
  (await cookies()).set('boostify_session', token, { httpOnly: true, secure: process.env.APP_URL?.startsWith('https://'), sameSite: 'lax', path: '/', expires: expiresAt });
}
export async function checkOrigin() {
  const origin = (await headers()).get('origin');
  if (!process.env.APP_URL || origin !== new URL(process.env.APP_URL).origin) throw new Error('Origen no permitido.');
}
export async function rateLimit(key: string, limit = 10) {
  const bucket = Math.floor(Date.now() / 900000);
  const row = await db.rateLimit.upsert({ where: { key: `${key}:${bucket}` }, create: { key: `${key}:${bucket}`, expiresAt: new Date(Date.now() + 900000) }, update: { count: { increment: 1 } } });
  if (row.count > limit) throw new Error('Demasiados intentos. Probá en 15 minutos.');
}
