import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParamMeta, MasterTestCase } from "./types";
import { applicableCases } from "./registry";
import { REGISTRY, GLOBAL_REGISTRY } from "./rules";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

const DATA_DIR = process.env.DATA_DIR ?? resolve(__dirname, "..", "..", "data");

let _metadata: ParamMeta[] | null = null;
let _cases: MasterTestCase[] | null = null;

export function loadMetadata(): ParamMeta[] {
  if (!_metadata) {
    const raw = readFileSync(resolve(DATA_DIR, "parameter_metadata.json"), "utf-8");
    _metadata = JSON.parse(raw) as ParamMeta[];
  }
  return _metadata;
}

export function loadMasterCases(): MasterTestCase[] {
  if (!_cases) {
    const raw = readFileSync(resolve(DATA_DIR, "master_test_cases.json"), "utf-8");
    _cases = JSON.parse(raw) as MasterTestCase[];
  }
  return _cases;
}

export interface GateFailure {
  parameter: string;
  caseId: string;
  ruleId: string;
  severity: string;
  message: string;
  priority: string;
  category: string;
}

export interface GateResult {
  passed: boolean;
  errors: GateFailure[];
  warnings: GateFailure[];
}

export function errorsOnly(failures: GateFailure[]): GateFailure[] {
  return failures.filter((f) => f.severity === "error");
}

export function checkRecord(record: Record<string, unknown>): GateFailure[] {
  const metaRows = loadMetadata();
  const cases = loadMasterCases();
  const failures: GateFailure[] = [];

  for (const meta of metaRows) {
    const value = record[meta.column_name];
    const applicable = applicableCases(meta, cases);

    for (const tc of applicable) {
      const ruleFn = REGISTRY[tc.rule_id];
      if (!ruleFn) continue;

      const message = ruleFn(value, meta);
      if (message) {
        failures.push({
          parameter: meta.column_name,
          caseId: tc.id,
          ruleId: tc.rule_id,
          severity: tc.test_case_type === "negative" ? "error" : "warning",
          message,
          priority: tc.priority,
          category: tc.test_case_category,
        });
      }
    }
  }

  for (const tc of cases.filter((c) => c.applicable_to === "Global")) {
    const ruleFn = GLOBAL_REGISTRY[tc.rule_id];
    if (!ruleFn) continue;

    const message = ruleFn(record, metaRows);
    if (message) {
      failures.push({
        parameter: "(global)",
        caseId: tc.id,
        ruleId: tc.rule_id,
        severity: "error",
        message,
        priority: tc.priority,
        category: tc.test_case_category,
      });
    }
  }

  return failures;
}

export function runDataQualityGate(record: Record<string, unknown>): GateResult {
  const failures = checkRecord(record);
  const errors = errorsOnly(failures);
  const warnings = failures.filter((f) => f.severity !== "error");

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
