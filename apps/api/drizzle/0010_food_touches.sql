CREATE TABLE "food_touches" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"times" integer DEFAULT 1 NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_touches" ADD CONSTRAINT "food_touches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_touches" ADD CONSTRAINT "food_touches_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "food_touches_pk" ON "food_touches" USING btree ("user_id","food_id");--> statement-breakpoint
CREATE INDEX "food_touches_user_idx" ON "food_touches" USING btree ("user_id","last_at");