CREATE TYPE "public"."food_image_kind" AS ENUM('front', 'ingredients', 'nutrition', 'user');--> statement-breakpoint
CREATE TABLE "food_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "food_image_kind" DEFAULT 'user' NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "images_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "food_images" ADD CONSTRAINT "food_images_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_images" ADD CONSTRAINT "food_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_images_food_idx" ON "food_images" USING btree ("food_id","sort");--> statement-breakpoint
CREATE INDEX "food_images_user_idx" ON "food_images" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_images_food_url_unique" ON "food_images" USING btree ("food_id","url");