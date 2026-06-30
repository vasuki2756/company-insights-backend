import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import healthRoutes from "../../../src/routes/health";
import { db } from "../../../src/lib/db";
import { getRedisClient } from "../../../src/lib/redis";
import { checkOllamaHealth } from "../../../src/lib/ollama";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/health", healthRoutes);
  return app;
}

describe("GET /api/v1/health", () => {
  const app = createApp();

  it("returns status ok with timestamp and uptime", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeGreaterThan(0);
  });
});

describe("GET /api/v1/health/detailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when all services are healthy", async () => {
    vi.mocked(db.$queryRaw).mockResolvedValue([{ "1": 1 }]);
    vi.mocked(getRedisClient).mockResolvedValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    } as any);
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);

    const app = createApp();
    const res = await request(app).get("/api/v1/health/detailed");

    expect(res.status).toBe(200);
    expect(res.body.database).toBe(true);
    expect(res.body.redis).toBe(true);
    expect(res.body.ollama).toBe(true);
    expect(res.body.timestamp).toBeDefined();
  });

  it("returns 503 when database is down", async () => {
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("DB down"));
    vi.mocked(getRedisClient).mockResolvedValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    } as any);
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);

    const app = createApp();
    const res = await request(app).get("/api/v1/health/detailed");

    expect(res.status).toBe(503);
    expect(res.body.database).toBe(false);
    expect(res.body.redis).toBe(true);
    expect(res.body.ollama).toBe(true);
  });
});
