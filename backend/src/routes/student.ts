import { Router, type Response } from "express";
import { z } from "zod";
import pino from "pino";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import type { ApiResponse } from "../types/auth";

const logger = pino({ name: "student" });
const router = Router();

const STUDENT_CACHE_PREFIX = "student:";
const CACHE_TTL = 300;

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch { /* fail-open */ }
  return null;
}

async function cacheSet(key: string, data: unknown, ttl = CACHE_TTL): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(key, JSON.stringify(data), { EX: ttl });
  } catch { /* fail-open */ }
}

async function invalidateCache(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`${STUDENT_CACHE_PREFIX}${userId}:dashboard`);
    await redis.del(`${STUDENT_CACHE_PREFIX}${userId}:targets`);
    await redis.del(`${STUDENT_CACHE_PREFIX}${userId}:favorites`);
    await redis.del(`${STUDENT_CACHE_PREFIX}${userId}:prep`);
  } catch { /* fail-open */ }
}

router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }

    const cacheKey = `${STUDENT_CACHE_PREFIX}${req.user.sub}:dashboard`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) { res.json({ success: true, data: cached } satisfies ApiResponse); return; }

    const [user, totalCompanies, targetCompanies, userSkills, companyReqCount] = await Promise.all([
      db.user.findUnique({ where: { id: req.user.sub } }),
      db.company.count(),
      db.studentTargetCompany.findMany({ where: { userId: req.user.sub, isFavorited: true }, include: { company: true } }),
      db.studentSkill.findMany({ where: { userId: req.user.sub }, include: { skill: true } }),
      db.companySkillRequirement.count(),
    ]);

    const profileData = user?.profileData as Record<string, unknown> | null;

    const totalSkillsToLearn = companyReqCount;
    const trackedSkills = userSkills.length;
    const prepProgress = totalSkillsToLearn > 0 ? Math.round((trackedSkills / totalSkillsToLearn) * 100) : 0;

    const userSkillMap = new Map(userSkills.map((us) => [us.skillId, us.currentLevel]));
    const scored = await Promise.all(
      targetCompanies.map(async (tc) => {
        const reqs = await db.companySkillRequirement.findMany({ where: { companyId: tc.companyId } });
        const matchCount = reqs.filter((r) => (userSkillMap.get(r.skillId) ?? 0) >= r.requiredLevel).length;
        const score = reqs.length > 0 ? Math.round((matchCount / reqs.length) * 100) : 50;
        return { id: tc.company.id, name: tc.company.name, category: tc.company.category, score };
      }),
    );

    const recommendations = scored.sort((a, b) => b.score - a.score).slice(0, 5);

    const payload = {
      stats: {
        daysUntilPlacement: 120,
        totalCompanies,
        targetCompanies: targetCompanies.length,
        skillsToLearn: totalSkillsToLearn - trackedSkills,
        prepProgress: Math.min(prepProgress, 100),
      },
      recommendations,
      targets: targetCompanies.map((tc) => ({
        companyId: tc.companyId, companyName: tc.company.name, category: tc.company.category,
        isFavorited: tc.isFavorited, addedAt: tc.addedAt.toISOString(),
      })),
      profileData,
    };

    await cacheSet(cacheKey, payload);
    res.json({ success: true, data: payload } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, userId: req.user?.sub }, "Dashboard failed");
    res.status(500).json({ success: false, error: "Failed to load dashboard" } satisfies ApiResponse);
  }
});

router.get("/recommendations", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }

    const user = await db.user.findUnique({ where: { id: req.user.sub } });
    if (!user || user.role !== "student") {
      res.status(400).json({ success: false, error: "Only students can get recommendations" } satisfies ApiResponse);
      return;
    }

    const profileData = user.profileData as Record<string, unknown> | null;
    const userSkills = await db.studentSkill.findMany({ where: { userId: req.user.sub } });
    const userSkillMap = new Map(userSkills.map((us) => [us.skillId, us.currentLevel]));

    const companies = await db.company.findMany({
      include: {
        skillRequirements: { include: { skill: true } },
      },
    });

    const scored = companies.map((c) => {
      let score = 50;
      const reasons: string[] = [];

      if (profileData?.cgpa && c.minCgpa) {
        const cgpa = Number(profileData.cgpa);
        const minCgpa = Number(c.minCgpa);
        if (cgpa >= minCgpa) { score += 15; reasons.push("CGPA meets requirement"); }
        else { score -= 10; reasons.push(`CGPA ${cgpa} below ${minCgpa}`); }
      }

      if (c.skillRequirements.length > 0) {
        const matched = c.skillRequirements.filter((r) => (userSkillMap.get(r.skillId) ?? 0) >= r.requiredLevel).length;
        score += Math.round((matched / c.skillRequirements.length) * 20);
        reasons.push(`${matched}/${c.skillRequirements.length} skills matched`);
      }

      if (c.glassdoorRating && Number(c.glassdoorRating) >= 4) { score += 10; reasons.push("High Glassdoor rating"); }
      if (c.selectionRate) {
        const rate = parseFloat(c.selectionRate);
        if (rate > 5) { score += 10; reasons.push("Good selection rate"); }
      }

      return {
        id: c.id, name: c.name, category: c.category, companyType: c.companyType,
        package: c.package, minCgpa: c.minCgpa?.toFixed(2), glassdoorRating: c.glassdoorRating?.toFixed(1),
        score: Math.max(0, Math.min(100, score)), reasons,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    res.json({ success: true, data: { companies: scored, total: scored.length } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, userId: req.user?.sub }, "Recommendations failed");
    res.status(500).json({ success: false, error: "Failed to get recommendations" } satisfies ApiResponse);
  }
});

