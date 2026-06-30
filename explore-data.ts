import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const companies = await p.company.findMany({ take: 5, orderBy: { company_id: "asc" }, select: { company_id: true, name: true, overview_text: true, category: true } });
for (const c of companies) {
  console.log(`\n=== ${c.name} (ID: ${c.company_id}) ===`);
  console.log("Category:", c.category);
  console.log("Overview:", c.overview_text?.slice(0, 300));
}
const wipro = await p.company.findUnique({ where: { company_id: 103 }, select: { name: true, overview_text: true, category: true, min_cgpa: true, package: true, selection_rate: true, headquarters: true, employee_count: true } });
console.log("\n=== WIPRO ===");
console.log(JSON.stringify(wipro, null, 2));
const j = await p.company_json.findUnique({ where: { company_id: 103 }, select: { full_json: true } });
console.log("\nWIPRO full_json keys:", j?.full_json ? Object.keys(j.full_json as Record<string, unknown>).slice(0, 20) : "none");
p.$disconnect();
