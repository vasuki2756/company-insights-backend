import { ChatGroq } from "@langchain/groq";
import pino from "pino";

const logger = pino({ name: "llm" });

const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama3-70b-8192";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";

let groqModel: ChatGroq | null = null;

function getGroqModel(): ChatGroq {
  if (!groqModel) {
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY environment variable is not set");
    }
    groqModel = new ChatGroq({
      apiKey: GROQ_API_KEY,
      model: GROQ_MODEL,
      temperature: 0.5,
      maxRetries: 2,
    });
  }
  return groqModel;
}

export async function generateResponse(prompt: string): Promise<string> {
  const start = performance.now();
  try {
    const model = getGroqModel();
    const response = await model.invoke([
      { role: "system", content: "You are a helpful placement assistant." },
      { role: "user", content: prompt },
    ]);
    const duration = (performance.now() - start).toFixed(0);
    const content = response.content as string;
    logger.info({ duration: `${duration}ms`, model: GROQ_MODEL }, "Groq response generated");
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, model: GROQ_MODEL }, "Groq generation failed");
    throw new Error(`Failed to generate response: ${message}`);
  }
}

export async function generateStreamingResponse(
  prompt: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const start = performance.now();
  try {
    const model = getGroqModel();
    const stream = await model.stream([
      { role: "system", content: "You are a helpful placement assistant." },
      { role: "user", content: prompt },
    ]);

    let fullResponse = "";
    for await (const chunk of stream) {
      const text = chunk.content as string;
      fullResponse += text;
      if (onChunk) onChunk(text);
    }

    const duration = (performance.now() - start).toFixed(0);
    logger.info({ duration: `${duration}ms`, model: GROQ_MODEL }, "Groq streaming completed");
    return fullResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, model: GROQ_MODEL }, "Groq streaming failed");
    throw new Error(`Failed to generate streaming response: ${message}`);
  }
}
