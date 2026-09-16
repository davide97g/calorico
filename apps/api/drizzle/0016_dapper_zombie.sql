CREATE TYPE "public"."grocery_category" AS ENUM('food', 'household', 'hygiene', 'other');--> statement-breakpoint
CREATE TYPE "public"."grocery_source" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."grocery_unit" AS ENUM('pz', 'g', 'kg', 'l', 'ml');--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid,
	"list_id" uuid GENERATED ALWAYS AS (coalesce("pantry_items"."family_id", "pantry_items"."user_id")) STORED,
	"food_id" uuid NOT NULL,
	"sealed_packages" integer DEFAULT 0 NOT NULL,
	"remaining_g" real DEFAULT 0 NOT NULL,
	"package_size_g" real NOT NULL,
	"low_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "unit" "grocery_unit" DEFAULT 'pz' NOT NULL;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "category" "grocery_category" DEFAULT 'food' NOT NULL;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "source" "grocery_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_list_food_unique" ON "pantry_items" USING btree ("list_id","food_id");--> statement-breakpoint
CREATE INDEX "pantry_list_idx" ON "pantry_items" USING btree ("list_id","updated_at");