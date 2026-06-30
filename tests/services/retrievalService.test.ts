import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/ollama", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.5)),
}));

vi.mock("../../src/lib/db", () => ({
  db: {
    company: { findMany: vi.fn(), findUnique: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("../../src/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  }),
}));

describe("Retrieval Service", () => {
  it("should export required functions", async () => {
    const mod = await import("../../src/services/retrievalService");
    expect(mod.semanticSearch).toBeDefined();
    expect(mod.searchByCompanyId).toBeDefined();
    expect(mod.getContextForQuery).toBeDefined();
    expect(mod.searchCompanies).toBeDefined();
  });
});
