import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Cloudflare Workers exposes WebSocket globally
neonConfig.webSocketConstructor = globalThis.WebSocket;

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema });
}

export type Db = ReturnType<typeof createDb>;
