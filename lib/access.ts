import { emailKey, isAdmin, publicCollections, collectionNames } from './validation.js';
export interface Account { email?: string; roles?: string[]; confirmedAt?: string; phone?: string; loginId?: string; authMethod?: string }
export function studentForAccount(data: Record<string, any>, user: Account | null) {
  if (user?.authMethod === 'phone' && user.phone) return data.ttc_students.find((row: any) => row.phone === user.phone) || null;
  return user?.confirmedAt && user.email ? data.ttc_students.find((row: any) => emailKey(row.email) === emailKey(user.email)) || null : null;
}
export function visibleSnapshot(data: Record<string, any>, revisions: Record<string, number>, user: Account | null) {
  const visible = structuredClone(data), versions = { ...revisions };
  const student = studentForAccount(data, user);
  if (!isAdmin(user)) {
    visible.ttc_students = student ? [structuredClone(student)] : [];
    visible.ttc_attendance = student ? visible.ttc_attendance.filter((row: any) => row.phone === student.phone) : [];
    visible.ttc_outbox_reports = [];
    for (const key of collectionNames) if (!publicCollections.includes(key)) delete versions[key];
  }
  return { data: visible, revisions: versions, account: user ? { email: user.email, loginId: user.loginId, authMethod: user.authMethod, admin: isAdmin(user), student } : null };
}
