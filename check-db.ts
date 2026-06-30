import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  await p.$connect();
  const r = await p.$queryRawUnsafe("SELECT 1 as ok");
  console.log("OK:", JSON.stringify(r));
  await p.$disconnect();
} catch (e) {
  console.error("FAIL:", e instanceof Error ? e.message : String(e));
}
