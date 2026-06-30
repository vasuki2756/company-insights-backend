// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — AI Types
// ─────────────────────────────────────────────────────────────

export interface OllamaConfig {
  apiUrl: string;
  model: string;
  embedModel: string;
  timeout: number;
}

export interface GenerationParams {
  temperature: number;
  topP: number;
  topK: number;
}

export interface RetrievalSource {
  companyId: number;
  companyName: string;
  sectionType: string;
  contentPreview: string;
  relevance: number;
}

export interface RetrievalResult {
  companyId: number;
  sectionType: string;
  content: string;
  similarity: number;
  company: {
    name: string;
    category: string;
  };
}

export interface AIChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface AIChatSession {
  sessionId: string;
  userId: string;
  messages: AIChatMessage[];
  context: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIChatRequest {
  sessionId: string;
  message: string;
  companyId?: number;
}

export interface AIChatResponse {
  response: string;
  sources: RetrievalSource[];
  tokens: {
    input: number;
    output: number;
  };
}

export interface SkillGapItem {
  skillName: string;
  userLevel: number;
  requiredLevel: number;
  gap: number;
  proficiencyNeeded: string;
}

export interface SkillGapResponse {
  analysis: string;
  gaps: SkillGapItem[];
}

export interface InterviewQuestionsResponse {
  questions: string[];
  techStack: string[];
  company: {
    name: string;
    category: string;
  };
}

export interface AIHealthResponse {
  status: "healthy" | "degraded" | "unavailable";
  model: string;
  embedModel: string;
  error?: string;
  warning?: string;
}

export interface EmbeddingProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
}

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
};

export const CHAT_SESSION_TTL = parseInt(
  process.env.CHAT_SESSION_TTL ?? "86400",
  10,
);
export const MAX_CONTEXT_LENGTH = parseInt(
  process.env.MAX_CONTEXT_LENGTH ?? "2000",
  10,
);
