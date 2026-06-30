import { randomUUID } from "node:crypto";
import pino from "pino";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import { generateResponse as groqGenerate } from "../lib/llm";
import { runAgent } from "../agents/placementAgent";
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

const sessionKey = (userId: string, sessionId: string) =>
  `ai:session:${userId}:${sessionId}`;

const userSessionsKey = (userId: string) =>
  `ai:user:${userId}:sessions`;

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
    await redis.sAdd(userSessionsKey(userId), sessionId);
    await redis.expire(userSessionsKey(userId), CHAT_SESSION_TTL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, "Failed to create chat session in Redis");
  }

  logger.info({ userId, sessionId }, "Chat session created");
  return sessionId;
}

export async function getChatSession(
  userId: string,
  sessionId: string,
): Promise<AIChatSession | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(sessionKey(userId, sessionId));
    if (!raw) return null;

    const session = JSON.parse(raw) as AIChatSession;
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

    if (session.messages.length > 50) {
      session.messages = session.messages.slice(session.messages.length - 50);
    }

    session.updatedAt = new Date();

    await redis.set(sessionKey(userId, sessionId), JSON.stringify(session), {
      EX: CHAT_SESSION_TTL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, sessionId, error: message }, "Failed to save chat message");
  }
}

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

export async function generateAssistantResponse(
  userId: string,
  sessionId: string,
  userMessage: string,
  companyId?: number,
): Promise<{ response: string; sources: RetrievalSource[] }> {
  let session = await getChatSession(userId, sessionId);
  if (!session) {
    await createChatSession(userId);
    session = await getChatSession(userId, sessionId);
    if (!session) {
      throw new Error("Failed to create chat session");
    }
  }

  const userMsg: AIChatMessage = {
    role: "user",
    content: userMessage,
    timestamp: new Date(),
  };
  await saveChatMessage(userId, sessionId, userMsg);

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

  const historyMessages = session.messages.slice(-6);
  const history = historyMessages
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
    .join("\n");

  const systemPrompt = buildSystemPrompt();
  const ragPrompt = buildRagPrompt(userMessage, context, history);
  const fullPrompt = `${systemPrompt}\n\n${ragPrompt}`;

  const responseText = await groqGenerate(fullPrompt);

  const assistantMsg: AIChatMessage = {
    role: "assistant",
    content: responseText,
    timestamp: new Date(),
  };
  await saveChatMessage(userId, sessionId, assistantMsg);

  const sources: RetrievalSource[] = results.slice(0, 5).map((r) => ({
    companyId: r.companyId,
    companyName: r.company.name,
    sectionType: r.sectionType,
    contentPreview: r.content.slice(0, 150),
    relevance: r.similarity,
  }));

  return { response: responseText, sources };
}

export async function generateAgentResponse(
  userId: string,
  query: string,
  companyId?: number,
): Promise<string> {
  return runAgent(query, userId, companyId);
}

export async function answerCompanyQuestion(
  companyId: number,
  question: string,
): Promise<{ answer: string; sources: string[] }> {
  const company = await db.company.findUnique({
    where: { company_id: companyId },
    select: { name: true, category: true },
  });

  if (!company) {
    throw new Error(`Company with ID ${companyId} not found`);
  }

  const results = await searchByCompanyId(companyId, question);

  const profileText = results
    .map((r) => `[${r.sectionType}]\n${r.content}`)
    .join("\n\n");

  const prompt = buildCompanyQuestionPrompt(company.name ?? "Company", question, profileText);

  const answer = await groqGenerate(prompt);

  const sources = results.map((r) => `${r.sectionType} (${r.company.name})`);

  return { answer, sources };
}

export async function skillGapAnalysis(
  userId: string,
  companyId: number,
): Promise<SkillGapResponse> {
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

  const studentSkillsText = student.studentSkills
    .map((s) => `${s.skill.skill_set_name}: Level ${s.proficiencyLevel}`)
    .join("\n");

  const companyRequirementsText = requirements
    .map((r) => `${r.skill_set_master.skill_set_name}: Required Level ${r.required_level} (${r.skill_set_master.category ?? "general"})`)
    .join("\n");

  const prompt = buildSkillGapPrompt(studentSkillsText, companyRequirementsText, company.name ?? "Company");
  const analysis = await groqGenerate(prompt);

  return { analysis, gaps: gaps.sort((a, b) => b.gap - a.gap) };
}

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
  const techStack = (fullJson?.techStack ?? []) as string[];
  const companyDescription = (fullJson?.overviewText ?? `${company.name} is a ${company.category ?? ""} company.`) as string;

  const prompt = buildInterviewPrepPrompt(
    company.name ?? "Company",
    techStack,
    companyDescription,
    count,
  );

  const response = await groqGenerate(prompt);

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
