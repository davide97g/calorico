-- A no-op, on purpose.
--
-- 0002, 0012 and 0013 were written by hand, and drizzle-kit only writes a
-- snapshot for the migrations it generates. Its idea of the schema therefore
-- stopped at 0011, two migrations behind the database, and `db:generate` kept
-- re-emitting 0012's four consent columns as though they were new.
--
-- This migration exists so its snapshot — which drizzle-kit takes from the
-- current schema.ts — becomes the one every future diff is measured against.
-- The statements below are what that stale diff produced; every database that
-- has run 0012 already has the columns, so they are guarded and do nothing.
--
-- Hand-written migrations from here on need a snapshot too: either generate a
-- matching one, or repeat this trick afterwards.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "health_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_attested_at" timestamp with time zone;
