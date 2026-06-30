// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Authentication Library
// Password hashing, JWT generation/verification, token revocation
// ─────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { JWTPayload } from "../types/auth";
import { getRedisClient } from "./redis";

// ─── Constants ────────────────────────────────────────────────

const BCRYPT_SALT_ROUNDS = 12;
const JWT_ALGORITHM = "HS256";
const JWT_EXPIRY = "24h";
const JWT_EXPIRY_SECONDS = 24 * 60 * 60; // Used for Redis TTL

// ─── Helpers ──────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

/** Token Redis key prefix for blacklist entries. */
const BLACKLIST_PREFIX = "blacklist:";

// ─── Exports ──────────────────────────────────────────────────

/**
 * Hash a plain-text password using bcryptjs.
 * @param password - Plain-text password (min 8 chars recommended)
 * @returns Promise resolving to the bcrypt hash string
 * @throws If password is empty
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 1) {
    throw new Error("Password cannot be empty");
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a plain-text password against a bcrypt hash.
 * @param password - Plain-text password to check
 * @param hash - Stored bcrypt hash
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JWT access token.
 * Token expires in 24 hours and includes user identity claims.
 * @param userId - UUID of the authenticated user
 * @param email - User's email address
 * @param role - User's role (student | recruiter | admin)
 * @returns Signed JWT string
 */
export function generateJWT(
  userId: string,
  email: string,
  role: "student" | "recruiter" | "admin",
): string {
  const payload: Omit<JWTPayload, "iat" | "exp"> = {
    sub: userId,
    email,
    role,
  };

  return jwt.sign(payload, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRY,
  });
}

/**
 * Verify and decode a JWT token.
 * Checks signature, expiration, and checks Redis blacklist.
 * @param token - JWT string to verify
 * @returns Decoded JWTPayload if valid, null otherwise
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload;

    if (!decoded.sub || !decoded.email || !decoded.role) {
      return null;
    }

    return {
      sub: decoded.sub,
      email: decoded.email as string,
      role: decoded.role as "student" | "recruiter" | "admin",
      iat: decoded.iat ?? 0,
      exp: decoded.exp ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Add a JWT to the Redis blacklist so it can no longer be used.
 * The blacklist entry auto-expires when the token would have expired.
 * @param token - JWT to revoke
 * @param expirySeconds - TTL in seconds (default: 24h)
 */
export async function revokeToken(
  token: string,
  expirySeconds: number = JWT_EXPIRY_SECONDS,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const key = `${BLACKLIST_PREFIX}${token}`;
    await redis.set(key, "true", { EX: expirySeconds });
  } catch (error) {
    console.error("[auth] Failed to revoke token:", error);
    throw new Error("Failed to revoke token. Please try again.");
  }
}

/**
 * Check whether a JWT has been revoked (blacklisted).
 * @param token - JWT to check
 * @returns true if token is blacklisted (revoked)
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const key = `${BLACKLIST_PREFIX}${token}`;
    const result = await redis.get(key);
    return result === "true";
  } catch (error) {
    console.error("[auth] Failed to check token revocation:", error);
    // If Redis is down, allow the request through (fail-open)
    // This avoids a hard dependency on Redis for auth
    return false;
  }
}

/**
 * Sanitize a user record by removing the password hash.
 * Returns a safe object suitable for API responses.
 */
export function sanitizeUser(user: {
  id: string;
  email: string;
  name: string;
  role: "student" | "recruiter" | "admin";
  profileData: unknown;
  lastLogin: Date | null;
  createdAt: Date;
}): import("../types/auth").SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    profileData: (user.profileData ?? null) as Record<string, unknown> | null,
    lastLogin: user.lastLogin?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
