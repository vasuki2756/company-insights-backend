import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    company: { findUnique: vi.fn() },
    company_skill_levels: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn(),
    embedding: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    company_json: { findUnique: vi.fn() },
  },
}));

vi.mock("../../../src/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("../../../src/lib/llm", () => ({
  generateResponse: vi.fn(),
}));

vi.mock("../../../src/agents/placementAgent", () => ({
  runAgent: vi.fn(),
}));

import type { Mock } from "vitest";
import { db } from "../../../src/lib/db";
import { getRedisClient } from "../../../src/lib/redis";
import { generateResponse as groqGenerate } from "../../../src/lib/llm";
import * as retrievalService from "../../../src/services/retrievalService";
import type {
  AIChatMessage,
  AIChatSession,
  RetrievalResult,
  SkillGapResponse,
  InterviewQuestionsResponse,
} from "../../../src/types/ai";

let mockStore: Record<string, string> = {};
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  sAdd: vi.fn(),
  sRem: vi.fn(),
  expire: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStore = {};
  mockRedis.get.mockImplementation((key: string) => Promise.resolve(mockStore[key] ?? null));
  mockRedis.set.mockImplementation((key: string, value: string) => {
    mockStore[key] = value;
    return Promise.resolve("OK");
  });
  mockRedis.del.mockImplementation((key: string) => {
    delete mockStore[key];
    return Promise.resolve(1);
  });
  (getRedisClient as Mock).mockResolvedValue(mockRedis);
});

function buildSession(overrides: Partial<AIChatSession> = {}): AIChatSession {
  return {
    sessionId: "test-session-id",
    userId: "user-1",
    messages: [],
    context: "",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function buildMessage(overrides: Partial<AIChatMessage> = {}): AIChatMessage {
  return {
    role: "user",
    content: "Hello",
    timestamp: new Date("2025-01-01"),
    ...overrides,
  };
}

function buildRetrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    companyId: 1,
    sectionType: "overview",
    content: "Some company content for testing",
    similarity: 0.95,
    company: { name: "TestCorp", category: "Tech" },
    ...overrides,
  };
}

function seedSession(session: AIChatSession): void {
  mockStore[`ai:session:${session.userId}:${session.sessionId}`] = JSON.stringify(session);
}

