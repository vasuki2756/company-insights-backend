// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Auth Middleware
// JWT verification, role guard, and audit logging
// ─────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import { verifyJWT, isTokenRevoked } from "../lib/auth";
import type { JWTPayload } from "../types/auth";

// ─── Types ────────────────────────────────────────────────────

/**
 * Express Request augmented with authenticated user info.
 * Available in route handlers after `requireAuth` middleware.
 */
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

// ─── Middleware ────────────────────────────────────────────────

/**
 * Middleware that requires a valid JWT for the request.
 * Extracts the token from the Authorization header (Bearer scheme)
 * or from the `token` cookie, verifies it, checks the Redis
 * blacklist, and attaches decoded payload to `req.user`.
 *
 * Returns 401 if no token is present, token is invalid, expired,
 * or has been revoked.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: "Authentication required. Please provide a valid token.",
    });
    return;
  }

  const payload = verifyJWT(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: "Invalid or expired token. Please log in again.",
    });
    return;
  }

  // Check Redis blacklist (async but non-blocking via IIFE)
  (async () => {
    const revoked = await isTokenRevoked(token);
    if (revoked) {
      res.status(401).json({
        success: false,
        error: "Token has been revoked. Please log in again.",
      });
      return;
    }

    req.user = payload;
    next();
  })().catch((err) => {
    console.error("[auth] Token verification error:", err);
    res.status(500).json({
      success: false,
      error: "Internal authentication error.",
    });
  });
}

/**
 * Middleware factory that restricts access to specific roles.
 * Must be used AFTER `requireAuth`.
 *
 * @param allowedRoles - Roles permitted to access the route
 * @returns Express middleware that checks req.user.role
 *
 * @example
 * ```typescript
 * import { requireAuth, requireRole } from "../middleware/auth";
 *
 * router.get("/admin", requireAuth, requireRole("admin"), adminHandler);
 * ```
 */
export function requireRole(...allowedRoles: Array<"student" | "recruiter" | "admin">) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role(s): ${allowedRoles.join(", ")}.`,
      });
      return;
    }

    next();
  };
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Extract JWT from Authorization header or cookies.
 * Tries the Authorization header (Bearer scheme) first,
 * then falls back to the `token` cookie.
 */
function extractToken(req: Request): string | null {
  // Check Authorization header: "Bearer <token>"
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check cookie
  const tokenCookie = req.cookies?.token;
  if (typeof tokenCookie === "string" && tokenCookie.length > 0) {
    return tokenCookie;
  }

  return null;
}
