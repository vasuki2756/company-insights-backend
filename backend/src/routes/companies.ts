import { Router, type Request, type Response } from "express";
import { z } from "zod";
import pino from "pino";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import { embedCompanyProfile } from "../services/embeddingService";
import type { ApiResponse } from "../types/auth";

const logger = pino({ name: "companies" });
const router = Router();

const CACHE_TTL = 300;
const COMPANY_CACHE_PREFIX = "company:";

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["name", "rating", "min_cgpa", "yoy_growth"]).optional(),
});

const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  shortName: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  companyType: z.string().max(50).optional(),
  incorporationYear: z.number().int().optional(),
  employeeSize: z.string().max(50).optional(),
  employeeCount: z.number().int().optional(),
  headquarters: z.string().max(500).optional(),
  websiteUrl: z.string().url().max(500).optional(),
  minCgpa: z.number().positive().optional(),
  package: z.string().max(50).optional(),
  selectionRate: z.string().max(50).optional(),
  applicationDeadline: z.string().datetime().optional(),
  driveDate: z.string().datetime().optional(),
  yoyGrowthRate: z.string().max(50).optional(),
  glassdoorRating: z.number().min(0).max(5).optional(),
  googleRating: z.number().min(0).max(5).optional(),
});

const updateCompanySchema = createCompanySchema.partial();

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

function getSortField(sortBy?: string): Record<string, "asc" | "desc"> {
  switch (sortBy) {
    case "name": return { name: "asc" };
    case "rating": return { glassdoorRating: "desc" };
    case "min_cgpa": return { minCgpa: "asc" };
    case "yoy_growth": return { yoyGrowthRate: "desc" };
    default: return { createdAt: "desc" };
  }
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse);
      return;
    }

    const { page, limit, category, search, sortBy } = parsed.data;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { companyType: { contains: search, mode: "insensitive" } },
      ];
    }

    const [companies, total] = await Promise.all([
      db.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: getSortField(sortBy),
        select: {
          id: true, name: true, shortName: true, category: true, companyType: true,
          headquarters: true, minCgpa: true, package: true, glassdoorRating: true,
          googleRating: true, employeeSize: true, selectionRate: true, applicationDeadline: true,
          driveDate: true, createdAt: true,
        },
      }),
      db.company.count({ where }),
    ]);

    res.json({
      success: true,
      data: { companies, total, hasMore: skip + companies.length < total, page },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to list companies");
    res.status(500).json({ success: false, error: "Failed to list companies" } satisfies ApiResponse);
  }
});

