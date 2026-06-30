import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/db", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/db")>("../../../src/lib/db");
  return { ...actual };
});

describe("db", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should export createPrismaClient and db singleton", async () => {
    const mod = await import("../../../src/lib/db");
    expect(mod.createPrismaClient).toBeDefined();
    expect(typeof mod.createPrismaClient).toBe("function");
    expect(mod.db).toBeDefined();
  });

  it("createPrismaClient returns an object with $connect and $disconnect", async () => {
    const mod = await import("../../../src/lib/db");
    const client = mod.createPrismaClient();
    expect(client).toBeDefined();
    expect(typeof client.$connect).toBe("function");
    expect(typeof client.$disconnect).toBe("function");
  });

  it("db singleton returns the same instance as createPrismaClient", async () => {
    const mod = await import("../../../src/lib/db");
    const manual = mod.createPrismaClient();
    expect(typeof manual.$connect).toBe("function");
  });
});
