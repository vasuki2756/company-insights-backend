import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT COUNT(*)::int as cnt FROM \"embeddings\"");
console.log("total rows:", rows[0]?.cnt);
const w = await p.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT \"companyId\", \"sectionType\" FROM \"embeddings\" WHERE \"companyId\" = 103");
console.log("Wipro sections:", w.length, JSON.stringify(w));
p.$disconnect();
