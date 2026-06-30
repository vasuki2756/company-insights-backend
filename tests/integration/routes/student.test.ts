import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import studentRoutes from "../../../src/routes/student";
import { db } from "../../../src/lib/db";
import { getRedisClient } from "../../../src/lib/redis";

let resetAuth: () => void;

vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: vi.fn((req: any, _res: any, next: any) => {
    req.user = { sub: "student-id", email: "student@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
    next();
  }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const { requireAuth } = await import("../../../src/middleware/auth");
  vi.mocked(requireAuth).mockImplementation((req: any, _res: any, next: any) => {
    req.user = { sub: "student-id", email: "student@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
    next();
  });
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/student", studentRoutes);
  return app;
}

describe("GET /api/v1/student/dashboard", () => {
  it("returns cached dashboard when redis has it", async () => {
    const redis = await getRedisClient();
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ stats: { daysUntilPlacement: 120 }, recommendations: [], targets: [] }));

    const res = await request(createApp()).get("/api/v1/student/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stats.daysUntilPlacement).toBe(120);
  });

  it("builds dashboard from db when cache is empty", async () => {
    const redis = await getRedisClient();
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      userId: "student-id", profileData: null,
    } as any);
    vi.mocked(db.company.count).mockResolvedValue(50);
    vi.mocked(db.studentTarget.findMany).mockResolvedValue([
      { companyId: 1, createdAt: new Date("2025-01-01"), company: { company_id: 1, name: "Google", category: "Tech" } },
    ] as any);
    vi.mocked(db.studentSkill.findMany).mockResolvedValue([]);
    vi.mocked(db.company_skill_levels.count).mockResolvedValue(200);
    vi.mocked(db.company_skill_levels.findMany).mockResolvedValue([]);

    const res = await request(createApp()).get("/api/v1/student/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalCompanies).toBe(50);
    expect(res.body.data.recommendations).toHaveLength(1);
    expect(res.body.data.targets).toHaveLength(1);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.user.findUnique).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/student/dashboard");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to load dashboard");
  });
});

describe("GET /api/v1/student/recommendations", () => {
  it("returns recommendations for student users", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      userId: "student-id", role: "student", profileData: { cgpa: 8.5 },
    } as any);
    vi.mocked(db.studentSkill.findMany).mockResolvedValue([
      { skillSetId: 1, proficiencyLevel: 8 },
    ] as any);
    vi.mocked(db.company.findMany).mockResolvedValue([
      { company_id: 1, name: "Google", category: "Tech", companyType: "MNC", package: "30L", minCgpa: 7.0, glassdoorRating: 4.5, selectionRate: "10", company_skill_levels: [] },
    ] as any);

    const res = await request(createApp()).get("/api/v1/student/recommendations");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.companies).toHaveLength(1);
    expect(res.body.data.companies[0].name).toBe("Google");
  });

  it("returns 400 for non-student users", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      userId: "recruiter-id", role: "recruiter",
    } as any);

    const res = await request(createApp()).get("/api/v1/student/recommendations");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only students can get recommendations");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.user.findUnique).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/student/recommendations");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get recommendations");
  });
});

