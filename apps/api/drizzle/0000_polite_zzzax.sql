CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active', 'very_active');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('off', 'generic', 'custom');--> statement-breakpoint
CREATE TYPE "public"."goal" AS ENUM('lose', 'maintain', 'gain');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid,
	"day" date NOT NULL,
	"meal" "meal" DEFAULT 'snack' NOT NULL,
	"quantity_g" real NOT NULL,
	"name_snapshot" text NOT NULL,
	"brand_snapshot" text,
	"kcal" real NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real DEFAULT 0 NOT NULL,
	"fat_g" real DEFAULT 0 NOT NULL,
	"fiber_g" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "food_source" DEFAULT 'off' NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"category" text,
	"image_url" text,
	"kcal_100" real NOT NULL,
	"protein_100" real DEFAULT 0 NOT NULL,
	"carbs_100" real DEFAULT 0 NOT NULL,
	"sugars_100" real,
	"fat_100" real DEFAULT 0 NOT NULL,
	"sat_fat_100" real,
	"fiber_100" real,
	"salt_100" real,
	"serving_size_g" real,
	"serving_label" text,
	"unit" text DEFAULT 'g' NOT NULL,
	"is_liquid" boolean DEFAULT false NOT NULL,
	"countries" text[],
	"raw" jsonb,
	"verified" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sex" "sex" DEFAULT 'male' NOT NULL,
	"birth_date" date,
	"height_cm" real,
	"start_weight_kg" real,
	"target_weight_kg" real,
	"activity_level" "activity_level" DEFAULT 'moderate' NOT NULL,
	"goal" "goal" DEFAULT 'maintain' NOT NULL,
	"target_kcal" integer DEFAULT 2000 NOT NULL,
	"target_protein_g" integer DEFAULT 120 NOT NULL,
	"target_carbs_g" integer DEFAULT 200 NOT NULL,
	"target_fat_g" integer DEFAULT 65 NOT NULL,
	"target_kcal_min" integer DEFAULT 1900 NOT NULL,
	"target_kcal_max" integer DEFAULT 2100 NOT NULL,
	"locale" text DEFAULT 'it' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"weight_kg" real NOT NULL,
	"body_fat_pct" real,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_user_day_idx" ON "diary_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_pk" ON "favorites" USING btree ("user_id","food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_barcode_unique" ON "foods" USING btree ("barcode") WHERE "foods"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "foods_name_trgm" ON "foods" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_brand_trgm" ON "foods" USING gin ("brand" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_source_idx" ON "foods" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "weight_user_day_unique" ON "weight_logs" USING btree ("user_id","day");