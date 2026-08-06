-- User-uploaded photos are gone with the R2 bucket. These rows have to go before
-- the enum below can be recreated without the 'user' value they still hold.
-- The objects themselves stay in the bucket until it is emptied by hand.
DELETE FROM "food_images" WHERE "kind" = 'user';--> statement-breakpoint
ALTER TABLE "food_images" DROP CONSTRAINT "food_images_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "food_images" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "food_images" ALTER COLUMN "kind" SET DEFAULT 'front'::text;--> statement-breakpoint
DROP TYPE "public"."food_image_kind";--> statement-breakpoint
CREATE TYPE "public"."food_image_kind" AS ENUM('front', 'ingredients', 'nutrition');--> statement-breakpoint
ALTER TABLE "food_images" ALTER COLUMN "kind" SET DEFAULT 'front'::"public"."food_image_kind";--> statement-breakpoint
ALTER TABLE "food_images" ALTER COLUMN "kind" SET DATA TYPE "public"."food_image_kind" USING "kind"::"public"."food_image_kind";--> statement-breakpoint
DROP INDEX "food_images_user_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_premium" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "food_images" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "food_images" DROP COLUMN "storage_key";--> statement-breakpoint
ALTER TABLE "food_images" DROP COLUMN "bytes";