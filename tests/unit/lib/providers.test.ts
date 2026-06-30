import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("providers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("OPENROUTER_API_KEY", "test-or-key");
    vi.stubEnv("GOOGLE_API_KEY", "test-google-key");
    vi.stubEnv("RESEARCH_PROVIDERS", "openrouter,groq");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should export PROVIDERS, invoke, invokeWithFallback, RESEARCH_PROVIDERS", async () => {
    const mod = await import("../../../src/lib/providers");
    expect(mod.PROVIDERS).toBeDefined();
    expect(mod.invoke).toBeDefined();
    expect(mod.invokeWithFallback).toBeDefined();
    expect(mod.RESEARCH_PROVIDERS).toEqual(["openrouter", "groq"]);
  });

  it("RESEARCH_PROVIDERS respects env override", async () => {
    vi.stubEnv("RESEARCH_PROVIDERS", "groq");
    const mod = await import("../../../src/lib/providers");
    expect(mod.RESEARCH_PROVIDERS).toEqual(["groq"]);
  });

  it("invoke with unknown provider throws", async () => {
    const mod = await import("../../../src/lib/providers");
    expect(() => mod.invoke("nonexistent", "test")).toThrow("Unknown provider");
  });

  it("invokeWithFallback throws when fallback also fails", async () => {
    const mod = await import("../../../src/lib/providers");
    await expect(mod.invokeWithFallback("nonexistent", "test", "fake")).rejects.toThrow();
  });

  it("PROVIDERS object has expected keys", async () => {
    const mod = await import("../../../src/lib/providers");
    expect(mod.PROVIDERS).toHaveProperty("openrouter");
    expect(mod.PROVIDERS).toHaveProperty("groq");
    expect(mod.PROVIDERS).toHaveProperty("gemini");
    expect(mod.PROVIDERS).toHaveProperty("openrouter-alt");
  });
});
