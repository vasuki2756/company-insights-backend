import { vi, describe, it, expect, beforeEach } from "vitest";

const mockReadFileSync = vi.fn();

const { mockApplicableCases, mockRuleFn, mockGlobalRuleFn } = vi.hoisted(() => ({
  mockApplicableCases: vi.fn<(meta: any, cases: any[]) => any[]>(),
  mockRuleFn: vi.fn<(value: unknown, meta: any) => string | null>(),
  mockGlobalRuleFn: vi.fn<(record: Record<string, unknown>, meta: any[]) => string | null>(),
}));

vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock("node:path", () => ({
  resolve: vi.fn((...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn(() => "/project/src/lib/validation/gate.ts"),
}));

vi.mock("../../../src/lib/validation/registry", () => ({
  applicableCases: mockApplicableCases,
}));

vi.mock("../../../src/lib/validation/rules", () => ({
  REGISTRY: { test_rule: mockRuleFn, blank_rule: mockRuleFn },
  GLOBAL_REGISTRY: { global_test: mockGlobalRuleFn },
}));

const sampleMeta = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  column_name: "name",
  label: "Company Name",
  category: "basic",
  description: "",
  content_type: "text",
  granularity: "single",
  ac: "Atomic",
  minimum_element: null,
  maximum_element: null,
  min_length: null,
  max_length: null,
  data_type: "VARCHAR",
  validation_type: "text",
  format_constraints: "",
  regex_pattern: null,
  nullability: "Not Null",
  nullable: false,
  delimiter: null,
  criticality: "high",
  confidence_level: "high",
  data_volatility: "low",
  update_frequency: "yearly",
  data_owner: "admin",
  business_rules: "",
  data_rules: "",
  data_source: "manual",
  validation_mode: "strict",
  is_derived_from: "",
  allowed_values: [],
  ...overrides,
});

const sampleCase = (overrides: Record<string, unknown> = {}) => ({
  id: "TC1",
  applicable_to: "Per-Parameter",
  parameters: ["name"],
  applies_when: "true",
  rule_id: "test_rule",
  test_case_category: "quality",
  test_case_type: "negative",
  priority: "high",
  description: "Test case",
  example_scenarios: "",
  ...overrides,
});

