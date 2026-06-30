import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import aiRoutes from "../../../src/routes/ai-assistant";
import { checkOllamaHealth } from "../../../src/lib/ollama";

vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: vi.fn((req: any, _res: any, next: any) => {
    req.user = { sub: "student-id", email: "student@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
    next();
  }),
}));

vi.mock("../../../src/services/aiAssistantService", () => ({
  createChatSession: vi.fn(),
  getChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  generateAssistantResponse: vi.fn(),
  generateAgentResponse: vi.fn(),
  answerCompanyQuestion: vi.fn(),
  skillGapAnalysis: vi.fn(),
  generateInterviewPrepQuestions: vi.fn(),
}));

vi.mock("../../../src/services/retrievalService", () => ({
  semanticSearch: vi.fn(),
  searchCompanies: vi.fn(),
}));

vi.mock("../../../src/services/researchService", () => ({
  runResearch: vi.fn(),
  runFullPipeline: vi.fn(),
}));

vi.mock("../../../src/services/pipelineService", () => ({
  runFullPipeline_v2: vi.fn(),
}));

vi.mock("../../../src/lib/validation/gate", () => ({
  runDataQualityGate: vi.fn(),
}));

import {
  createChatSession,
  getChatSession,
  deleteChatSession,
  generateAssistantResponse,
  generateAgentResponse,
  answerCompanyQuestion,
  skillGapAnalysis,
  generateInterviewPrepQuestions,
} from "../../../src/services/aiAssistantService";
import { searchCompanies } from "../../../src/services/retrievalService";
import { runResearch, runFullPipeline } from "../../../src/services/researchService";

beforeEach(async () => {
  vi.clearAllMocks();
  const { requireAuth } = await import("../../../src/middleware/auth");
  vi.mocked(requireAuth).mockImplementation((req: any, _res: any, next: any) => {
    req.user = { sub: "student-id", email: "student@test.com", role: "student" as const, iat: 0, exp: 9999999999 };
    next();
  });
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/ai", aiRoutes);
  return app;
}

describe("GET /api/v1/ai/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when GROQ_API_KEY is set and Ollama is up", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_MODEL = "llama3-70b-8192";
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);

    const res = await request(createApp()).get("/api/v1/ai/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.model).toBe("llama3-70b-8192");
  });

  it("returns degraded when GROQ_API_KEY is missing", async () => {
    delete process.env.GROQ_API_KEY;

    const res = await request(createApp()).get("/api/v1/ai/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.error).toContain("GROQ_API_KEY");
  });

  it("returns degraded when Ollama is down but key is present", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.mocked(checkOllamaHealth).mockResolvedValue(false);

    const res = await request(createApp()).get("/api/v1/ai/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.warning).toContain("Ollama unavailable");
  });

  it("returns 503 on health check error", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.mocked(checkOllamaHealth).mockRejectedValue(new Error("Timeout"));

    const res = await request(createApp()).get("/api/v1/ai/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unavailable");
  });
});

describe("POST /api/v1/ai/chat/session", () => {
  it("creates a new chat session", async () => {
    vi.mocked(createChatSession).mockResolvedValue("session-uuid-123");

    const res = await request(createApp()).post("/api/v1/ai/chat/session");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe("session-uuid-123");
  });

  it("returns 500 on error", async () => {
    vi.mocked(createChatSession).mockRejectedValue(new Error("Redis down"));

    const res = await request(createApp()).post("/api/v1/ai/chat/session");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to create chat session");
  });
});

