// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Embedding Seed
// Generates embeddings for all companies with profiles
// Usage: npx ts-node prisma/seed-embeddings.ts
// ─────────────────────────────────────────────────────────────

import { rebuildEmbeddings } from "../src/services/embeddingService";

async function main() {
  console.log("🧠 Starting embedding generation...\n");

  const progress = await rebuildEmbeddings();

  console.log("\n📊 Embedding Summary:");
  console.log(`  Total companies: ${progress.total}`);
  console.log(`  Completed: ${progress.completed}`);
  console.log(`  Failed: ${progress.failed}`);

  if (progress.failed > 0) {
    console.log("\n⚠️  Some embeddings failed. Check the logs above for details.");
    process.exit(1);
  }

  console.log("\n✅ Embedding seeding completed successfully!");
}

main().catch((e) => {
  console.error("❌ Embedding seeding failed:", e);
  process.exit(1);
});
