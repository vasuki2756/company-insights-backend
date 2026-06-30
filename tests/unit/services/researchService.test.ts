import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/prompts", () => ({
  render: vi.fn(),
}));

vi.mock("../../../src/lib/providers", () => ({
  invoke: vi.fn(),
  invokeWithFallback: vi.fn(),
  RESEARCH_PROVIDERS: ["openrouter", "groq", "gemini"],
}));

import type { Mock } from "vitest";
import { render } from "../../../src/lib/prompts";
import { invoke, invokeWithFallback, RESEARCH_PROVIDERS } from "../../../src/lib/providers";
import type { PipelineResult } from "../../../src/services/researchService";

/**
 * GOLDEN_RECORD_COLUMNS from researchService.ts (1-indexed):
 *   1 -> "name",
 *   2 -> "short_name",
 *   3 -> "logo_url",
 *   4 -> "category",
 *   5 -> "incorporation_year",
 *   6 -> "overview_text",
 *   7 -> "nature_of_company",
 *   8 -> "headquarters_address",
 *   9 -> "operating_countries",
 *  10 -> "office_count",
 *  ...
 */

const dummyCompany = "Acme Corp";

beforeEach(() => {
  vi.resetAllMocks();
  (render as Mock).mockImplementation((_name: string, tokens?: Record<string, string>) => {
    return `Prompt for ${tokens?.company ?? "unknown"}`;
  });
});

const isValidTable = `| ID | Category | A/C | Parameter | Research Output / Data | Source |
|---|---|---|---|---|---|
| 1 | Company | A | name | Acme Corp | provider |
| 2 | Company | A | short_name | ACME | provider |
| 6 | Overview | A | overview_text | A leading tech company | provider |`;