describe("POST /api/v1/student/targets", () => {
  it("adds a target company", async () => {
    vi.mocked(db.company.findUnique).mockResolvedValue({
      company_id: 1, name: "Google",
    } as any);
    vi.mocked(db.studentTarget.findFirst).mockResolvedValue(null);
    vi.mocked(db.studentTarget.create).mockResolvedValue({} as any);

    const res = await request(createApp())
      .post("/api/v1/student/targets")
      .send({ companyId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("does not duplicate existing targets", async () => {
    vi.mocked(db.company.findUnique).mockResolvedValue({
      company_id: 1, name: "Google",
    } as any);
    vi.mocked(db.studentTarget.findFirst).mockResolvedValue({
      userId: "student-id", companyId: 1,
    } as any);

    const res = await request(createApp())
      .post("/api/v1/student/targets")
      .send({ companyId: 1 });

    expect(res.status).toBe(200);
    expect(db.studentTarget.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const res = await request(createApp())
      .post("/api/v1/student/targets")
      .send({ companyId: "abc" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for missing company", async () => {
    vi.mocked(db.company.findUnique).mockResolvedValue(null);

    const res = await request(createApp())
      .post("/api/v1/student/targets")
      .send({ companyId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Company not found");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.company.findUnique).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp())
      .post("/api/v1/student/targets")
      .send({ companyId: 1 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to add target company");
  });
});

describe("GET /api/v1/student/targets", () => {
  it("returns target companies", async () => {
    vi.mocked(db.studentTarget.findMany).mockResolvedValue([
      { companyId: 1, createdAt: new Date("2025-01-01"), company: { company_id: 1, name: "Google", category: "Tech", companyType: "MNC", package: "30L", minCgpa: 7.0, glassdoorRating: "4.5", headquarters: "Mountain View" } },
    ] as any);

    const res = await request(createApp()).get("/api/v1/student/targets");

    expect(res.status).toBe(200);
    expect(res.body.data.companies).toHaveLength(1);
    expect(res.body.data.count).toBe(1);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentTarget.findMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/student/targets");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get target companies");
  });
});

describe("DELETE /api/v1/student/targets/:companyId", () => {
  it("removes a target company", async () => {
    vi.mocked(db.studentTarget.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await request(createApp()).delete("/api/v1/student/targets/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 for invalid company ID", async () => {
    const res = await request(createApp()).delete("/api/v1/student/targets/abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid company ID");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentTarget.deleteMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).delete("/api/v1/student/targets/1");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to remove target company");
  });
});

describe("POST /api/v1/student/favorites", () => {
  it("adds a favorite company", async () => {
    vi.mocked(db.studentTarget.findFirst).mockResolvedValue(null);
    vi.mocked(db.studentTarget.create).mockResolvedValue({} as any);

    const res = await request(createApp())
      .post("/api/v1/student/favorites")
      .send({ companyId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 for invalid body", async () => {
    const res = await request(createApp())
      .post("/api/v1/student/favorites")
      .send({ companyId: -1 });

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentTarget.findFirst).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp())
      .post("/api/v1/student/favorites")
      .send({ companyId: 1 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to add favorite");
  });
});

describe("GET /api/v1/student/favorites", () => {
  it("returns favorites list", async () => {
    vi.mocked(db.studentTarget.findMany).mockResolvedValue([
      { companyId: 1, createdAt: new Date("2025-01-01"), company: { company_id: 1, name: "Microsoft", category: "Tech", package: "25L", minCgpa: 7.5, glassdoorRating: "4.3", headquarters: "Redmond" } },
    ] as any);

    const res = await request(createApp()).get("/api/v1/student/favorites");

    expect(res.status).toBe(200);
    expect(res.body.data.companies).toHaveLength(1);
    expect(res.body.data.count).toBe(1);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentTarget.findMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/student/favorites");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get favorites");
  });
});

describe("DELETE /api/v1/student/favorites/:companyId", () => {
  it("removes a favorite", async () => {
    vi.mocked(db.studentTarget.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await request(createApp()).delete("/api/v1/student/favorites/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 for invalid company ID", async () => {
    const res = await request(createApp()).delete("/api/v1/student/favorites/0");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid company ID");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentTarget.deleteMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).delete("/api/v1/student/favorites/1");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to remove favorite");
  });
});

describe("PUT /api/v1/student/prep-progress", () => {
  it("updates prep progress and returns gap hours", async () => {
    vi.mocked(db.studentSkill.upsert).mockResolvedValue({} as any);
    vi.mocked(db.company_skill_levels.findMany).mockResolvedValue([
      { required_level: 7 },
      { required_level: 5 },
    ] as any);

    const res = await request(createApp())
      .put("/api/v1/student/prep-progress")
      .send({ skillId: 1, level: 3 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gapHours).toBe(40);
  });

  it("returns 400 for invalid body", async () => {
    const res = await request(createApp())
      .put("/api/v1/student/prep-progress")
      .send({ skillId: 1, level: 99 });

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentSkill.upsert).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp())
      .put("/api/v1/student/prep-progress")
      .send({ skillId: 1, level: 5 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to update prep progress");
  });
});

describe("GET /api/v1/student/prep-progress", () => {
  it("returns prep progress with gaps", async () => {
    vi.mocked(db.studentSkill.findMany).mockResolvedValue([
      { skillSetId: 1, proficiencyLevel: 3, skill: { skill_set_name: "Python", category: "Programming" } },
    ] as any);
    vi.mocked(db.studentTarget.findMany).mockResolvedValue([
      { companyId: 1 },
    ] as any);
    vi.mocked(db.company_skill_levels.findMany).mockResolvedValue([
      { company_id: 1, skill_set_id: 1, required_level: 7 },
    ] as any);

    const res = await request(createApp()).get("/api/v1/student/prep-progress");

    expect(res.status).toBe(200);
    expect(res.body.data.skills).toHaveLength(1);
    expect(res.body.data.skills[0].gap).toBe(4);
    expect(res.body.data.skills[0].gapHours).toBe(40);
  });

  it("returns empty skills for empty targets", async () => {
    vi.mocked(db.studentSkill.findMany).mockResolvedValue([]);
    vi.mocked(db.studentTarget.findMany).mockResolvedValue([]);

    const res = await request(createApp()).get("/api/v1/student/prep-progress");

    expect(res.status).toBe(200);
    expect(res.body.data.skills).toHaveLength(0);
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.studentSkill.findMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/student/prep-progress");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get prep progress");
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

  const authEndpoints = [
    { method: "get" as const, path: "/api/v1/student/dashboard" },
    { method: "get" as const, path: "/api/v1/student/recommendations" },
    { method: "post" as const, path: "/api/v1/student/targets" },
    { method: "get" as const, path: "/api/v1/student/targets" },
    { method: "delete" as const, path: "/api/v1/student/targets/1" },
    { method: "post" as const, path: "/api/v1/student/favorites" },
    { method: "get" as const, path: "/api/v1/student/favorites" },
    { method: "delete" as const, path: "/api/v1/student/favorites/1" },
    { method: "put" as const, path: "/api/v1/student/prep-progress" },
    { method: "get" as const, path: "/api/v1/student/prep-progress" },
  ];

  it.each(authEndpoints)("$method $path returns 401 without auth", async ({ method, path }) => {
    const app = createApp();
    let res;
    switch (method) {
      case "get": res = await request(app).get(path); break;
      case "post": res = await request(app).post(path); break;
      case "put": res = await request(app).put(path); break;
      case "delete": res = await request(app).delete(path); break;
    }
    expect(res!.status).toBe(401);
    expect(res!.body.error).toMatch(/Authentication required/);
  });
});
