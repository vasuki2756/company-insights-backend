import pino from "pino";
import { runResearchPipeline } from "../agents/researchGraph";
import { runDataQualityGate } from "../lib/validation/gate";
import { runResearch, runConsolidation, runFullPipeline } from "./researchService";

const logger = pino({ name: "pipeline-service" });

export interface PipelineStepResult {
  step: string;
  status: "success" | "error" | "skipped";
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface PipelineRunResult {
  company: string;
  status: "success" | "partial" | "error";
  steps: PipelineStepResult[];
  summary: {
    totalSteps: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}

export async function runPipelineStep(
  company: string,
  step: string,
  previousData?: Record<string, unknown>,
): Promise<PipelineStepResult> {
  const start = Date.now();

  try {
    switch (step) {
      case "research": {
        const result = await runResearch(company);
        return {
          step,
          status: "success",
          data: result,
          durationMs: Date.now() - start,
        };
      }

      case "consolidate": {
        if (!previousData?.research) {
          return {
            step,
            status: "error",
            error: "No research data available. Run 'research' step first.",
            durationMs: Date.now() - start,
          };
        }
        const perProviderRows: Record<string, Record<string, string>[]> = {};
        for (const [k, v] of Object.entries(previousData.research as Record<string, { rows: Record<string, string>[] }>)) {
          perProviderRows[k] = v.rows;
        }
        const record = await runConsolidation(company, perProviderRows);
        return {
          step,
          status: "success",
          data: record,
          durationMs: Date.now() - start,
        };
      }

      case "gate": {
        const record = (previousData?.golden ?? previousData?.consolidation) as Record<string, unknown> | undefined;
        if (!record || Object.keys(record).length === 0) {
          return {
            step,
            status: "error",
            error: "No golden record data available. Run 'consolidate' step first.",
            durationMs: Date.now() - start,
          };
        }
        const result = runDataQualityGate(record);
        return {
          step,
          status: "success",
          data: result,
          durationMs: Date.now() - start,
        };
      }

      default:
        return {
          step,
          status: "error",
          error: `Unknown pipeline step: ${step}. Valid steps: research, consolidate, gate`,
          durationMs: Date.now() - start,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ step, error: message }, "Pipeline step failed");
    return {
      step,
      status: "error",
      error: message,
      durationMs: Date.now() - start,
    };
  }
}

export async function runFullPipeline_v2(company: string): Promise<PipelineRunResult> {
  logger.info({ company }, "Full pipeline v2: starting with LangGraph research pipeline");

  const steps: PipelineStepResult[] = [];
  const start = Date.now();

  try {
    const pipelineResult = await runResearchPipeline(company);

    steps.push({
      step: "research_pipeline",
      status: "success",
      data: {
        golden: pipelineResult.golden,
        gateFailures: pipelineResult.gateFailures,
        dbStatus: pipelineResult.dbStatus,
        skillRow: pipelineResult.skillRow,
        hiringRow: pipelineResult.hiringRow,
      },
      durationMs: Date.now() - start,
    });

    if (pipelineResult.stageFailures.length > 0) {
      logger.warn({ company, failures: pipelineResult.stageFailures }, "Pipeline completed with stage failures");
    }

    const status: "success" | "partial" | "error" =
      pipelineResult.done
        ? pipelineResult.stageFailures.length > 0 ? "partial" : "success"
        : "error";

    return {
      company,
      status,
      steps,
      summary: {
        totalSteps: steps.length,
        succeeded: steps.filter((s) => s.status === "success").length,
        failed: steps.filter((s) => s.status === "error").length,
        skipped: steps.filter((s) => s.status === "skipped").length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ company, error: message }, "Full pipeline failed");

    return {
      company,
      status: "error",
      steps: [
        {
          step: "research_pipeline",
          status: "error",
          error: message,
          durationMs: Date.now() - start,
        },
      ],
      summary: {
        totalSteps: 1,
        succeeded: 0,
        failed: 1,
        skipped: 0,
      },
    };
  }
}
