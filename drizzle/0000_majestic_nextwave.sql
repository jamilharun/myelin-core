CREATE TYPE "public"."compiler" AS ENUM('gcc', 'clang', 'msvc', 'zig-cc', 'rustc', 'icc');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('asm', 'c', 'zig', 'rust', 'cpp');--> statement-breakpoint
CREATE TYPE "public"."metric" AS ENUM('cycles', 'instructions', 'ns', 'ms', 'rss', 'throughput');--> statement-breakpoint
CREATE TYPE "public"."simd" AS ENUM('avx2', 'avx512', 'sse4', 'neon', 'sve', 'rvv');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('optimization', 'gotcha', 'snippet');--> statement-breakpoint
CREATE TYPE "public"."vote_type" AS ENUM('upvote', 'flag');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"key_hash" text NOT NULL,
	"label" text NOT NULL,
	"is_readonly" boolean DEFAULT false NOT NULL,
	"readonly_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" varchar(2000) NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"canonical_slug" text NOT NULL,
	"type" "submission_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(5000),
	"code_before" text,
	"code_after" text,
	"before" double precision,
	"after" double precision,
	"delta" double precision,
	"metric" "metric",
	"cpu" text,
	"simd" "simd",
	"language" "language",
	"compiler" "compiler",
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"source_url" text,
	"supersedes" text,
	"superseded_by" text,
	"content_hash" text NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_canonical" boolean DEFAULT true NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"github_id" integer,
	"password_hash" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"verification_expires" timestamp,
	"reputation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"type" "vote_type" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_submission_vote" UNIQUE("user_id","submission_id")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_supersedes_submissions_slug_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."submissions"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;