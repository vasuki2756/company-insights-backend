import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "../../src/lib/db";

vi.mock("../../src/lib/db", () => ({
  db: {
    company: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    company_json: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    company_skill_levels: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const mockRedis = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
}));

vi.mock("../../src/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue(mockRedis),
}));

vi.mock("../../src/services/embeddingService", () => ({
  embedCompanyProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/middleware/auth", () => ({
  requireAuth: vi.fn((req: any, _res: any, next: any) => {
    req.user = { sub: "u1", email: "s@t.com", role: "student", iat: 0, exp: 9999999999 };
    next();
  }),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const mockCompany = {
  company_id: 1,
  name: "Acme Corp",
  shortName: "ACME",
  category: "Tech",
  companyType: "Product",
  incorporationYear: "2010",
  employeeSize: "1000-5000",
  employeeCount: 2500,
  headquarters: "Bangalore",
  websiteUrl: "https://acme.example.com",
  minCgpa: 7.5,
  package: "12-15 LPA",
  selectionRate: "8%",
  applicationDeadline: new Date("2025-12-31"),
  driveDate: new Date("2025-11-15"),
  yoyGrowthRate: "15%",
  glassdoorRating: 4.2,
  googleRating: 4.5,
  createdAt: new Date("2024-01-01"),
};

async function createApp() {
  const app = express();
  app.use(express.json());
  const mod = await import("../../src/routes/companies");
  app.use("/api/v1/companies", mod.default);
  return app;
}

describe("Companies Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  it("should export router", async () => {
    const mod = await import("../../src/routes/companies");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  describe("GET /api/v1/companies", () => {
    it("returns paginated company list", async () => {
      vi.mocked(db.company.findMany).mockResolvedValue([mockCompany]);
      vi.mocked(db.company.count).mockResolvedValue(1);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.companies).toHaveLength(1);
    });

    it("supports pagination params", async () => {
      vi.mocked(db.company.findMany).mockResolvedValue([]);
      vi.mocked(db.company.count).mockResolvedValue(0);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies?page=2&limit=10");

      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid params", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies?page=-1");
      expect(res.status).toBe(400);
    });

    it("supports search and category filters", async () => {
      vi.mocked(db.company.findMany).mockResolvedValue([mockCompany]);
      vi.mocked(db.company.count).mockResolvedValue(1);
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies?search=Acme&category=Tech&sortBy=rating");
      expect(res.status).toBe(200);
    });

    it("returns hasMore false when all results returned", async () => {
      vi.mocked(db.company.findMany).mockResolvedValue([mockCompany]);
      vi.mocked(db.company.count).mockResolvedValue(1);
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies?limit=50");
      expect(res.body.data.hasMore).toBe(false);
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company.findMany).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies");
      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/v1/companies/:companyId", () => {
    it("returns company by ID", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        ...mockCompany,
        company_json: { full_json: { overview: "test" }, short_json: null },
        company_skill_levels: [
          {
            required_level: 3,
            skill_set_master: {
              skill_set_id: 1,
              skill_set_name: "Python",
              category: "Programming",
            },
          },
        ],
      });

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1");

      expect(res.status).toBe(200);
      expect(res.body.data.company.name).toBe("Acme Corp");
    });

    it("returns 404 for unknown company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(null);
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/999");
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ID", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/invalid");
      expect(res.status).toBe(400);
    });

    it("returns cached data when available", async () => {
      const cachedData = { company: { name: "Cached Corp" } };
      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify(cachedData));
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1");
      expect(res.status).toBe(200);
      expect(res.body.data.company.name).toBe("Cached Corp");
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company.findUnique).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1");
      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/v1/companies/:companyId/intelligence", () => {
    it("returns intelligence data with sections", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        ...mockCompany,
        company_json: { full_json: { overview_text: "test" }, short_json: null },
      });

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/intelligence");
      expect(res.status).toBe(200);
      expect(res.body.data.sections).toBeDefined();
    });

    it("returns 404 for unknown company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(null);
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/999/intelligence");
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ID", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/invalid/intelligence");
      expect(res.status).toBe(400);
    });

    it("falls back to short_json when full_json is null", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        ...mockCompany,
        company_json: { full_json: null, short_json: { overview_text: "brief" } },
      });
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/intelligence");
      expect(res.status).toBe(200);
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company.findUnique).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/intelligence");
      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/v1/companies/:companyId/skills", () => {
    it("returns company skills with topics", async () => {
      vi.mocked(db.company_skill_levels.findMany).mockResolvedValue([
        {
          company_id: 1,
          skill_set_id: 1,
          required_level: 3,
          skill_set_master: {
            skill_set_id: 1,
            skill_set_name: "Python",
            category: "Programming",
            skill_set_topics: [
              { level_number: 1, topics: "Basics" },
            ],
          },
        },
      ]);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/skills");
      expect(res.status).toBe(200);
      expect(res.body.data.skills).toHaveLength(1);
    });

    it("returns 400 for invalid ID", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/invalid/skills");
      expect(res.status).toBe(400);
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company_skill_levels.findMany).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/skills");
      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/v1/companies", () => {
    it("creates a company", async () => {
      vi.mocked(db.company.create).mockResolvedValue(mockCompany);
      const app = await createApp();
      const res = await request(app)
        .post("/api/v1/companies")
        .send({ companyId: 1, name: "Acme Corp" });
      expect(res.status).toBe(201);
    });

    it("returns 409 on duplicate", async () => {
      vi.mocked(db.company.create).mockRejectedValue(new Error("Unique constraint violation"));
      const app = await createApp();
      const res = await request(app)
        .post("/api/v1/companies")
        .send({ companyId: 1, name: "Acme Corp" });
      expect(res.status).toBe(409);
    });

    it("returns 400 for invalid body", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/v1/companies")
        .send({ companyId: -1 });
      expect(res.status).toBe(400);
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company.create).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app)
        .post("/api/v1/companies")
        .send({ companyId: 1, name: "Acme Corp" });
      expect(res.status).toBe(500);
    });
  });

  describe("PUT /api/v1/companies/:companyId", () => {
    it("updates a company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(mockCompany);
      vi.mocked(db.company.update).mockResolvedValue(mockCompany);
      const app = await createApp();
      const res = await request(app)
        .put("/api/v1/companies/1")
        .send({ name: "Updated Corp" });
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(null);
      const app = await createApp();
      const res = await request(app)
        .put("/api/v1/companies/999")
        .send({ name: "Nope" });
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ID", async () => {
      const app = await createApp();
      const res = await request(app)
        .put("/api/v1/companies/invalid")
        .send({ name: "Nope" });
      expect(res.status).toBe(400);
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company.findUnique).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app)
        .put("/api/v1/companies/1")
        .send({ name: "Nope" });
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE /api/v1/companies/:companyId", () => {
    it("deletes a company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(mockCompany);
      vi.mocked(db.company.delete).mockResolvedValue(mockCompany);
      const app = await createApp();
      const res = await request(app).delete("/api/v1/companies/1");
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(null);
      const app = await createApp();
      const res = await request(app).delete("/api/v1/companies/999");
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ID", async () => {
      const app = await createApp();
      const res = await request(app).delete("/api/v1/companies/invalid");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/companies/:companyId/recommendations", () => {
    beforeEach(() => {
      vi.mocked(mockRedis.get).mockResolvedValue(null);
    });

    it("returns recommendation score for a student", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(mockCompany);
      vi.mocked(db.user.findUnique).mockResolvedValue({
        userId: "u1",
        role: "student",
        profileData: { cgpa: 8.5, targetSalaryMin: 10, targetSalaryMax: 20 },
      } as any);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/recommendations");
      expect(res.status).toBe(200);
      expect(res.body.data.score).toBeGreaterThan(50);
    });

    it("returns lower score when CGPA is below minimum", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        ...mockCompany,
        glassdoorRating: 3.0,
        selectionRate: "2%",
      });
      vi.mocked(db.user.findUnique).mockResolvedValue({
        userId: "u1",
        role: "student",
        profileData: { cgpa: 6.0 },
      } as any);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/recommendations");
      expect(res.status).toBe(200);
      expect(res.body.data.score).toBeLessThan(50);
    });

    it("returns score 100 when all conditions met", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        ...mockCompany,
        glassdoorRating: 5.0,
        selectionRate: "15%",
      });
      vi.mocked(db.user.findUnique).mockResolvedValue({
        userId: "u1",
        role: "student",
        profileData: { cgpa: 9.5, targetSalaryMin: 10, targetSalaryMax: 20 },
      } as any);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/recommendations");
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(null);
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/999/recommendations");
      expect(res.status).toBe(404);
    });

    it("returns 400 for non-student user", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(mockCompany);
      vi.mocked(db.user.findUnique).mockResolvedValue({
        userId: "u2",
        role: "admin",
        profileData: null,
      } as any);

      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/recommendations");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Only students/);
    });

    it("returns 400 for invalid ID", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/invalid/recommendations");
      expect(res.status).toBe(400);
    });

    it("returns 500 on DB error", async () => {
      vi.mocked(db.company.findUnique).mockRejectedValue(new Error("DB down"));
      const app = await createApp();
      const res = await request(app).get("/api/v1/companies/1/recommendations");
      expect(res.status).toBe(500);
    });
  });
});
