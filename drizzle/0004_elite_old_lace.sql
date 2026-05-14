ALTER TABLE "submissions" ADD COLUMN "root_cause" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "affected_cpus" text[];--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "detection" text;