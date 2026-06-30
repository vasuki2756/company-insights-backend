import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.$queryRawUnsafe<Array<{ companyId: number; sectionType: string }>>(
  `SELECT "companyId", "sectionType" FROM "embeddings" WHERE "companyId" IN (1, 76, 103) ORDER BY "companyId"`
);
console.log(JSON.stringify(rows, null, 2));
p.$disconnect();
