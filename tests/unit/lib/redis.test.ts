import { describe, it, expect } from "vitest";

describe("redis", () => {
  it("should export getRedisClient", async () => {
    const mod = await import("../../../src/lib/redis");
    expect(mod.getRedisClient).toBeDefined();
    expect(typeof mod.getRedisClient).toBe("function");
  });
});
