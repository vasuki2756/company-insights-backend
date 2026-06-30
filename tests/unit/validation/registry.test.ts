import { vi, describe, it, expect, beforeEach } from "vitest";

const mockRunInNewContext = vi.fn<(expr: string, sandbox: object) => unknown>();

const { mockRuleFn, mockGlobalRuleFn } = vi.hoisted(() => ({
  mockRuleFn: vi.fn<(value: unknown, meta: any) => string | null>(),
  mockGlobalRuleFn: vi.fn<(record: Record<string, unknown>, metadata: any[]) => string | null>(),
}));

vi.mock("node:vm", () => ({
  default: { runInNewContext: mockRunInNewContext },
  runInNewContext: mockRunInNewContext,
}));

vi.mock("../../../src/lib/validation/rules", () => ({
  REGISTRY: {
    not_blank: mockRuleFn,
    url_shape: mockRuleFn,
    test_rule: mockRuleFn,
  },
  GLOBAL_REGISTRY: {
    all_required_present: mockGlobalRuleFn,
  },
}));

const sampleMeta = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  column_name: "name",
  label: "",
  category: "",
  description: "",
  content_type: "",
  granularity: "",
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
  criticality: "",
  confidence_level: "",
  data_volatility: "",
  update_frequency: "",
  data_owner: "",
  business_rules: "",
  data_rules: "",
  data_source: "",
  validation_mode: "",
  is_derived_from: "",
  allowed_values: [],
  ...overrides,
});

const sampleCase = (overrides: Record<string, unknown> = {}) => ({
  id: "TC1",
  applicable_to: "Per-Parameter",
  parameters: ["name"],
  applies_when: "true",
  rule_id: "not_blank",
  test_case_category: "quality",
  test_case_type: "negative",
  priority: "high",
  description: "",
  example_scenarios: "",
  ...overrides,
});

