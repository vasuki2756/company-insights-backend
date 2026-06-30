import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/ollama", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
}));

vi.mock("../../src/lib/db", () => ({
  db: {
    company: {
      findUnique: vi.fn(),
    },
    companyEmbedding: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

describe("Embedding Service", () => {
  it("should export required functions", async () => {
    const mod = await import("../../src/services/embeddingService");
    expect(mod.embedCompanyProfile).toBeDefined();
    expect(mod.embedAllCompanies).toBeDefined();
    expect(mod.rebuildEmbeddings).toBeDefined();
    expect(mod.updateCompanyEmbeddings).toBeDefined();
  });
});
