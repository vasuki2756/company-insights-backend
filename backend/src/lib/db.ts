// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Prisma Database Client
// Singleton pattern to prevent multiple instances in development
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  db: PrismaClient | undefined;
};

/**
 * Returns a singleton PrismaClient instance.
 * In development, the client is cached on `globalThis` to survive
 * hot-reloads without exhausting database connections.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
  });
}

/** Application-wide Prisma database client instance. */
export const db =
  globalForPrisma.db ??
  (globalForPrisma.db = createPrismaClient());

// Graceful shutdown handlers
async function handleShutdown(signal: string) {
  console.log(`[db] Received ${signal}, disconnecting Prisma...`);
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