const targetSchema = z.object({ companyId: z.number().int().positive() });

router.post("/targets", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse); return; }

    const company = await db.company.findUnique({ where: { id: parsed.data.companyId } });
    if (!company) { res.status(404).json({ success: false, error: "Company not found" } satisfies ApiResponse); return; }

    await db.studentTargetCompany.upsert({
      where: { userId_companyId: { userId: req.user.sub, companyId: parsed.data.companyId } },
      create: { userId: req.user.sub, companyId: parsed.data.companyId, isFavorited: true },
      update: { isFavorited: true },
    });

    await invalidateCache(req.user.sub);
    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to add target");
    res.status(500).json({ success: false, error: "Failed to add target company" } satisfies ApiResponse);
  }
});

router.delete("/targets/:companyId", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) { res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse); return; }

    await db.studentTargetCompany.deleteMany({ where: { userId: req.user.sub, companyId } });
    await invalidateCache(req.user.sub);
    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to remove target");
    res.status(500).json({ success: false, error: "Failed to remove target company" } satisfies ApiResponse);
  }
});

router.get("/targets", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }

    const targets = await db.studentTargetCompany.findMany({
      where: { userId: req.user.sub, isFavorited: true },
      include: { company: { select: { id: true, name: true, category: true, companyType: true, package: true, minCgpa: true, glassdoorRating: true, headquarters: true } } },
      orderBy: { addedAt: "desc" },
    });

    res.json({ success: true, data: { companies: targets.map((t) => ({ ...t.company, isFavorited: t.isFavorited, addedAt: t.addedAt.toISOString() })), count: targets.length } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to get targets");
    res.status(500).json({ success: false, error: "Failed to get target companies" } satisfies ApiResponse);
  }
});

router.post("/favorites", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse); return; }

    await db.studentTargetCompany.upsert({
      where: { userId_companyId: { userId: req.user.sub, companyId: parsed.data.companyId } },
      create: { userId: req.user.sub, companyId: parsed.data.companyId, isFavorited: true },
      update: { isFavorited: true },
    });

    await invalidateCache(req.user.sub);
    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to add favorite");
    res.status(500).json({ success: false, error: "Failed to add favorite" } satisfies ApiResponse);
  }
});

router.delete("/favorites/:companyId", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) { res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse); return; }

    await db.studentTargetCompany.updateMany({ where: { userId: req.user.sub, companyId }, data: { isFavorited: false } });
    await invalidateCache(req.user.sub);
    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to remove favorite");
    res.status(500).json({ success: false, error: "Failed to remove favorite" } satisfies ApiResponse);
  }
});

router.get("/favorites", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }

    const favorites = await db.studentTargetCompany.findMany({
      where: { userId: req.user.sub, isFavorited: true },
      include: { company: { select: { id: true, name: true, category: true, package: true, minCgpa: true, glassdoorRating: true, headquarters: true } } },
      orderBy: { addedAt: "desc" },
    });

    res.json({ success: true, data: { companies: favorites.map((f) => ({ ...f.company, addedAt: f.addedAt.toISOString() })), count: favorites.length } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to get favorites");
    res.status(500).json({ success: false, error: "Failed to get favorites" } satisfies ApiResponse);
  }
});

const prepSchema = z.object({ skillId: z.number().int().positive(), level: z.number().int().min(1).max(10) });

router.put("/prep-progress", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }
    const parsed = prepSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse); return; }

    await db.studentSkill.upsert({
      where: { userId_skillId: { userId: req.user.sub, skillId: parsed.data.skillId } },
      create: { userId: req.user.sub, skillId: parsed.data.skillId, currentLevel: parsed.data.level },
      update: { currentLevel: parsed.data.level },
    });

    const requirements = await db.companySkillRequirement.findMany({
      where: { skillId: parsed.data.skillId },
      select: { requiredLevel: true, company: { select: { name: true } } },
    });

    const maxRequired = Math.max(...requirements.map((r) => r.requiredLevel), 0);
    const gapHours = Math.max(0, (maxRequired - parsed.data.level) * 10);

    await invalidateCache(req.user.sub);
    res.json({ success: true, data: { gapHours } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to update prep progress");
    res.status(500).json({ success: false, error: "Failed to update prep progress" } satisfies ApiResponse);
  }
});

router.get("/prep-progress", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse); return; }

    const userSkills = await db.studentSkill.findMany({
      where: { userId: req.user.sub },
      include: { skill: true },
    });

    const targetIds = (await db.studentTargetCompany.findMany({
      where: { userId: req.user.sub, isFavorited: true },
      select: { companyId: true },
    })).map((t) => t.companyId);

    const requirements = targetIds.length > 0
      ? await db.companySkillRequirement.findMany({ where: { companyId: { in: targetIds } } })
      : [];

    const skills = userSkills.map((us) => {
      const reqs = requirements.filter((r) => r.skillId === us.skillId);
      const maxRequired = Math.max(...reqs.map((r) => r.requiredLevel), 0);
      const gap = Math.max(0, maxRequired - us.currentLevel);
      return {
        skillId: us.skillId, skillName: us.skill.name, category: us.skill.category,
        currentLevel: us.currentLevel, requiredLevel: maxRequired, gap,
        gapHours: gap * 10, progress: us.currentLevel,
      };
    });

    res.json({ success: true, data: { skills } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, userId: req.user?.sub }, "Failed to get prep progress");
    res.status(500).json({ success: false, error: "Failed to get prep progress" } satisfies ApiResponse);
  }
});

export default router;
