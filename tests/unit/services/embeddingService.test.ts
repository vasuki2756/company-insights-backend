import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/db", () => ({
  db: {
    company: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    embedding: {
      deleteMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../../../src/lib/ollama", () => ({
  generateEmbedding: vi.fn(),
}));

// Override the setup.ts mock so the real embeddingService code runs
vi.mock("../../../src/services/embeddingService", async () => {
  return await vi.importActual("../../../src/services/embeddingService");
});

import type { Mock } from "vitest";
import { db } from "../../../src/lib/db";
import { generateEmbedding } from "../../../src/lib/ollama";

beforeEach(() => {
  vi.clearAllMocks();
});

const fullCompanyProfile = {
  company_id: 1,
  name: "Acme Corp",
  category: "Tech",
  company_json: {
    full_json: {
      overviewText: "Acme is a leading tech company.",
      visionStatement: "To innovate everywhere",
      missionStatement: "Deliver excellence",
      coreValues: ["Integrity", "Innovation"],
      ceoName: "Jane Doe",
      keyLeaders: ["Alice", "Bob"],
      boardMembers: ["Charlie"],
      annualRevenue: "$1B",
      annualProfit: "$200M",
      valuation: "$5B",
      yoyGrowthRate: "15%",
      keyInvestors: ["VC1", "VC2"],
      techStack: ["React", "Node.js", "PostgreSQL"],
      aiMlAdoptionLevel: "Advanced",
      rAndDInvestment: "$100M",
      intellectualProperty: ["Patent A", "Patent B"],
      offeringsDescription: ["Cloud Platform", "Analytics"],
      focusSectors: ["Healthcare", "Finance"],
      topCustomers: ["Customer1", "Customer2"],
      keyCompetitors: ["CompetitorA", "CompetitorB"],
      marketSharePercentage: "25%",
      competitiveAdvantages: ["Speed", "Scale"],
      workCultureSummary: "Remote-first culture",
      diversityInclusionScore: "85",
      psychologicalSafety: "High",
      burnoutRisk: "Low",
      fixedVsVariablePay: "60:40",
      esopsIncentives: ["ESOP 2024"],
      familyHealthInsurance: ["Dental", "Vision"],
      trainingSpend: "$5000/employee",
      avgRetentionTenure: "3.5 years",
      mentorshipAvailability: ["Senior mentorship"],
      internalMobility: "High",
      employeeTurnover: "12%",
      esgRatings: ["AAA"],
      sustainabilityCsr: "Carbon neutral by 2030",
      glassdoorPros: "Good culture",
      glassdoorCons: "Long hours sometimes",
      ratingCombined: "4.2",
      indeedRating: "4.0",
      operatingCountries: ["USA", "India"],
      officeLocations: ["NYC", "Bangalore"],
    },
  },
};

