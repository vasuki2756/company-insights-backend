import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.$connect();
console.log("DB connected");
const r = await p.$queryRawUnsafe("SELECT 1 as ok");
console.log(JSON.stringify(r));
await p.$disconnect();
