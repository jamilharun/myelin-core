import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { createRedis } from "../lib/redis";
import { submissions, users, comments, votes } from "../db/schema";
import { apiError } from "../lib/errors";
import { calculateDelta } from "../lib/delta";
import { contentHash } from "../lib/hash";
import { generateUniqueSlug, titleToSlug, isSlugConflict } from "../lib/slug";
import { formatSubmission } from "../lib/formatters";
import { fetchOneBySlug } from "../lib/queries";
import { checkAndDeduct, popBalloon, trackFlagReceived } from "../lib/balloon";
import { submissionRl, newAccountRl, burstRl, commentRl } from "../lib/rate-limit";
import { authenticate } from "../auth/middleware"; // used by router.use("*", authenticate)
import { createSubmissionSchema, editSubmissionSchema } from "../validators/submission";
import { createCommentSchema, flagSchema } from "../validators/comment";
import { errorSchema, submissionSchema, validationHook } from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

router.use("*", authenticate);

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ─── POST /submissions ────────────────────────────────────────────────────────

const createSubmissionRoute = createRoute({
  method: "post",
  path: "/submissions",
  tags: ["Submissions"],
  summary: "Create a new submission",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: createSubmissionSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("created"),
            slug: z.string(),
            is_canonical: z.boolean(),
            supersedes: z.string().nullable(),
            url: z.string(),
          }),
        },
      },
      description: "Submission created",
    },
    400: { content: { "application/json": { schema: errorSchema } }, description: "Validation error" },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Superseded submission not found" },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Exact duplicate" },
    429: { content: { "application/json": { schema: errorSchema } }, description: "Rate limited or balloon popped" },
  },
});