router.get("/:companyId", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    const cacheKey = `${COMPANY_CACHE_PREFIX}${companyId}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached } satisfies ApiResponse);
      return;
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      include: {
        profile: true,
        skillRequirements: {
          include: { skill: true },
          orderBy: [{ criticality: "asc" }, { requiredLevel: "desc" }],
        },
      },
    });

    if (!company) {
      res.status(404).json({ success: false, error: "Company not found" } satisfies ApiResponse);
      return;
    }

    const payload = {
      company: {
        id: company.id, name: company.name, shortName: company.shortName,
        category: company.category, companyType: company.companyType,
        incorporationYear: company.incorporationYear, employeeSize: company.employeeSize,
        employeeCount: company.employeeCount, headquarters: company.headquarters,
        websiteUrl: company.websiteUrl, minCgpa: company.minCgpa?.toFixed(2),
        package: company.package, selectionRate: company.selectionRate,
        applicationDeadline: company.applicationDeadline?.toISOString(),
        driveDate: company.driveDate?.toISOString(), yoyGrowthRate: company.yoyGrowthRate,
        glassdoorRating: company.glassdoorRating?.toFixed(1),
        googleRating: company.googleRating?.toFixed(1),
        createdAt: company.createdAt.toISOString(),
      },
      profile: company.profile ?? null,
      skills: company.skillRequirements.map((sr) => ({
        id: sr.skill.id, name: sr.skill.name, category: sr.skill.category,
        requiredLevel: sr.requiredLevel, criticality: sr.criticality,
        proficiencyLevel: sr.proficiencyLevel,
      })),
    };

    await cacheSet(cacheKey, payload);
    res.json({ success: true, data: payload } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to get company");
    res.status(500).json({ success: false, error: "Failed to get company details" } satisfies ApiResponse);
  }
});

router.get("/:companyId/intelligence", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    const cacheKey = `${COMPANY_CACHE_PREFIX}intel:${companyId}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached } satisfies ApiResponse);
      return;
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      include: { profile: true },
    });

    if (!company) {
      res.status(404).json({ success: false, error: "Company not found" } satisfies ApiResponse);
      return;
    }

    const profile = company.profile;
    const sectionDefs = [
      { name: "overview", label: "Overview & Identity", fields: ["overviewText", "visionStatement", "missionStatement", "coreValues", "historyTimeline"] },
      { name: "leadership", label: "Leadership", fields: ["ceoName", "ceoLinkedinUrl", "keyLeaders", "boardMembers"] },
      { name: "financials", label: "Financials", fields: ["annualRevenue", "annualProfit", "valuation", "revenueMix", "profitabilityStatus", "keyInvestors", "totalCapitalRaised", "burnRate", "runwayMonths"] },
      { name: "presence", label: "Global Presence", fields: ["operatingCountries", "officeCount", "officeLocations"] },
      { name: "products", label: "Products & Services", fields: ["offeringsDescription", "focusSectors", "topCustomers"] },
      { name: "tech_stack", label: "Technology Stack", fields: ["techStack", "aiMlAdoptionLevel", "rAndDInvestment", "intellectualProperty", "cybersecurityPosture"] },
      { name: "competitive", label: "Competitive Landscape", fields: ["keyCompetitors", "marketSharePercentage", "competitiveAdvantages", "weaknessesGaps"] },
      { name: "market", label: "Market Opportunity", fields: ["tam", "sam", "som", "strategicPriorities", "innovationRoadmap"] },
      { name: "esg", label: "ESG & Sustainability", fields: ["esgRatings", "sustainabilityCsr"] },
      { name: "culture", label: "Work Culture", fields: ["workCultureSummary", "diversityInclusionScore", "burnoutRisk", "psychologicalSafety"] },
      { name: "career", label: "Career Growth", fields: ["trainingSpend", "mentorshipAvailability", "internalMobility", "avgRetentionTenure", "employeeTurnover"] },
      { name: "compensation", label: "Compensation", fields: ["fixedVsVariablePay", "esopsIncentives", "familyHealthInsurance"] },
      { name: "ratings", label: "Ratings", fields: ["glassdoorPros", "glassdoorCons", "ratingCombined", "indeedRating", "googleRating", "brandValue", "brandSentimentScore"] },
      { name: "contact", label: "Contact", fields: ["primaryContactEmail", "primaryPhoneNumber"] },
    ];

    const sections = sectionDefs.map((s) => {
      const filled = s.fields.filter((f) => profile && (profile as Record<string, unknown>)[f] !== null && (profile as Record<string, unknown>)[f] !== undefined && (Array.isArray((profile as Record<string, unknown>)[f]) ? ((profile as Record<string, unknown>)[f] as Array<unknown>).length > 0 : true));
      return { name: s.name, label: s.label, populated: filled.length, total: s.fields.length };
    });

    const payload = {
      company: {
        id: company.id, name: company.name, shortName: company.shortName,
        category: company.category, companyType: company.companyType,
        minCgpa: company.minCgpa?.toFixed(2), package: company.package,
        selectionRate: company.selectionRate, glassdoorRating: company.glassdoorRating?.toFixed(1),
        googleRating: company.googleRating?.toFixed(1), employeeSize: company.employeeSize,
        headquarters: company.headquarters, websiteUrl: company.websiteUrl,
      },
      sections,
    };

    await cacheSet(cacheKey, payload, 120);
    res.json({ success: true, data: payload } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to get intelligence");
    res.status(500).json({ success: false, error: "Failed to get company intelligence" } satisfies ApiResponse);
  }
});