describe("researchService", () => {
  describe("runResearch", () => {
    it("should query each provider and parse markdown results", async () => {
      (invoke as Mock)
        .mockResolvedValueOnce(isValidTable)
        .mockResolvedValueOnce(isValidTable)
        .mockResolvedValueOnce(isValidTable);

      const { runResearch } = await import("../../../src/services/researchService");
      const result = await runResearch(dummyCompany);

      expect(Object.keys(result)).toEqual(RESEARCH_PROVIDERS);
      for (const provider of RESEARCH_PROVIDERS) {
        expect(result[provider].raw).toBe(isValidTable);
        expect(result[provider].rows.length).toBe(3);
      }
      expect(invoke).toHaveBeenCalledTimes(3);
    });

    it("should handle provider failures gracefully", async () => {
      (invoke as Mock)
        .mockResolvedValueOnce(isValidTable)
        .mockRejectedValueOnce(new Error("Provider down"))
        .mockResolvedValueOnce(isValidTable);

      const { runResearch } = await import("../../../src/services/researchService");
      const result = await runResearch(dummyCompany);

      expect(result["openrouter"].rows.length).toBe(3);
      expect(result["groq"].rows).toEqual([]);
      expect(result["groq"].raw).toBe("");
      expect(result["gemini"].rows.length).toBe(3);
    });

    it("should accept a custom provider list", async () => {
      (invoke as Mock).mockResolvedValue(isValidTable);

      const { runResearch } = await import("../../../src/services/researchService");
      const result = await runResearch(dummyCompany, ["custom-provider"]);

      expect(Object.keys(result)).toEqual(["custom-provider"]);
    });

    it("should render the research prompt with company name", async () => {
      (invoke as Mock).mockResolvedValue(isValidTable);

      const { runResearch } = await import("../../../src/services/researchService");
      await runResearch("TestCompany");

      expect(render).toHaveBeenCalledWith("research", { company: "TestCompany" });
      expect(invoke).toHaveBeenCalledWith(expect.any(String), "Prompt for TestCompany");
    });
  });

  describe("runConsolidation", () => {
    const perProviderRows = {
      prov1: [
        { ID: "1", Category: "Company", "A/C": "A", Parameter: "name", "Research Output / Data": "Acme Corp", Source: "" },
        { ID: "6", Category: "Overview", "A/C": "A", Parameter: "overview_text", "Research Output / Data": "Great company", Source: "" },
      ],
      prov2: [
        { ID: "1", Category: "Company", "A/C": "A", Parameter: "name", "Research Output / Data": "Acme Corp", Source: "" },
        { ID: "60", Category: "Financials", "A/C": "A", Parameter: "annual_revenue", "Research Output / Data": "$1B", Source: "" },
      ],
    };

    it("should consolidate rows from multiple providers into a golden record", async () => {
      const consolidatedTable = `| ID | Category | A/C | Parameter | Research Output / Data | Source |
|---|---|---|---|---|---|
| 1 | Company | A | name | Acme Corp | consolidated |
| 6 | Overview | A | overview_text | Great company | consolidated |
| 60 | Financials | A | annual_revenue | 1B | consolidated |`;

      (invokeWithFallback as Mock).mockResolvedValue(consolidatedTable);

      const { runConsolidation } = await import("../../../src/services/researchService");
      const record = await runConsolidation(dummyCompany, perProviderRows, "openrouter");

      expect(invokeWithFallback).toHaveBeenCalledWith("openrouter", expect.any(String), "groq");
      expect(record.name).toBe("Acme Corp");
      expect(record.overview_text).toBe("Great company");
      expect(record.annual_revenue).toBe("1B");
    });

    it("should handle empty consolidation response", async () => {
      (invokeWithFallback as Mock).mockResolvedValue("");

      const { runConsolidation } = await import("../../../src/services/researchService");
      const record = await runConsolidation(dummyCompany, perProviderRows);

      expect(Object.keys(record).length).toBe(0);
    });

    it("should handle provider fallback failure gracefully", async () => {
      (invokeWithFallback as Mock).mockRejectedValue(new Error("All providers failed"));

      const { runConsolidation } = await import("../../../src/services/researchService");
      await expect(runConsolidation(dummyCompany, perProviderRows, "openrouter")).rejects.toThrow();
    });
  });

  describe("runSkillMatrix", () => {
    const skillTable = `| Skill | Required Level | Importance |
|---|---|---|
| JavaScript | 4 | High |
| Python | 3 | Medium |`;

    it("should call LLM and return parsed row", async () => {
      (invokeWithFallback as Mock).mockResolvedValue(skillTable);

      const { runSkillMatrix } = await import("../../../src/services/researchService");
      const result = await runSkillMatrix(dummyCompany, "openrouter");

      expect(invokeWithFallback).toHaveBeenCalledWith("openrouter", expect.any(String), "groq");
      expect(render).toHaveBeenCalledWith("expectation_matrix", { companies: dummyCompany });
      expect(result).toHaveProperty("Skill");
      expect(result).toHaveProperty("Required Level");
      expect(result).toHaveProperty("Importance");
    });

    it("should return empty object when no rows parsed", async () => {
      (invokeWithFallback as Mock).mockResolvedValue("No table here");

      const { runSkillMatrix } = await import("../../../src/services/researchService");
      const result = await runSkillMatrix(dummyCompany);

      expect(Object.keys(result).length).toBe(0);
    });

    it("should handle provider failure", async () => {
      (invokeWithFallback as Mock).mockRejectedValue(new Error("LLM unavailable"));

      const { runSkillMatrix } = await import("../../../src/services/researchService");
      await expect(runSkillMatrix(dummyCompany)).rejects.toThrow("LLM unavailable");
    });
  });

  describe("runHiringAnalysis", () => {
    it("should call LLM and parse JSON response", async () => {
      const hiringJson = JSON.stringify({ positions: [{ title: "SDE", count: 5 }], total_hires: 20 });
      (invokeWithFallback as Mock).mockResolvedValue(hiringJson);

      const { runHiringAnalysis } = await import("../../../src/services/researchService");
      const result = await runHiringAnalysis(dummyCompany, "openrouter");

      expect(invokeWithFallback).toHaveBeenCalledWith("openrouter", expect.any(String), "groq");
      expect(render).toHaveBeenCalledWith("hiring", { company: dummyCompany });
      expect(result).toEqual({ positions: [{ title: "SDE", count: 5 }], total_hires: 20 });
    });

    it("should parse JSON from markdown code fences", async () => {
      (invokeWithFallback as Mock).mockResolvedValue('```json\n{"key": "value"}\n```');

      const { runHiringAnalysis } = await import("../../../src/services/researchService");
      const result = await runHiringAnalysis(dummyCompany);
      expect(result).toEqual({ key: "value" });
    });

    it("should parse JSON embedded in text with braces", async () => {
      (invokeWithFallback as Mock).mockResolvedValue('Here is the result: {"status": "ok"}');

      const { runHiringAnalysis } = await import("../../../src/services/researchService");
      const result = await runHiringAnalysis(dummyCompany);
      expect(result).toEqual({ status: "ok" });
    });

    it("should handle empty JSON string", async () => {
      (invokeWithFallback as Mock).mockResolvedValue("");

      const { runHiringAnalysis } = await import("../../../src/services/researchService");
      await expect(runHiringAnalysis(dummyCompany)).rejects.toThrow();
    });

    it("should handle LLM failure", async () => {
      (invokeWithFallback as Mock).mockRejectedValue(new Error("LLM unavailable"));

      const { runHiringAnalysis } = await import("../../../src/services/researchService");
      await expect(runHiringAnalysis(dummyCompany)).rejects.toThrow("LLM unavailable");
    });
  });

  describe("runFullPipeline", () => {
    it("should orchestrate research, consolidation, skill matrix, and hiring analysis", async () => {
      const consolidatedTable = `| ID | Category | A/C | Parameter | Research Output / Data | Source |
|---|---|---|---|---|---|
| 1 | Company | A | name | Acme Corp | final |
| 6 | Overview | A | overview_text | A leading tech company | final |`;

      (invoke as Mock).mockResolvedValue(isValidTable);
      (invokeWithFallback as Mock)
        .mockResolvedValueOnce(consolidatedTable)
        .mockResolvedValueOnce("| Skill | Level |\n|---|---|\n| JS | 4 |")
        .mockResolvedValueOnce('{"hires": 30}');

      const { runFullPipeline } = await import("../../../src/services/researchService");
      const result: PipelineResult = await runFullPipeline(dummyCompany, ["openrouter", "groq"], "openrouter");

      expect(result.company).toBe(dummyCompany);
      expect(Object.keys(result.research)).toEqual(["openrouter", "groq"]);
      expect(result.consolidation.name).toBe("Acme Corp");
      expect(result.skillMatrix).toHaveProperty("Skill");
      expect(result.hiringAnalysis).toEqual({ hires: 30 });
    });

    it("should use default providers when none specified", async () => {
      (invoke as Mock).mockResolvedValue(isValidTable);
      (invokeWithFallback as Mock)
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("{}");

      const { runFullPipeline } = await import("../../../src/services/researchService");
      const result: PipelineResult = await runFullPipeline(dummyCompany);

      expect(Object.keys(result.research)).toHaveLength(RESEARCH_PROVIDERS.length);
    });

    it("should continue gracefully when research yields empty results", async () => {
      (invoke as Mock).mockRejectedValue(new Error("All providers failed"));
      (invokeWithFallback as Mock)
        .mockResolvedValue("")
        .mockResolvedValue("")
        .mockResolvedValue("{}");

      const { runFullPipeline } = await import("../../../src/services/researchService");
      const result = await runFullPipeline(dummyCompany, ["broken-provider"]);

      expect(result.company).toBe(dummyCompany);
      expect(result.research["broken-provider"].rows).toEqual([]);
    });
  });
});
