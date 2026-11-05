import { pgTable, text, integer, jsonb, primaryKey, timestamp } from 'drizzle-orm/pg-core';

export const collections = pgTable('institute_collections', {
  name: text().primaryKey(),
  revision: integer().notNull().default(0),
});

export const records = pgTable('institute_records', {
  collection: text().notNull().references(() => collections.name),
  id: text().notNull(),
  payload: jsonb().$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.collection, table.id] })]);

export const adminCredentials = pgTable('institute_admin_credentials', {
  id: text().primaryKey(),
  passwordHash: text('password_hash').notNull(),
});
export const sessions = pgTable('institute_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  role: text().notNull(),
  phone: text(),
  // A fingerprint invalidates sessions when the password or student login details change.
  studentFingerprint: text('student_fingerprint'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const loginAttempts = pgTable('institute_login_attempts', {
  id: text().primaryKey(),
  attempts: integer().notNull().default(1),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});
