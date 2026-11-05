CREATE TABLE "institute_collections" (
	"name" text PRIMARY KEY,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institute_records" (
	"collection" text,
	"id" text,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institute_records_pkey" PRIMARY KEY("collection","id")
);
--> statement-breakpoint
ALTER TABLE "institute_records" ADD CONSTRAINT "institute_records_collection_institute_collections_name_fkey" FOREIGN KEY ("collection") REFERENCES "institute_collections"("name");