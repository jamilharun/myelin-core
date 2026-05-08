import type { Env } from "./lib/env";
import type { AuthUser } from "./auth/types";

export type Variables = {
  user: AuthUser;
  sessionId: string | null;
  isApiKey: boolean;
  isReadonly: boolean;
  apiKeyId: string | null;
};

export type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};
