import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const j = await p.company_json.findUnique({ where: { company_id: 103 }, select: { full_json: true } });
if (j?.full_json) {
  const data = j.full_json as Record<string, unknown>;
  console.log("WIPRO full_json keys:", Object.keys(data));
  console.log("overviewText:", (data.overviewText as string)?.slice(0, 200));
  console.log("techStack:", JSON.stringify(data.techStack));
  console.log("ceoName:", data.ceoName);
  console.log("valuation:", data.valuation);
  console.log("annualRevenue:", data.annualRevenue);
  console.log("glassdoorPros:", (data.glassdoorPros as string)?.slice(0, 200));
  console.log("glassdoorCons:", (data.glassdoorCons as string)?.slice(0, 200));
}
const sample = await p.company_json.findFirst({ where: { full_json: { not: null } }, select: { company_id: true, full_json: true } });
if (sample?.full_json) {
  const d = sample.full_json as Record<string, unknown>;
  console.log("\nSAMPLE company", sample.company_id, "keys:", Object.keys(d));
}
p.$disconnect();
