CREATE OR REPLACE FUNCTION app_family_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM family_members WHERE user_id = app_user_id()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_family_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_family_ids() TO calorico_app;--> statement-breakpoint
DROP POLICY IF EXISTS users_family_read ON users;--> statement-breakpoint
CREATE POLICY users_family_read ON users
  FOR SELECT
  USING (id IN (
    SELECT m.user_id FROM family_members m
    WHERE m.family_id IN (SELECT app_family_ids())
  ));--> statement-breakpoint
DROP POLICY IF EXISTS grocery_items_visibility ON grocery_items;--> statement-breakpoint
CREATE POLICY grocery_items_visibility ON grocery_items
  USING (
    (family_id IS NULL AND user_id = app_user_id())
    OR family_id IN (SELECT app_family_ids())
  )
  WITH CHECK (
    (family_id IS NULL AND user_id = app_user_id())
    OR family_id IN (SELECT app_family_ids())
  );--> statement-breakpoint
DROP POLICY IF EXISTS scan_events_visibility ON scan_events;--> statement-breakpoint
CREATE POLICY scan_events_visibility ON scan_events
  USING (
    (family_id IS NULL AND user_id = app_user_id())
    OR family_id IN (SELECT app_family_ids())
  )
  WITH CHECK (
    (family_id IS NULL AND user_id = app_user_id())
    OR family_id IN (SELECT app_family_ids())
  );--> statement-breakpoint
DROP POLICY IF EXISTS family_members_visibility ON family_members;--> statement-breakpoint
CREATE POLICY family_members_visibility ON family_members
  USING (
    user_id = app_user_id()
    OR family_id IN (SELECT app_family_ids())
  )
  WITH CHECK (user_id = app_user_id());--> statement-breakpoint
DROP POLICY IF EXISTS families_visibility ON families;--> statement-breakpoint
CREATE POLICY families_visibility ON families
  USING (
    created_by = app_user_id()
    OR id IN (SELECT app_family_ids())
  )
  WITH CHECK (
    created_by = app_user_id()
    OR id IN (SELECT app_family_ids())
  );--> statement-breakpoint
DROP POLICY IF EXISTS family_invites_visibility ON family_invites;--> statement-breakpoint
CREATE POLICY family_invites_visibility ON family_invites
  USING (family_id IN (SELECT app_family_ids()))
  WITH CHECK (family_id IN (SELECT app_family_ids()));
