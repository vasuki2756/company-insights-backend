import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn(() => "/fake/path/lib/prompts.ts"),
}));

vi.mock("node:path", () => ({
  resolve: vi.fn((...args: string[]) => args.join("/")),
}));

describe("lib/prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("load reads the correct file", async () => {
    vi.mocked(readFileSync).mockReturnValue("template content");
    const mod = await import("../../../src/lib/prompts");
    const result = mod.load("research");
    expect(readFileSync).toHaveBeenCalled();
    expect(result).toBe("template content");
  });

  it("render loads and replaces tokens", async () => {
    vi.mocked(readFileSync).mockReturnValue("Hello {{NAME}}, your role is {{ROLE}}");
    const mod = await import("../../../src/lib/prompts");
    const result = mod.render("test", { name: "Alice", role: "engineer" });
    expect(result).toBe("Hello Alice, your role is engineer");
  });

  it("render with no tokens returns the raw template", async () => {
    vi.mocked(readFileSync).mockReturnValue("static content");
    const mod = await import("../../../src/lib/prompts");
    const result = mod.render("static");
    expect(result).toBe("static content");
  });

  it("render keeps unmatched tokens as-is", async () => {
    vi.mocked(readFileSync).mockReturnValue("Hello {{NAME}}, {{MISSING}}");
    const mod = await import("../../../src/lib/prompts");
    const result = mod.render("test", { name: "Bob" });
    expect(result).toBe("Hello Bob, {{MISSING}}");
  });
});
