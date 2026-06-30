import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/db", () => ({
  db: {
    company: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    embedding: {
      deleteMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock("../../src/lib/ollama", () => ({
  generateEmbedding: vi.fn(),
}));

import { db } from "../../src/lib/db";

describe("Embedding Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export required functions", async () => {
    const mod = await vi.importActual("../../src/services/embeddingService");
    expect(mod.embedCompanyProfile).toBeDefined();
    expect(mod.embedAllCompanies).toBeDefined();
    expect(mod.rebuildEmbeddings).toBeDefined();
    expect(mod.updateCompanyEmbeddings).toBeDefined();
  });

  describe("embedCompanyProfile", () => {
    it("generates and stores embedding for a company", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        company_id: 1,
        name: "Acme Corp",
        company_json: {
          full_json: { overviewText: "A great company", techStack: ["React", "Node"] },
        },
      });
      const mockGenerateEmbedding = (await import("../../src/lib/ollama")).generateEmbedding;
      vi.mocked(mockGenerateEmbedding).mockResolvedValue(new Array(384).fill(0.1));
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(undefined);

      const mod = await vi.importActual("../../src/services/embeddingService");
      await mod.embedCompanyProfile(1);

      expect(mockGenerateEmbedding).toHaveBeenCalled();
      expect(db.$executeRawUnsafe).toHaveBeenCalled();
    });

    it("skips when company is not found", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue(null);
      const mod = await vi.importActual("../../src/services/embeddingService");
      await mod.embedCompanyProfile(999);
      const mockGenerateEmbedding = (await import("../../src/lib/ollama")).generateEmbedding;
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });

    it("skips when company has no extractable content", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        company_id: 2,
        name: "Minimal Corp",
        company_json: { full_json: {}, short_json: null },
      });
      const mod = await vi.importActual("../../src/services/embeddingService");
      await mod.embedCompanyProfile(2);
      const mockGenerateEmbedding = (await import("../../src/lib/ollama")).generateEmbedding;
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });
  });

  describe("updateCompanyEmbeddings", () => {
    it("deletes existing embeddings and re-embeds", async () => {
      vi.mocked(db.company.findUnique).mockResolvedValue({
        company_id: 1,
        name: "Acme Corp",
        company_json: { full_json: { overviewText: "test" } },
      });
      const mockGenerateEmbedding = (await import("../../src/lib/ollama")).generateEmbedding;
      vi.mocked(mockGenerateEmbedding).mockResolvedValue(new Array(384).fill(0.1));
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(undefined);

      const mod = await vi.importActual("../../src/services/embeddingService");
      await mod.updateCompanyEmbeddings(1);

      expect(db.embedding.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } });
    });
  });
});
