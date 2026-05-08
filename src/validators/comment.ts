import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const flagSchema = z.object({
  reason: z.string().min(1).max(500),
});
