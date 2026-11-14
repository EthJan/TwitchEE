CREATE TABLE "twitch_current_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"viewer_count" integer NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twitch_recommendation_records" (
	"dataset" text NOT NULL,
	"record_key" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "twitch_recommendation_records_dataset_record_key_collected_at_pk" PRIMARY KEY("dataset","record_key","collected_at")
);
--> statement-breakpoint
CREATE INDEX "twitch_current_streams_last_seen_at_idx" ON "twitch_current_streams" USING btree ("last_seen_at");