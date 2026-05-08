import { Redis } from "@upstash/redis";
import type { Env } from "./env";

export function createRedis(env: Pick<Env, "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN">) {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export type AppRedis = ReturnType<typeof createRedis>;
