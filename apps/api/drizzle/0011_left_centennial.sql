CREATE TABLE "meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity_g" real NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meal" "meal" DEFAULT 'snack' NOT NULL,
	"last_logged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "sugars_g" real;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "sat_fat_g" real;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "salt_g" real;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_items_meal_idx" ON "meal_items" USING btree ("meal_id","sort");--> statement-breakpoint
CREATE INDEX "meals_user_idx" ON "meals" USING btree ("user_id","last_logged_at");--> statement-breakpoint
-- Fill columns that never existed, from the food still on the row. Entries
-- whose food is gone stay null — rewriting history from a missing product
-- would be a guess, and a guess is worse than a blank.
UPDATE "diary_entries" AS e
SET
  "sugars_g" = CASE WHEN f."sugars_100" IS NULL THEN NULL ELSE round((f."sugars_100" * e."quantity_g" / 100)::numeric, 1)::real END,
  "sat_fat_g" = CASE WHEN f."sat_fat_100" IS NULL THEN NULL ELSE round((f."sat_fat_100" * e."quantity_g" / 100)::numeric, 1)::real END,
  "salt_g" = CASE WHEN f."salt_100" IS NULL THEN NULL ELSE round((f."salt_100" * e."quantity_g" / 100)::numeric, 1)::real END
FROM "foods" AS f
WHERE e."food_id" = f."id";