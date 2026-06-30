import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/db", () => ({
  db: {
    company: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("../../src/services/embeddingService", () => ({
  embedCompanyProfile: vi.fn().mockResolvedValue(undefined),
}));

describe("Companies Routes", () => {
  it("should export router", async () => {
    const mod = await import("../../src/routes/companies");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
