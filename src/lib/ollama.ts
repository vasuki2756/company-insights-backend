import ollama from "ollama";
import pino from "pino";

const logger = pino({ name: "ollama-embed" });

const config = {
  apiUrl: process.env.OLLAMA_API_URL ?? "http://localhost:11434",
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  timeout: parseInt(process.env.OLLAMA_TIMEOUT ?? "30000", 10),
};

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

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const tags = await ollama.list();
    const embedAvailable = tags.models.some(
      (n) => n.name === config.embedModel || n.name.startsWith(config.embedModel.split(":")[0] ?? config.embedModel),
    );
    if (!embedAvailable) {
      logger.warn({ embedModel: config.embedModel }, "Embed model not found. Run: ollama pull " + config.embedModel);
    }
    return embedAvailable;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Ollama health check failed");
    return false;
  }
}
