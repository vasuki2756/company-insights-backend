import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockBcryptHash = vi.hoisted(() => vi.fn());
const mockBcryptCompare = vi.hoisted(() => vi.fn());
const mockJwtSign = vi.hoisted(() => vi.fn());
const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());
const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("bcryptjs", () => ({
  default: {
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
  },
  hash: mockBcryptHash,
  compare: mockBcryptCompare,
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: mockJwtSign,
    verify: mockJwtVerify,
  },
  sign: mockJwtSign,
  verify: mockJwtVerify,
}));

vi.mock("../../../src/lib/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

describe("lib/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JWT_SECRET", "test-secret-key");
    mockRedisGet.mockResolvedValue(null);
    mockGetRedisClient.mockResolvedValue({
      get: mockRedisGet,
      set: mockRedisSet,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should export all expected functions", async () => {
    const mod = await import("../../../src/lib/auth");
    expect(mod.hashPassword).toBeDefined();
    expect(mod.verifyPassword).toBeDefined();
    expect(mod.generateJWT).toBeDefined();
    expect(mod.verifyJWT).toBeDefined();
    expect(mod.revokeToken).toBeDefined();
    expect(mod.isTokenRevoked).toBeDefined();
    expect(mod.sanitizeUser).toBeDefined();
  });

  describe("hashPassword", () => {
    it("returns a hash for valid password", async () => {
      mockBcryptHash.mockResolvedValue("hashed_password");
      const mod = await import("../../../src/lib/auth");
      const result = await mod.hashPassword("mypassword");
      expect(result).toBe("hashed_password");
      expect(mockBcryptHash).toHaveBeenCalledWith("mypassword", 12);
    });

    it("throws for empty password", async () => {
      const mod = await import("../../../src/lib/auth");
      await expect(mod.hashPassword("")).rejects.toThrow("Password cannot be empty");
    });
  });

  describe("verifyPassword", () => {
    it("returns true for matching password", async () => {
      mockBcryptCompare.mockResolvedValue(true);
      const mod = await import("../../../src/lib/auth");
      const result = await mod.verifyPassword("pass", "hash");
      expect(result).toBe(true);
    });

    it("returns false for non-matching password", async () => {
      mockBcryptCompare.mockResolvedValue(false);
      const mod = await import("../../../src/lib/auth");
      const result = await mod.verifyPassword("wrong", "hash");
      expect(result).toBe(false);
    });
  });

  describe("generateJWT", () => {
    it("returns a signed token", async () => {
      mockJwtSign.mockReturnValue("signed-jwt-token");
      const mod = await import("../../../src/lib/auth");
      const token = mod.generateJWT("user-1", "test@test.com", "student");
      expect(token).toBe("signed-jwt-token");
      expect(mockJwtSign).toHaveBeenCalledWith(
        { sub: "user-1", email: "test@test.com", role: "student" },
        "test-secret-key",
        { algorithm: "HS256", expiresIn: "24h" },
      );
    });
  });

  describe("verifyJWT", () => {
    it("returns payload for valid token", async () => {
      mockJwtVerify.mockReturnValue({
        sub: "user-1",
        email: "test@test.com",
        role: "student",
        iat: 1000,
        exp: 2000,
      });
      const mod = await import("../../../src/lib/auth");
      const result = mod.verifyJWT("valid-token");
      expect(result).toEqual({
        sub: "user-1",
        email: "test@test.com",
        role: "student",
        iat: 1000,
        exp: 2000,
      });
    });

    it("returns null for invalid token", async () => {
      mockJwtVerify.mockImplementation(() => { throw new Error("jwt malformed"); });
      const mod = await import("../../../src/lib/auth");
      const result = mod.verifyJWT("bad-token");
      expect(result).toBeNull();
    });

    it("returns null when decoded payload lacks required fields", async () => {
      mockJwtVerify.mockReturnValue({ sub: "user-1" });
      const mod = await import("../../../src/lib/auth");
      const result = mod.verifyJWT("incomplete-token");
      expect(result).toBeNull();
    });
  });

  describe("revokeToken", () => {
    it("sets the token in redis blacklist", async () => {
      const mod = await import("../../../src/lib/auth");
      await mod.revokeToken("some-token");
      expect(mockRedisSet).toHaveBeenCalledWith(
        "blacklist:some-token",
        "true",
        { EX: 86400 },
      );
    });

    it("throws when redis fails", async () => {
      mockGetRedisClient.mockRejectedValue(new Error("Redis down"));
      const mod = await import("../../../src/lib/auth");
      await expect(mod.revokeToken("token")).rejects.toThrow("Failed to revoke token");
    });
  });

  describe("isTokenRevoked", () => {
    it("returns true when token is blacklisted", async () => {
      mockRedisGet.mockResolvedValue("true");
      const mod = await import("../../../src/lib/auth");
      const result = await mod.isTokenRevoked("revoked-token");
      expect(result).toBe(true);
    });

    it("returns false when token is not blacklisted", async () => {
      mockRedisGet.mockResolvedValue(null);
      const mod = await import("../../../src/lib/auth");
      const result = await mod.isTokenRevoked("valid-token");
      expect(result).toBe(false);
    });

    it("returns false (fail-open) when redis is down", async () => {
      mockGetRedisClient.mockRejectedValue(new Error("Redis down"));
      const mod = await import("../../../src/lib/auth");
      const result = await mod.isTokenRevoked("token");
      expect(result).toBe(false);
    });
  });

  describe("sanitizeUser", () => {
    it("removes passwordHash and formats dates", async () => {
      const mod = await import("../../../src/lib/auth");
      const user = {
        userId: "u1",
        email: "a@b.com",
        name: "Alice",
        role: "student" as const,
        profileData: { cgpa: 8.5 },
        lastLogin: new Date("2025-06-01"),
        createdAt: new Date("2024-01-01"),
      };
      const safe = mod.sanitizeUser(user);
      expect(safe.id).toBe("u1");
      expect(safe.email).toBe("a@b.com");
      expect(safe.name).toBe("Alice");
      expect(safe.role).toBe("student");
      expect(safe.profileData).toEqual({ cgpa: 8.5 });
      expect(safe.lastLogin).toBe("2025-06-01T00:00:00.000Z");
      expect(safe.createdAt).toBe("2024-01-01T00:00:00.000Z");
    });
  });
});