router.openapi(createSubmissionRoute, async (c) => {
  const user = c.get("user");
  const isApiKey = c.get("isApiKey");
  const apiKeyId = c.get("apiKeyId");
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";

  const redis = createRedis(c.env);
  const db = createDb(c.env.DATABASE_URL);

  if (user.reputation < 0) {
    const { error, status } = apiError("FORBIDDEN", "Account suspended.");
    return c.json({ error }, status as 403);
  }

  if (!isApiKey) {
    const ageMs = Date.now() - user.createdAt.getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const { error, status } = apiError("FORBIDDEN", "New accounts must wait 24 hours before posting.");
      return c.json({ error }, status as 403);
    }

    if (ageMs < SEVEN_DAYS_MS) {
      const { success } = await newAccountRl(redis).limit(user.id);
      if (!success) {
        const { error, status } = apiError("RATE_LIMITED", "New accounts can post once per day for the first 7 days.");
        return c.json({ error }, status as 429);
      }
    }
  }

  const { success: rlOk, reset } = await submissionRl(redis).limit(ip);
  if (!rlOk) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    const { error, status } = apiError("RATE_LIMITED", "Too many submissions. Try again later.", { retryAfter });
    return c.json({ error }, status as 429);
  }

  const { success: burstOk } = await burstRl(redis).limit(user.id);
  if (!burstOk) {
    await popBalloon(redis, user.id, db);
    const { error, status } = apiError("BALLOON_POPPED", "Posting suspended due to burst activity. Contact support.");
    return c.json({ error }, status as 429);
  }

  const balloon = await checkAndDeduct(redis, user.id, "submission");
  if (!balloon.allowed) {
    const { error, status } = apiError("BALLOON_POPPED", "Posting budget exhausted. Try again later.");
    return c.json({ error }, status as 429);
  }

  const data = c.req.valid("json");

  const delta =
    data.type === "optimization" ? calculateDelta(data.before, data.after) : null;

  const hash = await contentHash(
    data.type,
    data.title.toLowerCase().trim(),
    "code_before" in data ? (data.code_before ?? "") : "",
    "code_after" in data ? data.code_after : "",
    "cpu" in data ? (data.cpu ?? "") : "",
    "language" in data ? (data.language ?? "") : ""
  );

  const dupCheck = await db
    .select({ slug: submissions.slug })
    .from(submissions)
    .where(eq(submissions.contentHash, hash))
    .limit(1);

  if (dupCheck.length > 0) {
    const { error, status } = apiError("DUPLICATE", "Exact duplicate already exists.", {
      existingSlug: dupCheck[0].slug,
    });
    return c.json({ error }, status as 409);
  }

  const [approvedRow] = await db
    .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
    .from(submissions)
    .where(and(eq(submissions.userId, user.id), eq(submissions.status, "approved")));

  const newStatus = isApiKey || Number(approvedRow?.count ?? 0) >= 3 ? "approved" : "pending";

  const supersededSlug = "supersedes" in data ? (data.supersedes ?? null) : null;

  let slug = "";
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      slug = attempt === 0
        ? await generateUniqueSlug(data.title, db)
        : `${titleToSlug(data.title) || "submission"}-${crypto.randomUUID().slice(0, 8)}`;

      const id = crypto.randomUUID();

      try {
        await db.transaction(async (tx) => {
          let version = 1;
          let canonicalSlug = slug;

          if (supersededSlug) {
            const prev = await tx
              .select({ version: submissions.version, canonicalSlug: submissions.canonicalSlug })
              .from(submissions)
              .where(eq(submissions.slug, supersededSlug))
              .limit(1);

            if (prev.length === 0) throw new Error("SUPERSEDES_NOT_FOUND");

            const [{ maxVersion }] = await tx
              .select({ maxVersion: sql<number>`CAST(MAX(${submissions.version}) AS INT)` })
              .from(submissions)
              .where(eq(submissions.canonicalSlug, prev[0].canonicalSlug));

            version = (maxVersion ?? prev[0].version) + 1;
            canonicalSlug = slug;

            await tx
              .update(submissions)
              .set({ supersededBy: slug })
              .where(eq(submissions.slug, supersededSlug));

            await tx
              .update(submissions)
              .set({ canonicalSlug: slug, isCanonical: false })
              .where(eq(submissions.canonicalSlug, prev[0].canonicalSlug));
          }

          await tx.insert(submissions).values({
            id,
            slug,
            canonicalSlug,
            type: data.type,
            title: data.title,
            body: data.body ?? null,
            codeBefore: "code_before" in data ? (data.code_before ?? null) : null,
            codeAfter: "code_after" in data ? data.code_after : null,
            before: "before" in data ? data.before : null,
            after: "after" in data ? data.after : null,
            delta,
            metric: "metric" in data ? data.metric : null,
            cpu: "cpu" in data ? data.cpu : null,
            simd: "simd" in data ? (data.simd ?? null) : null,
            language: "language" in data ? data.language : null,
            tags: data.tags,
            sourceUrl: data.source_url ?? null,
            supersedes: supersededSlug,
            contentHash: hash,
            status: newStatus,
            version,
            isCanonical: true,
            userId: user.id,
            apiKeyId: apiKeyId ?? null,
          });
        });

        break; // insert succeeded — exit retry loop
      } catch (e) {
        if (attempt < 4 && isSlugConflict(e)) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SUPERSEDES_NOT_FOUND") {
      const { error, status } = apiError("NOT_FOUND", "The submission to supersede does not exist.");
      return c.json({ error }, status as 404);
    }
    throw e;
  }

  return c.json(
    { status: "created" as const, slug, is_canonical: true, supersedes: supersededSlug, url: `/s/${slug}` },
    201
  );
});

// ─── PATCH /submissions/:slug ─────────────────────────────────────────────────

const editRoute = createRoute({
  method: "patch",
  path: "/submissions/:slug",
  tags: ["Submissions"],
  summary: "Edit a submission (within 6 hours of creation)",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
    body: {
      content: { "application/json": { schema: editSubmissionSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ slug: z.string(), version: z.number().int() }),
        },
      },
      description: "Updated",
    },
    400: { content: { "application/json": { schema: errorSchema } }, description: "Validation error" },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden or edit window expired" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
  },
});

