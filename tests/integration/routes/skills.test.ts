import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import skillsRoutes from "../../../src/routes/skills";
import { db } from "../../../src/lib/db";
import { getRedisClient } from "../../../src/lib/redis";

vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: vi.fn((req: any, _res: any, next: any) => {
    req.user = { sub: "student-id", email: "student@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
    next();
  }),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/skills", skillsRoutes);
  return app;
}

describe("GET /api/v1/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached skills when redis has them", async () => {
    const redis = await getRedisClient();
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ skills: [{ id: 1, name: "JavaScript" }] }));

    const res = await request(createApp()).get("/api/v1/skills");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.skills).toHaveLength(1);
    expect(res.body.data.skills[0].name).toBe("JavaScript");
  });

  it("fetches from db and caches when redis is empty", async () => {
    const redis = await getRedisClient();
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(db.skill_set_master.findMany).mockResolvedValue([
      { skill_set_id: 1, skill_set_name: "Python", category: "Programming", skill_set_description: "desc" },
    ] as any);

    const res = await request(createApp()).get("/api/v1/skills");

    expect(res.status).toBe(200);
    expect(res.body.data.skills).toHaveLength(1);
    expect(res.body.data.skills[0].name).toBe("Python");
    expect(redis.set).toHaveBeenCalled();
  });

  it("filters by category", async () => {
    vi.mocked(db.skill_set_master.findMany).mockResolvedValue([
      { skill_set_id: 1, skill_set_name: "React", category: "Frontend", skill_set_description: "UI lib" },
    ] as any);

    const res = await request(createApp()).get("/api/v1/skills?category=Frontend");

    expect(res.status).toBe(200);
    expect(db.skill_set_master.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: "Frontend" }),
      }),
    );
  });

  it("searches by searchTerm without caching", async () => {
    vi.mocked(db.skill_set_master.findMany).mockResolvedValue([]);

    const res = await request(createApp()).get("/api/v1/skills?searchTerm=Python");

    expect(res.status).toBe(200);
    const redis = await getRedisClient();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.skill_set_master.findMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/skills");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to list skills");
  });
});

describe("GET /api/v1/skills/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a single skill with topics", async () => {
    vi.mocked(db.skill_set_master.findUnique).mockResolvedValue({
      skill_set_id: 1, skill_set_name: "Go", category: "Backend", skill_set_description: "desc",
      skill_set_topics: [
        { level_number: 1, topics: "Basics" },
        { level_number: 2, topics: "Concurrency" },
      ],
    } as any);

    const res = await request(createApp()).get("/api/v1/skills/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.skill.name).toBe("Go");
    expect(res.body.data.topics).toHaveLength(2);
  });

  it("returns 400 for invalid skill ID", async () => {
    const res = await request(createApp()).get("/api/v1/skills/abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid skill ID");
  });

  it("returns 404 for missing skill", async () => {
    vi.mocked(db.skill_set_master.findUnique).mockResolvedValue(null);

    const res = await request(createApp()).get("/api/v1/skills/999");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Skill not found");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.skill_set_master.findUnique).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/skills/1");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get skill details");
  });
});

describe("GET /api/v1/skills/:skillId/roadmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns roadmap for a valid skill", async () => {
    vi.mocked(db.skill_set_master.findUnique).mockResolvedValue({
      skill_set_id: 1, skill_set_name: "Machine Learning", category: "AI", skill_set_description: "desc",
      skill_set_topics: [
        { level_number: 1, topics: "Statistics" },
        { level_number: 5, topics: "Deep Learning" },
      ],
    } as any);

    const res = await request(createApp()).get("/api/v1/skills/1/roadmap");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.skill).toBe("Machine Learning");
    expect(res.body.data.roadmapUrl).toContain("roadmap.sh");
    expect(res.body.data.levels).toHaveLength(2);
  });

  it("returns 400 for invalid skill ID", async () => {
    const res = await request(createApp()).get("/api/v1/skills/abc/roadmap");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid skill ID");
  });

  it("returns 404 for missing skill", async () => {
    vi.mocked(db.skill_set_master.findUnique).mockResolvedValue(null);

    const res = await request(createApp()).get("/api/v1/skills/999/roadmap");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Skill not found");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.skill_set_master.findUnique).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/skills/1/roadmap");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get skill roadmap");
  });
});

