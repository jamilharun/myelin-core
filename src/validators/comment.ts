import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const flagSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
