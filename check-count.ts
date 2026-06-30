import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.embedding.count().then(c => { console.log("Embeddings count:", c); p.$disconnect(); }).catch((e: Error) => { console.error(e.message); p.$disconnect(); });
