-- Row-level security for recipes.
--
-- Hand-written because Drizzle does not model policies, and for the same reason
-- it needs no snapshot: there is nothing in schema.ts for a future diff to
-- disagree with. A recipe has one owner, like a saved plate, and its lines
-- follow their recipe exactly as meal_items follow their meal.
--
-- The food a recipe measures is covered already: foods_visibility in 0012 keeps
-- a row whose created_by is somebody else out of every other account, and a
-- recipe's food always carries one.
--
-- The GRANT is a belt to the ALTER DEFAULT PRIVILEGES in 0012: that only covers
-- tables created by the role that ran it, and a clone restored by another owner
-- would otherwise hand calorico_app a table it cannot read.
GRANT SELECT, INSERT, UPDATE, DELETE ON recipes TO calorico_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON recipe_ingredients TO calorico_app;--> statement-breakpoint
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE recipes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS recipes_owner ON recipes;--> statement-breakpoint
CREATE POLICY recipes_owner ON recipes
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());--> statement-breakpoint
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE recipe_ingredients FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS recipe_ingredients_owner ON recipe_ingredients;--> statement-breakpoint
CREATE POLICY recipe_ingredients_owner ON recipe_ingredients
  USING (recipe_id IN (SELECT id FROM recipes WHERE user_id = app_user_id()))
  WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE user_id = app_user_id()));
