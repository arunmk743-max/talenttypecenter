import { isSameOriginRequest } from '../../lib/request-origin.js';
import { randomBytes } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Config, Context } from '@netlify/functions';
import { database } from '../../db/index.js';
import { adminCredentials, sessions, records, loginAttempts } from '../../db/schema.js';
import { digest, hashPassword, verifyPassword, validDob } from '../../lib/password.js';
import { getAccount, sessionToken, sessionCookie, studentFingerprint } from '../../lib/session.js';
import { isAdmin } from '../../lib/validation.js';

export default async (req: Request, context: Context) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const reply = (value: unknown, status = 200, cookie?: string) => Response.json(value, { status, headers: { ...headers, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!isSameOriginRequest(req)) return reply({ error: 'Request origin is not allowed.' }, 403);
  try {
    const text = await req.text();
    if (text.length > 4096) return reply({ error: 'Request is too large.' }, 413);
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object') return reply({ error: 'Invalid request.' }, 400);
    const db = database();
    const oldToken = sessionToken(req);
    if (body.action === 'logout') {
      if (oldToken) await db.delete(sessions).where(eq(sessions.tokenHash, digest(oldToken)));
      return reply({ saved: true }, 200, sessionCookie('', 0));
    }
    if (!['login', 'password'].includes(body.action)) return reply({ error: 'Unknown operation.' }, 400);
    // Shared, atomic limits survive function restarts and apply across devices.
    const keys = [digest(`ip:${context.ip || 'unknown'}`), digest(`account:${body.role === 'student' ? String(body.identifier || '') : 'ADMIN'}`)];
    for (const id of keys) {
      const [limit] = await db.insert(loginAttempts).values({ id, resetAt: new Date(Date.now() + 15 * 60000) }).onConflictDoUpdate({ target: loginAttempts.id, set: {
        attempts: sql`CASE WHEN ${loginAttempts.resetAt} < NOW() THEN 1 ELSE ${loginAttempts.attempts} + 1 END`,
        resetAt: sql`CASE WHEN ${loginAttempts.resetAt} < NOW() THEN NOW() + INTERVAL '15 minutes' ELSE ${loginAttempts.resetAt} END`,
      } }).returning();
      if (limit.attempts > (id === keys[0] ? 40 : 10)) return reply({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    }
    // Prune expired state as part of normal authentication traffic.
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await db.delete(loginAttempts).where(lt(loginAttempts.resetAt, new Date()));
    let role: string, phone: string | null = null, fingerprint: string | null = null;
    if (body.action === 'password') {
      const account = await getAccount(req);
      if (!isAdmin(account)) return reply({ error: 'Administrator access is required.' }, 403);
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return reply({ error: 'Use a password of 8–128 characters.' }, 400);
      const nextHash = await hashPassword(body.password);
      const changed = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(81234671)`);
        const [current] = await tx.select().from(adminCredentials).where(eq(adminCredentials.id, 'ADMIN'));
        if (current) {
          if (account?.authMethod !== 'identity' && (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128 || !await verifyPassword(body.currentPassword, current.passwordHash))) return false;
          await tx.update(adminCredentials).set({ passwordHash: nextHash }).where(eq(adminCredentials.id, 'ADMIN'));
        } else {
          if (account?.authMethod !== 'identity') return false;
          await tx.insert(adminCredentials).values({ id: 'ADMIN', passwordHash: nextHash });
        }
        await tx.delete(sessions).where(eq(sessions.role, 'admin'));
        return true;
      });
      if (!changed) return reply({ error: 'Current administrator password is incorrect.' }, 401);
      role = 'admin'; fingerprint = digest(nextHash);
    } else {
      const { identifier, password } = body;
      if (typeof identifier !== 'string' || typeof password !== 'string' || identifier.length > 100 || password.length > 128) return reply({ error: 'Invalid login details.' }, 400);
      if (body.role === 'student') {
        if (!/^\d{10}$/.test(identifier) || !validDob(password)) return reply({ error: 'Use your registered 10-digit phone number and DOB in DDMMYYYY format.' }, 400);
        const [row] = await db.select().from(records).where(and(eq(records.collection, 'ttc_students'), eq(records.id, identifier)));
        if (!row || row.payload.dob !== password) return reply({ error: 'Phone number or date of birth is incorrect.' }, 401);
        role = 'student'; phone = identifier; fingerprint = studentFingerprint(row.payload);
      } else if (body.role === 'admin' && identifier === 'ADMIN') {
        const [admin] = await db.select().from(adminCredentials).where(eq(adminCredentials.id, 'ADMIN'));
        if (!admin) return reply({ error: 'ADMIN password has not been set. Use administrator setup to sign in with your invited admin email, then set the ADMIN password in Settings.' }, 401);
        if (!await verifyPassword(password, admin.passwordHash)) return reply({ error: 'Admin ID or password is incorrect.' }, 401);
        role = 'admin'; fingerprint = digest(admin.passwordHash);
      } else return reply({ error: 'Invalid login details.' }, 401);
    }
    const token = randomBytes(32).toString('hex');
    await db.transaction(async tx => {
      if (oldToken) await tx.delete(sessions).where(eq(sessions.tokenHash, digest(oldToken)));
      await tx.insert(sessions).values({ tokenHash: digest(token), role, phone, studentFingerprint: fingerprint, expiresAt: new Date(Date.now() + 8 * 3600000) });
    });
    return reply({ saved: true }, 200, sessionCookie(token));
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: 'Invalid request.' }, 400);
    return reply({ error: 'Sign-in service is unavailable. Please try again.' }, 503);
  }
};
export const config: Config = { path: '/api/auth' };
