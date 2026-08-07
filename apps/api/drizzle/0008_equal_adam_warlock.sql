ALTER TABLE "users" ADD COLUMN "premium_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "free_photo_scans_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_stripe_customer_unique" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
-- The free allowance used to be three photos a rolling day, counted off the
-- scan feed; it is now one photo for the life of the account, counted here.
-- Without this every account that already used the feature would be handed a
-- fresh free analysis by the deploy.
UPDATE "users" SET "free_photo_scans_used" = "seen"."n"
FROM (
  SELECT "user_id", count(*)::int AS "n"
  FROM "scan_events" WHERE "kind" = 'photo' GROUP BY "user_id"
) AS "seen"
WHERE "users"."id" = "seen"."user_id";