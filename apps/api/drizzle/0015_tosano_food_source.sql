-- Open Food Facts is no longer the only place a packaged food can come from:
-- when it has never heard of a barcode, the supermarket's own label table is.
-- See lib/tosano.ts.
--
-- Idempotent because migrations run on boot; ADD VALUE is transaction-safe on
-- Postgres 12+ as long as nothing in the same transaction uses the new value.
ALTER TYPE "public"."food_source" ADD VALUE IF NOT EXISTS 'tosano';
