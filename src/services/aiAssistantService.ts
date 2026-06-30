// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — AI Assistant Service
// Orchestrates chat sessions, RAG retrieval, and LLM generation
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import pino from "pino";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import { generateResponse, generateResponseStream } from "../lib/ollama";
import { semanticSearch, searchByCompanyId } from "./retrievalService";
import {
  buildSystemPrompt,
  buildRagPrompt,
  buildCompanyQuestionPrompt,
  buildSkillGapPrompt,
  buildInterviewPrepPrompt,
  buildContextFromResults,
} from "../utils/prompts";
import type {
  AIChatSession,
  AIChatMessage,
  RetrievalResult,
  RetrievalSource,
  SkillGapItem,
  SkillGapResponse,
  InterviewQuestionsResponse,
} from "../types/ai";
import { CHAT_SESSION_TTL, MAX_CONTEXT_LENGTH } from "../types/ai";

const logger = pino({ name: "ai-assistant" });

// ─── Redis Keys ───────────────────────────────────────────────

const sessionKey = (userId: string, sessionId: string) =>
  `ai:session:${userId}:${sessionId}`;

const userSessionsKey = (userId: string) =>
  `ai:user:${userId}:sessions`;

// ─── Chat Session Management ──────────────────────────────────

/**
 * Create a new chat session for a user.
 * Session data is stored in Redis with a configurable TTL (default: 24h).
 * @param userId - The authenticated user's ID
 * @returns The unique session ID
 */
export async function createChatSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  const now = new Date();

  const session: AIChatSession = {
    sessionId,
    userId,
    messages: [],
    context: "",
    createdAt: now,
    updatedAt: now,
  };

  try {
    const redis = await getRedisClient();
    await redis.set(sessionKey(userId, sessionId), JSON.stringify(session), {
      EX: CHAT_SESSION_TTL,
    });
    // Track user session list
    await redis.sAdd(userSessionsKey(userId), sessionId);
    await redis.expire(userSessionsKey(userId), CHAT_SESSION_TTL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, "Failed to create chat session in Redis");
    // Return the sessionId anyway — caller can still use it
  }

  logger.info({ userId, sessionId }, "Chat session created");
  return sessionId;
}

/**
 * Retrieve a chat session from Redis.
 * @param userId - The authenticated user's ID
 * @param sessionId - The session ID to retrieve
 * @returns The session or null if not found/expired
 */
export async function getChatSession(
  userId: string,
  sessionId: string,
): Promise<AIChatSession | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(sessionKey(userId, sessionId));
    if (!raw) return null;

    const session = JSON.parse(raw) as AIChatSession;
    // Convert timestamp strings back to Date objects
    session.messages = session.messages.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    session.createdAt = new Date(session.createdAt);
    session.updatedAt = new Date(session.updatedAt);

    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, sessionId, error: message }, "Failed to retrieve chat session");
    return null;
  }
}

/**
 * Save a message to a chat session in Redis.
 * Maintains the last 50 messages to limit memory use.
 * @param userId - The authenticated user's ID
 * @param sessionId - The session ID
 * @param message - The message to append
 */
export async function saveChatMessage(
  userId: string,
  sessionId: string,
  message: AIChatMessage,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(sessionKey(userId, sessionId));
    if (!raw) {
      logger.warn({ userId, sessionId }, "Session not found, cannot save message");
      return;
    }

    const session = JSON.parse(raw) as AIChatSession;
    session.messages.push(message);

    // Keep only the last 50 messages
    if (session.messages.length > 50) {
      session.messages = session.messages.slice(session.messages.length - 50);
    }

    session.updatedAt = new Date();

    // Re-save with updated TTL
    await redis.set(sessionKey(userId, sessionId), JSON.stringify(session), {
      EX: CHAT_SESSION_TTL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, sessionId, error: message }, "Failed to save chat message");
  }
}

