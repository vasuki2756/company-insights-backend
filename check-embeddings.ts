import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.$queryRawUnsafe("SELECT count(*)::int as count FROM \"embeddings\"")
  .then((r: unknown) => { console.log(JSON.stringify(r)); p.$disconnect(); })
  .catch((e: Error) => { console.error(e.message); p.$disconnect(); });