router.get("/:companyId/skills", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    const skills = await db.companySkillRequirement.findMany({
      where: { companyId },
      include: {
        skill: {
          include: {
            topics: { orderBy: { levelNumber: "asc" } },
          },
        },
      },
      orderBy: [
        { criticality: "asc" },
        { requiredLevel: "desc" },
      ],
    });

    const mapped = skills.map((sr) => ({
      id: sr.skill.id,
      name: sr.skill.name,
      category: sr.skill.category,
      requiredLevel: sr.requiredLevel,
      criticality: sr.criticality,
      proficiencyLevel: sr.proficiencyLevel,
      topics: sr.skill.topics.map((t) => ({
        level: t.levelNumber, name: t.topicName, description: t.description, resourcesUrl: t.resourcesUrl,
      })),
    }));

    res.json({ success: true, data: { skills: mapped } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to get company skills");
    res.status(500).json({ success: false, error: "Failed to get company skills" } satisfies ApiResponse);
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse);
      return;
    }

    const company = await db.company.create({ data: parsed.data });

    try {
      await embedCompanyProfile(company.id).catch((e) => logger.warn({ error: e }, "Embedding queued"));
    } catch { /* background */ }

    res.status(201).json({
      success: true,
      data: { companyId: company.id, message: "Company created and embeddings queued" },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint")) {
      res.status(409).json({ success: false, error: "Company with this name already exists" } satisfies ApiResponse);
      return;
    }
    logger.error({ error: message }, "Failed to create company");
    res.status(500).json({ success: false, error: "Failed to create company" } satisfies ApiResponse);
  }
});

router.put("/:companyId", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0]?.message } satisfies ApiResponse);
      return;
    }

    const existing = await db.company.findUnique({ where: { id: companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Company not found" } satisfies ApiResponse);
      return;
    }

    const company = await db.company.update({
      where: { id: companyId },
      data: parsed.data,
    });

    try {
      const redis = await getRedisClient();
      await redis.del(`${COMPANY_CACHE_PREFIX}${companyId}`);
      await redis.del(`${COMPANY_CACHE_PREFIX}intel:${companyId}`);
    } catch { /* fail-open */ }

    try {
      await embedCompanyProfile(companyId).catch((e) => logger.warn({ error: e }, "Re-embedding queued"));
    } catch { /* background */ }

    res.json({ success: true, data: { company, message: "Updated" } } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to update company");
    res.status(500).json({ success: false, error: "Failed to update company" } satisfies ApiResponse);
  }
});

router.delete("/:companyId", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    const existing = await db.company.findUnique({ where: { id: companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Company not found" } satisfies ApiResponse);
      return;
    }

    await db.company.delete({ where: { id: companyId } });

    try {
      const redis = await getRedisClient();
      await redis.del(`${COMPANY_CACHE_PREFIX}${companyId}`);
      await redis.del(`${COMPANY_CACHE_PREFIX}intel:${companyId}`);
    } catch { /* fail-open */ }

    res.json({ success: true } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to delete company");
    res.status(500).json({ success: false, error: "Failed to delete company" } satisfies ApiResponse);
  }
});

router.get("/:companyId/recommendations", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (Number.isNaN(companyId) || companyId < 1) {
      res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
      return;
    }

    const [company, user] = await Promise.all([
      db.company.findUnique({ where: { id: companyId } }),
      db.user.findUnique({ where: { id: req.user.sub } }),
    ]);

    if (!company) {
      res.status(404).json({ success: false, error: "Company not found" } satisfies ApiResponse);
      return;
    }

    if (!user || user.role !== "student") {
      res.status(400).json({ success: false, error: "Only students can get recommendations" } satisfies ApiResponse);
      return;
    }

    const profileData = user.profileData as Record<string, unknown> | null;
    let score = 50;
    const reasons: string[] = [];

    if (profileData?.cgpa && company.minCgpa) {
      const cgpa = Number(profileData.cgpa);
      const minCgpa = Number(company.minCgpa);
      if (cgpa >= minCgpa) {
        score += 20;
        reasons.push(`CGPA ${cgpa} meets minimum requirement of ${minCgpa}`);
      } else {
        score -= 10;
        reasons.push(`CGPA ${cgpa} below minimum requirement of ${minCgpa}`);
      }
    }

    if (profileData?.targetSalaryMin && profileData?.targetSalaryMax && company.package) {
      reasons.push(`Salary range compatible with company package (${company.package})`);
      score += 10;
    }

    if (company.glassdoorRating && Number(company.glassdoorRating) >= 4) {
      score += 10;
      reasons.push("High Glassdoor rating");
    }

    if (company.selectionRate) {
      const rate = parseFloat(company.selectionRate);
      if (rate > 5) {
        score += 10;
        reasons.push("Higher selection probability");
      } else {
        score -= 5;
      }
    }

    score = Math.max(0, Math.min(100, score));

    res.json({
      success: true,
      data: { companyId: company.id, score, reasons },
    } satisfies ApiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, companyId: req.params.companyId }, "Failed to get recommendations");
    res.status(500).json({ success: false, error: "Failed to get recommendations" } satisfies ApiResponse);
  }
});

export default router;
