import { Router, type Request, type Response } from "express";
import { z } from "zod";
import pino from "pino";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import type { ApiResponse } from "../types/auth";

const logger = pino({ name: "skills" });
const router = Router();

const SKILLS_CACHE_KEY = "skills:master";
const SKILLS_CACHE_TTL = 3600;

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch { /* fail-open */ }
  return null;
}

async function cacheSet(key: string, data: unknown, ttl = SKILLS_CACHE_TTL): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(key, JSON.stringify(data), { EX: ttl });
  } catch { /* fail-open */ }
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const category = req.query.category as string | undefined;
    const searchTerm = req.query.searchTerm as string | undefined;

    const cacheKey = category ? `${SKILLS_CACHE_KEY}:${category}` : SKILLS_CACHE_KEY;
    if (!searchTerm) {
      const cached = await cacheGet<Record<string, unknown>>(cacheKey);
      if (cached) {
        res.json({ success: true, data: cached } satisfies ApiResponse);
        return;
      }
    }

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (searchTerm) where.name = { contains: searchTerm, mode: "insensitive" };

    const skills = await db.skill.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true, description: true },
    });

    if (!searchTerm) await cacheSet(cacheKey, { skills });
    res.json({ success: true, data: { skills } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to list skills");
    res.status(500).json({ success: false, error: "Failed to list skills" } satisfies ApiResponse);
  }
});

router.get("/:skillId", async (req: Request, res: Response): Promise<void> => {
  try {
    const skillId = parseInt(req.params.skillId as string, 10);
    if (Number.isNaN(skillId) || skillId < 1) {
      res.status(400).json({ success: false, error: "Invalid skill ID" } satisfies ApiResponse);
      return;
    }

    const skill = await db.skill.findUnique({
      where: { id: skillId },
      include: {
        topics: { orderBy: { levelNumber: "asc" } },
      },
    });

    if (!skill) {
      res.status(404).json({ success: false, error: "Skill not found" } satisfies ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        skill: { id: skill.id, name: skill.name, category: skill.category, description: skill.description },
        topics: skill.topics.map((t) => ({
          level: t.levelNumber, name: t.topicName, description: t.description, resourcesUrl: t.resourcesUrl,
        })),
      },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, skillId: req.params.skillId }, "Failed to get skill");
    res.status(500).json({ success: false, error: "Failed to get skill details" } satisfies ApiResponse);
  }
});

router.get("/:skillId/roadmap", async (req: Request, res: Response): Promise<void> => {
  try {
    const skillId = parseInt(req.params.skillId as string, 10);
    if (Number.isNaN(skillId) || skillId < 1) {
      res.status(400).json({ success: false, error: "Invalid skill ID" } satisfies ApiResponse);
      return;
    }

    const skill = await db.skill.findUnique({
      where: { id: skillId },
      include: {
        topics: { orderBy: { levelNumber: "asc" } },
      },
    });

    if (!skill) {
      res.status(404).json({ success: false, error: "Skill not found" } satisfies ApiResponse);
      return;
    }

    const roadmapUrl = `https://roadmap.sh/${skill.name.toLowerCase().replace(/\s+/g, "-")}`;

    res.json({
      success: true,
      data: {
        skill: skill.name,
        roadmapUrl,
        levels: skill.topics.map((t) => ({
          level: t.levelNumber,
          bloom: t.levelNumber <= 2 ? "Remember/Understand" :
                 t.levelNumber <= 4 ? "Apply" :
                 t.levelNumber <= 6 ? "Analyze" :
                 t.levelNumber <= 8 ? "Evaluate" : "Create",
          topic: t.topicName,
          description: t.description,
          resources: t.resourcesUrl ? [{ url: t.resourcesUrl }] : [],
        })),
      },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, skillId: req.params.skillId }, "Failed to get roadmap");
    res.status(500).json({ success: false, error: "Failed to get skill roadmap" } satisfies ApiResponse);
  }
});

router.get("/company/:companyId", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    const skills = await db.companySkillRequirement.findMany({
      where: { companyId },
      include: { skill: true },
      orderBy: [{ criticality: "asc" }, { requiredLevel: "desc" }],
    });

    res.json({
      success: true,
      data: {
        skills: skills.map((sr) => ({
          id: sr.skill.id, name: sr.skill.name, category: sr.skill.category,
          requiredLevel: sr.requiredLevel, criticality: sr.criticality,
          proficiencyLevel: sr.proficiencyLevel,
          bloomLevel: sr.requiredLevel <= 2 ? "Remember/Understand" :
                      sr.requiredLevel <= 4 ? "Apply" :
                      sr.requiredLevel <= 6 ? "Analyze" :
                      sr.requiredLevel <= 8 ? "Evaluate" : "Create",
        })),
        totalSkills: skills.length,
      },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to get company skills");
    res.status(500).json({ success: false, error: "Failed to get company skills" } satisfies ApiResponse);
  }
});

const studentSkillSchema = z.object({
  skillId: z.number().int().positive(),
  currentLevel: z.number().int().min(1).max(10),
});

router.post("/student/skills", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
      return;
    }

    const parsed = studentSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse);
      return;
    }

    const { skillId, currentLevel } = parsed.data;

    const skill = await db.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      res.status(404).json({ success: false, error: "Skill not found" } satisfies ApiResponse);
      return;
    }

    await db.studentSkill.upsert({
      where: { userId_skillId: { userId: req.user.sub, skillId } },
      create: { userId: req.user.sub, skillId, currentLevel },
      update: { currentLevel },
    });

    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to save skill");
    res.status(500).json({ success: false, error: "Failed to save skill level" } satisfies ApiResponse);
  }
});

router.get("/student/skills", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
      return;
    }

    const userSkills = await db.studentSkill.findMany({
      where: { userId: req.user.sub },
      include: { skill: true },
    });

    const targetCompanies = await db.studentTargetCompany.findMany({
      where: { userId: req.user.sub, isFavorited: true },
      select: { companyId: true },
    });

    let gaps: Record<string, unknown> = {};
    if (targetCompanies.length > 0) {
      const reqs = await db.companySkillRequirement.findMany({
        where: { companyId: { in: targetCompanies.map((t) => t.companyId) } },
        include: { skill: true },
      });

      gaps = reqs.reduce<Record<string, unknown>>((acc, req) => {
        const userSkill = userSkills.find((us) => us.skillId === req.skillId);
        const userLevel = userSkill?.currentLevel ?? 0;
        if (userLevel < req.requiredLevel) {
          const key = req.skill.name;
          if (!acc[key]) {
            acc[key] = { skillName: req.skill.name, userLevel, requiredLevel: req.requiredLevel, gap: req.requiredLevel - userLevel, criticality: req.criticality };
          }
        }
        return acc;
      }, {});
    }

    res.json({
      success: true,
      data: {
        skills: userSkills.map((us) => ({
          skillId: us.skillId, skillName: us.skill.name, category: us.skill.category,
          currentLevel: us.currentLevel, updatedAt: us.updatedAt.toISOString(),
        })),
        gaps: Object.values(gaps),
      },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to get student skills");
    res.status(500).json({ success: false, error: "Failed to get skills" } satisfies ApiResponse);
  }
});

export default router;
