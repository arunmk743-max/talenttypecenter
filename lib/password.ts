import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(value, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(value: string, stored: string) {
  const [salt, expected] = stored.split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const hash = await scrypt(value, salt, 64) as Buffer;
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
export function validDob(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return false;
  const day = Number(value.slice(0, 2)), month = Number(value.slice(2, 4)), year = Number(value.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date <= new Date() && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
