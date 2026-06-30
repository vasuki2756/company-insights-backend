import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/ollama", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/ollama")>("../../../src/lib/ollama");
  return { ...actual };
});

describe("ollama", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should export generateEmbedding and checkOllamaHealth", async () => {
    const mod = await import("../../../src/lib/ollama");
    expect(mod.generateEmbedding).toBeDefined();
    expect(typeof mod.generateEmbedding).toBe("function");
    expect(mod.checkOllamaHealth).toBeDefined();
    expect(typeof mod.checkOllamaHealth).toBe("function");
  });
});
