import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import adminRoutes from "../../../src/routes/admin";
import { db } from "../../../src/lib/db";
import { getRedisClient } from "../../../src/lib/redis";
import { checkOllamaHealth } from "../../../src/lib/ollama";
import { rebuildEmbeddings } from "../../../src/services/embeddingService";

vi.mock("../../../src/middleware/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/middleware/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn((req: any, _res: any, next: any) => {
      req.user = { sub: "admin-id", email: "admin@test.com", role: "admin" as const, iat: 0, exp: 9999999999 };
      next();
    }),
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { requireAuth } = await import("../../../src/middleware/auth");
  vi.mocked(requireAuth).mockImplementation((req: any, _res: any, next: any) => {
    req.user = { sub: "admin-id", email: "admin@test.com", role: "admin" as const, iat: 0, exp: 9999999999 };
    next();
  });
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin", adminRoutes);
  return app;
}

describe("GET /api/v1/admin/stats", () => {
  it("returns stats successfully", async () => {
    vi.mocked(db.user.count).mockResolvedValue(10);
    vi.mocked(db.company.count).mockResolvedValue(5);
    vi.mocked(db.skill_set_master.count).mockResolvedValue(100);
    vi.mocked(db.auditLog.findMany).mockResolvedValue([
      { id: 1, userId: "u1", action: "login", resource: "auth", resourceId: null, details: null, ipAddress: null, createdAt: new Date("2025-01-01"), user: { name: "Alice", email: "alice@test.com" } } as any,
    ]);
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    const redis = await getRedisClient();
    vi.mocked(redis.ping).mockResolvedValue("PONG");

    const res = await request(createApp()).get("/api/v1/admin/stats");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users).toBe(10);
    expect(res.body.data.companies).toBe(5);
    expect(res.body.data.skills).toBe(100);
    expect(res.body.data.health.database).toBe(true);
    expect(res.body.data.health.redis).toBe(true);
    expect(res.body.data.health.ollama).toBe(true);
    expect(res.body.data.recentActivity).toHaveLength(1);
  });

  it("returns 500 on db error", async () => {
    vi.mocked(db.user.count).mockRejectedValue(new Error("DB down"));

    const res = await request(createApp()).get("/api/v1/admin/stats");

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Failed to get admin stats");
  });
});

describe("GET /api/v1/admin/audit-logs", () => {
  it("returns audit logs with default pagination", async () => {
    const mockLogs = [
      { id: 1, userId: "u1", action: "login", resource: "auth", resourceId: null, details: null, ipAddress: "127.0.0.1", createdAt: new Date("2025-01-01"), user: { name: "Alice", email: "alice@test.com" } } as any,
    ];
    vi.mocked(db.auditLog.findMany).mockResolvedValue(mockLogs);
    vi.mocked(db.auditLog.count).mockResolvedValue(1);

    const res = await request(createApp()).get("/api/v1/admin/audit-logs");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logs).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
  });

  it("filters by userId and action query params", async () => {
    vi.mocked(db.auditLog.findMany).mockResolvedValue([]);
    vi.mocked(db.auditLog.count).mockResolvedValue(0);

    const res = await request(createApp()).get("/api/v1/admin/audit-logs?userId=u1&action=login");

    expect(res.status).toBe(200);
    expect(db.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", action: "login" }),
      }),
    );
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.auditLog.findMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/admin/audit-logs");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get audit logs");
  });
});

describe("POST /api/v1/admin/embeddings/rebuild", () => {
  it("queues rebuild and returns 200", async () => {
    vi.mocked(rebuildEmbeddings).mockResolvedValue(undefined);

    const res = await request(createApp()).post("/api/v1/admin/embeddings/rebuild");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("queued");
  });
});

describe("GET /api/v1/admin/embeddings/status", () => {
  it("returns embedding status", async () => {
    vi.mocked(db.embedding.count).mockResolvedValue(60);
    vi.mocked(db.company.count).mockResolvedValue(5);

    const res = await request(createApp()).get("/api/v1/admin/embeddings/status");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("100%");
  });

  it("returns idle when no companies have json", async () => {
    vi.mocked(db.embedding.count).mockResolvedValue(0);
    vi.mocked(db.company.count).mockResolvedValue(0);

    const res = await request(createApp()).get("/api/v1/admin/embeddings/status");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("idle");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.embedding.count).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/admin/embeddings/status");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to check embedding status");
  });
});

describe("POST /api/v1/admin/backup", () => {
  it("creates a backup record", async () => {
    const res = await request(createApp()).post("/api/v1/admin/backup");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.backupId).toBeDefined();
    expect(res.body.data.timestamp).toBeDefined();
  });
});

describe("GET /api/v1/admin/performance", () => {
  it("returns performance metrics", async () => {
    vi.mocked(db.user.count).mockResolvedValue(10);

    const res = await request(createApp()).get("/api/v1/admin/performance");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avgResponseTime).toBeGreaterThanOrEqual(0);
    expect(res.body.data.cacheHitRate).toBe(0.85);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.user.count).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/admin/performance");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get performance metrics");
  });
});

describe("POST /api/v1/admin/users/:userId/impersonate", () => {
  it("impersonates a user successfully", async () => {
    process.env.JWT_SECRET = "test-secret";
    vi.mocked(db.user.findUnique).mockResolvedValue({
      userId: "target-id", email: "target@test.com", role: "student",
    } as any);
    vi.mocked(db.auditLog.create).mockResolvedValue({ id: 1 } as any);

    const res = await request(createApp()).post("/api/v1/admin/users/target-id/impersonate");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.userId).toBe("target-id");
  });

  it("returns 404 for missing user", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    const res = await request(createApp()).post("/api/v1/admin/users/target-id/impersonate");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.user.findUnique).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).post("/api/v1/admin/users/target-id/impersonate");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to impersonate user");
  });
});

describe("Auth Guard - 401 without auth", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAuth } = await import("../../../src/middleware/auth");
    vi.mocked(requireAuth).mockImplementation((_req: any, res: any, _next: any) => {
      res.status(401).json({ success: false, error: "Authentication required. Please provide a valid token." });
    });
  });

  it("GET /stats returns 401 without auth", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/stats");
    expect(res.status).toBe(401);
  });
});

describe("Auth Guard - 403 for non-admin", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAuth } = await import("../../../src/middleware/auth");
    vi.mocked(requireAuth).mockImplementation((req: any, _res: any, next: any) => {
      req.user = { sub: "user-id", email: "user@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
      next();
    });
  });

  it("GET /stats returns 403 for non-admin users", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/stats");
    expect(res.status).toBe(403);
  });
});
