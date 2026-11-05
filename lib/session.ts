import { getUser } from '@netlify/identity';
import { and, eq, gt } from 'drizzle-orm';
import { database } from '../db/index.js';
import { records, sessions, adminCredentials } from '../db/schema.js';
import { digest } from './password.js';
import type { Account } from './access.js';
export const cookieName = '__Host-ttc_session';
export function sessionToken(req: Request) {
  const value = req.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function studentFingerprint(student: Record<string, unknown>) {
  return digest(JSON.stringify([student.phone, student.dob, student.regId]));
}
export async function getAccount(req: Request): Promise<Account | null> {
  const token = sessionToken(req);
  if (token) {
    const db = database();
    const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date())));
    if (session?.role === 'admin') {
      const [admin] = await db.select().from(adminCredentials).where(eq(adminCredentials.id, 'ADMIN'));
      if (admin && session.studentFingerprint === digest(admin.passwordHash)) return { roles: ['admin'], loginId: 'ADMIN', authMethod: 'password' };
      return null;
    }
    if (session?.role === 'student' && session.phone) {
      const [row] = await db.select().from(records).where(and(eq(records.collection, 'ttc_students'), eq(records.id, session.phone)));
      if (row && session.studentFingerprint === studentFingerprint(row.payload)) return { phone: session.phone, authMethod: 'phone', confirmedAt: 'verified' };
    }
    return null;
  }
  const user = await getUser();
  // Identity remains the private bootstrap and recovery route for institute administrators.
  return user?.roles?.includes('admin') ? { email: user.email, roles: user.roles, authMethod: 'identity', loginId: 'ADMIN' } : null;
}
export function sessionCookie(token: string, maxAge = 28800) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
