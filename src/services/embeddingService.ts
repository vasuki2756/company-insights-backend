import pino from "pino";
import { db } from "../lib/db";
import { generateEmbedding } from "../lib/ollama";
import type { EmbeddingProgress } from "../types/ai";

const logger = pino({ name: "embedding" });

const BATCH_SIZE = 5;
const VECTOR_DIMENSIONS = 384;

function val(p: Record<string, unknown>, key: string): unknown {
  return p[key] ?? p[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
}
function str(p: Record<string, unknown>, key: string): string | undefined {
  const v = val(p, key);
  return v ? String(v) : undefined;
}
function arr(p: Record<string, unknown>, key: string): string {
  const v = val(p, key);
  return Array.isArray(v) ? v.join(", ") : v ? String(v) : "";
}

interface SectionExtractor {
  type: string;
  extract: (profile: Record<string, unknown>) => string;
}

const sectionExtractors: SectionExtractor[] = [
  {
    type: "overview",
    extract: (p) => {
      const parts: string[] = [];
      const ov = str(p, "overviewText"); if (ov) parts.push(`Overview: ${ov}`);
      const vs = str(p, "visionStatement"); if (vs) parts.push(`Vision: ${vs}`);
      const ms = str(p, "missionStatement"); if (ms) parts.push(`Mission: ${ms}`);
      const cv = arr(p, "coreValues"); if (cv) parts.push(`Core Values: ${cv}`);
      return parts.join("\n");
    },
  },
  {
    type: "leadership",
    extract: (p) => {
      const parts: string[] = [];
      const cn = str(p, "ceoName"); if (cn) parts.push(`CEO: ${cn}`);
      const kl = arr(p, "keyLeaders"); if (kl) parts.push(`Key Leaders: ${kl}`);
      const bm = arr(p, "boardMembers"); if (bm) parts.push(`Board Members: ${bm}`);
      return parts.join("\n");
    },
  },
  {
    type: "financials",
    extract: (p) => {
      const parts: string[] = [];
      const ar = str(p, "annualRevenue"); if (ar) parts.push(`Annual Revenue: ${ar}`);
      const ap = str(p, "annualProfit"); if (ap) parts.push(`Annual Profit: ${ap}`);
      const v = str(p, "valuation"); if (v) parts.push(`Valuation: ${v}`);
      const yg = str(p, "yoyGrowthRate"); if (yg) parts.push(`YoY Growth Rate: ${yg}`);
      const ki = arr(p, "keyInvestors"); if (ki) parts.push(`Key Investors: ${ki}`);
      return parts.join("\n");
    },
  },
  {
    type: "tech_stack",
    extract: (p) => {
      const parts: string[] = [];
      const ts = arr(p, "techStack"); if (ts) parts.push(`Tech Stack: ${ts}`);
      const ai = str(p, "aiMlAdoptionLevel"); if (ai) parts.push(`AI/ML Adoption Level: ${ai}`);
      const rd = str(p, "rAndDInvestment"); if (rd) parts.push(`R&D Investment: ${rd}`);
      const ip = arr(p, "intellectualProperty"); if (ip) parts.push(`Intellectual Property: ${ip}`);
      return parts.join("\n");
    },
  },
  {
    type: "products",
    extract: (p) => {
      const parts: string[] = [];
      const od = arr(p, "offeringsDescription"); if (od) parts.push(`Offerings: ${od}`);
      const fs = arr(p, "focusSectors"); if (fs) parts.push(`Focus Sectors: ${fs}`);
      const tc = arr(p, "topCustomers"); if (tc) parts.push(`Top Customers: ${tc}`);
      return parts.join("\n");
    },
  },
  {
    type: "competitive_landscape",
    extract: (p) => {
      const parts: string[] = [];
      const kc = arr(p, "keyCompetitors"); if (kc) parts.push(`Key Competitors: ${kc}`);
      const ms = str(p, "marketSharePercentage"); if (ms) parts.push(`Market Share: ${ms}`);
      const ca = arr(p, "competitiveAdvantages"); if (ca) parts.push(`Competitive Advantages: ${ca}`);
      return parts.join("\n");
    },
  },
  {
    type: "culture",
    extract: (p) => {
      const parts: string[] = [];
      const wc = str(p, "workCultureSummary"); if (wc) parts.push(`Work Culture: ${wc}`);
      const di = str(p, "diversityInclusionScore"); if (di) parts.push(`Diversity & Inclusion Score: ${di}`);
      const ps = str(p, "psychologicalSafety"); if (ps) parts.push(`Psychological Safety: ${ps}`);
      const br = str(p, "burnoutRisk"); if (br) parts.push(`Burnout Risk: ${br}`);
      return parts.join("\n");
    },
  },
  {
    type: "compensation",
    extract: (p) => {
      const parts: string[] = [];
      const fv = str(p, "fixedVsVariablePay"); if (fv) parts.push(`Pay Structure: ${fv}`);
      const ei = arr(p, "esopsIncentives"); if (ei) parts.push(`ESOPs & Incentives: ${ei}`);
      const fh = arr(p, "familyHealthInsurance"); if (fh) parts.push(`Health Insurance: ${fh}`);
      const ts = str(p, "trainingSpend"); if (ts) parts.push(`Training Spend: ${ts}`);
      const at = str(p, "avgRetentionTenure"); if (at) parts.push(`Avg Retention Tenure: ${at}`);
      return parts.join("\n");
    },
  },
  {
    type: "career_growth",
    extract: (p) => {
      const parts: string[] = [];
      const ma = arr(p, "mentorshipAvailability"); if (ma) parts.push(`Mentorship: ${ma}`);
      const im = str(p, "internalMobility"); if (im) parts.push(`Internal Mobility: ${im}`);
      const et = str(p, "employeeTurnover"); if (et) parts.push(`Employee Turnover: ${et}`);
      return parts.join("\n");
    },
  },
  {
    type: "esg_sustainability",
    extract: (p) => {
      const parts: string[] = [];
      const er = arr(p, "esgRatings"); if (er) parts.push(`ESG Ratings: ${er}`);
      const sc = str(p, "sustainabilityCsr"); if (sc) parts.push(`Sustainability & CSR: ${sc}`);
      return parts.join("\n");
    },
  },
  {
    type: "ratings",
    extract: (p) => {
      const parts: string[] = [];
      const gp = str(p, "glassdoorPros"); if (gp) parts.push(`Glassdoor Pros: ${gp}`);
      const gc = str(p, "glassdoorCons"); if (gc) parts.push(`Glassdoor Cons: ${gc}`);
      const rc = str(p, "ratingCombined"); if (rc) parts.push(`Combined Rating: ${rc}`);
      const ir = str(p, "indeedRating"); if (ir) parts.push(`Indeed Rating: ${ir}`);
      return parts.join("\n");
    },
  },
  {
    type: "location",
    extract: (p) => {
      const parts: string[] = [];
      const oc = arr(p, "operatingCountries"); if (oc) parts.push(`Operating Countries: ${oc}`);
      const ol = arr(p, "officeLocations"); if (ol) parts.push(`Office Locations: ${ol}`);
      return parts.join("\n");
    },
  },
];

export async function embedCompanyProfile(companyId: number): Promise<void> {
  const company = await db.company.findUnique({
    where: { company_id: companyId },
    include: {
      company_json: true,
    },
  });

  if (!company) {
    logger.warn({ companyId }, "No company found, skipping");
    return;
  }

  const companyName = company.name ?? `Company ${companyId}`;
  const fullJson = (company.company_json?.full_json ?? {}) as Record<string, unknown>;

  const sections: { type: string; content: string }[] = [];
  for (const extractor of sectionExtractors) {
    try {
      const content = extractor.extract(fullJson);
      if (content && content.length >= 10) {
        sections.push({ type: extractor.type, content });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ companyId, section: extractor.type, error: message }, "Section extraction failed");
    }
  }

  if (sections.length === 0) {
    logger.warn({ companyId, companyName }, "No extractable content found, skipping");
    return;
  }

  let successCount = 0;
  for (const section of sections) {
    try {
      const truncatedContent = section.content.length > 500 ? section.content.slice(0, 500) : section.content;
      const embedding = await generateEmbedding(truncatedContent);
      const vectorStr = `[${embedding.join(",")}]`;

      await db.$executeRawUnsafe(
        `INSERT INTO "embeddings" ("companyId", "embedding", "sectionType", "content", "createdAt", "updatedAt")
         VALUES ($1, $2::vector, $3, $4, NOW(), NOW())
         ON CONFLICT ("companyId", "sectionType")
         DO UPDATE SET "embedding" = $2::vector, "content" = $4, "updatedAt" = NOW()`,
        companyId, vectorStr, section.type, truncatedContent,
      );
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ companyId, section: section.type, error: message }, "Failed to embed section");
    }
  }

  logger.info(
    { companyId, companyName, sections: successCount },
    "Company profile embedding completed",
  );
}

