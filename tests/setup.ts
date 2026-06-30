import { vi } from "vitest";

vi.mock("../src/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    company_json: {
      findUnique: vi.fn(),
    },
    company_skill_levels: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../src/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue("PONG"),
  }),
}));

vi.mock("../src/lib/ollama", () => ({
  checkOllamaHealth: vi.fn(),
}));

vi.mock("../src/services/embeddingService", () => ({
  embedCompanyProfile: vi.fn().mockResolvedValue(undefined),
  embedAllCompanies: vi.fn().mockResolvedValue(undefined),
  rebuildEmbeddings: vi.fn().mockResolvedValue(undefined),
  updateCompanyEmbeddings: vi.fn().mockResolvedValue(undefined),
}));
