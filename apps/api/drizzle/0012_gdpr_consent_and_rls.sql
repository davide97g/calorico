ALTER TABLE "users" ADD COLUMN "health_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_attested_at" timestamp with time zone;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'calorico_app') THEN
    CREATE ROLE calorico_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
GRANT calorico_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO calorico_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO calorico_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO calorico_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO calorico_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO calorico_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id() TO calorico_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_family_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM family_members WHERE user_id = app_user_id()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_family_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_family_ids() TO calorico_app;--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'diary_entries',
    'weight_logs',
    'favorites',
    'food_touches',
    'reminders',
    'push_subscriptions',
    'meals'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id())',
      t || '_owner',
      t
    );
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS users_owner ON users;--> statement-breakpoint
CREATE POLICY users_owner ON users
  USING (id = app_user_id())
  WITH CHECK (id = app_user_id());--> statement-breakpoint
DROP POLICY IF EXISTS users_family_read ON users;--> statement-breakpoint
CREATE POLICY users_family_read ON users
  FOR SELECT
  USING (id IN (
    SELECT m.user_id FROM family_members m
    WHERE m.family_id IN (SELECT app_family_ids())
  ));--> statement-breakpoint
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE meal_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS meal_items_owner ON meal_items;--> statement-breakpoint
CREATE POLICY meal_items_owner ON meal_items
  USING (meal_id IN (SELECT id FROM meals WHERE user_id = app_user_id()))
  WITH CHECK (meal_id IN (SELECT id FROM meals WHERE user_id = app_user_id()));--> statement-breakpoint
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE foods FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS foods_visibility ON foods;--> statement-breakpoint
CREATE POLICY foods_visibility ON foods
  USING (source IN ('off', 'generic') OR created_by = app_user_id())
  WITH CHECK (source IN ('off', 'generic') OR created_by = app_user_id());--> statement-breakpoint
ALTER TABLE food_images ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE food_images FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS food_images_visibility ON food_images;--> statement-breakpoint
CREATE POLICY food_images_visibility ON food_images
  USING (
    food_id IN (
      SELECT id FROM foods
      WHERE source IN ('off', 'generic') OR created_by = app_user_id()
    )
  )
  WITH CHECK (
    food_id IN (
      SELECT id FROM foods
      WHERE source IN ('off', 'generic') OR created_by = app_user_id()
    )
  );--> statement-breakpoint
ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE grocery_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scan_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE family_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS family_members_visibility ON family_members;--> statement-breakpoint
CREATE POLICY family_members_visibility ON family_members
  USING (
    user_id = app_user_id()
    OR family_id IN (SELECT app_family_ids())
  )
  WITH CHECK (user_id = app_user_id());--> statement-breakpoint
ALTER TABLE families ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE families FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE family_invites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE family_invites FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS family_invites_visibility ON family_invites;--> statement-breakpoint
CREATE POLICY family_invites_visibility ON family_invites
  USING (family_id IN (SELECT app_family_ids()))
  WITH CHECK (family_id IN (SELECT app_family_ids()));