router.openapi(editRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const row = await db
    .select()
    .from(submissions)
    .where(eq(submissions.slug, slug))
    .limit(1);

  if (row.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  const sub = row[0];

  if (sub.userId !== user.id) {
    const { error, status } = apiError("FORBIDDEN", "You can only edit your own submissions.");
    return c.json({ error }, status as 403);
  }

  if (Date.now() - sub.createdAt.getTime() > SIX_HOURS_MS) {
    const { error, status } = apiError("EDIT_WINDOW_EXPIRED", "The 6-hour edit window has closed.");
    return c.json({ error }, status as 403);
  }

  const data = c.req.valid("json");

  // `type` is always present after discriminated union parsing — only reject if no other field provided
  const { type: _type, ...dataWithoutType } = data;
  if (Object.keys(dataWithoutType).length === 0) {
    const { error, status } = apiError("VALIDATION_ERROR", "No fields provided to update.");
    return c.json({ error }, status as 400);
  }

  let newDelta = sub.delta;
  if (data.type === "optimization" && (data.before !== undefined || data.after !== undefined)) {
    newDelta = calculateDelta(data.before ?? sub.before ?? 0, data.after ?? sub.after ?? 0);
  }

  const nextHash = await contentHash(
    sub.type,
    (data.title ?? sub.title).toLowerCase().trim(),
    ("code_before" in data ? data.code_before : undefined) ?? sub.codeBefore ?? "",
    ("code_after" in data ? data.code_after : undefined) ?? sub.codeAfter ?? "",
    ("cpu" in data ? data.cpu : undefined) ?? sub.cpu ?? "",
    sub.language ?? "",
  );

  const typeSpecificSet = data.type === "optimization"
    ? {
        ...(data.before !== undefined && { before: data.before }),
        ...(data.after !== undefined && { after: data.after }),
        ...(newDelta !== sub.delta && { delta: newDelta }),
        ...(data.metric !== undefined && { metric: data.metric }),
        ...(data.cpu !== undefined && { cpu: data.cpu }),
        ...(data.code_before !== undefined && { codeBefore: data.code_before }),
        ...(data.code_after !== undefined && { codeAfter: data.code_after }),
      }
    : data.type === "gotcha"
    ? {
        ...(data.cpu !== undefined && { cpu: data.cpu }),
        ...(data.code_before !== undefined && { codeBefore: data.code_before }),
        ...(data.code_after !== undefined && { codeAfter: data.code_after }),
      }
    : {
        ...(data.code_after !== undefined && { codeAfter: data.code_after }),
      };

  await db
    .update(submissions)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...typeSpecificSet,
      contentHash: nextHash,
      updatedAt: new Date(),
    })
    .where(eq(submissions.slug, slug));

  return c.json({ slug, version: sub.version }, 200);
});

// ─── POST /submissions/:slug/comments ─────────────────────────────────────────

const createCommentRoute = createRoute({
  method: "post",
  path: "/submissions/:slug/comments",
  tags: ["Submissions"],
  summary: "Add a comment (requires reputation ≥ 10)",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
    body: {
      content: { "application/json": { schema: createCommentSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({ id: z.string(), submission_slug: z.string() }),
        },
      },
      description: "Comment created",
    },
    400: { content: { "application/json": { schema: errorSchema } }, description: "Validation error" },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Insufficient reputation" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Submission not found" },
    429: { content: { "application/json": { schema: errorSchema } }, description: "Rate limited or balloon popped" },
  },
});

router.openapi(createCommentRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const user = c.get("user");
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";

  if (user.reputation < 10) {
    const { error, status } = apiError("FORBIDDEN", "Commenting requires reputation ≥ 10.");
    return c.json({ error }, status as 403);
  }

  const redis = createRedis(c.env);
  const { success: rlOk, reset } = await commentRl(redis).limit(ip);
  if (!rlOk) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    const { error, status } = apiError("RATE_LIMITED", "Too many comments. Try again later.", { retryAfter });
    return c.json({ error }, status as 429);
  }

  const balloon = await checkAndDeduct(redis, user.id, "comment");
  if (!balloon.allowed) {
    const { error, status } = apiError("BALLOON_POPPED", "Commenting budget exhausted.");
    return c.json({ error }, status as 429);
  }

  const { body } = c.req.valid("json");

  const db = createDb(c.env.DATABASE_URL);

  const sub = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.slug, slug), eq(submissions.status, "approved")))
    .limit(1);

  if (sub.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  const id = crypto.randomUUID();
  await db.insert(comments).values({
    id,
    submissionId: sub[0].id,
    userId: user.id,
    body,
  });

  return c.json({ id, submission_slug: slug }, 201);
});

// ─── POST /submissions/:slug/upvote ──────────────────────────────────────────

