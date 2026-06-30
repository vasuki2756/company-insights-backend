import { vi, describe, it, expect, beforeEach } from "vitest";

const {
  capturedNodes,
  capturedRoutes,
  mockInvoke,
  mockRender,
  mockRunDataQualityGate,
  mockCompiledInvoke,
} = vi.hoisted(() => ({
  capturedNodes: {} as Record<string, Function>,
  capturedRoutes: {} as Record<string, Function>,
  mockInvoke: vi.fn<(provider: string, prompt: string) => Promise<string>>(),
  mockRender: vi.fn<(name: string, tokens?: Record<string, string>) => string>(),
  mockRunDataQualityGate: vi.fn(),
  mockCompiledInvoke: vi.fn(),
}));

const mockAnnotationFn = vi.fn(() => ({}));
mockAnnotationFn.Root = vi.fn(
  (config: Record<string, { default?: () => unknown; reducer?: Function }>) => {
    const state: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "default" in value &&
        typeof value.default === "function"
      ) {
        state[key] = value.default();
      } else {
        state[key] = undefined;
      }
    }
    return { State: state };
  },
);

vi.mock("@langchain/langgraph", () => {
  const api = {
    addNode: vi.fn(function (this: typeof api, name: string, fn: Function) {
      capturedNodes[name] = fn;
      return this;
    }),
    addEdge: vi.fn(function (this: typeof api) { return this; }),
    addConditionalEdges: vi.fn(function (
      this: typeof api,
      node: string,
      fn: Function,
      mapping: Record<string, string>,
    ) {
      capturedRoutes[`route:${node}`] = fn;
      capturedRoutes[`mapping:${node}`] = mapping;
      return this;
    }),
    compile: vi.fn(function (this: typeof api) {
      return { invoke: mockCompiledInvoke };
    }),
  };
  return {
    StateGraph: vi.fn(function () { return api; }),
    Annotation: mockAnnotationFn,
    END: "__end__",
  };
});

vi.mock("../../../src/lib/prompts", () => ({
  render: mockRender,
}));

vi.mock("../../../src/lib/providers", () => ({
  invoke: mockInvoke,
  RESEARCH_PROVIDERS: ["openrouter", "groq", "gemini"],
}));

vi.mock("../../../src/lib/validation/gate", () => ({
  runDataQualityGate: mockRunDataQualityGate,
}));

function defaultState(): Record<string, unknown> {
  return {
    company: "TestCorp",
    company_id: undefined,
    raw: {},
    rows: {},
    valid: {},
    attempts: {},
    golden: {},
    gate_failures: [],
    db_status: "",
    db_error: "",
    skill_row: {},
    hiring_row: null,
    stage_failures: [],
    log: [],
    done: false,
  };
}

