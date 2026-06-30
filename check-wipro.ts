import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.company.findMany({ where: { name: { contains: "wipro", mode: "insensitive" } }, select: { company_id: true, name: true } })
  .then((r) => { console.log(JSON.stringify(r)); p.$disconnect(); })
  .catch((e) => { console.error(e.message); p.$disconnect(); });
