import pino from "pino";
import { db } from "../lib/db";
import { generateEmbedding } from "../lib/ollama";
import type { EmbeddingProgress } from "../types/ai";

const logger = pino({ name: "embedding" });

const BATCH_SIZE = 5;
const VECTOR_DIMENSIONS = 384;

interface SectionExtractor {
  type: string;
  extract: (profile: Record<string, unknown>) => string;
}

const sectionExtractors: SectionExtractor[] = [
  {
    type: "overview",
    extract: (p) => {
      const parts: string[] = [];
      if (p.overviewText) parts.push(`Overview: ${p.overviewText}`);
      if (p.visionStatement) parts.push(`Vision: ${p.visionStatement}`);
      if (p.missionStatement) parts.push(`Mission: ${p.missionStatement}`);
      if (p.coreValues) parts.push(`Core Values: ${Array.isArray(p.coreValues) ? p.coreValues.join(", ") : p.coreValues}`);
      return parts.join("\n");
    },
  },
  {
    type: "leadership",
    extract: (p) => {
      const parts: string[] = [];
      if (p.ceoName) parts.push(`CEO: ${p.ceoName}`);
      if (p.keyLeaders) parts.push(`Key Leaders: ${Array.isArray(p.keyLeaders) ? p.keyLeaders.join(", ") : p.keyLeaders}`);
      if (p.boardMembers) parts.push(`Board Members: ${Array.isArray(p.boardMembers) ? p.boardMembers.join(", ") : p.boardMembers}`);
      return parts.join("\n");
    },
  },
  {
    type: "financials",
    extract: (p) => {
      const parts: string[] = [];
      if (p.annualRevenue) parts.push(`Annual Revenue: ${p.annualRevenue}`);
      if (p.annualProfit) parts.push(`Annual Profit: ${p.annualProfit}`);
      if (p.valuation) parts.push(`Valuation: ${p.valuation}`);
      if (p.yoyGrowthRate) parts.push(`YoY Growth Rate: ${p.yoyGrowthRate}`);
      if (p.keyInvestors) parts.push(`Key Investors: ${Array.isArray(p.keyInvestors) ? p.keyInvestors.join(", ") : p.keyInvestors}`);
      return parts.join("\n");
    },
  },
  {
    type: "tech_stack",
    extract: (p) => {
      const parts: string[] = [];
      if (p.techStack) parts.push(`Tech Stack: ${Array.isArray(p.techStack) ? p.techStack.join(", ") : p.techStack}`);
      if (p.aiMlAdoptionLevel) parts.push(`AI/ML Adoption Level: ${p.aiMlAdoptionLevel}`);
      if (p.rAndDInvestment) parts.push(`R&D Investment: ${p.rAndDInvestment}`);
      if (p.intellectualProperty) parts.push(`Intellectual Property: ${Array.isArray(p.intellectualProperty) ? p.intellectualProperty.join(", ") : p.intellectualProperty}`);
      return parts.join("\n");
    },
  },
  {
    type: "products",
    extract: (p) => {
      const parts: string[] = [];
      if (p.offeringsDescription) parts.push(`Offerings: ${Array.isArray(p.offeringsDescription) ? p.offeringsDescription.join(", ") : p.offeringsDescription}`);
      if (p.focusSectors) parts.push(`Focus Sectors: ${Array.isArray(p.focusSectors) ? p.focusSectors.join(", ") : p.focusSectors}`);
      if (p.topCustomers) parts.push(`Top Customers: ${Array.isArray(p.topCustomers) ? p.topCustomers.join(", ") : p.topCustomers}`);
      return parts.join("\n");
    },
  },
  {
    type: "competitive_landscape",
    extract: (p) => {
      const parts: string[] = [];
      if (p.keyCompetitors) parts.push(`Key Competitors: ${Array.isArray(p.keyCompetitors) ? p.keyCompetitors.join(", ") : p.keyCompetitors}`);
      if (p.marketSharePercentage) parts.push(`Market Share: ${p.marketSharePercentage}`);
      if (p.competitiveAdvantages) parts.push(`Competitive Advantages: ${Array.isArray(p.competitiveAdvantages) ? p.competitiveAdvantages.join(", ") : p.competitiveAdvantages}`);
      return parts.join("\n");
    },
  },
  {
    type: "culture",
    extract: (p) => {
      const parts: string[] = [];
      if (p.workCultureSummary) parts.push(`Work Culture: ${p.workCultureSummary}`);
      if (p.diversityInclusionScore) parts.push(`Diversity & Inclusion Score: ${p.diversityInclusionScore}`);
      if (p.psychologicalSafety) parts.push(`Psychological Safety: ${p.psychologicalSafety}`);
      if (p.burnoutRisk) parts.push(`Burnout Risk: ${p.burnoutRisk}`);
      return parts.join("\n");
    },
  },
  {
    type: "compensation",
    extract: (p) => {
      const parts: string[] = [];
      if (p.fixedVsVariablePay) parts.push(`Pay Structure: ${p.fixedVsVariablePay}`);
      if (p.esopsIncentives) parts.push(`ESOPs & Incentives: ${Array.isArray(p.esopsIncentives) ? p.esopsIncentives.join(", ") : p.esopsIncentives}`);
      if (p.familyHealthInsurance) parts.push(`Health Insurance: ${Array.isArray(p.familyHealthInsurance) ? p.familyHealthInsurance.join(", ") : p.familyHealthInsurance}`);
      if (p.trainingSpend) parts.push(`Training Spend: ${p.trainingSpend}`);
      if (p.avgRetentionTenure) parts.push(`Avg Retention Tenure: ${p.avgRetentionTenure}`);
      return parts.join("\n");
    },
  },
  {
    type: "career_growth",
    extract: (p) => {
      const parts: string[] = [];
      if (p.mentorshipAvailability) parts.push(`Mentorship: ${Array.isArray(p.mentorshipAvailability) ? p.mentorshipAvailability.join(", ") : p.mentorshipAvailability}`);
      if (p.internalMobility) parts.push(`Internal Mobility: ${p.internalMobility}`);
      if (p.employeeTurnover) parts.push(`Employee Turnover: ${p.employeeTurnover}`);
      return parts.join("\n");
    },
  },
  {
    type: "esg_sustainability",
    extract: (p) => {
      const parts: string[] = [];
      if (p.esgRatings) parts.push(`ESG Ratings: ${Array.isArray(p.esgRatings) ? p.esgRatings.join(", ") : p.esgRatings}`);
      if (p.sustainabilityCsr) parts.push(`Sustainability & CSR: ${p.sustainabilityCsr}`);
      return parts.join("\n");
    },
  },
  {
    type: "ratings",
    extract: (p) => {
      const parts: string[] = [];
      if (p.glassdoorPros) parts.push(`Glassdoor Pros: ${p.glassdoorPros}`);
      if (p.glassdoorCons) parts.push(`Glassdoor Cons: ${p.glassdoorCons}`);
      if (p.ratingCombined) parts.push(`Combined Rating: ${p.ratingCombined}`);
      if (p.indeedRating) parts.push(`Indeed Rating: ${p.indeedRating}`);
      return parts.join("\n");
    },
  },
  {
    type: "location",
    extract: (p) => {
      const parts: string[] = [];
      if (p.operatingCountries) parts.push(`Operating Countries: ${Array.isArray(p.operatingCountries) ? p.operatingCountries.join(", ") : p.operatingCountries}`);
      if (p.officeLocations) parts.push(`Office Locations: ${Array.isArray(p.officeLocations) ? p.officeLocations.join(", ") : p.officeLocations}`);
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

  const combinedContent = sections.map((s) => `[${s.type}]\n${s.content}`).join("\n\n");
  const sectionTypesCombined = sections.map((s) => s.type).join(",");

  try {
    const embedding = await generateEmbedding(combinedContent);
    const vectorStr = `[${embedding.join(",")}]`;

    // Use raw SQL because the `embedding` field is Unsupported("vector(384)")
    await db.$executeRawUnsafe(
      `INSERT INTO "embeddings" ("companyId", "embedding", "sectionType", "content")
       VALUES ($1, $2::vector, $3, $4)
       ON CONFLICT ("companyId")
       DO UPDATE SET "embedding" = $2::vector, "sectionType" = $3, "content" = $4`,
      companyId, vectorStr, sectionTypesCombined, combinedContent,
    );

    logger.info(
      { companyId, companyName, embeddedSections: sections.length },
      "Company profile embedding completed",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { companyId, error: message },
      "Failed to embed company profile",
    );
  }
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
