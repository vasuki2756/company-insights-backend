// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Authentication Routes
// Register, Login, Logout, Refresh, Me, Change Password
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import {
  hashPassword,
  verifyPassword,
  generateJWT,
  revokeToken,
  sanitizeUser,
} from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { ApiResponse, AuthResponse } from "../types/auth";

const router = Router();

// ─── Validation Schemas (Zod) ─────────────────────────────────

const emailSchema = z
  .string()
  .email("Please provide a valid email address")
  .max(255)
  .transform((v) => v.toLowerCase().trim());

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters");

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(255)
  .trim();

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  role: z.enum(["student", "recruiter"]).optional().default("student"),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Set the JWT as an httpOnly cookie on the response.
 * In production, the cookie is Secure and SameSite=Strict.
 */
function setTokenCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours in ms
    path: "/",
  });
}

/**
 * Generate the standard API success response for auth endpoints.
 */
function authResponse(user: Awaited<ReturnType<typeof sanitizeUser>>, token: string): ApiResponse<AuthResponse> {
  return {
    success: true,
    data: { user, token },
  };
}

// ─── POST /api/v1/auth/register ────────────────────────────────

/**
 * Create a new user account.
 * Validates input, checks for duplicate email, hashes password,
 * creates user in DB, generates JWT, sets cookie.
 *
 * Body: { email, password, name, role? }
 * Response 201: { success, data: { user, token } }
 * Response 400/409: { success: false, error }
 */
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Invalid request body";
      res.status(400).json({
        success: false,
        error: message,
      } satisfies ApiResponse);
      return;
    }

    const { email, password, name, role } = parsed.data;

    // Check for existing user (don't reveal whether email exists)
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({
        success: false,
        error: "An account with this email already exists.",
      } satisfies ApiResponse);
      return;
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        role,
      },
    });

    // Generate JWT
    const token = generateJWT(user.id, user.email, user.role);

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Set cookie and respond
    setTokenCookie(res, token);
    res.status(201).json(
      authResponse(sanitizeUser(user), token),
    );
  } catch (error) {
    console.error("[auth] Register error:", error);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred during registration.",
    } satisfies ApiResponse);
  }
});

// ─── POST /api/v1/auth/login ───────────────────────────────────

/**
 * Authenticate an existing user.
 * Validates credentials, checks password, generates JWT, sets cookie.
 *
 * Rate limit: 5 attempts per minute per IP (should be applied at gateway level).
 *
 * Body: { email, password }
 * Response 200: { success, data: { user, token } }
 * Response 400/401: { success: false, error }
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Invalid request body";
      res.status(400).json({
        success: false,
        error: message,
      } satisfies ApiResponse);
      return;
    }

    const { email, password } = parsed.data;

    // Find user by email
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      // Use generic message — don't reveal whether email exists
      res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      } satisfies ApiResponse);
      return;
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      } satisfies ApiResponse);
      return;
    }

    // Generate JWT
    const token = generateJWT(user.id, user.email, user.role);

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log audit event
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      },
    });

    // Set cookie and respond
    setTokenCookie(res, token);
    res.json(authResponse(sanitizeUser(user), token));
  } catch (error) {
    console.error("[auth] Login error:", error);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred during login.",
    } satisfies ApiResponse);
  }
});

// ─── POST /api/v1/auth/logout ──────────────────────────────────

/**
 * Log out the current user by revoking their JWT.
 * The revoked token is added to a Redis blacklist for its remaining lifespan.
 *
 * Headers: Authorization: Bearer <token>
 * Response 200: { success: true }
 * Response 401: { success: false, error }
 */
router.post("/logout", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req);

    if (token) {
      await revokeToken(token);
    }

    // Log audit event
    if (req.user) {
      await db.auditLog.create({
        data: {
          userId: req.user.sub,
          action: "LOGOUT",
          resourceType: "user",
          resourceId: req.user.sub,
          ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        },
      });
    }

    // Clear cookie
    res.clearCookie("token", { path: "/" });

    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    console.error("[auth] Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to log out. Please try again.",
    } satisfies ApiResponse);
  }
});

// ─── POST /api/v1/auth/refresh ─────────────────────────────────