export async function updateCompanyEmbeddings(companyId: number): Promise<void> {
  try {
    await db.embedding.deleteMany({
      where: { companyId },
    });
    logger.info({ companyId }, "Existing embeddings deleted, re-embedding...");
    await embedCompanyProfile(companyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ companyId, error: message }, "Failed to update company embeddings");
    throw new Error(`Failed to update embeddings for company ${companyId}: ${message}`);
  }
}

export async function embedAllCompanies(): Promise<EmbeddingProgress> {
  const companies = await db.company.findMany({
    select: { company_id: true, name: true },
  });

  const progress: EmbeddingProgress = {
    total: companies.length,
    completed: 0,
    failed: 0,
    current: "",
  };

  logger.info({ total: companies.length }, "Starting batch embedding of all companies");

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (c) => {
        progress.current = c.name ?? "";
        await embedCompanyProfile(c.company_id);
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        progress.completed++;
      } else {
        progress.failed++;
        logger.error({ error: result.reason }, "Company embedding failed");
      }
    }

    logger.info(
      { completed: progress.completed, failed: progress.failed, total: progress.total },
      "Batch progress",
    );
  }

  logger.info(progress, "All company embeddings completed");
  return progress;
}

export async function rebuildEmbeddings(): Promise<EmbeddingProgress> {
  logger.info("Starting full embedding rebuild...");

  try {
    await db.embedding.deleteMany();
    logger.info("All existing embeddings deleted");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to clear embeddings");
  }

  return embedAllCompanies();
}
