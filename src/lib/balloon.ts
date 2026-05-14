import { and, eq } from "drizzle-orm";
import { submissions } from "../db/schema";
import type { Db } from "../db/client";
import type { AppRedis } from "./redis";

// Tuned for active seeders: 500pt cap + 100pt/hr refill lets a contributor
// sustain ~5 submissions/hr indefinitely without hitting the floor.
// Burst detection (10 posts/10min) and flag accumulation (3/hr) are the real
// spam gates — the balloon just rate-smooths good-faith volume.
const CAPACITY = 500;
const SUBMISSION_COST = 20;
const COMMENT_COST = 5;
const REFILL_PER_HOUR = 100;

const bKey = (userId: string) => `myelin:balloon:${userId}`;
const flagKey = (userId: string) => `myelin:balloon:flags:${userId}`;

interface BalloonState {
  value: number;
  lastRefill: number;
  popped: boolean;
}

async function readState(redis: AppRedis, userId: string): Promise<BalloonState> {
  const data = await redis.hgetall<Record<string, string>>(bKey(userId));

  if (!data) {
    return { value: CAPACITY, lastRefill: Date.now(), popped: false };
  }

  const lastRefill = parseInt(data.lastRefill ?? "0") || Date.now();
  const elapsedHours = (Date.now() - lastRefill) / 3_600_000;
  const refill = Math.floor(elapsedHours * REFILL_PER_HOUR);
  const raw = parseInt(data.value ?? "0") || 0;

  return {
    value: Math.min(CAPACITY, raw + refill),
    lastRefill: refill > 0 ? Date.now() : lastRefill,
    popped: data.popped === "true",
  };
}

async function saveState(redis: AppRedis, userId: string, state: BalloonState) {
  await redis.hset(bKey(userId), {
    value: String(state.value),
    lastRefill: String(state.lastRefill),
    popped: String(state.popped),
  });
}

export async function checkAndDeduct(
  redis: AppRedis,
  userId: string,
  action: "submission" | "comment"
): Promise<{ allowed: boolean }> {
  const cost = action === "submission" ? SUBMISSION_COST : COMMENT_COST;
  const state = await readState(redis, userId);

  if (state.popped || state.value < cost) return { allowed: false };

  await saveState(redis, userId, { ...state, value: state.value - cost });
  return { allowed: true };
}

// Pops the balloon and rejects all pending submissions from this user.
export async function popBalloon(redis: AppRedis, userId: string, db?: Db): Promise<void> {
  const state = await readState(redis, userId);
  await saveState(redis, userId, { ...state, value: 0, popped: true });

  if (db) {
    await db
      .update(submissions)
      .set({ status: "rejected" })
      .where(and(eq(submissions.userId, userId), eq(submissions.status, "pending")));
  }
}

// Called when a submission by this author gets flagged.
// 3 flags in 1 hour → pop their balloon and reject their pending queue.
export async function trackFlagReceived(
  redis: AppRedis,
  authorUserId: string,
  db?: Db
): Promise<void> {
  const key = flagKey(authorUserId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  if (count >= 3) await popBalloon(redis, authorUserId, db);
}
