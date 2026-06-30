import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@langchain/groq", () => ({
  ChatGroq: vi.fn(function () {
    return {
      invoke: vi.fn().mockResolvedValue({ content: "mock response" }),
      stream: vi.fn(),
    };
  }),
}));

describe("llm", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should export generateResponse and generateStreamingResponse", async () => {
    const mod = await import("../../../src/lib/llm");
    expect(mod.generateResponse).toBeDefined();
    expect(mod.generateStreamingResponse).toBeDefined();
  });

  it("generateResponse throws when GROQ_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const mod = await import("../../../src/lib/llm");
    await expect(mod.generateResponse("test")).rejects.toThrow("Failed to generate response");
  });
});
