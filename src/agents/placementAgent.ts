import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import pino from "pino";
import { semanticSearch, searchByCompanyId } from "../services/retrievalService";
import { db } from "../lib/db";
import { buildContextFromResults } from "../utils/prompts";
import { MAX_CONTEXT_LENGTH } from "../types/ai";

const logger = pino({ name: "placement-agent" });

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama3-70b-8192";

const searchCompanyTool = tool(
  async ({ query, limit }) => {
    const results = await semanticSearch(query, limit ?? 5, 0.4);
    return buildContextFromResults(
      results.map((r) => ({
        companyName: r.company.name,
        sectionType: r.sectionType,
        content: r.content,
      })),
      MAX_CONTEXT_LENGTH,
    );
  },
  {
    name: "search_company_info",
    description: "Search company information using semantic search. Use this to answer questions about companies.",
    schema: z.object({
      query: z.string().describe("The search query about the company"),
      limit: z.number().optional().describe("Number of results to return (default 5)"),
    }),
  },
);

const getCompanyDetailsTool = tool(
  async ({ companyId }) => {
    const company = await db.company.findUnique({
      where: { company_id: companyId },
      include: { company_json: true },
    });
    if (!company) return "Company not found";
    const json = company.company_json?.full_json ?? {};
    return JSON.stringify({ name: company.name, category: company.category, ...json as object }, null, 2);
  },
  {
    name: "get_company_details",
    description: "Get full company profile details by company ID.",
    schema: z.object({
      companyId: z.number().describe("The company ID"),
    }),
  },
);

const getStudentSkillsTool = tool(
  async ({ userId }) => {
    const student = await db.user.findUnique({
      where: { userId },
      include: {
        studentSkills: {
          include: { skill: { select: { skill_set_name: true, category: true } } },
        },
      },
    });
    if (!student) return "Student not found";
    return student.studentSkills
      .map((s) => `${s.skill.skill_set_name}: Level ${s.proficiencyLevel} (${s.skill.category ?? "general"})`)
      .join("\n");
  },
  {
    name: "get_student_skills",
    description: "Get the current student's self-assessed skill levels.",
    schema: z.object({
      userId: z.string().describe("The student's user ID"),
    }),
  },
);

const tools = [searchCompanyTool, getCompanyDetailsTool, getStudentSkillsTool];
const toolNode = new ToolNode(tools);

const model = new ChatGroq({
  apiKey: GROQ_API_KEY,
  model: GROQ_MODEL,
  temperature: 0.5,
}).bindTools(tools);

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?._getType() !== "tool") {
    return "end";
  }
  return "continue";
}

async function callModel(state: typeof MessagesAnnotation.State) {
  const { messages } = state;
  const response = await model.invoke(messages);
  return { messages: [response] };
}

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addEdge("__start__", "agent")
  .addNode("tools", toolNode)
  .addEdge("tools", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    continue: "tools",
    end: "__end__",
  });

const app = workflow.compile();

export async function runAgent(query: string, userId?: string, companyId?: number): Promise<string> {
  try {
    const contextParts: string[] = [];
    if (companyId) {
      const companyResults = await searchByCompanyId(companyId, query);
      const context = buildContextFromResults(
        companyResults.map((r) => ({
          companyName: r.company.name,
          sectionType: r.sectionType,
          content: r.content,
        })),
        MAX_CONTEXT_LENGTH,
      );
      if (context) contextParts.push(context);
    }

    const systemMessage = `You are a placement preparation assistant for engineering students. Help students research companies, understand skill requirements, and prepare for interviews.
${contextParts.length ? `\nRelevant company context:\n${contextParts[0]}` : ""}
Use the available tools to search for company information and student skills when needed. Be concise and helpful.`;

    const input = {
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: query },
      ],
    };

    const result = await app.invoke(input);
    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage?.content as string ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Agent execution failed");
    throw new Error(`Agent failed: ${message}`);
  }
}
