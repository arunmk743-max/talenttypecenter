import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleSnapshot } from '../lib/access.js';
import { validateCollection, InputError, isAdmin } from '../lib/validation.js';
const alice = { name: 'Alice', phone: '9000000001', email: 'alice@example.com', dob: '01012004', regId: 'TTC-2026-001', grade: 'junior', gender: 'Female', machine: 'Desk No: 01', feeStatus: 'Paid', batch: 'Morning' };
const bob = { ...alice, name: 'Bob', phone: '9000000002', email: 'bob@example.com', regId: 'TTC-2026-002' };
const data = { ttc_settings: { phone: '7558162374' }, ttc_students: [alice, bob], ttc_attendance: [{ phone: alice.phone }, { phone: bob.phone }], ttc_outbox_reports: [{ candidate: 'Private inquiry' }] };
const revisions = { ttc_students: 5, ttc_attendance: 4, ttc_settings: 2, ttc_outbox_reports: 3 };
test('public visitors receive no student records, attendance, reports, or private revisions', () => {
  const visible = visibleSnapshot(data, revisions, null);
  assert.deepEqual(visible.data.ttc_students, []);
  assert.deepEqual(visible.data.ttc_attendance, []);
  assert.deepEqual(visible.data.ttc_outbox_reports, []);
  assert.deepEqual(visible.revisions, { ttc_settings: 2 });
  assert.equal(visible.account, null);
  assert.equal(data.ttc_students.length, 2);
});
test('verified students see only their own profile and attendance', () => {
  const visible = visibleSnapshot(data, revisions, { email: 'ALICE@EXAMPLE.COM', confirmedAt: '2026-01-01' });
  assert.deepEqual(visible.data.ttc_students, [alice]);
  assert.deepEqual(visible.data.ttc_attendance, [{ phone: alice.phone }]);
  assert.deepEqual(visible.data.ttc_outbox_reports, []);
  assert.equal(visible.account?.admin, false);
});
test('unverified accounts cannot claim student records by email', () => {
  assert.deepEqual(visibleSnapshot(data, revisions, { email: alice.email }).data.ttc_students, []);
});
test('administrators retain access to all institute records', () => {
  assert.deepEqual(visibleSnapshot(data, revisions, { email: 'admin@example.com', roles: ['admin'] }).data, data);
  assert.equal(isAdmin({ roles: ['student'] }), false);
});
test('duplicate phone numbers, emails and admission numbers are rejected', () => {
  assert.throws(() => validateCollection('ttc_students', [alice, { ...bob, email: 'ALICE@example.com' }]), InputError);
  assert.throws(() => validateCollection('ttc_students', [alice, { ...bob, phone: alice.phone }]), InputError);
  assert.throws(() => validateCollection('ttc_students', [alice, { ...bob, regId: alice.regId }]), InputError);
});
test('legacy student records can be imported before an email is linked', () => {
  const { email, ...legacy } = alice;
  const rows = validateCollection('ttc_students', [legacy]);
  assert.equal(rows[0].email, '');
});
test('stored HTML and unsafe identifiers cannot enter shared rendered data', () => {
  assert.throws(() => validateCollection('ttc_students', [{ ...alice, name: '<img src=x onerror=alert(1)>' }]), InputError);
  assert.throws(() => validateCollection('ttc_batches', [{ id: "');alert(1);//" }]), InputError);
  assert.throws(() => validateCollection('ttc_batches', [{ id: 'b1', badgeBg: 'x" onclick="alert(1)' }]), InputError);
  assert.throws(() => validateCollection('ttc_admin_creds', {}), InputError);
});
