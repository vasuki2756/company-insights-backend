import { PrismaClient } from "@prisma/client";
import { generateEmbedding } from "./src/lib/ollama.js";

const p = new PrismaClient();

// test wipro
const company = await p.company.findUnique({
  where: { company_id: 103 },
  include: { company_json: true },
});

const fullJson = (company?.company_json?.full_json ?? {}) as Record<string, unknown>;
const content = `[overview]\n${fullJson.overview_text || ""}\n\n[financials]\nValuation: ${fullJson.valuation || ""}`;
console.log("Content:", content.substring(0, 300));

const emb = await generateEmbedding(content.substring(0, 2000));
console.log("Embedding dims:", emb.length);

const vectorStr = `[${emb.join(",")}]`;

await p.$executeRawUnsafe(
  `INSERT INTO "embeddings" ("companyId", "embedding", "sectionType", "content", "createdAt", "updatedAt")
   VALUES ($1, $2::vector, $3, $4, NOW(), NOW())`,
  103, vectorStr, "test", content
);
console.log("INSERT OK");

const cnt = await p.$queryRawUnsafe<Array<{cnt: number}>>("SELECT COUNT(*)::int as cnt FROM \"embeddings\"");
console.log("Total rows:", cnt[0].cnt);

p.$disconnect();
