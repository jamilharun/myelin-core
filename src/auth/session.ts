import { eq } from "drizzle-orm";
import { users, sessions } from "../db/schema";
import type { Db } from "../db/client";
import type { AuthAdapter, AuthUser } from "./types";

export function createSessionAdapter(db: Db): AuthAdapter {
  return {
    async createSession(userId) {
      const id = crypto.randomUUID();
      // Sessions don't expire per design — revoked explicitly via logout or admin
      const expiresAt = new Date(Date.UTC(9999, 11, 31));

      await db.insert(sessions).values({ id, userId, expiresAt });
      return { token: id, session: { id, userId, expiresAt } };
    },

    async validateToken(token) {
      const rows = await db
        .select()
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.id, token))
        .limit(1);

      if (rows.length === 0) return null;

      const { sessions: session, users: user } = rows[0];

      if (session.expiresAt < new Date()) {
        await db.delete(sessions).where(eq(sessions.id, token));
        return null;
      }

      return {
        session: { id: session.id, userId: session.userId, expiresAt: session.expiresAt },
        user: toAuthUser(user),
      };
    },

    async invalidateSession(sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    },

    async invalidateUserSessions(userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
    },
  };
}

function toAuthUser(user: typeof users.$inferSelect): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    reputation: user.reputation,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}
