import { validDob } from './password.js';
export const publicCollections = ['ttc_settings', 'ttc_batches', 'ttc_courses', 'ttc_passages'];
export const collectionNames = [...publicCollections, 'ttc_students', 'ttc_attendance', 'ttc_outbox_reports'];
export class InputError extends Error {}
export class ConflictError extends Error {}
export function isAdmin(user: { roles?: string[] } | null) { return !!user?.roles?.includes('admin'); }
export function emailKey(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
export function assertSafe(value: unknown, depth = 0): void {
  if (depth > 12) throw new InputError('Data is too deeply nested.');
  if (typeof value === 'string' && (value.length > 40000 || /[<>]/.test(value))) throw new InputError('Text must not contain HTML and must be under 40,000 characters.');
  if (value && typeof value === 'object') for (const item of Object.values(value)) assertSafe(item, depth + 1);
}
export function validateCollection(key: string, value: unknown): Record<string, unknown>[] {
  if (!collectionNames.includes(key)) throw new InputError('Unknown collection.');
  assertSafe(value);
  if (key === 'ttc_settings') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new InputError('Invalid settings.');
    const v = value as Record<string, unknown>;
    for (const field of ['addressEng', 'addressTamil', 'phone', 'email']) if (typeof v[field] !== 'string') throw new InputError('Missing contact settings.');
    return [v];
  }
  if (!Array.isArray(value) || value.length > 10000 || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw new InputError('Invalid record collection.');
  if (key === 'ttc_batches' && value.length === 0) throw new InputError('Keep at least one batch.');
  for (const row of value) {
    if (row.id !== undefined && (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id))) throw new InputError('Invalid record ID.');
    if (row.badgeBg !== undefined && (typeof row.badgeBg !== 'string' || !/^[a-zA-Z0-9 :_-]{1,200}$/.test(row.badgeBg))) throw new InputError('Invalid batch style.');
  }
  if (key === 'ttc_students') {
    const phones = new Set(), emails = new Set(), admissions = new Set();
    for (const student of value) {
      if (typeof student.name !== 'string' || !student.name.trim() || !/^\d{10}$/.test(student.phone) || !validDob(student.dob) || typeof student.regId !== 'string' || !student.regId || !['junior', 'senior', 'high'].includes(student.grade)) throw new InputError('Invalid student details.');
      for (const field of ['gender', 'machine', 'feeStatus', 'batch']) if (typeof student[field] !== 'string') throw new InputError('Incomplete student details.');
      const email = emailKey(student.email);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Invalid student email.');
      if (phones.has(student.phone) || admissions.has(student.regId) || (email && emails.has(email))) throw new InputError('Student phone, email, and admission numbers must be unique.');
      phones.add(student.phone); admissions.add(student.regId); if (email) emails.add(email);
      student.email = email;
    }
  }
  return value;
}
export function recordId(key: string, row: Record<string, unknown>, index: number) {
  return key === 'ttc_students' ? String(row.phone) : key === 'ttc_attendance' ? `${row.phone}:${row.date}` : String(row.id || index);
}