describe("gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("loadMetadata", () => {
    it("reads and parses parameter_metadata.json on first call", async () => {
      const metadata = [sampleMeta()];
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(metadata));

      const { loadMetadata } = await import("../../../src/lib/validation/gate");
      const result = loadMetadata();

      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining("parameter_metadata.json"),
        "utf-8",
      );
      expect(result).toEqual(metadata);
    });

    it("returns cached metadata on subsequent calls", async () => {
      const metadata = [sampleMeta()];
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(metadata));

      const mod = await import("../../../src/lib/validation/gate");
      mod.loadMetadata();
      vi.clearAllMocks();

      const result = mod.loadMetadata();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(result).toEqual(metadata);
    });
  });

  describe("loadMasterCases", () => {
    it("reads and parses master_test_cases.json on first call", async () => {
      const cases = [sampleCase()];
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([]));
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(cases));

      const mod = await import("../../../src/lib/validation/gate");
      mod.loadMetadata();
      const result = mod.loadMasterCases();

      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
      expect(mockReadFileSync).toHaveBeenLastCalledWith(
        expect.stringContaining("master_test_cases.json"),
        "utf-8",
      );
      expect(result).toEqual(cases);
    });

    it("caches master cases after first load", async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([]));
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([sampleCase()]));

      const mod = await import("../../../src/lib/validation/gate");
      mod.loadMetadata();
      mod.loadMasterCases();
      vi.clearAllMocks();

      const result = mod.loadMasterCases();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe("checkRecord", () => {
    it("runs per-parameter rules and returns failures", async () => {
      const meta = sampleMeta({ column_name: "name" });
      const tc = sampleCase({ rule_id: "test_rule" });

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([tc]));

      mockApplicableCases.mockReturnValue([tc]);
      mockRuleFn.mockReturnValue("name is blank");

      const { checkRecord } = await import("../../../src/lib/validation/gate");
      const failures = checkRecord({ name: "" });

      expect(mockRuleFn).toHaveBeenCalledWith("", meta);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        parameter: "name",
        caseId: "TC1",
        ruleId: "test_rule",
        severity: "error",
        message: "name is blank",
      });
    });

    it("marks negative test cases as error severity, positive as warning", async () => {
      const meta = sampleMeta({ column_name: "email" });
      const negativeCase = sampleCase({
        id: "N1",
        rule_id: "test_rule",
        test_case_type: "negative",
      });
      const positiveCase = sampleCase({
        id: "P1",
        rule_id: "test_rule",
        test_case_type: "positive",
      });

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([negativeCase, positiveCase]));

      mockApplicableCases.mockReturnValue([negativeCase, positiveCase]);
      mockRuleFn.mockReturnValue("validation failed");

      const { checkRecord } = await import("../../../src/lib/validation/gate");
      const failures = checkRecord({ email: "bad" });

      expect(failures).toHaveLength(2);
      expect(failures[0].severity).toBe("error");
      expect(failures[1].severity).toBe("warning");
    });

    it("runs global rules against the record", async () => {
      const meta = sampleMeta({ column_name: "name" });
      const globalCase = sampleCase({
        id: "G1",
        applicable_to: "Global",
        rule_id: "global_test",
      });

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([globalCase]));

      mockApplicableCases.mockReturnValue([]);
      mockGlobalRuleFn.mockReturnValue("missing required fields");

      const { checkRecord } = await import("../../../src/lib/validation/gate");
      const failures = checkRecord({ name: "" });

      expect(mockGlobalRuleFn).toHaveBeenCalled();
      const gf = failures.find((f) => f.caseId === "G1");
      expect(gf).toBeDefined();
      expect(gf!.parameter).toBe("(global)");
      expect(gf!.severity).toBe("error");
    });

    it("skips unknown rule_ids gracefully", async () => {
      const meta = sampleMeta({ column_name: "name" });
      const unknownCase = sampleCase({ rule_id: "nonexistent_rule" });

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([unknownCase]));

      mockApplicableCases.mockReturnValue([unknownCase]);

      const { checkRecord } = await import("../../../src/lib/validation/gate");
      const failures = checkRecord({ name: "Acme" });

      expect(failures).toHaveLength(0);
    });
  });

  describe("runDataQualityGate", () => {
    it("returns passed=true when no errors", async () => {
      const meta = sampleMeta({ column_name: "name" });
      const tc = sampleCase();

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([tc]));

      mockApplicableCases.mockReturnValue([tc]);
      mockRuleFn.mockReturnValue(null);

      const { runDataQualityGate } = await import("../../../src/lib/validation/gate");
      const result = runDataQualityGate({ name: "Acme Corp" });

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("returns passed=false when errors exist", async () => {
      const meta = sampleMeta({ column_name: "name" });
      const tc = sampleCase({ test_case_type: "negative" });

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([tc]));

      mockApplicableCases.mockReturnValue([tc]);
      mockRuleFn.mockReturnValue("value is blank");

      const { runDataQualityGate } = await import("../../../src/lib/validation/gate");
      const result = runDataQualityGate({ name: "" });

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("separates errors and warnings correctly", async () => {
      const meta = sampleMeta({ column_name: "field_x" });
      const errorCase = sampleCase({
        id: "E1",
        rule_id: "test_rule",
        test_case_type: "negative",
      });
      const warningCase = sampleCase({
        id: "W1",
        rule_id: "test_rule",
        test_case_type: "positive",
      });

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify([meta]))
        .mockReturnValueOnce(JSON.stringify([errorCase, warningCase]));

      mockApplicableCases.mockReturnValue([errorCase, warningCase]);
      mockRuleFn.mockReturnValue("issue found");

      const { runDataQualityGate } = await import("../../../src/lib/validation/gate");
      const result = runDataQualityGate({ field_x: "bad" });

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.errors[0].caseId).toBe("E1");
      expect(result.warnings[0].caseId).toBe("W1");
    });
  });

  describe("errorsOnly", () => {
    it("filters failures to only error severity", async () => {
      const { errorsOnly } = await import("../../../src/lib/validation/gate");
      const failures = [
        { severity: "error", message: "err1" },
        { severity: "warning", message: "warn1" },
        { severity: "error", message: "err2" },
        { severity: "info", message: "info1" },
      ] as any;

      const result = errorsOnly(failures);
      expect(result).toHaveLength(2);
      expect(result.every((f) => f.severity === "error")).toBe(true);
    });

    it("returns empty array when no errors", async () => {
      const { errorsOnly } = await import("../../../src/lib/validation/gate");
      const failures = [
        { severity: "warning", message: "warn" },
      ] as any;

      expect(errorsOnly(failures)).toEqual([]);
    });

    it("returns empty array for empty input", async () => {
      const { errorsOnly } = await import("../../../src/lib/validation/gate");
      expect(errorsOnly([])).toEqual([]);
    });
  });
});
