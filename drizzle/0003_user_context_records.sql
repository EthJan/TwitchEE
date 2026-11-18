CREATE TABLE "twitch_user_context_records" (
	"user_id" uuid NOT NULL,
	"dataset" text NOT NULL,
	"record_key" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "twitch_user_context_records_user_id_dataset_record_key_collected_at_pk" PRIMARY KEY("user_id","dataset","record_key","collected_at")
);
--> statement-breakpoint
CREATE INDEX "twitch_user_context_records_user_dataset_idx" ON "twitch_user_context_records" USING btree ("user_id","dataset");
--> statement-breakpoint
CREATE TABLE "twitch_user_recommendation_records" (
	"user_id" uuid NOT NULL,
	"record_key" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "twitch_user_recommendation_records_user_id_record_key_collected_at_pk" PRIMARY KEY("user_id","record_key","collected_at")
);
--> statement-breakpoint
CREATE INDEX "twitch_user_recommendations_user_collected_idx" ON "twitch_user_recommendation_records" USING btree ("user_id","collected_at");
--> statement-breakpoint
ALTER TABLE "twitch_user_context_records" ADD CONSTRAINT "twitch_user_context_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twitch_user_recommendation_records" ADD CONSTRAINT "twitch_user_recommendation_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
