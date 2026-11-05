CREATE TABLE "institute_admin_credentials" (
	"id" text PRIMARY KEY,
	"password_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institute_login_attempts" (
	"id" text PRIMARY KEY,
	"attempts" integer DEFAULT 1 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institute_sessions" (
	"token_hash" text PRIMARY KEY,
	"role" text NOT NULL,
	"phone" text,
	"student_fingerprint" text,
	"expires_at" timestamp with time zone NOT NULL
);