/**
 * Delete a chat session from Redis.
 * @param userId - The authenticated user's ID
 * @param sessionId - The session ID to delete
 */
export async function deleteChatSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(sessionKey(userId, sessionId));
    await redis.sRem(userSessionsKey(userId), sessionId);
    logger.info({ userId, sessionId }, "Chat session deleted");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, sessionId, error: message }, "Failed to delete chat session");
  }
}

// ─── Response Generation ──────────────────────────────────────

/**
 * Generate an AI response using RAG.
 * Retrieves relevant context, builds a prompt with conversation history,
 * generates a response, saves both user and assistant messages.
 *
 * @param userId - The authenticated user's ID
 * @param sessionId - The chat session ID
 * @param userMessage - The user's latest message
 * @param companyId - Optional company ID to scope the search
 * @returns The response text and source citations
 */
export async function generateAssistantResponse(
  userId: string,
  sessionId: string,
  userMessage: string,
  companyId?: number,
): Promise<{ response: string; sources: RetrievalSource[] }> {
  // 1. Get or create session
  let session = await getChatSession(userId, sessionId);
  if (!session) {
    // Create a new session if expired
    await createChatSession(userId);
    session = await getChatSession(userId, sessionId);
    if (!session) {
      throw new Error("Failed to create chat session");
    }
  }

  // 2. Save user message
  const userMsg: AIChatMessage = {
    role: "user",
    content: userMessage,
    timestamp: new Date(),
  };
  await saveChatMessage(userId, sessionId, userMsg);

  // 3. Retrieve context
  let results: RetrievalResult[];
  if (companyId) {
    results = await searchByCompanyId(companyId, userMessage);
  } else {
    results = await semanticSearch(userMessage, 8, 0.4);
  }

  const context = buildContextFromResults(
    results.map((r) => ({
      companyName: r.company.name,
      sectionType: r.sectionType,
      content: r.content,
    })),
    MAX_CONTEXT_LENGTH,
  );

  // 4. Build conversation history (last 6 messages for context but not too many tokens)
  const historyMessages = session.messages.slice(-6);
  const history = historyMessages
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
    .join("\n");

  // 5. Build system prompt
  const systemPrompt = buildSystemPrompt();
  const ragPrompt = buildRagPrompt(userMessage, context, history);
  const fullPrompt = `${systemPrompt}\n\n${ragPrompt}`;

  // 6. Generate response
  const responseText = await generateResponse(fullPrompt);

  // 7. Save assistant message
  const assistantMsg: AIChatMessage = {
    role: "assistant",
    content: responseText,
    timestamp: new Date(),
  };
  await saveChatMessage(userId, sessionId, assistantMsg);

  // 8. Format sources
  const sources: RetrievalSource[] = results.slice(0, 5).map((r) => ({
    companyId: r.companyId,
    companyName: r.company.name,
    sectionType: r.sectionType,
    contentPreview: r.content.slice(0, 150),
    relevance: r.similarity,
  }));

  return { response: responseText, sources };
}

/**
 * Answer a question specifically about one company.
 * Uses all available embeddings for that company as context.
 *
 * @param companyId - The company ID
 * @param question - The user's question about the company
 * @returns Answer with cited sources
 */
export async function answerCompanyQuestion(
  companyId: number,
  question: string,
): Promise<{ answer: string; sources: string[] }> {
  // Fetch company info
  const company = await db.company.findUnique({
    where: { company_id: companyId },
    select: { name: true, category: true },
  });

  if (!company) {
    throw new Error(`Company with ID ${companyId} not found`);
  }

  // Retrieve all relevant sections for this company
  const results = await searchByCompanyId(companyId, question);

  const profileText = results
    .map((r) => `[${r.sectionType}]\n${r.content}`)
    .join("\n\n");

  const prompt = buildCompanyQuestionPrompt(company.name ?? "Company", question, profileText);

  // Generate response with lower temperature for factual accuracy
  const answer = await generateResponse(prompt, undefined, { temperature: 0.3 });

  const sources = results.map((r) => `${r.sectionType} (${r.company.name})`);

  return { answer, sources };
}

