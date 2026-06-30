import { Router, type Request, type Response } from "express";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import { checkOllamaHealth } from "../lib/ollama";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get("/detailed", async (_req: Request, res: Response): Promise<void> => {
  const checks = {
    database: false,
    redis: false,
    ollama: false,
  };

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch { /* failed */ }

  try {
    const redis = await getRedisClient();
    await redis.ping();
    checks.redis = true;
  } catch { /* failed */ }

  checks.ollama = await checkOllamaHealth();

  const allHealthy = checks.database && checks.redis && checks.ollama;

  res.status(allHealthy ? 200 : 503).json({
    ...checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
