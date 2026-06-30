import vm from "node:vm";
import type { ParamMeta, MasterTestCase } from "./types";
import { REGISTRY, GLOBAL_REGISTRY } from "./rules";

const SAFE_BUILTINS: Record<string, unknown> = { True: true, False: false, None: null };

function evaluatePredicate(expr: string, meta: ParamMeta): boolean {
  try {
    const sandbox = { __builtins__: SAFE_BUILTINS, ...meta };
    return Boolean(vm.runInNewContext(expr, sandbox));
  } catch {
    return false;
  }
}

export function applicableCases(meta: ParamMeta, cases: MasterTestCase[]): MasterTestCase[] {
  return cases.filter((c) => evaluatePredicate(c.applies_when, meta));
}

export function runRulesForValue(
  value: unknown,
  meta: ParamMeta,
  cases: MasterTestCase[],
): Array<{ caseId: string; ruleId: string; passed: boolean; error: string | null }> {
  const applicable = applicableCases(meta, cases);
  return applicable.map((tc) => {
    const ruleFn = REGISTRY[tc.rule_id];
    if (!ruleFn) return { caseId: tc.id, ruleId: tc.rule_id, passed: false, error: `Unknown rule: ${tc.rule_id}` };
    const error = ruleFn(value, meta);
    return { caseId: tc.id, ruleId: tc.rule_id, passed: error === null, error };
  });
}

export function runGlobalRules(
  record: Record<string, unknown>,
  metadata: ParamMeta[],
  cases: MasterTestCase[],
): Array<{ caseId: string; ruleId: string; passed: boolean; error: string | null }> {
  const globalCases = cases.filter((c) => c.applicable_to === "Global");
  return globalCases.map((tc) => {
    const ruleFn = GLOBAL_REGISTRY[tc.rule_id];
    if (!ruleFn) return { caseId: tc.id, ruleId: tc.rule_id, passed: false, error: `Unknown global rule: ${tc.rule_id}` };
    const error = ruleFn(record, metadata);
    return { caseId: tc.id, ruleId: tc.rule_id, passed: error === null, error };
  });
}