describe("embeddingService", () => {
  describe("embedCompanyProfile", () => {
    it("should embed a company profile successfully", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(fullCompanyProfile);
      const fakeEmbedding = new Array(384).fill(0.05);
      (generateEmbedding as Mock).mockResolvedValue(fakeEmbedding);
      (db.$executeRawUnsafe as Mock).mockResolvedValue(undefined);

      const { embedCompanyProfile } = await import("../../../src/services/embeddingService");
      await embedCompanyProfile(1);

      expect(db.company.findUnique).toHaveBeenCalledWith({
        where: { company_id: 1 },
        include: { company_json: true },
      });
      expect(generateEmbedding).toHaveBeenCalledTimes(12);
      expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(12);

      const rawSql = (db.$executeRawUnsafe as Mock).mock.calls[0][0];
      expect(rawSql).toContain("INSERT INTO \"embeddings\"");
      expect(rawSql).toContain("ON CONFLICT");

      const params = (db.$executeRawUnsafe as Mock).mock.calls[0].slice(1);
      expect(params[0]).toBe(1);
      expect(params[1]).toBe(`[${fakeEmbedding.join(",")}]`);
      expect(params[2]).toContain("overview");

      const lastParams = (db.$executeRawUnsafe as Mock).mock.calls[11].slice(1);
      expect(lastParams[2]).toContain("location");
    });

    it("should skip when company is not found", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(null);

      const { embedCompanyProfile } = await import("../../../src/services/embeddingService");
      await embedCompanyProfile(999);

      expect(generateEmbedding).not.toHaveBeenCalled();
      expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("should skip when full_json is empty or has no extractable content", async () => {
      (db.company.findUnique as Mock).mockResolvedValue({
        company_id: 2,
        name: "Empty Corp",
        company_json: { full_json: {} },
      });

      const { embedCompanyProfile } = await import("../../../src/services/embeddingService");
      await embedCompanyProfile(2);

      expect(generateEmbedding).not.toHaveBeenCalled();
      expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("should handle missing company_json gracefully", async () => {
      (db.company.findUnique as Mock).mockResolvedValue({
        company_id: 3,
        name: "NoJsonCorp",
        company_json: null,
      });

      const { embedCompanyProfile } = await import("../../../src/services/embeddingService");
      await embedCompanyProfile(3);

      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it("should handle embedding generation failure gracefully", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(fullCompanyProfile);
      (generateEmbedding as Mock).mockRejectedValue(new Error("Ollama unavailable"));

      const { embedCompanyProfile } = await import("../../../src/services/embeddingService");
      await embedCompanyProfile(1);

      expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("should handle db upsert failure gracefully", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(fullCompanyProfile);
      (generateEmbedding as Mock).mockResolvedValue(new Array(384).fill(0.1));
      (db.$executeRawUnsafe as Mock).mockRejectedValue(new Error("DB constraint"));

      const { embedCompanyProfile } = await import("../../../src/services/embeddingService");
      await embedCompanyProfile(1);

      expect(db.$executeRawUnsafe).toHaveBeenCalled();
    });
  });

  describe("updateCompanyEmbeddings", () => {
    it("should delete old embeddings and re-embed", async () => {
      (db.embedding.deleteMany as Mock).mockResolvedValue({ count: 3 });
      (db.company.findUnique as Mock).mockResolvedValue(null);

      const { updateCompanyEmbeddings } = await import("../../../src/services/embeddingService");
      await updateCompanyEmbeddings(1);

      expect(db.embedding.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } });
    });

    it("should throw when deletion fails", async () => {
      (db.embedding.deleteMany as Mock).mockRejectedValue(new Error("DB error"));

      const { updateCompanyEmbeddings } = await import("../../../src/services/embeddingService");
      await expect(updateCompanyEmbeddings(1)).rejects.toThrow("Failed to update embeddings for company 1");
    });
  });

  describe("embedAllCompanies", () => {
    const companies = [
      { company_id: 1, name: "Acme" },
      { company_id: 2, name: "Beta" },
      { company_id: 3, name: "Gamma" },
      { company_id: 4, name: "Delta" },
      { company_id: 5, name: "Epsilon" },
      { company_id: 6, name: "Zeta" },
    ];

    beforeEach(() => {
      (db.company.findMany as Mock).mockResolvedValue(companies);
    });

    it("should process all companies in batches and return progress", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(fullCompanyProfile);
      (generateEmbedding as Mock).mockResolvedValue(new Array(384).fill(0.1));
      (db.$executeRawUnsafe as Mock).mockResolvedValue(undefined);

      const { embedAllCompanies } = await import("../../../src/services/embeddingService");
      const progress = await embedAllCompanies();

      expect(progress.total).toBe(6);
      expect(progress.completed).toBe(6);
      expect(progress.failed).toBe(0);
    });

    it("should count failed embeddings separately", async () => {
      let callCount = 0;
      (db.company.findUnique as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          return Promise.reject(new Error("DB failure on company 3"));
        }
        return Promise.resolve({
          company_id: callCount,
          name: `Company ${callCount}`,
          company_json: { full_json: { overviewText: "Some text" } },
        });
      });
      (generateEmbedding as Mock).mockResolvedValue(new Array(384).fill(0.1));
      (db.$executeRawUnsafe as Mock).mockResolvedValue(undefined);

      const { embedAllCompanies } = await import("../../../src/services/embeddingService");
      const progress = await embedAllCompanies();

      expect(progress.total).toBe(6);
      expect(progress.failed).toBeGreaterThanOrEqual(1);
    });

    it("should handle empty company list", async () => {
      (db.company.findMany as Mock).mockResolvedValue([]);

      const { embedAllCompanies } = await import("../../../src/services/embeddingService");
      const progress = await embedAllCompanies();

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(0);
    });
  });

  describe("rebuildEmbeddings", () => {
    it("should clear all embeddings and re-embed all companies", async () => {
      (db.embedding.deleteMany as Mock).mockResolvedValue({ count: 50 });
      (db.company.findMany as Mock).mockResolvedValue([]);

      const { rebuildEmbeddings } = await import("../../../src/services/embeddingService");
      const progress = await rebuildEmbeddings();

      expect(db.embedding.deleteMany).toHaveBeenCalledWith();
      expect(progress.total).toBe(0);
    });

    it("should handle deletion failure and still proceed to re-embed", async () => {
      (db.embedding.deleteMany as Mock).mockRejectedValue(new Error("Clear failed"));
      (db.company.findMany as Mock).mockResolvedValue([]);

      const { rebuildEmbeddings } = await import("../../../src/services/embeddingService");
      const progress = await rebuildEmbeddings();

      expect(progress.total).toBe(0);
    });
  });
});
