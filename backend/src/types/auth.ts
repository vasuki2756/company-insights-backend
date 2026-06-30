// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Auth Types
// ─────────────────────────────────────────────────────────────

/** JWT payload structure embedded in every access token. */
export interface JWTPayload {
  /** User ID (UUID) */
  sub: string;

  /** User email */
  email: string;

  /** User role */
  role: "student" | "recruiter" | "admin";

  /** Issued-at timestamp (epoch seconds) */
  iat: number;

  /** Expiration timestamp (epoch seconds) */
  exp: number;
}

/** Safe user object returned to clients (never contains passwordHash). */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: "student" | "recruiter" | "admin";
  profileData: Record<string, unknown> | null;
  lastLogin: string | null;
  createdAt: string;
}

/** POST /api/v1/auth/register request body. */
export interface RegisterBody {
  email: string;
  password: string;
  name: string;
  role?: "student" | "recruiter";
}

/** POST /api/v1/auth/login request body. */
export interface LoginBody {
  email: string;
  password: string;
}

/** POST /api/v1/auth/change-password request body. */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/** Standard API response envelope. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Auth response returned on login/register. */
export interface AuthResponse {
  user: SafeUser;
  token: string;
}

/** Zod validation error shape. */
export interface ValidationError {
  field: string;
  message: string;
}
