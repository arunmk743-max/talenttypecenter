import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, validDob } from '../lib/password.js';
import { visibleSnapshot } from '../lib/access.js';
import { validateCollection, InputError } from '../lib/validation.js';

test('salted password hashes verify and reject an incorrect password or malformed hash', async () => {
  const value = randomBytes(24).toString('hex');
  const first = await hashPassword(value), second = await hashPassword(value);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(value, first), true);
  assert.equal(await verifyPassword(randomBytes(24).toString('hex'), first), false);
  assert.equal(await verifyPassword(value, 'invalid'), false);
});
test('DOB validation rejects impossible dates and supports leap years in DDMMYYYY', () => {
  assert.equal(validDob('29022004'), true);
  for (const value of ['29022003', '31042004', '00002004', '2004-02-29', '01013000']) assert.equal(validDob(value), false);
});
test('phone sessions see only their own record and attendance without needing an email', () => {
  const own = { phone: '9000000001', dob: '29022004' };
  const other = { phone: '9000000002' };
  const data = { ttc_students: [own, other], ttc_attendance: [own, other], ttc_outbox_reports: [{ details: 'private' }] };
  const visible = visibleSnapshot(data, {}, { phone: own.phone, authMethod: 'phone' });
  assert.deepEqual(visible.data.ttc_students, [own]);
  assert.deepEqual(visible.data.ttc_attendance, [own]);
  assert.deepEqual(visible.data.ttc_outbox_reports, []);
  assert.equal(visible.account?.admin, false);
  assert.deepEqual(visibleSnapshot(data, {}, { phone: own.phone }).data.ttc_students, []);
  assert.deepEqual(visibleSnapshot(data, {}, { phone: '9000000003', authMethod: 'phone' }).data.ttc_students, []);
});
test('student saves reject DOBs which cannot be used for calendar-date login', () => {
  assert.throws(() => validateCollection('ttc_students', [{ name: 'Test', phone: '9000000001', dob: '31022004', regId: 'T1', grade: 'junior' }]), InputError);
});
