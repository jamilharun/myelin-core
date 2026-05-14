CREATE TYPE "public"."confidence" AS ENUM('measured', 'documented', 'observed', 'theoretical');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('comment', 'upvote', 'flag_received', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."submission_type" ADD VALUE 'fix';--> statement-breakpoint
ALTER TYPE "public"."submission_type" ADD VALUE 'benchmark';--> statement-breakpoint
ALTER TYPE "public"."submission_type" ADD VALUE 'compiler_note';--> statement-breakpoint
ALTER TYPE "public"."submission_type" ADD VALUE 'compatibility';--> statement-breakpoint
CREATE TABLE "edit_history" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"user_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "fix_for" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "confidence" "confidence";--> statement-breakpoint
ALTER TABLE "edit_history" ADD CONSTRAINT "edit_history_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_history" ADD CONSTRAINT "edit_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_edit_history_submission_created" ON "edit_history" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_edit_history_user_created" ON "edit_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read_created" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhooks_user_active" ON "webhooks" USING btree ("user_id","active");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_fix_for_submissions_slug_fk" FOREIGN KEY ("fix_for") REFERENCES "public"."submissions"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "ck_fix_for_consistency" CHECK (("submissions"."type" = 'fix' AND "submissions"."fix_for" IS NOT NULL) OR ("submissions"."type" <> 'fix' AND "submissions"."fix_for" IS NULL));