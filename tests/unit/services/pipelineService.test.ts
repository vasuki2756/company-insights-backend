import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/agents/researchGraph", () => ({
  runResearchPipeline: vi.fn(),
}));

vi.mock("../../../src/lib/validation/gate", () => ({
  runDataQualityGate: vi.fn(),
}));

vi.mock("../../../src/services/researchService", () => ({
  runResearch: vi.fn(),
  runConsolidation: vi.fn(),
  runFullPipeline: vi.fn(),
}));

import type { Mock } from "vitest";
import { runResearchPipeline } from "../../../src/agents/researchGraph";
import { runDataQualityGate } from "../../../src/lib/validation/gate";
import { runResearch, runConsolidation } from "../../../src/services/researchService";
import type { PipelineRunResult, PipelineStepResult } from "../../../src/services/pipelineService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pipelineService", () => {
  describe("runPipelineStep", () => {
    describe("research step", () => {
      it("should run research and return success", async () => {
        const mockData = { provider1: { raw: "data", rows: [{ ID: "1", "Research Output / Data": "Acme" }] } };
        (runResearch as Mock).mockResolvedValue(mockData);

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result: PipelineStepResult = await runPipelineStep("Acme Corp", "research");

        expect(runResearch).toHaveBeenCalledWith("Acme Corp");
        expect(result.step).toBe("research");
        expect(result.status).toBe("success");
        expect(result.data).toBe(mockData);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it("should handle research failures gracefully", async () => {
        (runResearch as Mock).mockRejectedValue(new Error("Research failed"));

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "research");

        expect(result.status).toBe("error");
        expect(result.error).toContain("Research failed");
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe("consolidate step", () => {
      const previousData = {
        research: {
          prov1: { rows: [{ ID: "1", "Research Output / Data": "Acme Corp" }] },
        },
      };

      it("should run consolidation with previous research data", async () => {
        const mockRecord = { name: "Acme Corp", overview_text: "Great" };
        (runConsolidation as Mock).mockResolvedValue(mockRecord);

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "consolidate", previousData);

        expect(runConsolidation).toHaveBeenCalledWith("Acme Corp", {
          prov1: previousData.research.prov1.rows,
        });
        expect(result.status).toBe("success");
        expect(result.data).toBe(mockRecord);
      });

      it("should return error if no research data available", async () => {
        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "consolidate", {});

        expect(result.status).toBe("error");
        expect(result.error).toBe("No research data available. Run 'research' step first.");
        expect(runConsolidation).not.toHaveBeenCalled();
      });

      it("should handle consolidation failures gracefully", async () => {
        (runConsolidation as Mock).mockRejectedValue(new Error("Consolidation failed"));

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "consolidate", previousData);

        expect(result.status).toBe("error");
        expect(result.error).toContain("Consolidation failed");
      });
    });

    describe("gate step", () => {
      it("should run data quality gate on golden record", async () => {
        const gateResult = { passed: true, errors: [], warnings: [] };
        (runDataQualityGate as Mock).mockReturnValue(gateResult);

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "gate", {
          golden: { name: "Acme", overview_text: "Great" },
        });

        expect(runDataQualityGate).toHaveBeenCalledWith({ name: "Acme", overview_text: "Great" });
        expect(result.status).toBe("success");
        expect(result.data).toBe(gateResult);
      });

      it("should accept consolidation key as fallback for golden", async () => {
        const gateResult = { passed: true, errors: [], warnings: [] };
        (runDataQualityGate as Mock).mockReturnValue(gateResult);

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "gate", {
          consolidation: { name: "Acme" },
        });

        expect(result.status).toBe("success");
      });

      it("should return error if no golden record available", async () => {
        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "gate", {});

        expect(result.status).toBe("error");
        expect(result.error).toBe("No golden record data available. Run 'consolidate' step first.");
        expect(runDataQualityGate).not.toHaveBeenCalled();
      });

      it("should return error for empty golden record", async () => {
        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "gate", { golden: {} });

        expect(result.status).toBe("error");
        expect(result.error).toBe("No golden record data available. Run 'consolidate' step first.");
      });

      it("should handle gate exceptions gracefully", async () => {
        (runDataQualityGate as Mock).mockImplementation(() => {
          throw new Error("Gate error");
        });

        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "gate", {
          golden: { name: "Acme" },
        });

        expect(result.status).toBe("error");
        expect(result.error).toContain("Gate error");
      });
    });

    describe("unknown step", () => {
      it("should return error for unknown step name", async () => {
        const { runPipelineStep } = await import("../../../src/services/pipelineService");
        const result = await runPipelineStep("Acme Corp", "unknown_step");

        expect(result.status).toBe("error");
        expect(result.error).toContain("Unknown pipeline step: unknown_step");
        expect(result.error).toContain("research, consolidate, gate");
      });
    });
  });

  describe("runFullPipeline_v2", () => {
    it("should run the research pipeline and return success", async () => {
      const pipelineResult = {
        golden: { name: "Acme Corp" },
        gateFailures: [],
        dbStatus: "written",
        skillRow: { Skill: "JavaScript", Level: "4" },
        hiringRow: { total_hires: 20 },
        stageFailures: [],
        done: true,
      };
      (runResearchPipeline as Mock).mockResolvedValue(pipelineResult);

      const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
      const result: PipelineRunResult = await runFullPipeline_v2("Acme Corp");

      expect(runResearchPipeline).toHaveBeenCalledWith("Acme Corp");
      expect(result.company).toBe("Acme Corp");
      expect(result.status).toBe("success");
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].step).toBe("research_pipeline");
      expect(result.steps[0].status).toBe("success");
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(0);
    });

    it("should return partial status when there are stage failures but pipeline is done", async () => {
      (runResearchPipeline as Mock).mockResolvedValue({
        golden: { name: "Acme" },
        gateFailures: [],
        dbStatus: "written",
        skillRow: {},
        hiringRow: null,
        stageFailures: ["skills: timeout"],
        done: true,
      });

      const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
      const result = await runFullPipeline_v2("Acme Corp");

      expect(result.status).toBe("partial");
    });

    it("should return error status when pipeline is not done", async () => {
      (runResearchPipeline as Mock).mockResolvedValue({
        golden: {},
        gateFailures: [],
        dbStatus: "",
        skillRow: {},
        hiringRow: null,
        stageFailures: ["research: all providers failed"],
        done: false,
      });

      const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
      const result = await runFullPipeline_v2("Acme Corp");

      expect(result.status).toBe("error");
      expect(result.summary.totalSteps).toBe(1);
    });

    it("should handle pipeline crashes with an error result", async () => {
      (runResearchPipeline as Mock).mockRejectedValue(new Error("Pipeline crashed"));

      const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
      const result = await runFullPipeline_v2("Acme Corp");

      expect(result.status).toBe("error");
      expect(result.summary.failed).toBe(1);
      expect(result.steps[0].error).toContain("Pipeline crashed");
    });

    it("should include pipeline data in the step result", async () => {
      (runResearchPipeline as Mock).mockResolvedValue({
        golden: { name: "Acme" },
        gateFailures: [{ parameter: "name", caseId: "c1", ruleId: "r1", severity: "error", message: "Missing", priority: "high", category: "completeness" }],
        dbStatus: "written",
        skillRow: { Skill: "JS" },
        hiringRow: { hires: 5 },
        stageFailures: [],
        done: true,
      });

      const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
      const result = await runFullPipeline_v2("Acme Corp");

      const stepData = result.steps[0].data as Record<string, unknown>;
      expect(stepData.golden).toEqual({ name: "Acme" });
      expect(stepData.gateFailures).toHaveLength(1);
      expect(stepData.dbStatus).toBe("written");
      expect(stepData.skillRow).toEqual({ Skill: "JS" });
      expect(stepData.hiringRow).toEqual({ hires: 5 });
    });

    it("should compute summary correctly with mixed statuses", async () => {
      (runResearchPipeline as Mock).mockResolvedValue({
        golden: {},
        gateFailures: [],
        dbStatus: "",
        skillRow: {},
        hiringRow: null,
        stageFailures: ["error1", "error2"],
        done: true,
      });

      const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
      const result = await runFullPipeline_v2("Acme Corp");

      expect(result.summary.totalSteps).toBe(1);
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.skipped).toBe(0);
    });
  });
});
