import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'companies' ORDER BY ordinal_position")
  .then((r: unknown) => { console.log(JSON.stringify(r, null, 2)); p.$disconnect(); })
  .catch((e: Error) => { console.error(e.message); p.$disconnect(); });
