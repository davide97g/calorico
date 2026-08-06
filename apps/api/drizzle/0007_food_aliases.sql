ALTER TABLE "foods" ADD COLUMN "aliases" text[];--> statement-breakpoint
--
-- Postgres will not build an index on array_to_string: it is STABLE, because
-- in general an element's text representation can depend on runtime settings.
-- For text[] it cannot, so the same call is re-declared IMMUTABLE here and the
-- index — and every query that wants to use it — goes through this function.
--
CREATE OR REPLACE FUNCTION food_alias_haystack(aliases text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string(coalesce(aliases, '{}'), ' ') $$;--> statement-breakpoint
CREATE INDEX "foods_aliases_trgm" ON "foods" USING gin (food_alias_haystack("aliases") gin_trgm_ops);
