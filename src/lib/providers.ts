import pino from "pino";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const logger = pino({ name: "providers" });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-sonnet";
const OPENROUTER_MODEL_2 = process.env.OPENROUTER_MODEL_2 ?? "nvidia/nemotron-nano-9b-v2:free";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE ?? "0.2");

export const RESEARCH_PROVIDERS = (process.env.RESEARCH_PROVIDERS ?? "openrouter,groq,gemini")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

function openrouterLlm(): BaseChatModel {
  const { ChatOpenAI } = require("@langchain/openai");
  return new ChatOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL,
    temperature: LLM_TEMPERATURE,
  });
}

function openrouterAltLlm(): BaseChatModel {
  const { ChatOpenAI } = require("@langchain/openai");
  return new ChatOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL_2,
    temperature: LLM_TEMPERATURE,
  });
}

function groqLlm(): BaseChatModel {
  const { ChatGroq } = require("@langchain/groq");
  return new ChatGroq({
    apiKey: GROQ_API_KEY,
    model: GROQ_MODEL,
    temperature: LLM_TEMPERATURE,
  });
}

function geminiLlm(): BaseChatModel {
  const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
  return new ChatGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY,
    model: GEMINI_MODEL,
    temperature: LLM_TEMPERATURE,
  });
}

export const PROVIDERS: Record<string, () => BaseChatModel> = {
  openrouter: openrouterLlm,
  "openrouter-alt": openrouterAltLlm,
  groq: groqLlm,
  gemini: geminiLlm,
};

export function invoke(provider: string, prompt: string): Promise<string> {
  const factory = PROVIDERS[provider];
  if (!factory) {
    throw new Error(`Unknown provider: ${provider}. Available: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  const llm = factory();
  return llm.invoke(prompt).then((result) => {
    const content = result.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((c) => c.text ?? "").join("");
    return JSON.stringify(content);
  });
}

export async function invokeWithFallback(provider: string, prompt: string, fallbackProvider?: string): Promise<string> {
  try {
    return await invoke(provider, prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ provider, error: message }, "Provider failed");
    if (fallbackProvider) {
      logger.info({ fallbackProvider }, "Attempting fallback provider");
      return invoke(fallbackProvider, prompt);
    }
    throw error;
  }
}
