import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const count = await p.company_json.count({ where: { full_json: { not: { equals: null } } } });
console.log("Companies with full_json:", count);
const sample = await p.company_json.findFirst({ where: { NOT: { full_json: null } } });
if (sample?.full_json) {
  const d = sample.full_json as Record<string, unknown>;
  const keys = Object.keys(d);
  console.log("Keys:", keys.join(", "));
}
await p.$disconnect();
