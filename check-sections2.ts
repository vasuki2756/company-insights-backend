import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT COUNT(*)::int as cnt FROM \"embeddings\"");
console.log("total rows:", rows);
const sample = await p.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT \"companyId\", \"sectionType\", LEFT(\"content\", 100) as preview FROM \"embeddings\" LIMIT 5");
console.log("sample:", JSON.stringify(sample, null, 2));
p.$disconnect();