/**
 * Analyze skill gaps between a student and a target company.
 *
 * @param userId - The student's user ID
 * @param companyId - The target company ID
 * @returns Structured skill gap analysis
 */
export async function skillGapAnalysis(
  userId: string,
  companyId: number,
): Promise<SkillGapResponse> {
  // Get student's skills
  const student = await db.user.findUnique({
    where: { userId: userId },
    include: {
      studentSkills: {
        include: {
          skill: { select: { skill_set_name: true, category: true } },
        },
      },
    },
  });

  if (!student) {
    throw new Error("User not found");
  }

  // Get company's skill requirements
  const company = await db.company.findUnique({
    where: { company_id: companyId },
    select: { name: true, category: true },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  const requirements = await db.company_skill_levels.findMany({
    where: { company_id: companyId },
    include: { skill_set_master: true },
  });

  // Build structured skill data
  const studentSkillMap = new Map(
    student.studentSkills.map((s) => [s.skill.skill_set_name.toLowerCase(), s.proficiencyLevel]),
  );

  const gaps: SkillGapItem[] = requirements.map((req) => {
    const skillName = req.skill_set_master.skill_set_name;
    const userLevel = studentSkillMap.get(skillName.toLowerCase()) ?? 0;
    const gap = Math.max(0, req.required_level - userLevel);

    return {
      skillName,
      userLevel,
      requiredLevel: req.required_level,
      gap,
      proficiencyNeeded: gap <= 0
        ? "Meets requirement"
        : gap <= 2
          ? "Near target"
          : gap <= 4
            ? "Moderate gap"
            : "Significant gap",
    };
  });

  // Format for LLM analysis
  const studentSkillsText = student.studentSkills
    .map((s) => `${s.skill.skill_set_name}: Level ${s.proficiencyLevel}`)
    .join("\n");

  const companyRequirementsText = requirements
    .map((r) => `${r.skill_set_master.skill_set_name}: Required Level ${r.required_level} (${r.skill_set_master.category ?? "general"})`)
    .join("\n");

  const prompt = buildSkillGapPrompt(studentSkillsText, companyRequirementsText, company.name ?? "Company");
  const analysis = await generateResponse(prompt, undefined, { temperature: 0.4 });

  return { analysis, gaps: gaps.sort((a, b) => b.gap - a.gap) };
}

/**
 * Generate interview preparation questions for a company.
 *
 * @param companyId - The target company ID
 * @param count - Number of questions to generate (default: 5)
 * @returns Questions, tech stack, and company info
 */
export async function generateInterviewPrepQuestions(
  companyId: number,
  count: number = 5,
): Promise<InterviewQuestionsResponse> {
  const company = await db.company.findUnique({
    where: { company_id: companyId },
    include: {
      company_json: true,
    },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  const fullJson = company.company_json?.full_json as Record<string, unknown> | undefined;
  const shortJson = company.company_json?.short_json as Record<string, unknown> | undefined;
  const techStack = (fullJson?.techStack ?? shortJson?.techStack ?? []) as string[];
  const companyDescription = (fullJson?.overview_text ?? shortJson ?? `${company.name} is a ${company.category ?? ""} company.`) as string;

  const prompt = buildInterviewPrepPrompt(
    company.name ?? "Company",
    techStack,
    companyDescription,
    count,
  );

  const response = await generateResponse(prompt, undefined, { temperature: 0.5 });

  // Parse into questions array
  const questions = response
    .split(/\d+\./)
    .map((q) => q.trim())
    .filter((q) => q.length > 20);

  return {
    questions: questions.slice(0, count),
    techStack,
    company: {
      name: company.name ?? "Company",
      category: company.category ?? "",
    },
  };
}
