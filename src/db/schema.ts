import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  unique,
  check,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const submissionTypeEnum = pgEnum("submission_type", [
  "optimization",
  "gotcha",
  "snippet",
  "fix",
  "benchmark",
  "compiler_note",
  "compatibility",
]);

export const confidenceEnum = pgEnum("confidence", [
  "measured",
  "documented",
  "observed",
  "theoretical",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "comment",
  "upvote",
  "flag_received",
  "approved",
  "rejected",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "flagged",
  "rejected",
]);

export const metricEnum = pgEnum("metric", [
  "cycles",
  "instructions",
  "ns",
  "ms",
  "rss",
  "throughput",
]);

export const simdEnum = pgEnum("simd", [
  "avx2",
  "avx512",
  "sse4",
  "neon",
  "sve",
  "rvv",
]);

export const languageEnum = pgEnum("language", [
  "asm",
  "c",
  "zig",
  "rust",
  "cpp",
]);

export const compilerEnum = pgEnum("compiler", [
  "gcc",
  "clang",
  "msvc",
  "zig-cc",
  "rustc",
  "icc",
]);

export const voteTypeEnum = pgEnum("vote_type", ["upvote", "flag"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  githubId: integer("github_id").unique(),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationExpires: timestamp("verification_expires"),
  reputation: integer("reputation").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lucia-managed session table
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  // null for anonymous readonly keys (no account required)
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label").notNull(),
  isReadonly: boolean("is_readonly").notNull().default(false),
  readonlyEmail: text("readonly_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => [
  check("ck_write_key_has_owner", sql`${table.isReadonly} = true OR ${table.userId} IS NOT NULL`),
  check("ck_anon_key_has_email", sql`${table.userId} IS NOT NULL OR ${table.readonlyEmail} IS NOT NULL`),
]);

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  canonicalSlug: text("canonical_slug")
    .notNull()
    .references((): AnyPgColumn => submissions.slug),
  type: submissionTypeEnum("type").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: varchar("body", { length: 5000 }),
  codeBefore: text("code_before"),
  codeAfter: text("code_after"),
  before: doublePrecision("before"),
  after: doublePrecision("after"),
  delta: doublePrecision("delta"),
  metric: metricEnum("metric"),
  cpu: text("cpu"),
  simd: simdEnum("simd"),
  language: languageEnum("language"),
  compiler: compilerEnum("compiler"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  sourceUrl: text("source_url"),
  // self-referential FK requires callback to avoid circular reference
  supersedes: text("supersedes").references((): AnyPgColumn => submissions.slug),
  supersededBy: text("superseded_by"),
  // fix type only — points to the submission this corrects
  fixFor: text("fix_for").references((): AnyPgColumn => submissions.slug),
  confidence: confidenceEnum("confidence"),
  contentHash: text("content_hash").notNull(),
  status: submissionStatusEnum("status").notNull().default("pending"),
  version: integer("version").notNull().default(1),
  isCanonical: boolean("is_canonical").notNull().default(true),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  apiKeyId: text("api_key_id").references(() => apiKeys.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  body: varchar("body", { length: 2000 }).notNull(),
  upvotes: integer("upvotes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const votes = pgTable(
  "votes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    type: voteTypeEnum("type").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("uq_user_submission_vote").on(table.userId, table.submissionId)]
);

// Snapshot of changed fields stored before each PATCH — newest first via createdAt desc
export const editHistory = pgTable("edit_history", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  // JSON snapshot of the fields as they were before this edit
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  // HMAC-SHA256 signing secret — stored plaintext, shown once on creation
  secret: text("secret").notNull(),
  // e.g. ["submission.approved", "submission.flagged", "comment.created"]
  events: text("events").array().notNull().default(sql`ARRAY[]::text[]`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  // Flexible payload: { submissionSlug, actorUsername, commentId, ... }
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
