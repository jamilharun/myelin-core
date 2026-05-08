export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "SIMILAR_FOUND"
  | "EDIT_WINDOW_EXPIRED"
  | "RATE_LIMITED"
  | "BALLOON_POPPED";

const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE: 409,
  SIMILAR_FOUND: 409,
  EDIT_WINDOW_EXPIRED: 403,
  RATE_LIMITED: 429,
  BALLOON_POPPED: 429,
};

interface ErrorOptions {
  retryAfter?: number;
  existingSlug?: string;
  similarSubmissions?: Array<{ slug: string; delta: number; similarity: number }>;
}

export interface ApiErrorObject {
  code: string;
  message: string;
  status: number;
  retry_after?: number;
  existing_slug?: string;
  similar_submissions?: Array<{ slug: string; delta: number; similarity: number }>;
}

export function apiError(code: ErrorCode, message: string, options: ErrorOptions = {}): { error: ApiErrorObject; status: number } {
  const status = ERROR_STATUS[code];
  const error: ApiErrorObject = { code, message, status };
  if (options.retryAfter !== undefined) error.retry_after = options.retryAfter;
  if (options.existingSlug !== undefined) error.existing_slug = options.existingSlug;
  if (options.similarSubmissions) error.similar_submissions = options.similarSubmissions;
  return { error, status };
}
