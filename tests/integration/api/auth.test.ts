import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import authRoutes from "../../../src/routes/auth";
import { db } from "../../../src/lib/db";

vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: vi.fn((_req: any, res: any, next: any) => {
    next();
  }),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  AuthenticatedRequest: Object,
}));

vi.mock("../../../src/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/auth")>();
  return {
    ...actual,
    hashPassword: vi.fn().mockImplementation((pw: string) => Promise.resolve(`hashed_${pw}`)),
    verifyPassword: vi.fn().mockImplementation((pw: string, hash: string) => Promise.resolve(hash === `hashed_${pw}`)),
    generateJWT: vi.fn().mockReturnValue("test-jwt-token"),
    revokeToken: vi.fn().mockResolvedValue(undefined),
  };
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  return app;
}

const mockUser = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  email: "test@example.com",
  name: "Test User",
  passwordHash: "hashed_password123",
  role: "student" as const,
  profileData: null,
  lastLogin: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a new user successfully", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    vi.mocked(db.user.create).mockResolvedValue(mockUser);

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@example.com", password: "password123", name: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("test@example.com");
    expect(res.body.data.token).toBeDefined();
  });

  it("returns 409 for duplicate email", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@example.com", password: "password123", name: "Test User" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it("returns 400 for invalid email", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "password123", name: "Test User" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for short password", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@example.com", password: "short", name: "Test User" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for missing name", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in with valid credentials", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(db.auditLog.create).mockResolvedValue({ id: 1 } as any);

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("test@example.com");
  });

  it("returns 401 for wrong password", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/);
  });

  it("returns 401 for non-existent email", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nonexistent@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/);
  });

  it("returns 400 for missing password", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user profile when authenticated", async () => {
    const { requireAuth } = await import("../../../src/middleware/auth");
    vi.mocked(requireAuth).mockImplementation((req: any, _res: any, next: any) => {
      req.user = { sub: mockUser.userId, email: mockUser.email, role: mockUser.role, iat: 0, exp: 9999999999 };
      next();
    });

    vi.mocked(db.user.findUnique).mockResolvedValue({
      ...mockUser,
      studentTargets: [],
      studentSkills: [],
    });

    const app = createApp();
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("test@example.com");
    expect(res.body.data.targetCompanies).toEqual([]);
    expect(res.body.data.skills).toEqual([]);
  });

  it("returns 401 when no token is provided", async () => {
    const { requireAuth } = await import("../../../src/middleware/auth");
    vi.mocked(requireAuth).mockImplementation((_req: any, res: any, _next: any) => {
      res.status(401).json({ success: false, error: "Authentication required. Please provide a valid token." });
    });

    const app = createApp();
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/);
  });
});
