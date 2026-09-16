-- Row-level security for the pantry.
--
-- Hand-written because Drizzle does not model policies, and for the same reason
-- it needs no snapshot: there is nothing in schema.ts for a future diff to
-- disagree with. The rule is the one grocery_items already carries, because a
-- pantry belongs to the same household as the shopping list it feeds.
--
-- The GRANT is a belt to the ALTER DEFAULT PRIVILEGES in 0012: that only covers
-- tables created by the role that ran it, and a clone restored by another owner
-- would otherwise hand calorico_app a table it cannot read.
GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_items TO calorico_app;--> statement-breakpoint
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE pantry_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS pantry_items_visibility ON pantry_items;--> statement-breakpoint
CREATE POLICY pantry_items_visibility ON pantry_items
  USING (
    (family_id IS NULL AND user_id = app_user_id())
    OR family_id IN (SELECT app_family_ids())
  )
  WITH CHECK (
    (family_id IS NULL AND user_id = app_user_id())
    OR family_id IN (SELECT app_family_ids())
  );