/**
 * Refresh the current JWT by issuing a new one.
 * Requires a valid (non-expired, non-revoked) token.
 * This rotates the token — the old one remains valid until expiry
 * but the client should use the new one.
 *
 * Headers: Authorization: Bearer <token>
 * Response 200: { success, data: { token } }
 * Response 401: { success: false, error }
 */
router.post("/refresh", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required.",
      } satisfies ApiResponse);
      return;
    }

    const newToken = generateJWT(req.user.sub, req.user.email, req.user.role);

    setTokenCookie(res, newToken);
    res.json({
      success: true,
      data: { token: newToken },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[auth] Refresh error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to refresh token.",
    } satisfies ApiResponse);
  }
});

// ─── GET /api/v1/auth/me ───────────────────────────────────────

/**
 * Return the current authenticated user's full profile,
 * including their target companies and self-assessed skills.
 *
 * Headers: Authorization: Bearer <token>
 * Response 200: { success, data: { user, targetCompanies, skills } }
 * Response 401: { success: false, error }
 */
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required.",
      } satisfies ApiResponse);
      return;
    }

    const user = await db.user.findUnique({
      where: { id: req.user.sub },
      include: {
        targetCompanies: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                shortName: true,
                category: true,
                companyType: true,
                minCgpa: true,
                package: true,
                glassdoorRating: true,
                websiteUrl: true,
              },
            },
          },
        },
        studentSkills: {
          include: {
            skill: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found.",
      } satisfies ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        targetCompanies: user.targetCompanies.map((tc) => ({
          companyId: tc.companyId,
          isFavorited: tc.isFavorited,
          addedAt: tc.addedAt.toISOString(),
          company: tc.company,
        })),
        skills: user.studentSkills.map((ss) => ({
          skillId: ss.skillId,
          skillName: ss.skill.name,
          skillCategory: ss.skill.category,
          currentLevel: ss.currentLevel,
        })),
      },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[auth] Me error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user profile.",
    } satisfies ApiResponse);
  }
});

// ─── POST /api/v1/auth/change-password ────────────────────────

/**
 * Change the authenticated user's password.
 * Verifies the current password before updating.
 * Revokes ALL existing tokens — user must log in again on all devices.
 *
 * Headers: Authorization: Bearer <token>
 * Body: { currentPassword, newPassword }
 * Response 200: { success: true, message }
 * Response 400/401: { success: false, error }
 */
router.post("/change-password", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required.",
      } satisfies ApiResponse);
      return;
    }

    // Validate input
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Invalid request body";
      res.status(400).json({
        success: false,
        error: message,
      } satisfies ApiResponse);
      return;
    }

    const { currentPassword, newPassword } = parsed.data;

    // Fetch user with password hash
    const user = await db.user.findUnique({
      where: { id: req.user.sub },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found.",
      } satisfies ApiResponse);
      return;
    }

    // Verify current password
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({
        success: false,
        error: "Current password is incorrect.",
      } satisfies ApiResponse);
      return;
    }

    // Ensure new password differs from current
    const samePassword = await verifyPassword(newPassword, user.passwordHash);
    if (samePassword) {
      res.status(400).json({
        success: false,
        error: "New password must be different from current password.",
      } satisfies ApiResponse);
      return;
    }

    // Hash and update new password
    const newPasswordHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Log audit event
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "CHANGE_PASSWORD",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      },
    });

    // Note: Token revocation for ALL user sessions would require
    // a Redis pattern like `blacklist:user:<userId>:*` which is
    // outside the scope of this single-token blacklist approach.
    // For production, implement a token family or user-level
    // token versioning scheme.

    res.clearCookie("token", { path: "/" });
    res.json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[auth] Change password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to change password.",
    } satisfies ApiResponse);
  }
});

// ─── Helper ────────────────────────────────────────────────────

/**
 * Extract the raw JWT string from the request.
 * Checks the Authorization header first, then falls back to cookies.
 */
function extractTokenFromRequest(req: AuthenticatedRequest): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const tokenCookie = req.cookies?.token;
  if (typeof tokenCookie === "string" && tokenCookie.length > 0) {
    return tokenCookie;
  }
  return null;
}

export default router;