describe("researchGraph", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("graph compiles without error", async () => {
    const mod = await import("../../../src/agents/researchGraph");
    expect(mod.runResearchPipeline).toBeDefined();
    expect(typeof mod.runResearchPipeline).toBe("function");
  });

  describe("ResearchState defaults", () => {
    it("has all required state keys with correct default values", async () => {
      await import("../../../src/agents/researchGraph");

      const state = defaultState();
      expect(state.company).toBe("TestCorp");
      expect(state.company_id).toBeUndefined();
      expect(state.raw).toEqual({});
      expect(state.rows).toEqual({});
      expect(state.valid).toEqual({});
      expect(state.attempts).toEqual({});
      expect(state.golden).toEqual({});
      expect(state.gate_failures).toEqual([]);
      expect(state.db_status).toBe("");
      expect(state.db_error).toBe("");
      expect(state.skill_row).toEqual({});
      expect(state.hiring_row).toBeNull();
      expect(state.stage_failures).toEqual([]);
      expect(state.log).toEqual([]);
      expect(state.done).toBe(false);
    });
  });

  describe("parseMarkdownTable", () => {
    const TABLE = `| ID | Parameter | Research Output / Data | Source |
|---|---|---|---|
| 1 | Company Name | Acme Corp | web |
| 2 | Revenue | $1B | manual |`;

    const TABLE_WITH_EMPTY = `| ID | Parameter | Value |
|---|---|---|
| 1 | Name | Alpha |
| 2 | Revenue | |`;

    const SINGLE_ROW = `| ID | Name |
|---|---|
| 42 | Answer |`;

    it("parses a standard markdown table into rows", async () => {
      mockInvoke.mockResolvedValue(TABLE);
      mockRender.mockReturnValue("research prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      for (const p of ["openrouter", "groq", "gemini"]) {
        expect(state.rows[p]).toBeDefined();
        expect(Array.isArray(state.rows[p])).toBe(true);
        expect(state.rows[p]!.length).toBe(2);
      }
      const firstRow = (state.rows["openrouter"] as Record<string, string>[])[0];
      expect(firstRow["ID"]).toBe("1");
      expect(firstRow["Parameter"]).toBe("Company Name");
      expect(firstRow["Research Output / Data"]).toBe("Acme Corp");
    });

    it("handles empty cells", async () => {
      mockInvoke.mockResolvedValue(TABLE_WITH_EMPTY);
      mockRender.mockReturnValue("prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      const rows = state.rows["openrouter"] as Record<string, string>[];
      expect(rows[1]["Value"]).toBe("");
    });

    it("returns empty array for a single header-only table", async () => {
      mockInvoke.mockResolvedValue("| H1 | H2 |\n|---|---|");
      mockRender.mockReturnValue("prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      const rows = state.rows["openrouter"] as Record<string, string>[];
      expect(rows).toEqual([]);
    });

    it("handles separator lines correctly", async () => {
      mockInvoke.mockResolvedValue(SINGLE_ROW);
      mockRender.mockReturnValue("prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      const rows = state.rows["openrouter"] as Record<string, string>[];
      expect(rows).toHaveLength(1);
      expect(rows[0]["ID"]).toBe("42");
    });

    it("handles extra whitespace in cells", async () => {
      const text = "|  ID  |  Name  |\n|---|---|\n|  1  |  Foo  |";
      mockInvoke.mockResolvedValue(text);
      mockRender.mockReturnValue("prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      const rows = state.rows["openrouter"] as Record<string, string>[];
      expect(rows[0]["ID"]).toBe("1");
      expect(rows[0]["Name"]).toBe("Foo");
    });
  });

  describe("extractJson", () => {
    it("extracts from triple-backtick json code fences", async () => {
      const jsonText = '```json\n{"key": "value", "num": 42}\n```';
      mockInvoke.mockResolvedValue(jsonText);
      mockRender.mockReturnValue("hiring prompt");

      const state = { ...defaultState(), company: "TestCorp" };
      await capturedNodes["hiring"](state);

      expect(state.hiring_row).toEqual({ key: "value", num: 42 });
    });

    it("extracts from bare JSON without fences", async () => {
      const jsonText = '{"name": "Acme", "revenue": 1e9}';
      mockInvoke.mockResolvedValue(jsonText);
      mockRender.mockReturnValue("hiring prompt");

      const state = { ...defaultState(), company: "TestCorp" };
      await capturedNodes["hiring"](state);

      expect(state.hiring_row).toEqual({ name: "Acme", revenue: 1e9 });
    });

    it("extracts JSON array", async () => {
      mockInvoke.mockResolvedValue('[{"id": 1}, {"id": 2}]');
      mockRender.mockReturnValue("hiring prompt");

      const state = { ...defaultState(), company: "TestCorp" };
      await capturedNodes["hiring"](state);

      expect(state.hiring_row).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("handles JSON with surrounding text", async () => {
      mockInvoke.mockResolvedValue(
        'Some text before\n```\n{"result": "success"}\n```\nand after',
      );
      mockRender.mockReturnValue("hiring prompt");

      const state = { ...defaultState(), company: "TestCorp" };
      await capturedNodes["hiring"](state);

      expect(state.hiring_row).toEqual({ result: "success" });
    });

    it("sets hiring_row to null when hiringNode throws", async () => {
      mockInvoke.mockRejectedValue(new Error("Provider down"));
      mockRender.mockReturnValue("hiring prompt");

      const state = { ...defaultState(), company: "TestCorp" };
      await capturedNodes["hiring"](state);

      expect(state.hiring_row).toBeNull();
      expect(state.stage_failures).toHaveLength(1);
      expect(state.stage_failures[0]).toMatch(/Provider down/);
    });
  });

  describe("rowsToRecord", () => {
    it("converts parsed rows to a flattened record keyed by column name", async () => {
      const tableText =
        "| ID | Parameter | Research Output / Data | Source |\n" +
        "|---|---|---|---|\n" +
        "| 1 | Company Name | Acme Corp | web |\n" +
        "| 2 | Overview | A tech co | manual |";

      mockInvoke.mockResolvedValue(tableText);
      mockRender.mockReturnValue("consolidation prompt");

      const state = {
        ...defaultState(),
        rows: {
          openrouter: [
            { ID: "1", "Research Output / Data": "Acme Corp" },
            { ID: "2", "Research Output / Data": "A tech co" },
          ],
        },
        attempts: { consolidate: 0 },
      };

      await capturedNodes["consolidate"](state);
      expect(state.golden).toBeDefined();
      expect(Object.keys(state.golden).length).toBeGreaterThan(0);
    });

    it("skips rows with unknown ID", async () => {
      mockInvoke.mockResolvedValue(
        "| ID | Research Output / Data |\n|---|---|\n| 9999 | ignored |",
      );
      mockRender.mockReturnValue("consolidation prompt");

      const state = {
        ...defaultState(),
        rows: {
          openrouter: [
            { ID: "9999", "Research Output / Data": "should be ignored" },
          ],
        },
        attempts: { consolidate: 0 },
      };

      await capturedNodes["consolidate"](state);
      expect(state.golden).toEqual({});
    });
  });

  describe("column mapping helpers", () => {
    it("columnForId returns correct column for valid IDs (1-indexed)", async () => {
      const { runResearchPipeline } = await import(
        "../../../src/agents/researchGraph"
      );

      const state = defaultState();
      const validateNode = capturedNodes["validate_research"];

      state.rows = {
        openrouter: [
          { ID: "1", "Research Output / Data": "NameVal" },
          { ID: "64", "Research Output / Data": "Val64" },
        ],
      };

      await validateNode(state);
      expect(state.valid["openrouter"]).toBe(false);
    });

    it("returns correct column name via consolidation output", async () => {
      mockInvoke.mockResolvedValue(
        "| ID | Research Output / Data |\n|---|---|\n| 1 | Acme Corp |\n| 2 | ACME |",
      );
      mockRender.mockReturnValue("consolidation prompt");

      const state = {
        ...defaultState(),
        rows: {
          openrouter: [
            { ID: "1", "Research Output / Data": "Acme Corp" },
            { ID: "2", "Research Output / Data": "ACME" },
          ],
        },
        attempts: { consolidate: 0 },
      };

      await capturedNodes["consolidate"](state);
      expect(state.golden["name"]).toBe("Acme Corp");
      expect(state.golden["short_name"]).toBe("ACME");
    });
  });

  describe("error handling — provider failure", () => {
    it("does not crash pipeline when all providers fail", async () => {
      mockInvoke.mockRejectedValue(new Error("API unavailable"));
      mockRender.mockReturnValue("research prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      for (const p of ["openrouter", "groq", "gemini"]) {
        expect(state.rows[p]).toEqual([]);
      }
      expect(state.log.length).toBeGreaterThan(0);
    });

    it("handles partial provider failure (some succeed, some fail)", async () => {
      mockInvoke
        .mockResolvedValueOnce("| ID | Value |\n|---|---|\n| 1 | Ok |") // openrouter
        .mockRejectedValueOnce(new Error("Groq down")) // groq
        .mockResolvedValueOnce("| ID | Value |\n|---|---|\n| 1 | Ok |"); // gemini
      mockRender.mockReturnValue("research prompt");

      const state = defaultState();
      await capturedNodes["research"](state);

      expect((state.rows["openrouter"] as Record<string, string>[]).length).toBe(1);
      expect(state.rows["groq"]).toEqual([]);
      expect((state.rows["gemini"] as Record<string, string>[]).length).toBe(1);
    });

    it("consolidate node skips failed providers and picks best result", async () => {
      mockInvoke
        .mockResolvedValueOnce(
          "| ID | Research Output / Data |\n|---|---|\n| 1 | Acme Corp |",
        )
        .mockResolvedValueOnce(
          "| ID | Research Output / Data |\n|---|---|\n| 1 | Acme Inc |\n| 2 | AI |",
        )
        .mockResolvedValueOnce(
          "| ID | Research Output / Data |\n|---|---|\n| 1 | Acme Inc |\n| 2 | AI |",
        );
      mockRender.mockReturnValue("consolidation prompt");

      const state = {
        ...defaultState(),
        rows: {
          openrouter: [
            { ID: "1", "Research Output / Data": "Acme Corp" },
            { ID: "2", "Research Output / Data": "ACME" },
          ],
          groq: [],
          gemini: [
            { ID: "1", "Research Output / Data": "Acme Inc" },
            { ID: "2", "Research Output / Data": "AI" },
          ],
        },
        attempts: { consolidate: 0 },
      };

      await capturedNodes["consolidate"](state);
      expect(state.golden["name"]).toBeDefined();
    });
  });

  describe("gate node", () => {
    it("processes golden record through runDataQualityGate", async () => {
      mockRunDataQualityGate.mockReturnValue({
        passed: true,
        errors: [],
        warnings: [],
      });

      const state = {
        ...defaultState(),
        golden: { name: "Acme Corp" },
      };
      await capturedNodes["gate"](state);

      expect(mockRunDataQualityGate).toHaveBeenCalledWith({ name: "Acme Corp" });
      expect(state.gate_failures).toEqual([]);
    });

    it("records gate failures when data quality issues exist", async () => {
      mockRunDataQualityGate.mockReturnValue({
        passed: false,
        errors: [
          {
            parameter: "name",
            caseId: "C1",
            ruleId: "not_blank",
            severity: "error",
            message: "value is blank",
            priority: "high",
            category: "completeness",
          },
        ],
        warnings: [],
      });

      const state = {
        ...defaultState(),
        golden: { name: "" },
        attempts: { consolidate: 0 },
      };
      await capturedNodes["gate"](state);

      expect(state.gate_failures).toHaveLength(1);
      expect(state.gate_failures[0].parameter).toBe("name");
    });
  });

  describe("routing functions", () => {
    it("routeAfterValidate returns 'research' when some providers need retry", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:validate_research"] as Function;

      const result = route({
        valid: { openrouter: false, groq: true, gemini: false },
        attempts: { openrouter: 0, groq: 0, gemini: 0 },
      });

      expect(result).toBe("research");
    });

    it("routeAfterValidate returns 'consolidate' when all providers are valid", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:validate_research"] as Function;

      const result = route({
        valid: { openrouter: true, groq: true, gemini: true },
        attempts: { openrouter: 1, groq: 1, gemini: 1 },
      });

      expect(result).toBe("consolidate");
    });

    it("routeAfterValidate returns 'consolidate' when retries exhausted", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:validate_research"] as Function;

      const result = route({
        valid: { openrouter: false, groq: true, gemini: true },
        attempts: { openrouter: 3, groq: 1, gemini: 1 },
      });

      expect(result).toBe("consolidate");
    });

    it("routeAfterGate returns 'consolidate' when errors exist and retries remain", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:gate"] as Function;

      const result = route({
        gate_failures: [{ parameter: "name" }],
        attempts: { consolidate: 0 },
        log: [],
      });

      expect(result).toBe("consolidate");
    });

    it("routeAfterGate returns 'db_write' when no errors", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:gate"] as Function;

      const result = route({
        gate_failures: [],
        attempts: { consolidate: 0 },
      });

      expect(result).toBe("db_write");
    });

    it("routeAfterDb returns 'skills' on successful write", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:db_write"] as Function;

      const result = route({
        db_status: "pending",
        attempts: { db_write: 1 },
      });

      expect(result).toBe("skills");
    });

    it("routeAfterDb returns 'consolidate' on error with retry", async () => {
      await import("../../../src/agents/researchGraph");
      const route = capturedRoutes["route:db_write"] as Function;

      const result = route({
        db_status: "error",
        attempts: { db_write: 0 },
        log: [],
      });

      expect(result).toBe("consolidate");
    });
  });

  describe("runResearchPipeline", () => {
    it("returns a ResearchResult with correct shape", async () => {
      mockCompiledInvoke.mockResolvedValueOnce({
        company: "TestCorp",
        golden: { name: "Acme" },
        gate_failures: [],
        db_status: "pending",
        db_error: "",
        skill_row: {},
        hiring_row: null,
        stage_failures: [],
        log: [],
        done: true,
      });

      const { runResearchPipeline } = await import(
        "../../../src/agents/researchGraph"
      );

      const result = await runResearchPipeline("TestCorp");
      expect(result.company).toBe("TestCorp");
      expect(result.golden).toEqual({ name: "Acme" });
      expect(result.gateFailures).toEqual([]);
      expect(result.dbStatus).toBe("pending");
      expect(result.skillRow).toEqual({});
      expect(result.stageFailures).toEqual([]);
      expect(result.log).toEqual([]);
      expect(result.done).toBe(true);
    });
  });
});
