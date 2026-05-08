import { Ratelimit } from "@upstash/ratelimit";
import type { AppRedis } from "./redis";

// 5 submissions per hour per IP
export const submissionRl = (redis: AppRedis) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 h"), prefix: "myelin:rl:sub" });

// 1 submission per day for accounts < 7 days old (per user ID)
export const newAccountRl = (redis: AppRedis) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1, "24 h"), prefix: "myelin:rl:new" });

// Burst protection: 10 submissions in 10 minutes — pop balloon if hit
export const burstRl = (redis: AppRedis) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 m"), prefix: "myelin:rl:burst" });

// 20 comments per hour per IP
export const commentRl = (redis: AppRedis) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 h"), prefix: "myelin:rl:comment" });
