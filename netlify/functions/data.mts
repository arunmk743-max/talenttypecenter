import { isSameOriginRequest } from '../../lib/request-origin.js';
import { getAccount } from '../../lib/session.js';
import { and, eq, sql } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { collections, records } from '../../db/schema.js';
import { defaults } from '../../lib/defaults.js';
import { collectionNames, isAdmin, assertSafe, validateCollection, recordId, InputError, ConflictError } from '../../lib/validation.js';
import { studentForAccount, visibleSnapshot } from '../../lib/access.js';
import type { Config } from '@netlify/functions';

export default async (req: Request) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, PUT, POST' } });
  if (req.method !== 'GET' && !isSameOriginRequest(req)) return reply({ error: 'Request origin is not allowed.' }, 403);
  try {
    const user = await getAccount(req);
    const admin = isAdmin(user);
    const db = database();
    // Database revisions and rows are read together to provide a consistent snapshot.
    const snapshot = await db.transaction(async tx => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
      const versions = await tx.select().from(collections);
      const rows = await tx.select().from(records);
      return { versions, rows };
    });
    const data: Record<string, any> = {};
    const revisions: Record<string, number> = {};
    for (const key of collectionNames) {
      const values = snapshot.rows.filter(row => row.collection === key).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).map(row => row.payload);
      revisions[key] = snapshot.versions.find(row => row.name === key)?.revision || 0;
      data[key] = key === 'ttc_settings' ? (values[0] || defaults[key]) : (revisions[key] ? values : defaults[key]);
    }
    const student = studentForAccount(data, user);
    if (req.method === 'GET') return reply(visibleSnapshot(data, revisions, user));
    const text = await req.text();
    if (text.length > 2_000_000) return reply({ error: 'Request is too large.' }, 413);
    const body = JSON.parse(text);
    if (req.method === 'PUT') {
      if (!admin) return reply({ error: 'Administrator access is required.' }, user ? 403 : 401);
      const { key, value, revision } = body;
      const rows = validateCollection(key, value);
      if (!Number.isInteger(revision) || revision < 0) throw new InputError('Invalid revision.');
      const next = await db.transaction(async tx => {
        await tx.insert(collections).values({ name: key }).onConflictDoNothing();
        const updated = await tx.update(collections).set({ revision: sql`${collections.revision} + 1` }).where(and(eq(collections.name, key), eq(collections.revision, revision))).returning();
        if (!updated.length) throw new ConflictError();
        await tx.delete(records).where(eq(records.collection, key));
        if (rows.length) await tx.insert(records).values(rows.map((payload, index) => ({ collection: key, id: recordId(key, payload, index), payload })));
        return updated[0].revision;
      });
      return reply({ revision: next });
    }
    if (body.action === 'attendance') {
      if (!student) return reply({ error: 'Sign in with an enrolled student account.' }, 403);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const payload = { date, time: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }), studentName: student.name, phone: student.phone, status: 'Present', mode: 'Secure Login' };
      await db.transaction(async tx => {
        await tx.insert(collections).values({ name: 'ttc_attendance' }).onConflictDoNothing();
        const added = await tx.insert(records).values({ collection: 'ttc_attendance', id: `${student.phone}:${date}`, payload }).onConflictDoNothing().returning();
        if (added.length) await tx.update(collections).set({ revision: sql`${collections.revision} + 1` }).where(eq(collections.name, 'ttc_attendance'));
      });
      return reply({ saved: true });
    }
    if (body.action === 'report') {
      const input = body.report;
      assertSafe(input);
      if (!input || typeof input.category !== 'string' || typeof input.candidate !== 'string' || typeof input.details !== 'string' || typeof input.message !== 'string' || JSON.stringify(input).length > 30000) throw new InputError('Invalid report.');
      if (!admin && !student && input.category !== 'Admission Inquiry') return reply({ error: 'Sign in to submit practice reports.' }, 401);
      if (!admin && student && !['Speed Practice Exam', 'Admission Inquiry'].includes(input.category)) return reply({ error: 'Report type not allowed.' }, 403);
      const id = crypto.randomUUID();
      const payload = { id, timestamp: new Date().toISOString(), category: input.category, candidate: student && input.category === 'Speed Practice Exam' ? `${student.name} (${student.phone})` : input.candidate, details: input.details, message: input.message, channel: 'Admin Private Group' };
      await db.transaction(async tx => {
        await tx.insert(collections).values({ name: 'ttc_outbox_reports' }).onConflictDoNothing();
        await tx.insert(records).values({ collection: 'ttc_outbox_reports', id, payload });
        await tx.update(collections).set({ revision: sql`${collections.revision} + 1` }).where(eq(collections.name, 'ttc_outbox_reports'));
      });
      return reply({ saved: true });
    }
    throw new InputError('Unknown operation.');
  } catch (error) {
    if (error instanceof ConflictError) return reply({ error: 'Another device updated these records. Reload the latest data and try again.' }, 409);
    if (error instanceof InputError || error instanceof SyntaxError) return reply({ error: error.message }, 400);
    return reply({ error: 'Central database is unavailable. No changes were saved. Please try again.' }, 503);
  }
};
export const config: Config = { path: '/api/data' };