describe("aiAssistantService", () => {
  describe("createChatSession", () => {
    it("should create a session in Redis and return a sessionId", async () => {
      mockRedis.sAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);

      const { createChatSession } = await import("../../../src/services/aiAssistantService");
      const sessionId = await createChatSession("user-1");

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe("string");
      const setKey = Object.keys(mockStore).find((k) => k.startsWith("ai:session:"));
      expect(setKey).toBeTruthy();
      const parsed = JSON.parse(mockStore[setKey!]);
      expect(parsed.userId).toBe("user-1");
      expect(parsed.sessionId).toBe(sessionId);
      expect(parsed.messages).toEqual([]);
      expect(mockRedis.sAdd).toHaveBeenCalledWith("ai:user:user-1:sessions", sessionId);
      expect(mockRedis.expire).toHaveBeenCalledWith("ai:user:user-1:sessions", expect.any(Number));
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.set.mockRejectedValue(new Error("Redis down"));

      const { createChatSession } = await import("../../../src/services/aiAssistantService");
      const sessionId = await createChatSession("user-1");
      expect(sessionId).toBeTruthy();
    });
  });

  describe("getChatSession", () => {
    it("should retrieve and parse a session from Redis", async () => {
      seedSession(buildSession());

      const { getChatSession } = await import("../../../src/services/aiAssistantService");
      const result = await getChatSession("user-1", "test-session-id");

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("test-session-id");
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
    });

    it("should return null when session is not found", async () => {
      const { getChatSession } = await import("../../../src/services/aiAssistantService");
      const result = await getChatSession("user-1", "nonexistent");
      expect(result).toBeNull();
    });

    it("should handle JSON parse errors and return null", async () => {
      mockStore["ai:session:user-1:bad-json"] = "invalid json";

      const { getChatSession } = await import("../../../src/services/aiAssistantService");
      const result = await getChatSession("user-1", "bad-json");
      expect(result).toBeNull();
    });

    it("should convert message timestamps to Date objects", async () => {
      const session = buildSession({
        messages: [{ role: "user", content: "hi", timestamp: "2025-06-01T00:00:00.000Z" } as unknown as AIChatMessage],
      });
      seedSession(session);

      const { getChatSession } = await import("../../../src/services/aiAssistantService");
      const result = await getChatSession("user-1", "test-session-id");
      expect(result!.messages[0].timestamp).toBeInstanceOf(Date);
      expect(result!.messages[0].timestamp.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    });
  });

  describe("saveChatMessage", () => {
    it("should append a message to the session and save", async () => {
      seedSession(buildSession({ messages: [] }));

      const { saveChatMessage } = await import("../../../src/services/aiAssistantService");
      await saveChatMessage("user-1", "test-session-id", buildMessage({ content: "Test message" }));

      const savedRaw = mockStore["ai:session:user-1:test-session-id"];
      const saved = JSON.parse(savedRaw);
      expect(saved.messages.length).toBe(1);
      expect(saved.messages[0].content).toBe("Test message");
    });

    it("should enforce the 50-message limit", async () => {
      const msgs: AIChatMessage[] = [];
      for (let i = 0; i < 60; i++) {
        msgs.push(buildMessage({ content: `msg-${i}` }));
      }
      seedSession(buildSession({ messages: msgs }));

      const { saveChatMessage } = await import("../../../src/services/aiAssistantService");
      await saveChatMessage("user-1", "test-session-id", buildMessage({ content: "final" }));

      const savedRaw = mockStore["ai:session:user-1:test-session-id"];
      const saved = JSON.parse(savedRaw);
      expect(saved.messages.length).toBe(50);
      expect(saved.messages[0].content).toBe("msg-11");
      expect(saved.messages[49].content).toBe("final");
    });

    it("should warn and return when session is not found", async () => {
      const { saveChatMessage } = await import("../../../src/services/aiAssistantService");
      await saveChatMessage("user-1", "ghost-session", buildMessage());
      expect(Object.keys(mockStore)).toHaveLength(0);
    });

    it("should handle Redis errors gracefully", async () => {
      seedSession(buildSession({ messages: [] }));
      mockRedis.set.mockRejectedValue(new Error("timeout"));

      const { saveChatMessage } = await import("../../../src/services/aiAssistantService");
      await saveChatMessage("user-1", "test-session-id", buildMessage());
    });
  });

  describe("deleteChatSession", () => {
    it("should delete session from Redis and remove from user set", async () => {
      seedSession(buildSession());
      mockRedis.sRem.mockResolvedValue(1);

      const { deleteChatSession } = await import("../../../src/services/aiAssistantService");
      await deleteChatSession("user-1", "test-session-id");

      expect(mockStore["ai:session:user-1:test-session-id"]).toBeUndefined();
      expect(mockRedis.sRem).toHaveBeenCalledWith("ai:user:user-1:sessions", "test-session-id");
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.del.mockRejectedValue(new Error("Redis down"));

      const { deleteChatSession } = await import("../../../src/services/aiAssistantService");
      await deleteChatSession("user-1", "test-session-id");
      expect(mockRedis.sRem).not.toHaveBeenCalled();
    });
  });

  describe("generateAssistantResponse", () => {
    beforeEach(() => {
      vi.spyOn(retrievalService, "semanticSearch").mockResolvedValue([buildRetrievalResult()]);
      vi.spyOn(retrievalService, "searchByCompanyId").mockResolvedValue([buildRetrievalResult()]);
      (groqGenerate as Mock).mockResolvedValue("Here is the answer.");
    });

    it("should use company-specific search when companyId is provided", async () => {
      seedSession(buildSession({ messages: [] }));

      const { generateAssistantResponse } = await import("../../../src/services/aiAssistantService");
      await generateAssistantResponse("user-1", "test-session-id", "Tell me about this company", 42);

      expect(retrievalService.searchByCompanyId).toHaveBeenCalledWith(42, "Tell me about this company");
      expect(retrievalService.semanticSearch).not.toHaveBeenCalled();
    });

    it("should use general semantic search when no companyId", async () => {
      seedSession(buildSession({ messages: [] }));

      const { generateAssistantResponse } = await import("../../../src/services/aiAssistantService");
      await generateAssistantResponse("user-1", "test-session-id", "General query");

      expect(retrievalService.semanticSearch).toHaveBeenCalledWith("General query", 8, 0.4);
    });

    it("should limit source previews to 5 items", async () => {
      const manyResults: RetrievalResult[] = [];
      for (let i = 0; i < 10; i++) {
        manyResults.push(buildRetrievalResult({ companyId: i }));
      }
      vi.spyOn(retrievalService, "semanticSearch").mockResolvedValue(manyResults);
      seedSession(buildSession({ messages: [] }));

      const { generateAssistantResponse } = await import("../../../src/services/aiAssistantService");
      const result = await generateAssistantResponse("user-1", "test-session-id", "query");
      expect(result.sources.length).toBeLessThanOrEqual(5);
    });

    it("should throw if session does not exist", async () => {
      const { generateAssistantResponse } = await import("../../../src/services/aiAssistantService");
      await expect(generateAssistantResponse("user-1", "bad-session", "hi")).rejects.toThrow("Failed to create chat session");
    });

    it("should save both user and assistant messages", async () => {
      seedSession(buildSession({ messages: [] }));

      const { generateAssistantResponse } = await import("../../../src/services/aiAssistantService");
      await generateAssistantResponse("user-1", "test-session-id", "Hello");

      const savedRaw = mockStore["ai:session:user-1:test-session-id"];
      const saved = JSON.parse(savedRaw);
      expect(saved.messages.length).toBe(2);
      expect(saved.messages[0].role).toBe("user");
      expect(saved.messages[1].role).toBe("assistant");
    });

    it("should handle empty search results gracefully", async () => {
      vi.spyOn(retrievalService, "semanticSearch").mockResolvedValue([]);
      seedSession(buildSession({ messages: [] }));

      const { generateAssistantResponse } = await import("../../../src/services/aiAssistantService");
      const result = await generateAssistantResponse("user-1", "test-session-id", "query");
      expect(result.response).toBe("Here is the answer.");
      expect(result.sources).toEqual([]);
    });
  });

  describe("generateAgentResponse", () => {
    it("should delegate to runAgent", async () => {
      const { runAgent } = await import("../../../src/agents/placementAgent");
      (runAgent as Mock).mockResolvedValue("agent response");

      const { generateAgentResponse } = await import("../../../src/services/aiAssistantService");
      const result = await generateAgentResponse("user-1", "query", 1);
      expect(runAgent).toHaveBeenCalledWith("query", "user-1", 1);
      expect(result).toBe("agent response");
    });
  });

  describe("answerCompanyQuestion", () => {
    it("should look up company, search, and generate answer", async () => {
      (db.company.findUnique as Mock).mockResolvedValue({ name: "Acme", category: "Tech" });
      vi.spyOn(retrievalService, "searchByCompanyId").mockResolvedValue([buildRetrievalResult()]);
      (groqGenerate as Mock).mockResolvedValue("Acme is a great company.");

      const { answerCompanyQuestion } = await import("../../../src/services/aiAssistantService");
      const result = await answerCompanyQuestion(1, "What does Acme do?");

      expect(db.company.findUnique).toHaveBeenCalledWith({
        where: { company_id: 1 },
        select: { name: true, category: true },
      });
      expect(retrievalService.searchByCompanyId).toHaveBeenCalledWith(1, "What does Acme do?");
      expect(groqGenerate).toHaveBeenCalled();
      expect(result.answer).toBe("Acme is a great company.");
      expect(result.sources).toEqual(["overview (TestCorp)"]);
    });

    it("should throw if company is not found", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(null);

      const { answerCompanyQuestion } = await import("../../../src/services/aiAssistantService");
      await expect(answerCompanyQuestion(999, "question")).rejects.toThrow("Company with ID 999 not found");
    });
  });

  describe("skillGapAnalysis", () => {
    const student = {
      userId: "user-1",
      studentSkills: [
        { proficiencyLevel: 3, skill: { skill_set_name: "JavaScript", category: "Language" } },
        { proficiencyLevel: 1, skill: { skill_set_name: "Python", category: "Language" } },
      ],
    };

    const company = { name: "TechCorp", category: "IT" };

    const requirements = [
      { required_level: 4, skill_set_master: { skill_set_name: "JavaScript", category: "Language" } },
      { required_level: 3, skill_set_master: { skill_set_name: "Python", category: "Language" } },
      { required_level: 2, skill_set_master: { skill_set_name: "Docker", category: "DevOps" } },
    ];

    beforeEach(() => {
      (db.user.findUnique as Mock).mockResolvedValue(student);
      (db.company.findUnique as Mock).mockResolvedValue(company);
      (db.company_skill_levels.findMany as Mock).mockResolvedValue(requirements);
      (groqGenerate as Mock).mockResolvedValue("Analysis text");
    });

    it("should compute skill gaps correctly", async () => {
      const { skillGapAnalysis } = await import("../../../src/services/aiAssistantService");
      const result: SkillGapResponse = await skillGapAnalysis("user-1", 1);

      expect(result.analysis).toBe("Analysis text");
      expect(result.gaps).toHaveLength(3);
      const jsGap = result.gaps.find((g) => g.skillName === "JavaScript")!;
      expect(jsGap.userLevel).toBe(3);
      expect(jsGap.requiredLevel).toBe(4);
      expect(jsGap.gap).toBe(1);
      expect(jsGap.proficiencyNeeded).toBe("Near target");
      const pythonGap = result.gaps.find((g) => g.skillName === "Python")!;
      expect(pythonGap.gap).toBe(2);
      expect(pythonGap.proficiencyNeeded).toBe("Near target");
      const dockerGap = result.gaps.find((g) => g.skillName === "Docker")!;
      expect(dockerGap.userLevel).toBe(0);
      expect(dockerGap.gap).toBe(2);
    });

    it("should sort gaps by descending gap size", async () => {
      const { skillGapAnalysis } = await import("../../../src/services/aiAssistantService");
      const result = await skillGapAnalysis("user-1", 1);
      for (let i = 1; i < result.gaps.length; i++) {
        expect(result.gaps[i].gap).toBeLessThanOrEqual(result.gaps[i - 1].gap);
      }
    });

    it("should mark proficiency as 'Meets requirement' when gap <= 0", async () => {
      (db.user.findUnique as Mock).mockResolvedValue({
        userId: "user-1",
        studentSkills: [{ proficiencyLevel: 5, skill: { skill_set_name: "JavaScript", category: "Language" } }],
      });
      (db.company_skill_levels.findMany as Mock).mockResolvedValue([
        { required_level: 3, skill_set_master: { skill_set_name: "JavaScript", category: "Language" } },
      ]);

      const { skillGapAnalysis } = await import("../../../src/services/aiAssistantService");
      const result = await skillGapAnalysis("user-1", 1);
      expect(result.gaps[0].proficiencyNeeded).toBe("Meets requirement");
      expect(result.gaps[0].gap).toBe(0);
    });

    it("should mark 'Moderate gap' for gap 3-4 and 'Significant gap' for gap >= 5", async () => {
      (db.user.findUnique as Mock).mockResolvedValue({ userId: "user-1", studentSkills: [] });
      (db.company_skill_levels.findMany as Mock).mockResolvedValue([
        { required_level: 3, skill_set_master: { skill_set_name: "Go", category: "Language" } },
        { required_level: 6, skill_set_master: { skill_set_name: "Rust", category: "Language" } },
      ]);

      const { skillGapAnalysis } = await import("../../../src/services/aiAssistantService");
      const result = await skillGapAnalysis("user-1", 1);
      expect(result.gaps.find((g) => g.skillName === "Go")!.proficiencyNeeded).toBe("Moderate gap");
      expect(result.gaps.find((g) => g.skillName === "Rust")!.proficiencyNeeded).toBe("Significant gap");
    });

    it("should throw when student is not found", async () => {
      (db.user.findUnique as Mock).mockResolvedValue(null);
      const { skillGapAnalysis } = await import("../../../src/services/aiAssistantService");
      await expect(skillGapAnalysis("nonexistent", 1)).rejects.toThrow("User not found");
    });

    it("should throw when company is not found", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(null);
      const { skillGapAnalysis } = await import("../../../src/services/aiAssistantService");
      await expect(skillGapAnalysis("user-1", 999)).rejects.toThrow("Company not found");
    });
  });

  describe("generateInterviewPrepQuestions", () => {
    const company = {
      company_id: 1,
      name: "TechCorp",
      category: "IT",
      company_json: {
        full_json: {
          techStack: ["React", "Node.js"],
          overviewText: "A leading tech company",
        },
      },
    };

    beforeEach(() => {
      (db.company.findUnique as Mock).mockResolvedValue(company);
    });

    it("should generate and parse interview questions", async () => {
      (groqGenerate as Mock).mockResolvedValue(
        "1. What is the React virtual DOM and how does it improve performance compared to direct DOM manipulation?\n2. Explain the Node.js event loop architecture and its phases in detail\n3. How do you manage complex application state across multiple components?\n4. Describe REST API design principles for building scalable microservices\n5. What is CI/CD pipeline automation and its role in DevOps culture?",
      );

      const { generateInterviewPrepQuestions } = await import("../../../src/services/aiAssistantService");
      const result: InterviewQuestionsResponse = await generateInterviewPrepQuestions(1, 5);

      expect(groqGenerate).toHaveBeenCalled();
      expect(result.questions).toHaveLength(5);
      expect(result.questions[0]).toContain("React virtual DOM");
      expect(result.techStack).toEqual(["React", "Node.js"]);
      expect(result.company.name).toBe("TechCorp");
      expect(result.company.category).toBe("IT");
    });

    it("should handle fewer questions returned from LLM than requested", async () => {
      (groqGenerate as Mock).mockResolvedValue("1. Only one question but it must be longer than twenty characters to pass the filter");

      const { generateInterviewPrepQuestions } = await import("../../../src/services/aiAssistantService");
      const result = await generateInterviewPrepQuestions(1, 10);
      expect(result.questions.length).toBeLessThanOrEqual(5);
      expect(result.questions.length).toBeGreaterThanOrEqual(1);
    });

    it("should throw when company is not found", async () => {
      (db.company.findUnique as Mock).mockResolvedValue(null);
      const { generateInterviewPrepQuestions } = await import("../../../src/services/aiAssistantService");
      await expect(generateInterviewPrepQuestions(999)).rejects.toThrow("Company not found");
    });

    it("should handle missing company_json gracefully", async () => {
      (db.company.findUnique as Mock).mockResolvedValue({
        company_id: 2,
        name: "NoJsonCorp",
        category: "Finance",
        company_json: null,
      });
      (groqGenerate as Mock).mockResolvedValue(
        "1. First interview question that is definitely longer than twenty characters to pass the filter\n2. Second interview question that is also long enough to meet the minimum threshold\n3. Third interview question which completes the set of generated questions",
      );

      const { generateInterviewPrepQuestions } = await import("../../../src/services/aiAssistantService");
      const result = await generateInterviewPrepQuestions(2, 3);
      expect(result.techStack).toEqual([]);
      expect(result.company.name).toBe("NoJsonCorp");
      expect(result.questions.length).toBe(3);
    });
  });
});
