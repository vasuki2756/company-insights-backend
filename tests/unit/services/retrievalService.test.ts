import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/db", () => ({
  db: {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    company: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    embedding: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../../../src/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("../../../src/lib/ollama", () => ({
  generateEmbedding: vi.fn(),
}));

import type { Mock } from "vitest";
import { db } from "../../../src/lib/db";
import { getRedisClient } from "../../../src/lib/redis";
import { generateEmbedding } from "../../../src/lib/ollama";

const defaultRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getRedisClient as Mock).mockResolvedValue(defaultRedis);
  (generateEmbedding as Mock).mockResolvedValue(new Array(384).fill(0.5));
  defaultRedis.get.mockReset();
  defaultRedis.set.mockReset();
});

function makeRawRow(overrides: Record<string, unknown> = {}) {
  return {
    company_id: 1,
    section_type: "overview",
    content: "Test content about the company",
    distance: 0.05,
    company_name: "Acme Corp",
    company_category: "Tech",
    ...overrides,
  };
}

function makeRawRowNoDistance(overrides: Record<string, unknown> = {}) {
  return {
    company_id: 1,
    section_type: "overview",
    content: "Test content",
    company_name: "Acme Corp",
    company_category: "Tech",
    ...overrides,
  };
}

describe("retrievalService", () => {
  describe("semanticSearch", () => {
    it("should perform a pgvector semantic search and cache results", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRow()]);
      defaultRedis.set.mockResolvedValue("OK");

      const { semanticSearch } = await import("../../../src/services/retrievalService");
      const results = await semanticSearch("find tech companies", 5, 0.4);

      expect(results).toHaveLength(1);
      expect(results[0].companyId).toBe(1);
      expect(results[0].sectionType).toBe("overview");
      expect(results[0].company.name).toBe("Acme Corp");
      expect(results[0].similarity).toBeCloseTo(0.95, 2);
      expect(generateEmbedding).toHaveBeenCalledWith("find tech companies");
      expect(db.$queryRawUnsafe).toHaveBeenCalledOnce();
      expect(defaultRedis.set).toHaveBeenCalledOnce();
    });

    it("should return cached results on cache hit", async () => {
      const cachedResults = [
        { companyId: 1, sectionType: "overview", content: "cached", similarity: 0.9, company: { name: "CachedCorp", category: "AI" } },
      ];
      defaultRedis.get.mockResolvedValue(JSON.stringify(cachedResults));

      const { semanticSearch } = await import("../../../src/services/retrievalService");
      const results = await semanticSearch("cached query");

      expect(results).toEqual(cachedResults);
      expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockRejectedValue(new Error("DB connection lost"));

      const { semanticSearch } = await import("../../../src/services/retrievalService");
      const results = await semanticSearch("error query");

      expect(results).toEqual([]);
    });

    it("should calculate similarity correctly from distance", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([
        makeRawRow({ distance: 0.2 }),
        makeRawRow({ company_id: 2, distance: 0.5 }),
      ]);
      defaultRedis.set.mockResolvedValue("OK");

      const { semanticSearch } = await import("../../../src/services/retrievalService");
      const results = await semanticSearch("query");

      expect(results[0].similarity).toBeCloseTo(0.8, 2);
      expect(results[1].similarity).toBeCloseTo(0.5, 2);
    });
  });

  describe("searchByCompanyId", () => {
    it("should search within a company with a query using vector similarity", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRow()]);
      defaultRedis.set.mockResolvedValue("OK");

      const { searchByCompanyId } = await import("../../../src/services/retrievalService");
      const results = await searchByCompanyId(1, "React developers");

      expect(results).toHaveLength(1);
      expect(db.$queryRawUnsafe).toHaveBeenCalledOnce();
      const sql = (db.$queryRawUnsafe as Mock).mock.calls[0][0] as string;
      expect(sql).toContain("ce.embedding <=> $1::vector");
      expect(sql).toContain("ce.\"companyId\" = $2");
      expect(generateEmbedding).toHaveBeenCalledWith("React developers");
    });

    it("should search within a company without a query (return all sections)", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRowNoDistance()]);
      defaultRedis.set.mockResolvedValue("OK");

      const { searchByCompanyId } = await import("../../../src/services/retrievalService");
      const results = await searchByCompanyId(1);

      expect(results).toHaveLength(1);
      const sql = (db.$queryRawUnsafe as Mock).mock.calls[0][0] as string;
      expect(sql).not.toContain("<=>");
      expect(sql).toContain("ce.\"companyId\" = $1");
      expect(results[0].similarity).toBe(1);
      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it("should return cached results for company search", async () => {
      const cached = [
        { companyId: 1, sectionType: "overview", content: "cached", similarity: 1, company: { name: "Acme", category: "Tech" } },
      ];
      defaultRedis.get.mockResolvedValue(JSON.stringify(cached));

      const { searchByCompanyId } = await import("../../../src/services/retrievalService");
      const results = await searchByCompanyId(1, "typescript");

      expect(results).toEqual(cached);
      expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockRejectedValue(new Error("Query failed"));

      const { searchByCompanyId } = await import("../../../src/services/retrievalService");
      const results = await searchByCompanyId(99, "error");

      expect(results).toEqual([]);
    });
  });

  describe("getContextForQuery", () => {
    it("should format a single result into a context string", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRow()]);
      defaultRedis.set.mockResolvedValue("OK");

      const { getContextForQuery } = await import("../../../src/services/retrievalService");
      const context = await getContextForQuery("AI companies");

      expect(context).toContain("Company: Acme Corp");
      expect(context).toContain("Section: overview");
      expect(context).toContain("Test content about the company");
    });

    it("should use company filter when companyId is provided", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRow()]);
      defaultRedis.set.mockResolvedValue("OK");

      const { getContextForQuery } = await import("../../../src/services/retrievalService");
      await getContextForQuery("query", 42, 5);

      const sql = (db.$queryRawUnsafe as Mock).mock.calls[0][0] as string;
      // With query param, companyId is $2 (vector is $1)
      expect(sql).toContain("ce.\"companyId\" = $2");
    });

    it("should return empty string when no results found", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([]);

      const { getContextForQuery } = await import("../../../src/services/retrievalService");
      const context = await getContextForQuery("nothing");

      expect(context).toBe("");
    });

    it("should join multiple results with separators", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([
        makeRawRow({ company_id: 1, section_type: "overview", content: "First content" }),
        makeRawRow({ company_id: 2, section_type: "tech_stack", content: "Second content" }),
      ]);
      defaultRedis.set.mockResolvedValue("OK");

      const { getContextForQuery } = await import("../../../src/services/retrievalService");
      const context = await getContextForQuery("multiple results");

      const parts = context.split("\n\n---\n\n");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain("First content");
      expect(parts[1]).toContain("Second content");
    });
  });

  describe("searchCompanies", () => {
    const textRows = [
      { company_id: 1, name: "Acme Corp", relevance: 8.0 },
      { company_id: 2, name: "Beta Inc", relevance: 5.0 },
    ];

    it("should merge text and semantic search results with deduplication", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValueOnce(textRows);
      (db.$queryRawUnsafe as Mock).mockResolvedValueOnce([
        { companyId: 2, sectionType: "overview", content: "text", similarity: 0.9, company: { name: "Beta Inc", category: "Tech" } },
        { companyId: 3, sectionType: "overview", content: "text", similarity: 0.7, company: { name: "Gamma LLC", category: "AI" } },
      ]);
      defaultRedis.set.mockResolvedValue("OK");

      const { searchCompanies } = await import("../../../src/services/retrievalService");
      const results = await searchCompanies("Acme", 10);

      expect(results).toHaveLength(3);

      const acme = results.find((r) => r.companyName === "Acme Corp")!;
      expect(acme.relevance).toBe(8.0);

      const beta = results.find((r) => r.companyName === "Beta Inc")!;
      expect(beta.relevance).toBe(Math.max(5.0, 0.9 * 5));
    });

    it("should return cached results", async () => {
      const cached = [
        { companyId: 1, companyName: "Acme Corp", relevance: 8.0 },
      ];
      defaultRedis.get.mockResolvedValue(JSON.stringify(cached));

      const { searchCompanies } = await import("../../../src/services/retrievalService");
      const results = await searchCompanies("Acme");

      expect(results).toEqual(cached);
      expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("should sort by descending relevance and respect limit", async () => {
      defaultRedis.get.mockResolvedValue(null);
      const manyTextRows = Array.from({ length: 20 }, (_, i) => ({
        company_id: i + 1,
        name: `Company ${i + 1}`,
        relevance: 10 - i * 0.5,
      }));
      (db.$queryRawUnsafe as Mock).mockResolvedValueOnce(manyTextRows);
      (db.$queryRawUnsafe as Mock).mockResolvedValueOnce([]);
      defaultRedis.set.mockResolvedValue("OK");

      const { searchCompanies } = await import("../../../src/services/retrievalService");
      const results = await searchCompanies("Company", 5);

      expect(results).toHaveLength(5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].relevance).toBeLessThanOrEqual(results[i - 1].relevance);
      }
    });

    it("should handle database errors gracefully", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockRejectedValue(new Error("DB error"));

      const { searchCompanies } = await import("../../../src/services/retrievalService");
      const results = await searchCompanies("error");

      expect(results).toEqual([]);
    });

    it("should prefer the higher relevance score when merging duplicate companies", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValueOnce([textRows[0]]);
      (db.$queryRawUnsafe as Mock).mockResolvedValueOnce([
        { companyId: 1, sectionType: "overview", content: "text", similarity: 0.95, company: { name: "Acme Corp", category: "Tech" } },
      ]);
      defaultRedis.set.mockResolvedValue("OK");

      const { searchCompanies } = await import("../../../src/services/retrievalService");
      const results = await searchCompanies("Acme");

      expect(results[0].relevance).toBe(Math.max(8.0, 0.95 * 5));
    });
  });

  describe("cache behavior", () => {
    it("should skip caching on semantic search when redis.set fails", async () => {
      defaultRedis.get.mockResolvedValue(null);
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRow()]);
      defaultRedis.set.mockRejectedValue(new Error("Cache write failed"));

      const { semanticSearch } = await import("../../../src/services/retrievalService");
      const results = await semanticSearch("no cache");

      expect(results).toHaveLength(1);
    });

    it("should return null from getCached when redis.get fails", async () => {
      defaultRedis.get.mockRejectedValue(new Error("Redis error"));
      (db.$queryRawUnsafe as Mock).mockResolvedValue([makeRawRow()]);
      defaultRedis.set.mockResolvedValue("OK");

      const { semanticSearch } = await import("../../../src/services/retrievalService");
      const results = await semanticSearch("redis error");

      expect(results).toHaveLength(1);
      expect(db.$queryRawUnsafe).toHaveBeenCalled();
    });
  });
});