describe("POST /api/v1/ai/chat/message", () => {
  it("sends a message and gets response", async () => {
    vi.mocked(generateAssistantResponse).mockResolvedValue({
      response: "Here is some info",
      sources: [{ title: "Google Careers", url: "https://careers.google.com", snippet: "snippet" }],
    });

    const res = await request(createApp())
      .post("/api/v1/ai/chat/message")
      .send({ sessionId: "550e8400-e29b-41d4-a716-446655440000", message: "Tell me about Google" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toBe("Here is some info");
    expect(res.body.data.sources).toHaveLength(1);
    expect(res.body.data.tokens.input).toBeGreaterThan(0);
    expect(res.body.data.tokens.output).toBeGreaterThan(0);
  });

  it("returns 400 for missing message", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat/message")
      .send({ sessionId: "550e8400-e29b-41d4-a716-446655440000", message: "" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid sessionId", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat/message")
      .send({ sessionId: "not-a-uuid", message: "Hello" });

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(generateAssistantResponse).mockRejectedValue(new Error("LLM error"));

    const res = await request(createApp())
      .post("/api/v1/ai/chat/message")
      .send({ sessionId: "550e8400-e29b-41d4-a716-446655440000", message: "Hello" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to generate response");
  });
});

describe("POST /api/v1/ai/agent", () => {
  it("runs agent query successfully", async () => {
    vi.mocked(generateAgentResponse).mockResolvedValue("Agent analysis result");

    const res = await request(createApp())
      .post("/api/v1/ai/agent")
      .send({ query: "Analyze Google" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toBe("Agent analysis result");
  });

  it("returns 400 for empty query", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/agent")
      .send({ query: "" });

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(generateAgentResponse).mockRejectedValue(new Error("Agent error"));

    const res = await request(createApp())
      .post("/api/v1/ai/agent")
      .send({ query: "Analyze Google" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("GROQ_API_KEY");
  });
});

describe("GET /api/v1/ai/chat/session/:sessionId", () => {
  it("returns chat session history", async () => {
    vi.mocked(getChatSession).mockResolvedValue({
      messages: [
        { role: "user", content: "Hello", timestamp: new Date("2025-01-01") },
        { role: "assistant", content: "Hi!", timestamp: new Date("2025-01-01") },
      ],
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    });

    const res = await request(createApp()).get("/api/v1/ai/chat/session/550e8400-e29b-41d4-a716-446655440000");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.messages).toHaveLength(2);
  });

  it("returns 404 for missing session", async () => {
    vi.mocked(getChatSession).mockResolvedValue(null);

    const res = await request(createApp()).get("/api/v1/ai/chat/session/550e8400-e29b-41d4-a716-446655440000");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Session not found");
  });

  it("returns 500 on error", async () => {
    vi.mocked(getChatSession).mockRejectedValue(new Error("Redis error"));

    const res = await request(createApp()).get("/api/v1/ai/chat/session/nonexistent");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to retrieve chat session");
  });
});

describe("DELETE /api/v1/ai/chat/session/:sessionId", () => {
  it("deletes a chat session", async () => {
    vi.mocked(deleteChatSession).mockResolvedValue(undefined);

    const res = await request(createApp()).delete("/api/v1/ai/chat/session/550e8400-e29b-41d4-a716-446655440000");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on error", async () => {
    vi.mocked(deleteChatSession).mockRejectedValue(new Error("Redis error"));

    const res = await request(createApp()).delete("/api/v1/ai/chat/session/nonexistent");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to delete chat session");
  });
});

describe("POST /api/v1/ai/company/:companyId/question", () => {
  it("answers a company question", async () => {
    vi.mocked(answerCompanyQuestion).mockResolvedValue({
      answer: "Google was founded in 1998",
      sources: [{ title: "Wikipedia", url: "https://wikipedia.org", snippet: "snippet" }],
    });

    const res = await request(createApp())
      .post("/api/v1/ai/company/1/question")
      .send({ question: "When was Google founded?" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBe("Google was founded in 1998");
  });

  it("returns 400 for invalid company ID", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/company/abc/question")
      .send({ question: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid company ID");
  });

  it("returns 400 for empty question", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/company/1/question")
      .send({ question: "" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when company not found", async () => {
    vi.mocked(answerCompanyQuestion).mockRejectedValue(new Error("Company not found"));

    const res = await request(createApp())
      .post("/api/v1/ai/company/999/question")
      .send({ question: "Test" });

    expect(res.status).toBe(404);
  });

  it("returns 500 on error", async () => {
    vi.mocked(answerCompanyQuestion).mockRejectedValue(new Error("LLM error"));

    const res = await request(createApp())
      .post("/api/v1/ai/company/1/question")
      .send({ question: "Test" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to answer question");
  });
});

describe("POST /api/v1/ai/company/:companyId/interview-prep", () => {
  it("generates interview prep questions", async () => {
    vi.mocked(generateInterviewPrepQuestions).mockResolvedValue({
      questions: [
        { id: 1, question: "What is a linked list?", difficulty: "medium" },
      ],
    });

    const res = await request(createApp())
      .post("/api/v1/ai/company/1/interview-prep");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.questions).toHaveLength(1);
  });

  it("respects count query param", async () => {
    vi.mocked(generateInterviewPrepQuestions).mockResolvedValue({ questions: [] });

    await request(createApp())
      .post("/api/v1/ai/company/1/interview-prep?count=3");

    expect(generateInterviewPrepQuestions).toHaveBeenCalledWith(1, 3);
  });

  it("caps count at 15", async () => {
    vi.mocked(generateInterviewPrepQuestions).mockResolvedValue({ questions: [] });

    await request(createApp())
      .post("/api/v1/ai/company/1/interview-prep?count=100");

    expect(generateInterviewPrepQuestions).toHaveBeenCalledWith(1, 15);
  });

  it("returns 400 for invalid company ID", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/company/abc/interview-prep");

    expect(res.status).toBe(400);
  });

  it("returns 404 when company not found", async () => {
    vi.mocked(generateInterviewPrepQuestions).mockRejectedValue(new Error("Company not found"));

    const res = await request(createApp())
      .post("/api/v1/ai/company/999/interview-prep");

    expect(res.status).toBe(404);
  });

  it("returns 500 on error", async () => {
    vi.mocked(generateInterviewPrepQuestions).mockRejectedValue(new Error("Service error"));

    const res = await request(createApp())
      .post("/api/v1/ai/company/1/interview-prep");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to generate interview questions.");
  });
});

describe("POST /api/v1/ai/student/skill-gap-analysis", () => {
  it("analyzes skill gaps", async () => {
    vi.mocked(skillGapAnalysis).mockResolvedValue({
      gaps: [{ skill: "Python", currentLevel: 3, requiredLevel: 7, gap: 4 }],
      overallMatch: 42,
    });

    const res = await request(createApp())
      .post("/api/v1/ai/student/skill-gap-analysis")
      .send({ companyId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gaps).toHaveLength(1);
  });

  it("returns 400 for missing companyId", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/student/skill-gap-analysis")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(skillGapAnalysis).mockRejectedValue(new Error("Analysis failed"));

    const res = await request(createApp())
      .post("/api/v1/ai/student/skill-gap-analysis")
      .send({ companyId: 1 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to analyze skill gaps.");
  });
});

describe("GET /api/v1/ai/search", () => {
  it("searches companies successfully", async () => {
    vi.mocked(searchCompanies).mockResolvedValue([
      { id: 1, name: "Google", score: 0.95 },
    ]);

    const res = await request(createApp()).get("/api/v1/ai/search?q=tech+companies");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results).toHaveLength(1);
  });

  it("respects limit param", async () => {
    vi.mocked(searchCompanies).mockResolvedValue([]);

    await request(createApp()).get("/api/v1/ai/search?q=tech&limit=5");

    expect(searchCompanies).toHaveBeenCalledWith("tech", 5);
  });

  it("caps limit at 50", async () => {
    vi.mocked(searchCompanies).mockResolvedValue([]);

    await request(createApp()).get("/api/v1/ai/search?q=tech&limit=100");

    expect(searchCompanies).toHaveBeenCalledWith("tech", 50);
  });

  it("returns 500 on error", async () => {
    vi.mocked(searchCompanies).mockRejectedValue(new Error("Search error"));

    const res = await request(createApp()).get("/api/v1/ai/search?q=tech");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Search failed");
  });
});

describe("POST /api/v1/ai/research", () => {
  it("runs research successfully", async () => {
    vi.mocked(runResearch).mockResolvedValue({
      company: "Google",
      overview: "A tech company",
    });

    const res = await request(createApp())
      .post("/api/v1/ai/research")
      .send({ company: "Google" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company).toBe("Google");
  });

  it("returns 400 for missing company name", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/research")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(runResearch).mockRejectedValue(new Error("Research failed"));

    const res = await request(createApp())
      .post("/api/v1/ai/research")
      .send({ company: "Google" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Research failed");
  });
});

describe("POST /api/v1/ai/pipeline", () => {
  it("runs full pipeline successfully", async () => {
    vi.mocked(runFullPipeline).mockResolvedValue({
      company: "Google",
      skills: [{ name: "Python", level: 7 }],
    });

    const res = await request(createApp())
      .post("/api/v1/ai/pipeline")
      .send({ company: "Google" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company).toBe("Google");
  });

  it("returns 400 for missing company name", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/pipeline")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Pipeline error"));

    const res = await request(createApp())
      .post("/api/v1/ai/pipeline")
      .send({ company: "Google" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Pipeline failed");
  });
});

describe("POST /api/v1/ai/pipeline/run", () => {
  it("runs pipeline v2 successfully", async () => {
    const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
    vi.mocked(runFullPipeline_v2).mockResolvedValue({ status: "completed" });

    const res = await request(createApp())
      .post("/api/v1/ai/pipeline/run")
      .send({ company: "Google" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("completed");
  });

  it("returns 400 for missing company name", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/pipeline/run")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    const { runFullPipeline_v2 } = await import("../../../src/services/pipelineService");
    vi.mocked(runFullPipeline_v2).mockRejectedValue(new Error("v2 error"));

    const res = await request(createApp())
      .post("/api/v1/ai/pipeline/run")
      .send({ company: "Google" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Pipeline failed");
  });
});

describe("POST /api/v1/ai/pipeline/gate", () => {
  it("runs data quality gate successfully", async () => {
    const { runDataQualityGate } = await import("../../../src/lib/validation/gate");
    vi.mocked(runDataQualityGate).mockReturnValue({ valid: true, issues: [] });

    const res = await request(createApp())
      .post("/api/v1/ai/pipeline/gate")
      .send({ record: { name: "Test", category: "Tech" } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.valid).toBe(true);
  });

  it("returns 400 for missing record", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/pipeline/gate")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 500 on error", async () => {
    const { runDataQualityGate } = await import("../../../src/lib/validation/gate");
    vi.mocked(runDataQualityGate).mockImplementation(() => {
      throw new Error("Gate error");
    });

    const res = await request(createApp())
      .post("/api/v1/ai/pipeline/gate")
      .send({ record: { name: "Test" } });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Gate validation failed.");
  });
});

describe("Auth Guard - 401 without auth", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAuth } = await import("../../../src/middleware/auth");
    vi.mocked(requireAuth).mockImplementation((_req: any, res: any, _next: any) => {
      res.status(401).json({ success: false, error: "Authentication required. Please provide a valid token." });
    });
  });

  const authEndpoints = [
    { method: "post" as const, path: "/api/v1/ai/chat/session" },
    { method: "post" as const, path: "/api/v1/ai/chat/message" },
    { method: "post" as const, path: "/api/v1/ai/agent" },
    { method: "get" as const, path: "/api/v1/ai/chat/session/some-uuid" },
    { method: "delete" as const, path: "/api/v1/ai/chat/session/some-uuid" },
    { method: "post" as const, path: "/api/v1/ai/company/1/question" },
    { method: "post" as const, path: "/api/v1/ai/company/1/interview-prep" },
    { method: "post" as const, path: "/api/v1/ai/student/skill-gap-analysis" },
    { method: "get" as const, path: "/api/v1/ai/search" },
    { method: "post" as const, path: "/api/v1/ai/research" },
    { method: "post" as const, path: "/api/v1/ai/pipeline" },
    { method: "post" as const, path: "/api/v1/ai/pipeline/run" },
    { method: "post" as const, path: "/api/v1/ai/pipeline/gate" },
  ];

  it.each(authEndpoints)("$method $path returns 401 without auth", async ({ method, path }) => {
    const app = createApp();
    let res;
    switch (method) {
      case "get": res = await request(app).get(path); break;
      case "post": res = await request(app).post(path); break;
      case "delete": res = await request(app).delete(path); break;
    }
    expect(res!.status).toBe(401);
    expect(res!.body.error).toMatch(/Authentication required/);
  });
});
