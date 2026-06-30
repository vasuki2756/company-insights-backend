import { vi, describe, it, expect, beforeEach } from "vitest";

const {
  mockSemanticSearch,
  mockSearchByCompanyId,
  mockBuildContextFromResults,
  capturedTools,
  capturedConditionalEdges,
  mockCompiledInvoke,
} = vi.hoisted(() => ({
  mockSemanticSearch: vi.fn(),
  mockSearchByCompanyId: vi.fn(),
  mockBuildContextFromResults: vi.fn(),
  capturedTools: [] as Array<{
    name: string;
    description: string;
    schema: unknown;
    fn: Function;
  }>,
  capturedConditionalEdges: [] as Array<{
    node: string;
    fn: Function;
    mapping: Record<string, string>;
  }>,
  mockCompiledInvoke: vi.fn(),
}));

vi.mock("@langchain/langgraph", () => {
  const api = {
    addNode: vi.fn(function (this: typeof api) { return this; }),
    addEdge: vi.fn(function (this: typeof api) { return this; }),
    addConditionalEdges: vi.fn(function (
      this: typeof api,
      node: string,
      fn: Function,
      mapping: Record<string, string>,
    ) {
      capturedConditionalEdges.push({ node, fn, mapping });
      return this;
    }),
    compile: vi.fn(function (this: typeof api) {
      return { invoke: mockCompiledInvoke };
    }),
  };
  return {
    StateGraph: vi.fn(function () { return api; }),
    MessagesAnnotation: { State: {} },
  };
});

vi.mock("@langchain/langgraph/prebuilt", () => ({
  ToolNode: vi.fn(function (this: { tools: unknown[] }, tools: unknown[]) {
    this.tools = tools;
    return this;
  }),
}));

vi.mock("@langchain/groq", () => ({
  ChatGroq: vi.fn(function () {
    this.bindTools = vi.fn().mockReturnThis();
    return this;
  }),
}));

vi.mock("@langchain/core/tools", () => ({
  tool: vi.fn(
    (fn: Function, config: { name: string; description: string; schema: unknown }) => {
      capturedTools.push({ ...config, fn });
      return { ...config, fn };
    },
  ),
}));

const mockZodChain = {
  describe: vi.fn(() => mockZodChain),
  optional: vi.fn(() => mockZodChain),
};

vi.mock("zod", () => ({
  z: {
    object: vi.fn(() => mockZodChain),
    string: vi.fn(() => mockZodChain),
    number: vi.fn(() => mockZodChain),
  },
}));