const upvoteRoute = createRoute({
  method: "post",
  path: "/submissions/:slug/upvote",
  tags: ["Submissions"],
  summary: "Toggle upvote on a submission",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ upvoted: z.boolean() }),
        },
      },
      description: "Upvote toggled",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Cannot upvote own submission" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
  },
});

router.openapi(upvoteRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const sub = await db
    .select({ id: submissions.id, userId: submissions.userId })
    .from(submissions)
    .where(and(eq(submissions.slug, slug), eq(submissions.status, "approved")))
    .limit(1);

  if (sub.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  if (sub[0].userId === user.id) {
    const { error, status } = apiError("FORBIDDEN", "You cannot upvote your own submission.");
    return c.json({ error }, status as 403);
  }

  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: votes.id })
      .from(votes)
      .where(and(eq(votes.submissionId, sub[0].id), eq(votes.userId, user.id), eq(votes.type, "upvote")))
      .limit(1);

    if (existing.length > 0) {
      const deleted = await tx
        .delete(votes)
        .where(eq(votes.id, existing[0].id))
        .returning({ id: votes.id });
      if (deleted.length > 0) {
        await tx.update(users)
          .set({ reputation: sql`${users.reputation} - 5` })
          .where(eq(users.id, sub[0].userId));
      }
      return { upvoted: false as const };
    }

    // uq_user_submission_vote fires if a concurrent insert wins — the whole
    // transaction rolls back, so reputation is never touched.
    await tx.insert(votes).values({
      id: crypto.randomUUID(),
      userId: user.id,
      submissionId: sub[0].id,
      type: "upvote",
    });
    await tx.update(users)
      .set({ reputation: sql`${users.reputation} + 5` })
      .where(eq(users.id, sub[0].userId));
    return { upvoted: true as const };
  });

  return c.json(result, 200);
});

// ─── POST /submissions/:slug/flag ─────────────────────────────────────────────

const flagRoute = createRoute({
  method: "post",
  path: "/submissions/:slug/flag",
  tags: ["Submissions"],
  summary: "Flag a submission for review (requires reputation ≥ 20)",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
    body: {
      content: { "application/json": { schema: flagSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ flagged: z.literal(true) }),
        },
      },
      description: "Flagged",
    },
    400: { content: { "application/json": { schema: errorSchema } }, description: "Validation error" },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Insufficient reputation or already flagged" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
  },
});

router.openapi(flagRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const user = c.get("user");

  if (user.reputation < 20) {
    const { error, status } = apiError("FORBIDDEN", "Flagging requires reputation ≥ 20.");
    return c.json({ error }, status as 403);
  }

  const { reason } = c.req.valid("json");

  const db = createDb(c.env.DATABASE_URL);

  const sub = await db
    .select({ id: submissions.id, userId: submissions.userId, status: submissions.status })
    .from(submissions)
    .where(eq(submissions.slug, slug))
    .limit(1);

  if (sub.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  const inserted = await db
    .insert(votes)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      submissionId: sub[0].id,
      type: "flag",
      reason,
    })
    .onConflictDoNothing()
    .returning({ id: votes.id });

  if (inserted.length === 0) {
    const { error, status } = apiError("FORBIDDEN", "You have already flagged this submission.");
    return c.json({ error }, status as 403);
  }

  const [flagCount, upvoteCount] = await Promise.all([
    db.select({ n: sql<number>`CAST(COUNT(*) AS INT)` }).from(votes)
      .where(and(eq(votes.submissionId, sub[0].id), eq(votes.type, "flag"))),
    db.select({ n: sql<number>`CAST(COUNT(*) AS INT)` }).from(votes)
      .where(and(eq(votes.submissionId, sub[0].id), eq(votes.type, "upvote"))),
  ]);

  const flags = Number(flagCount[0]?.n ?? 0);
  const upvotes = Number(upvoteCount[0]?.n ?? 0);

  if (flags === upvotes && flags > 0) {
    await db.update(submissions).set({ status: "pending" }).where(eq(submissions.id, sub[0].id));
  }

  const redis = createRedis(c.env);
  await trackFlagReceived(redis, sub[0].userId, db);

  return c.json({ flagged: true as const }, 200);
});

export default router;
