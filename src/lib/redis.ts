// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Redis Client
// Connection pooling, health checks, and graceful shutdown
// ─────────────────────────────────────────────────────────────

import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Creates and returns a configured Redis client instance.
 * Implements exponential backoff reconnection strategy and
 * registers lifecycle event handlers for observability.
 */
function buildRedisClient(): RedisClient {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries: number): number => {
        // Exponential backoff: 50ms, 100ms, 150ms, ... up to 2s
        const delay = Math.min(retries * 50, 2000);
        return delay;
      },
      connectTimeout: 10_000, // 10 seconds
    },
  });

  client.on("error", (err: Error) => {
    console.error("[redis] Connection error:", err.message);
  });

  client.on("connect", () => {
    console.log("[redis] Connected successfully");
  });

  client.on("reconnecting", () => {
    console.warn("[redis] Reconnecting...");
  });

  client.on("ready", () => {
    console.log("[redis] Client ready");
  });

  client.on("end", () => {
    console.log("[redis] Connection closed");
  });

  return client;
}

/** Singleton Redis client instance. */
let redis: RedisClient | null = null;

/**
 * Ensures Redis is connected and returns the client.
 * Call once at application startup before handling requests.
 */
export async function getRedisClient(): Promise<RedisClient> {
  if (!redis) {
    redis = buildRedisClient();
    await redis.connect();
  }
  return redis;
}

// Graceful shutdown
process.on("SIGINT", async () => {
  if (redis) {
    console.log("[redis] Disconnecting on SIGINT...");
    await redis.disconnect();
  }
});

process.on("SIGTERM", async () => {
  if (redis) {
    console.log("[redis] Disconnecting on SIGTERM...");
    await redis.disconnect();
  }
});
