import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/auth", () => ({
  verifyJWT: vi.fn(),
  isTokenRevoked: vi.fn().mockResolvedValue(false),
}));

describe("Auth Middleware", () => {
  it("should export requireAuth and requireRole", async () => {
    const mod = await import("../../src/middleware/auth");
    expect(mod.requireAuth).toBeDefined();
    expect(mod.requireRole).toBeDefined();
  });

  it("requireRole should return a middleware function", async () => {
    const mod = await import("../../src/middleware/auth");
    const guard = mod.requireRole("admin");
    expect(typeof guard).toBe("function");
  });

  it("requireRole should return 403 for wrong role", async () => {
    const mod = await import("../../src/middleware/auth");
    const guard = mod.requireRole("admin");

    const req = { user: { sub: "1", email: "test@test.com", role: "student" as const, iat: 0, exp: 9999999999 } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    guard(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