describe("registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applicableCases", () => {
    it("returns cases where applies_when evaluates to true", async () => {
      mockRunInNewContext.mockReturnValue(true);

      const { applicableCases } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta({ nullability: "Nullable" });
      const cases = [
        sampleCase({ id: "C1", applies_when: "nullability === 'Nullable'" }),
        sampleCase({ id: "C2", applies_when: "nullability === 'Not Null'" }),
      ];

      const result = applicableCases(meta, cases);

      expect(mockRunInNewContext).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("C1");
      expect(result[1].id).toBe("C2");
    });

    it("filters out cases where applies_when evaluates to false", async () => {
      mockRunInNewContext
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const { applicableCases } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta({ nullable: true });
      const cases = [
        sampleCase({ id: "C1", applies_when: "nullable === true" }),
        sampleCase({ id: "C2", applies_when: "nullable === false" }),
        sampleCase({ id: "C3", applies_when: "nullable === true" }),
      ];

      const result = applicableCases(meta, cases);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("C1");
      expect(result[1].id).toBe("C3");
    });

    it("returns empty array when no cases match", async () => {
      mockRunInNewContext.mockReturnValue(false);

      const { applicableCases } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta({ nullable: false });
      const cases = [sampleCase({ applies_when: "nullable === true" })];

      const result = applicableCases(meta, cases);
      expect(result).toEqual([]);
    });

    it("handles predicate evaluation errors gracefully (returns false)", async () => {
      mockRunInNewContext.mockImplementation(() => {
        throw new Error("Syntax error");
      });

      const { applicableCases } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta();
      const cases = [sampleCase({ applies_when: "invalid syntax @" })];

      const result = applicableCases(meta, cases);
      expect(result).toEqual([]);
    });

    it("passes meta properties to the sandbox", async () => {
      const { applicableCases } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta({ ac: "Composite", nullable: true });
      const cases = [sampleCase({ applies_when: "ac === 'Composite'" })];

      mockRunInNewContext.mockImplementation((expr, sandbox: any) => {
        return sandbox.ac === "Composite";
      });

      const result = applicableCases(meta, cases);
      expect(result).toHaveLength(1);
      expect(mockRunInNewContext).toHaveBeenCalledWith(
        "ac === 'Composite'",
        expect.objectContaining({ ac: "Composite", nullable: true }),
      );
    });
  });

  describe("runRulesForValue", () => {
    it("runs applicable rules for a value and returns results", async () => {
      mockRunInNewContext.mockReturnValue(true);
      mockRuleFn.mockReturnValue(null);

      const { runRulesForValue } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta();
      const cases = [
        sampleCase({ id: "C1", rule_id: "not_blank" }),
        sampleCase({ id: "C2", rule_id: "url_shape" }),
      ];

      const results = runRulesForValue("hello", meta, cases);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        caseId: "C1",
        ruleId: "not_blank",
        passed: true,
        error: null,
      });
      expect(results[1]).toEqual({
        caseId: "C2",
        ruleId: "url_shape",
        passed: true,
        error: null,
      });
    });

    it("reports failures when rule returns error message", async () => {
      mockRunInNewContext.mockReturnValue(true);
      mockRuleFn.mockReturnValue("value is blank");

      const { runRulesForValue } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta();
      const cases = [sampleCase({ id: "C1", rule_id: "not_blank" })];

      const results = runRulesForValue("", meta, cases);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        caseId: "C1",
        ruleId: "not_blank",
        passed: false,
        error: "value is blank",
      });
    });

    it("handles unknown rule_id with an error entry", async () => {
      mockRunInNewContext.mockReturnValue(true);

      const { runRulesForValue } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta();
      const cases = [sampleCase({ id: "C1", rule_id: "does_not_exist" })];

      const results = runRulesForValue("test", meta, cases);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].error).toMatch(/Unknown rule/);
    });

    it("returns empty array when no cases are applicable", async () => {
      mockRunInNewContext.mockReturnValue(false);

      const { runRulesForValue } = await import("../../../src/lib/validation/registry");
      const meta = sampleMeta();
      const cases = [sampleCase({ applies_when: "false" })];

      const results = runRulesForValue("test", meta, cases);
      expect(results).toEqual([]);
    });
  });

  describe("runGlobalRules", () => {
    it("runs global rules against the record", async () => {
      mockGlobalRuleFn.mockReturnValue(null);

      const { runGlobalRules } = await import("../../../src/lib/validation/registry");
      const metadata = [sampleMeta({ column_name: "name" })];
      const cases = [
        {
          id: "G1",
          applicable_to: "Global",
          parameters: [],
          applies_when: "true",
          rule_id: "all_required_present",
          test_case_category: "completeness",
          test_case_type: "negative",
          priority: "high",
          description: "",
          example_scenarios: "",
        },
      ];

      const results = runGlobalRules({ name: "Acme" }, metadata, cases);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        caseId: "G1",
        ruleId: "all_required_present",
        passed: true,
        error: null,
      });
      expect(mockGlobalRuleFn).toHaveBeenCalledWith({ name: "Acme" }, metadata);
    });

    it("returns error when global rule fails", async () => {
      mockGlobalRuleFn.mockReturnValue("missing required values");

      const { runGlobalRules } = await import("../../../src/lib/validation/registry");
      const metadata = [sampleMeta({ column_name: "name" })];
      const cases = [
        {
          id: "G1",
          applicable_to: "Global",
          parameters: [],
          applies_when: "true",
          rule_id: "all_required_present",
          test_case_category: "completeness",
          test_case_type: "negative",
          priority: "high",
          description: "",
          example_scenarios: "",
        },
      ];

      const results = runGlobalRules({ name: "" }, metadata, cases);

      expect(results[0].passed).toBe(false);
      expect(results[0].error).toBe("missing required values");
    });

    it("filters per-parameter cases, only running global ones", async () => {
      const { runGlobalRules } = await import("../../../src/lib/validation/registry");
      const metadata = [sampleMeta({ column_name: "name" })];
      const cases = [
        {
          id: "G1",
          applicable_to: "Global",
          parameters: [],
          applies_when: "true",
          rule_id: "all_required_present",
          test_case_category: "completeness",
          test_case_type: "negative",
          priority: "high",
          description: "",
          example_scenarios: "",
        },
        {
          id: "P1",
          applicable_to: "Per-Parameter",
          parameters: ["name"],
          applies_when: "true",
          rule_id: "not_blank",
          test_case_category: "quality",
          test_case_type: "negative",
          priority: "medium",
          description: "",
          example_scenarios: "",
        },
      ];

      mockGlobalRuleFn.mockReturnValue(null);

      const results = runGlobalRules({ name: "x" }, metadata, cases);

      expect(results).toHaveLength(1);
      expect(results[0].caseId).toBe("G1");
    });

    it("handles unknown global rule_id", async () => {
      const { runGlobalRules } = await import("../../../src/lib/validation/registry");
      const metadata = [sampleMeta()];
      const cases = [
        {
          id: "G1",
          applicable_to: "Global",
          parameters: [],
          applies_when: "true",
          rule_id: "nonexistent_global",
          test_case_category: "completeness",
          test_case_type: "negative",
          priority: "high",
          description: "",
          example_scenarios: "",
        },
      ];

      const results = runGlobalRules({}, metadata, cases);

      expect(results[0].passed).toBe(false);
      expect(results[0].error).toMatch(/Unknown global rule/);
    });
  });
});
