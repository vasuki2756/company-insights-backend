import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.$executeRawUnsafe("DELETE FROM \"embeddings\"").then(() => { console.log("Cleared"); p.$disconnect(); }).catch((e: Error) => { console.error(e.message); p.$disconnect(); });
