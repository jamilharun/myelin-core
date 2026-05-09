export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  reputation: number;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthAdapter {
  createSession(userId: string): Promise<{ token: string; session: AuthSession }>;
  validateToken(token: string): Promise<{ session: AuthSession; user: AuthUser } | null>;
  invalidateSession(sessionId: string): Promise<void>;
  invalidateUserSessions(userId: string): Promise<void>;
}
