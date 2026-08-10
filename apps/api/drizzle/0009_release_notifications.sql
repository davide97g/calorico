CREATE TABLE "app_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"announced_at" timestamp with time zone,
	"notified" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "build_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "app_releases_build_id_unique" ON "app_releases" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "app_releases_detected_idx" ON "app_releases" USING btree ("detected_at");