describe("GET /api/v1/skills/company/:companyId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns company skills", async () => {
    vi.mocked(db.company_skill_levels.findMany).mockResolvedValue([
      { company_id: 1, skill_set_id: 1, required_level: 5, skill_set_master: { skill_set_id: 1, skill_set_name: "Kubernetes", category: "DevOps", skill_set_description: "desc" } },
    ] as any);

    const res = await request(createApp()).get("/api/v1/skills/company/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.skills).toHaveLength(1);
    expect(res.body.data.totalSkills).toBe(1);
  });

  it("returns 400 for invalid company ID", async () => {
    const res = await request(createApp()).get("/api/v1/skills/company/abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid company ID");
  });

  it("returns 500 on error", async () => {
    vi.mocked(db.company_skill_levels.findMany).mockRejectedValue(new Error("DB error"));

    const res = await request(createApp()).get("/api/v1/skills/company/1");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get company skills");
  });
});

describe("Auth-Guarded Student Skill Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAuth } = await import("../../../src/middleware/auth");
    vi.mocked(requireAuth).mockImplementation((req: any, _res: any, next: any) => {
      req.user = { sub: "student-id", email: "student@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
      next();
    });
  });

  describe("POST /api/v1/skills/student/skills", () => {
    it("saves a student skill successfully", async () => {
      vi.mocked(db.skill_set_master.findUnique).mockResolvedValue({
        skill_set_id: 1, skill_set_name: "Go", category: "Backend", skill_set_description: "desc",
      } as any);
      vi.mocked(db.studentSkill.upsert).mockResolvedValue({} as any);

      const res = await request(createApp())
        .post("/api/v1/skills/student/skills")
        .send({ skillId: 1, currentLevel: 7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 400 for invalid body", async () => {
      const res = await request(createApp())
        .post("/api/v1/skills/student/skills")
        .send({ skillId: "abc", currentLevel: 99 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 404 for missing skill", async () => {
      vi.mocked(db.skill_set_master.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post("/api/v1/skills/student/skills")
        .send({ skillId: 999, currentLevel: 5 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Skill not found");
    });

    it("returns 500 on error", async () => {
      vi.mocked(db.skill_set_master.findUnique).mockRejectedValue(new Error("DB error"));

      const res = await request(createApp())
        .post("/api/v1/skills/student/skills")
        .send({ skillId: 1, currentLevel: 5 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to save skill level");
    });
  });

  describe("GET /api/v1/skills/student/skills", () => {
    it("returns student skills with gaps", async () => {
      vi.mocked(db.studentSkill.findMany).mockResolvedValue([
        { skillSetId: 1, userId: "student-id", proficiencyLevel: 3, createdAt: new Date("2025-01-01"), skill: { skill_set_id: 1, skill_set_name: "Python", category: "Programming", skill_set_description: "desc" } },
      ] as any);
      vi.mocked(db.studentTarget.findMany).mockResolvedValue([
        { companyId: 1 },
      ] as any);
      vi.mocked(db.company_skill_levels.findMany).mockResolvedValue([
        { company_id: 1, skill_set_id: 1, required_level: 7, skill_set_master: { skill_set_name: "Python" } },
      ] as any);

      const res = await request(createApp()).get("/api/v1/skills/student/skills");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.skills).toHaveLength(1);
      expect(res.body.data.gaps).toHaveLength(1);
    });

    it("returns 500 on error", async () => {
      vi.mocked(db.studentSkill.findMany).mockRejectedValue(new Error("DB error"));

      const res = await request(createApp()).get("/api/v1/skills/student/skills");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get skills");
    });
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

  it("POST /student/skills returns 401 without auth", async () => {
    const res = await request(createApp())
      .post("/api/v1/skills/student/skills")
      .send({ skillId: 1, currentLevel: 7 });
    expect(res.status).toBe(401);
  });

  it("GET /student/skills returns 401 without auth", async () => {
    const res = await request(createApp()).get("/api/v1/skills/student/skills");
    expect(res.status).toBe(401);
  });
});
