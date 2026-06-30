import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.company.count().then((c: number) => { console.log("Companies:", c); p.$disconnect(); }).catch((e: Error) => { console.error(e.message); p.$disconnect(); });
