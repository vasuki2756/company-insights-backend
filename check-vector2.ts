import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.$queryRawUnsafe("SELECT cls.relname, a.attname, format_type(a.atttypid, a.atttypmod) as type FROM pg_class cls JOIN pg_attribute a ON a.attrelid = cls.oid WHERE cls.relname = 'embeddings' AND a.attname = 'embedding'")
  .then((r: unknown) => { console.log(JSON.stringify(r, null, 2)); p.$disconnect(); })
  .catch((e: Error) => { console.error(e.message); p.$disconnect(); });
