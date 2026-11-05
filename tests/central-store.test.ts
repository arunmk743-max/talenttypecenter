import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomBytes } from 'node:crypto';
async function browser() {
  const calls: any[] = [];
  const responses: any[] = [{ data: { ttc_students: [] }, revisions: { ttc_students: 7 }, account: { admin: true, email: 'admin@example.com' } }];
  const elements = new Map();
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { getElementById(id: string) { if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} } }); return elements.get(id); } },
    getUser: async () => null, onAuthChange() {}, handleAuthCallback: async () => null,
    login: async () => {}, logout: async () => {}, acceptInvite: async () => {}, updateUser: async () => {}, requestPasswordRecovery: async () => {},
    fetch: async (path: string, options: any) => { calls.push({ path, options }); const next = responses.shift(); return { ok: !next?.error, json: async () => next }; },
    alert() {}, confirm: () => true, structuredClone, JSON, Object, Error,
  });
  const source = fs.readFileSync('web/central-store.js', 'utf8').replace(/^import .*\n/, '');
  vm.runInContext(source, context);
  await context.window.centralReady;
  return { store: context.window.centralStore, auth: context.window.instituteAuth, calls, responses };
}
test('failed database saves do not update the cache or report success', async () => {
  const { store, calls, responses } = await browser();
  responses.push({ error: 'Another device updated these records.' });
  await assert.rejects(store.setItem('ttc_students', JSON.stringify([{ name: 'New student' }])), /Another device/);
  assert.equal(store.getItem('ttc_students'), '[]');
  assert.equal(JSON.parse(calls[1].options.body).revision, 7);
});
test('successful saves use the server revision for the next edit', async () => {
  const { store, calls, responses } = await browser();
  responses.push({ revision: 8 }, { revision: 9 });
  await store.setItem('ttc_students', JSON.stringify([{ name: 'Saved' }]));
  await store.setItem('ttc_students', JSON.stringify([{ name: 'Updated' }]));
  assert.equal(JSON.parse(calls[2].options.body).revision, 8);
  assert.equal(JSON.parse(store.getItem('ttc_students'))[0].name, 'Updated');
});
test('attendance is submitted to the server and then reloaded', async () => {
  const { store, calls, responses } = await browser();
  responses.push({ saved: true }, { data: { ttc_attendance: [{ date: '2026-11-04' }] }, revisions: {}, account: { student: {} } });
  await store.attendance();
  assert.equal(JSON.parse(calls[1].options.body).action, 'attendance');
  assert.equal(calls[2].options.cache, 'no-store');
  assert.equal(JSON.parse(store.getItem('ttc_attendance'))[0].date, '2026-11-04');
});

test('student login goes through the server before private records are refreshed', async () => {
  const { auth, calls, responses } = await browser();
  responses.push({ saved: true }, { data: { ttc_students: [{ phone: '9000000001' }] }, revisions: {}, account: { student: { phone: '9000000001' } } });
  const result = await auth.login('9000000001', randomBytes(8).toString('hex'), 'student');
  assert.equal(calls[1].path, '/api/auth');
  assert.equal(JSON.parse(calls[1].options.body).role, 'student');
  assert.equal(calls[2].path, '/api/data');
  assert.equal(result.student.phone, '9000000001');
});
test('failed student authentication does not fetch private data', async () => {
  const { auth, calls, responses } = await browser();
  responses.push({ error: 'Phone number or date of birth is incorrect.' });
  await assert.rejects(auth.login('9000000001', randomBytes(8).toString('hex'), 'student'), /incorrect/);
  assert.equal(calls.length, 2);
});
test('administrator password changes are saved on the server and refresh the account', async () => {
  const { auth, calls, responses } = await browser();
  responses.push({ saved: true }, { data: {}, revisions: {}, account: { admin: true, loginId: 'ADMIN', authMethod: 'password' } });
  await auth.changePassword(randomBytes(16).toString('hex'), randomBytes(16).toString('hex'));
  assert.equal(calls[1].path, '/api/auth');
  assert.equal(JSON.parse(calls[1].options.body).action, 'password');
  assert.equal(calls[2].path, '/api/data');
});
