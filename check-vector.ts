import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.$queryRawUnsafe("SELECT column_name, udt_name, domain_name, character_maximum_length FROM information_schema.columns WHERE table_name = 'embeddings' AND column_name = 'embedding'")
  .then((r: unknown) => { console.log(JSON.stringify(r, null, 2)); p.$disconnect(); })
  .catch((e: Error) => { console.error(e.message); p.$disconnect(); });
