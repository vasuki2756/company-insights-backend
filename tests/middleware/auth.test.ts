import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockVerifyJWT = vi.hoisted(() => vi.fn());
const mockIsTokenRevoked = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/auth", () => ({
  verifyJWT: mockVerifyJWT,
  isTokenRevoked: mockIsTokenRevoked,
}));

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export requireAuth and requireRole", async () => {
    const mod = await import("../../src/middleware/auth");
    expect(mod.requireAuth).toBeDefined();
    expect(mod.requireRole).toBeDefined();
  });

  describe("requireRole", () => {
    it("returns a middleware function", async () => {
      const mod = await import("../../src/middleware/auth");
      const guard = mod.requireRole("admin");
      expect(typeof guard).toBe("function");
    });

    it("returns 403 for wrong role", async () => {
      const mod = await import("../../src/middleware/auth");
      const guard = mod.requireRole("admin");
      const req = { user: { sub: "1", email: "test@test.com", role: "student" as const, iat: 0, exp: 9999999999 } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      guard(req as any, res as any, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("calls next for allowed role", async () => {
      const mod = await import("../../src/middleware/auth");
      const guard = mod.requireRole("admin");
      const req = { user: { sub: "1", email: "admin@test.com", role: "admin" as const, iat: 0, exp: 9999999999 } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      guard(req as any, res as any, next);
      expect(next).toHaveBeenCalled();
    });

    it("returns 401 when req.user is missing", async () => {
      const mod = await import("../../src/middleware/auth");
      const guard = mod.requireRole("student");
      const req = { user: undefined };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      guard(req as any, res as any, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("requireAuth", () => {
    it("returns 401 when no token is present", async () => {
      const mod = await import("../../src/middleware/auth");
      const req = { headers: {}, cookies: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mod.requireAuth(req as any, res as any, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("returns 401 when token is invalid", async () => {
      mockVerifyJWT.mockReturnValue(null);
      const mod = await import("../../src/middleware/auth");
      const req = { headers: { authorization: "Bearer badtoken" }, cookies: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mod.requireAuth(req as any, res as any, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("calls next when token is valid and not revoked", async () => {
      mockVerifyJWT.mockReturnValue({ sub: "u1", email: "a@b.com", role: "student", iat: 0, exp: 9999999999 });
      mockIsTokenRevoked.mockResolvedValue(false);
      const mod = await import("../../src/middleware/auth");
      const req = { headers: { authorization: "Bearer validtoken" }, cookies: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mod.requireAuth(req as any, res as any, next);
      await new Promise(process.nextTick);
      expect(next).toHaveBeenCalled();
      expect((req as any).user).toBeDefined();
    });

    it("returns 401 when token is revoked", async () => {
      mockVerifyJWT.mockReturnValue({ sub: "u1", email: "a@b.com", role: "student", iat: 0, exp: 9999999999 });
      mockIsTokenRevoked.mockResolvedValue(true);
      const mod = await import("../../src/middleware/auth");
      const req = { headers: { authorization: "Bearer revokedtoken" }, cookies: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mod.requireAuth(req as any, res as any, next);
      await new Promise(process.nextTick);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("extracts token from cookie when no auth header", async () => {
      mockVerifyJWT.mockReturnValue({ sub: "u1", email: "a@b.com", role: "student", iat: 0, exp: 9999999999 });
      mockIsTokenRevoked.mockResolvedValue(false);
      const mod = await import("../../src/middleware/auth");
      const req = { headers: {}, cookies: { token: "cookie-token" } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mod.requireAuth(req as any, res as any, next);
      await new Promise(process.nextTick);
      expect(next).toHaveBeenCalled();
    });

    it("returns 500 when async check throws", async () => {
      mockVerifyJWT.mockReturnValue({ sub: "u1", email: "a@b.com", role: "student", iat: 0, exp: 9999999999 });
      mockIsTokenRevoked.mockRejectedValue(new Error("Unexpected error"));
      const mod = await import("../../src/middleware/auth");
      const req = { headers: { authorization: "Bearer validtoken" }, cookies: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mod.requireAuth(req as any, res as any, next);
      await new Promise(process.nextTick);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
