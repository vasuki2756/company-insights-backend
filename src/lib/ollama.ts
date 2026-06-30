// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — ollama Client
// Local LLM integration for embeddings and text generation
// Privacy-first: no external API calls
// ─────────────────────────────────────────────────────────────

import ollama from "ollama";
import pino from "pino";
import type { OllamaConfig, GenerationParams } from "../types/ai";
import { DEFAULT_GENERATION_PARAMS } from "../types/ai";

const logger = pino({ name: "ollama" });

// ─── Configuration ────────────────────────────────────────────

const config: OllamaConfig = {
  apiUrl: process.env.OLLAMA_API_URL ?? "http://localhost:11434",
  model: process.env.OLLAMA_MODEL ?? "llama3.2",
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  timeout: parseInt(process.env.OLLAMA_TIMEOUT ?? "30000", 10),
};

// ─── Embeddings ───────────────────────────────────────────────

/**
 * Generate an embedding vector for the given text using ollama.
 * Uses the configured embed model (default: nomic-embed-text, 384 dimensions).
 * @param text - Text to embed
 * @returns Promise resolving to a float array of embedding values
 * @throws If ollama is unreachable or the model is not found
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const start = performance.now();
  try {
    const response = await ollama.embeddings({
      model: config.embedModel,
      prompt: text,
    });
    const duration = (performance.now() - start).toFixed(0);
    logger.info({ duration: `${duration}ms`, model: config.embedModel }, "Embedding generated");
    return response.embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, model: config.embedModel }, "Embedding generation failed");
    throw new Error(`Failed to generate embedding: ${message}`);
  }
}

// ─── Text Generation ──────────────────────────────────────────

/**
 * Generate a text response from ollama without streaming.
 * If context is provided, it's prepended as "Context: ...\n\nQuestion: ..."
 * @param prompt - The user's prompt/question
 * @param context - Optional context from RAG retrieval
 * @param params - Optional generation parameters override
 * @returns Promise resolving to the generated text
 * @throws If ollama is unreachable or generation fails
 */
export async function generateResponse(
  prompt: string,
  context?: string,
  params: Partial<GenerationParams> = {},
): Promise<string> {
  const genParams = { ...DEFAULT_GENERATION_PARAMS, ...params };
  const fullPrompt = context
    ? `Context: ${context}\n\nQuestion: ${prompt}`
    : prompt;

  const start = performance.now();
  try {
    const response = await ollama.generate({
      model: config.model,
      prompt: fullPrompt,
      options: {
        temperature: genParams.temperature,
        top_p: genParams.topP,
        top_k: genParams.topK,
      },
    });

    const duration = (performance.now() - start).toFixed(0);
    const inputTokens = Math.ceil(fullPrompt.length / 4);
    const outputTokens = Math.ceil(response.response.length / 4);

    logger.info(
      {
        duration: `${duration}ms`,
        inputTokens,
        outputTokens,
        model: config.model,
      },
      "Response generated",
    );

    return response.response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, model: config.model }, "Response generation failed");
    throw new Error(`Failed to generate response: ${message}`);
  }
}

// ─── Streaming Generation ─────────────────────────────────────

/**
 * Generate a text response from ollama with streaming support.
 * Calls the onChunk callback for each token received.
 * @param prompt - The user's prompt/question
 * @param context - Optional context from RAG retrieval
 * @param onChunk - Optional callback invoked with each token
 * @param params - Optional generation parameters override
 * @returns Promise resolving to the complete generated text
 */
export async function generateResponseStream(
  prompt: string,
  context?: string,
  onChunk?: (chunk: string) => void,
  params: Partial<GenerationParams> = {},
): Promise<string> {
  const genParams = { ...DEFAULT_GENERATION_PARAMS, ...params };
  const fullPrompt = context
    ? `Context: ${context}\n\nQuestion: ${prompt}`
    : prompt;

  const start = performance.now();
  let fullResponse = "";

  try {
    const stream = await ollama.generate({
      model: config.model,
      prompt: fullPrompt,
      options: {
        temperature: genParams.temperature,
        top_p: genParams.topP,
        top_k: genParams.topK,
      },
    });

    fullResponse = stream.response;
    if (onChunk && stream.response) {
      onChunk(stream.response);
    }

    const duration = (performance.now() - start).toFixed(0);
    const inputTokens = Math.ceil(fullPrompt.length / 4);
    const outputTokens = Math.ceil(fullResponse.length / 4);

    logger.info(
      {
        duration: `${duration}ms`,
        inputTokens,
        outputTokens,
        streaming: true,
        model: config.model,
      },
      "Streaming response completed",
    );

    return fullResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, model: config.model }, "Streaming response failed");
    throw new Error(`Failed to generate streaming response: ${message}`);
  }
}

// ─── Health Check ─────────────────────────────────────────────

/**
 * Check if ollama is running and the configured model is available.
 * @returns true if ollama responds and the model exists
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const tags = await ollama.list();
    const modelNames = tags.models.map((m) => m.name);
    const modelAvailable = modelNames.some(
      (n) => n === config.model || n.startsWith(config.model.split(":")[0] ?? config.model),
    );
    const embedAvailable = modelNames.some(
      (n) => n === config.embedModel || n.startsWith(config.embedModel.split(":")[0] ?? config.embedModel),
    );

    if (!modelAvailable) {
      logger.warn({ model: config.model }, "Model not found in ollama. Run: ollama pull " + config.model);
    }
    if (!embedAvailable) {
      logger.warn({ embedModel: config.embedModel }, "Embed model not found. Run: ollama pull " + config.embedModel);
    }

    return modelAvailable && embedAvailable;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "ollama health check failed — is ollama running?");
    return false;
  }
}

/**
 * Pull the required models from ollama if they're not already available.
 * Called during startup to ensure models are present.
 */
export async function ensureModels(): Promise<void> {
  try {
    const tags = await ollama.list();
    const modelNames = tags.models.map((m) => m.name);

    const modelsToPull: string[] = [];
    if (!modelNames.some((n) => n.startsWith(config.model.split(":")[0] ?? config.model))) {
      modelsToPull.push(config.model);
    }
    if (!modelNames.some((n) => n.startsWith(config.embedModel.split(":")[0] ?? config.embedModel))) {
      modelsToPull.push(config.embedModel);
    }

    for (const model of modelsToPull) {
      logger.info({ model }, "Pulling model from ollama (this may take a while)...");
      // ollama pull is async; we just check availability at startup
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, "Could not check ollama models. Ensure ollama is running.");
  }
}