vi.mock("pino", () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock("../../../src/services/retrievalService", () => ({
  semanticSearch: mockSemanticSearch,
  searchByCompanyId: mockSearchByCompanyId,
}));

vi.mock("../../../src/utils/prompts", () => ({
  buildContextFromResults: mockBuildContextFromResults,
}));

vi.mock("../../../src/types/ai", () => ({
  MAX_CONTEXT_LENGTH: 2000,
}));

describe("placementAgent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("agent compiles — module imports without error", async () => {
    const mod = await import("../../../src/agents/placementAgent");
    expect(mod.runAgent).toBeDefined();
    expect(typeof mod.runAgent).toBe("function");
  });

  it("runAgent without tools needed returns a response", async () => {
    const fakeResponse = {
      messages: [
        {
          content: "Here is information about companies.",
          _getType: () => "ai" as const,
        },
      ],
    };
    mockCompiledInvoke.mockResolvedValue(fakeResponse);

    mockSearchByCompanyId.mockResolvedValue([]);

    const { runAgent } = await import("../../../src/agents/placementAgent");
    const result = await runAgent("Tell me about top companies");

    expect(mockCompiledInvoke).toHaveBeenCalledTimes(1);
    expect(result).toBe("Here is information about companies.");
  });

  it("runAgent with companyId provides context in system message", async () => {
    const searchResults = [
      {
        companyId: 1,
        sectionType: "overview",
        content: "Google is a tech company",
        similarity: 0.95,
        company: { name: "Google", category: "Technology" },
      },
    ];

    mockSearchByCompanyId.mockResolvedValue(searchResults);
    mockBuildContextFromResults.mockReturnValue("Google overview context");
    mockCompiledInvoke.mockResolvedValue({
      messages: [{ content: "Google info", _getType: () => "ai" as const }],
    });

    const { runAgent } = await import("../../../src/agents/placementAgent");
    const result = await runAgent("Tell me about Google", undefined, 1);

    expect(mockSearchByCompanyId).toHaveBeenCalledWith(1, "Tell me about Google");
    expect(mockBuildContextFromResults).toHaveBeenCalled();
    expect(result).toBe("Google info");
  });

  it("runAgent throws on graph failure", async () => {
    mockCompiledInvoke.mockRejectedValue(new Error("LLM timeout"));

    const { runAgent } = await import("../../../src/agents/placementAgent");
    await expect(runAgent("test")).rejects.toThrow("Agent failed");
  });

  describe("tool definitions exist", () => {
    it("registers search_company_info tool", async () => {
      await import("../../../src/agents/placementAgent");
      const t = capturedTools.find((x) => x.name === "search_company_info");
      expect(t).toBeDefined();
      expect(t!.description).toMatch(/search company information/i);
    });

    it("registers get_company_details tool", async () => {
      await import("../../../src/agents/placementAgent");
      const t = capturedTools.find((x) => x.name === "get_company_details");
      expect(t).toBeDefined();
      expect(t!.description).toMatch(/full company profile/i);
    });

    it("registers get_student_skills tool", async () => {
      await import("../../../src/agents/placementAgent");
      const t = capturedTools.find((x) => x.name === "get_student_skills");
      expect(t).toBeDefined();
      expect(t!.description).toMatch(/student.s self-assessed skill/i);
    });

    it("creates exactly 3 tools", async () => {
      await import("../../../src/agents/placementAgent");
      expect(capturedTools.length).toBe(3);
    });

    it("searchCompanyTool calls semanticSearch and buildContextFromResults", async () => {
      await import("../../../src/agents/placementAgent");
      const searchTool = capturedTools.find((x) => x.name === "search_company_info")!;

      const retrievalResults = [
        {
          companyId: 1,
          sectionType: "overview",
          content: "Google overview",
          similarity: 0.9,
          company: { name: "Google", category: "Tech" },
        },
      ];
      mockSemanticSearch.mockResolvedValue(retrievalResults);
      mockBuildContextFromResults.mockReturnValue("formatted context");

      const result = await searchTool.fn({ query: "Google", limit: 3 });

      expect(mockSemanticSearch).toHaveBeenCalledWith("Google", 3, 0.4);
      expect(mockBuildContextFromResults).toHaveBeenCalledWith(
        [{ companyName: "Google", sectionType: "overview", content: "Google overview" }],
        2000,
      );
      expect(result).toBe("formatted context");
    });

    it("getCompanyDetailsTool queries db and returns company json", async () => {
      const { db } = await import("../../../src/lib/db");

      await import("../../../src/agents/placementAgent");
      const detailsTool = capturedTools.find((x) => x.name === "get_company_details")!;

      vi.mocked(db.company.findUnique).mockResolvedValueOnce({
        company_id: 1,
        name: "Acme Corp",
        category: "Technology",
        company_json: { full_json: { website: "https://acme.com" } },
      });

      const result = await detailsTool.fn({ companyId: 1 });
      expect(db.company.findUnique).toHaveBeenCalledWith({
        where: { company_id: 1 },
        include: { company_json: true },
      });
      expect(result).toContain("Acme Corp");
      expect(result).toContain("Technology");
      expect(result).toContain("https://acme.com");
    });

    it("getCompanyDetailsTool returns 'Company not found' for missing company", async () => {
      const { db } = await import("../../../src/lib/db");

      await import("../../../src/agents/placementAgent");
      const detailsTool = capturedTools.find((x) => x.name === "get_company_details")!;

      vi.mocked(db.company.findUnique).mockResolvedValueOnce(null);

      const result = await detailsTool.fn({ companyId: 999 });
      expect(result).toBe("Company not found");
    });

    it("getStudentSkillsTool queries user skills", async () => {
      const { db } = await import("../../../src/lib/db");

      await import("../../../src/agents/placementAgent");
      const skillsTool = capturedTools.find((x) => x.name === "get_student_skills")!;

      vi.mocked(db.user.findUnique).mockResolvedValueOnce({
        userId: "u1",
        studentSkills: [
          {
            proficiencyLevel: 4,
            skill: { skill_set_name: "Python", category: "Programming" },
          },
          {
            proficiencyLevel: 3,
            skill: { skill_set_name: "SQL", category: "Database" },
          },
        ],
      });

      const result = await skillsTool.fn({ userId: "u1" });
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { userId: "u1" },
        include: {
          studentSkills: {
            include: { skill: { select: { skill_set_name: true, category: true } } },
          },
        },
      });
      expect(result).toContain("Python");
      expect(result).toContain("Level 4");
      expect(result).toContain("SQL");
    });

    it("getStudentSkillsTool returns 'Student not found' for missing user", async () => {
      const { db } = await import("../../../src/lib/db");

      await import("../../../src/agents/placementAgent");
      const skillsTool = capturedTools.find((x) => x.name === "get_student_skills")!;

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);

      const result = await skillsTool.fn({ userId: "nonexistent" });
      expect(result).toBe("Student not found");
    });
  });

  describe("shouldContinue", () => {
    it("returns 'end' for non-tool messages", async () => {
      await import("../../../src/agents/placementAgent");

      const entry = capturedConditionalEdges.find((x) => x.node === "agent");
      expect(entry).toBeDefined();

      expect(entry!.fn({ messages: [{ _getType: () => "ai" }] })).toBe("end");
      expect(entry!.fn({ messages: [{ _getType: () => "human" }] })).toBe("end");
      expect(entry!.fn({ messages: [{ _getType: () => "system" }] })).toBe("end");
    });

    it("returns 'continue' for tool messages", async () => {
      await import("../../../src/agents/placementAgent");

      const entry = capturedConditionalEdges.find((x) => x.node === "agent");
      expect(entry!.fn({ messages: [{ _getType: () => "tool" }] })).toBe("continue");
    });

    it("returns 'end' for empty messages list", async () => {
      await import("../../../src/agents/placementAgent");

      const entry = capturedConditionalEdges.find((x) => x.node === "agent");
      expect(entry!.fn({ messages: [] })).toBe("end");
    });

    it("maps continue → tools and end → __end__", async () => {
      await import("../../../src/agents/placementAgent");

      const entry = capturedConditionalEdges.find((x) => x.node === "agent");
      expect(entry!.mapping).toEqual({
        continue: "tools",
        end: "__end__",
      });
    });
  });
});
