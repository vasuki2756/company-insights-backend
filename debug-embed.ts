import { PrismaClient } from "@prisma/client";
import { generateEmbedding } from "../src/lib/ollama";
const p = new PrismaClient();
try {
  const company = await p.company.findUnique({ where: { company_id: 103 }, include: { company_json: true } });
  console.log("Company:", company?.name);
  
  const fullJson = (company?.company_json?.full_json ?? {}) as Record<string, unknown>;
  const combined = `[overview]\n${fullJson.overview_text}\n\n[financials]\nValuation: ${fullJson.valuation}`;
  console.log("Content:", combined.slice(0, 200));
  
  const emb = await generateEmbedding(combined);
  console.log("Embedding length:", emb.length);
  
  const vectorStr = `[${emb.join(",")}]`;
  console.log("Vector str length:", vectorStr.length);
  
  await p.$executeRawUnsafe(
    `INSERT INTO "embeddings" ("companyId", "embedding", "sectionType", "content", "createdAt", "updatedAt")
     VALUES ($1, $2::vector, $3, $4, NOW(), NOW())
     ON CONFLICT ("companyId")
     DO UPDATE SET "embedding" = $2::vector, "sectionType" = $3, "content" = $4, "updatedAt" = NOW()`,
    103, vectorStr, "overview,financials", combined,
  );
  console.log("INSERT succeeded");
  
  const count = await p.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT COUNT(*)::int as cnt FROM \"embeddings\"");
  console.log("Total rows:", count[0]?.cnt);
} catch (e) {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
}
p.$disconnect();
