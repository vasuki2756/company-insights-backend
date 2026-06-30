// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — AI Assistant Routes
// Chat sessions, RAG queries, skill gap analysis, interview prep
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import pino from "pino";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import {
  createChatSession,
  getChatSession,
  deleteChatSession,
  generateAssistantResponse,
  answerCompanyQuestion,
  skillGapAnalysis,
  generateInterviewPrepQuestions,
} from "../services/aiAssistantService";
import { semanticSearch, searchCompanies } from "../services/retrievalService";
import { checkOllamaHealth } from "../lib/ollama";
import type { ApiResponse } from "../types/auth";
import type { AIHealthResponse } from "../types/ai";

const logger = pino({ name: "ai-routes" });
const router = Router();

// ─── Validation Schemas ───────────────────────────────────────

const chatMessageSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  message: z.string().min(1, "Message is required").max(2000, "Message too long"),
  companyId: z.number().int().positive().optional(),
});

const companyQuestionSchema = z.object({
  question: z.string().min(1, "Question is required").max(2000, "Question too long"),
});

const skillGapSchema = z.object({
  companyId: z.number().int().positive("Valid company ID is required"),
});

// ─── POST /api/v1/ai/chat/session ─────────────────────────────
// Create a new chat session

router.post(
  "/chat/session",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const sessionId = await createChatSession(req.user.sub);
      res.status(201).json({
        success: true,
        data: { sessionId },
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Failed to create chat session");
      res.status(500).json({
        success: false,
        error: "Failed to create chat session",
      } satisfies ApiResponse);
    }
  },
);

// ─── POST /api/v1/ai/chat/message ─────────────────────────────
// Send a message and get AI response

router.post(
  "/chat/message",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const parsed = chatMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? "Invalid request";
        res.status(400).json({ success: false, error: message } satisfies ApiResponse);
        return;
      }

      const { sessionId, message, companyId } = parsed.data;

      const result = await generateAssistantResponse(
        req.user.sub,
        sessionId,
        message,
        companyId,
      );

      res.json({
        success: true,
        data: {
          response: result.response,
          sources: result.sources,
          tokens: {
            input: Math.ceil(message.length / 4),
            output: Math.ceil(result.response.length / 4),
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Failed to generate AI response");
      res.status(500).json({
        success: false,
        error: "Failed to generate response. Please ensure Ollama is running.",
      } satisfies ApiResponse);
    }
  },
);

// ─── GET /api/v1/ai/chat/session/:sessionId ──────────────────
// Retrieve chat session history

router.get(
  "/chat/session/:sessionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const sessionId = req.params.sessionId as string;
      const session = await getChatSession(req.user.sub, sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: "Session not found or expired",
        } satisfies ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: {
          messages: session.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
        },
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Failed to retrieve session");
      res.status(500).json({
        success: false,
        error: "Failed to retrieve chat session",
      } satisfies ApiResponse);
    }
  },
);

// ─── DELETE /api/v1/ai/chat/session/:sessionId ───────────────
// Delete a chat session

router.delete(
  "/chat/session/:sessionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const sessionId = req.params.sessionId as string;
      await deleteChatSession(req.user.sub, sessionId);

      res.json({ success: true } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Failed to delete session");
      res.status(500).json({
        success: false,
        error: "Failed to delete chat session",
      } satisfies ApiResponse);
    }
  },
);

// ─── POST /api/v1/ai/company/:companyId/question ──────────────
// Ask a question about a specific company

router.post(
  "/company/:companyId/question",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const companyId = parseInt(req.params.companyId as string, 10);
      if (Number.isNaN(companyId) || companyId < 1) {
        res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
        return;
      }

      const parsed = companyQuestionSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? "Invalid request";
        res.status(400).json({ success: false, error: message } satisfies ApiResponse);
        return;
      }

      const result = await answerCompanyQuestion(companyId, parsed.data.question);

      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found")) {
        res.status(404).json({ success: false, error: message } satisfies ApiResponse);
        return;
      }
      logger.error({ error: message }, "Failed to answer company question");
      res.status(500).json({
        success: false,
        error: "Failed to answer question. Ensure Ollama is running.",
      } satisfies ApiResponse);
    }
  },
);

// ─── POST /api/v1/ai/company/:companyId/interview-prep ────────
// Generate interview preparation questions for a company

router.post(
  "/company/:companyId/interview-prep",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const companyId = parseInt(req.params.companyId as string, 10);
      if (Number.isNaN(companyId) || companyId < 1) {
        res.status(400).json({ success: false, error: "Invalid company ID" } satisfies ApiResponse);
        return;
      }

      const count = Math.min(
        parseInt(req.query.count as string, 10) || 5,
        15,
      );

      const result = await generateInterviewPrepQuestions(companyId, count);

      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found")) {
        res.status(404).json({ success: false, error: message } satisfies ApiResponse);
        return;
      }
      logger.error({ error: message }, "Failed to generate interview prep");
      res.status(500).json({
        success: false,
        error: "Failed to generate interview questions.",
      } satisfies ApiResponse);
    }
  },
);

// ─── POST /api/v1/ai/student/skill-gap-analysis ──────────────
// Analyze skill gaps between student and target company

router.post(
  "/student/skill-gap-analysis",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" } satisfies ApiResponse);
        return;
      }

      const parsed = skillGapSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? "Invalid request";
        res.status(400).json({ success: false, error: message } satisfies ApiResponse);
        return;
      }

      const result = await skillGapAnalysis(req.user.sub, parsed.data.companyId);

      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Failed to analyze skill gaps");
      res.status(500).json({
        success: false,
        error: "Failed to analyze skill gaps.",
      } satisfies ApiResponse);
    }
  },
);

// ─── GET /api/v1/ai/search ────────────────────────────────────
// Search companies with semantic relevance

router.get(
  "/search",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        res.status(400).json({ success: false, error: "Search query is required" } satisfies ApiResponse);
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);
      const results = await searchCompanies(query, limit);

      res.json({
        success: true,
        data: { results },
      } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Search failed");
      res.status(500).json({ success: false, error: "Search failed" } satisfies ApiResponse);
    }
  },
);

// ─── GET /api/v1/ai/health ────────────────────────────────────
// Check AI system health (no auth required)

router.get(
  "/health",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const healthy = await checkOllamaHealth();
      const response: AIHealthResponse = {
        status: healthy ? "healthy" : "unavailable",
        model: process.env.OLLAMA_MODEL ?? "llama3.2",
        embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
      };

      if (!healthy) {
        response.error = "Ollama model(s) not found. Run: ollama pull " +
          `${process.env.OLLAMA_MODEL ?? "llama3.2"} && ` +
          `ollama pull ${process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text"}`;
      }

      const statusCode = healthy ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(503).json({
        status: "unavailable",
        model: process.env.OLLAMA_MODEL ?? "llama3.2",
        embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
        error: `Ollama connection failed: ${message}`,
      } as AIHealthResponse);
    }
  },
);

export default router;
