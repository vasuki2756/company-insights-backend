// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Retrieval Service
// pgvector semantic search with Redis caching
// ─────────────────────────────────────────────────────────────

import pino from "pino";
import { db } from "../lib/db";
import { getRedisClient } from "../lib/redis";
import { generateEmbedding } from "../lib/ollama";
import type { RetrievalResult } from "../types/ai";

const logger = pino({ name: "retrieval" });

const CACHE_TTL = 5 * 60; // 5 minutes in seconds
const SEARCH_TIMEOUT = 10000; // 10 seconds

// ─── Caching Helpers ──────────────────────────────────────────

function cacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `search:${prefix}:${parts.join(":")}`;
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

async function setCache<T>(key: string, value: T): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(key, JSON.stringify(value), { EX: CACHE_TTL });
  } catch {
    // Cache failures are non-critical
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Perform a semantic search across all company embeddings.
 * Generates an embedding for the query and finds the most similar
 * sections using pgvector cosine similarity.
 *
 * @param query - Natural language search query
 * @param limit - Maximum results to return (default: 5)
 * @param threshold - Minimum similarity threshold 0-1 (default: 0.5)
 * @returns Sorted array of retrieval results with company metadata
 */
export async function semanticSearch(
  query: string,
  limit: number = 5,
  threshold: number = 0.5,
): Promise<RetrievalResult[]> {
  const cache = cacheKey("semantic", query, limit.toString());
  const cached = await getCached<RetrievalResult[]>(cache);
  if (cached) {
    logger.debug({ query, resultCount: cached.length }, "Cache hit for semantic search");
    return cached;
  }

  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

    try {
      // Search using pgvector cosine similarity (<=> operator)
      // similarity = 1 - distance
      const results = await db.$queryRawUnsafe<Array<{
        company_id: number;
        section_type: string;
        content: string;
        distance: number;
        company_name: string;
        company_category: string;
      }>>(
        `SELECT
          ce.company_id,
          ce.section_type,
          ce.content,
          ce.embedding <=> $1::vector AS distance,
          c.name AS company_name,
          c.category AS company_category
        FROM company_embeddings ce
        JOIN companies c ON c.id = ce.company_id
        WHERE ce.embedding IS NOT NULL
          AND ce.embedding <=> $1::vector < $2
        ORDER BY ce.embedding <=> $1::vector
        LIMIT $3`,
        vectorStr,
        1 - threshold,
        limit,
      );

      clearTimeout(timeoutId);

      const formatted: RetrievalResult[] = results.map((r) => ({
        companyId: r.company_id,
        sectionType: r.section_type,
        content: r.content,
        similarity: Math.round((1 - Number(r.distance)) * 1000) / 1000,
        company: {
          name: r.company_name,
          category: r.company_category ?? "",
        },
      }));

      // Cache results
      await setCache(cache, formatted);

      logger.info(
        { query, resultCount: formatted.length },
        "Semantic search completed",
      );

      return formatted;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ query, error: message }, "Semantic search failed");

    // Fallback: return empty results rather than crashing
    return [];
  }
}

/**
 * Get all embeddings for a specific company.
 * Optionally filter by semantic similarity to a query.
 *
 * @param companyId - The company ID to search within
 * @param query - Optional query to filter by relevance
 * @returns Array of retrieval results for the company
 */
export async function searchByCompanyId(
  companyId: number,
  query?: string,
): Promise<RetrievalResult[]> {
  const cacheKeyStr = cacheKey("company", companyId, query ?? "all");
  const cached = await getCached<RetrievalResult[]>(cacheKeyStr);
  if (cached) return cached;

  try {
    let results: RetrievalResult[];

    if (query) {
      // Search with semantic relevance within this company
      const queryEmbedding = await generateEmbedding(query);
      const vectorStr = `[${queryEmbedding.join(",")}]`;

      const raw = await db.$queryRawUnsafe<Array<{
        company_id: number;
        section_type: string;
        content: string;
        distance: number;
        company_name: string;
        company_category: string;
      }>>(
        `SELECT
          ce.company_id,
          ce.section_type,
          ce.content,
          ce.embedding <=> $1::vector AS distance,
          c.name AS company_name,
          c.category AS company_category
        FROM company_embeddings ce
        JOIN companies c ON c.id = ce.company_id
        WHERE ce.company_id = $2
          AND ce.embedding IS NOT NULL
        ORDER BY ce.embedding <=> $1::vector`,
        vectorStr,
        companyId,
      );

      results = raw.map((r) => ({
        companyId: r.company_id,
        sectionType: r.section_type,
        content: r.content,
        similarity: Math.round((1 - Number(r.distance)) * 1000) / 1000,
        company: {
          name: r.company_name,
          category: r.company_category ?? "",
        },
      }));
    } else {
      // Fetch all sections for the company
      const raw = await db.$queryRawUnsafe<Array<{
        company_id: number;
        section_type: string;
        content: string;
        company_name: string;
        company_category: string;
      }>>(
        `SELECT
          ce.company_id,
          ce.section_type,
          ce.content,
          c.name AS company_name,
          c.category AS company_category
        FROM company_embeddings ce
        JOIN companies c ON c.id = ce.company_id
        WHERE ce.company_id = $1
          AND ce.embedding IS NOT NULL
        ORDER BY ce.section_type`,
        companyId,
      );

      results = raw.map((r) => ({
        companyId: r.company_id,
        sectionType: r.section_type,
        content: r.content,
        similarity: 1,
        company: {
          name: r.company_name,
          category: r.company_category ?? "",
        },
      }));
    }

    await setCache(cacheKeyStr, results);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ companyId, query, error: message }, "Company search failed");
    return [];
  }
}

/**
 * Build a combined context string from retrieved results for LLM prompting.
 * Formats results as structured text with company and section headers.
 *
 * @param query - The user's question (for semantic retrieval)
 * @param companyId - Optional company ID to scope the search
 * @param limit - Maximum sections to include
 * @returns Formatted context string for LLM
 */
export async function getContextForQuery(
  query: string,
  companyId?: number,
  limit: number = 8,
): Promise<string> {
  let results: RetrievalResult[];

  if (companyId) {
    results = await searchByCompanyId(companyId, query);
  } else {
    results = await semanticSearch(query, limit, 0.4);
  }

  if (results.length === 0) {
    return "";
  }

  const contextParts = results.map(
    (r) => `Company: ${r.company.name}
Section: ${r.sectionType}
${r.content}`,
  );

  return contextParts.join("\n\n---\n\n");
}

/**
 * Search for companies by name, category, or tech stack combined with
 * semantic search on embeddings. Deduplicates by company ID.
 *
 * @param query - Search query
 * @param limit - Maximum results
 * @returns Sorted array of company matches with relevance scores
 */
export async function searchCompanies(
  query: string,
  limit: number = 10,
): Promise<Array<{ companyId: number; companyName: string; relevance: number }>> {
  const cacheKeyStr = cacheKey("companies", query, limit.toString());
  const cached = await getCached<Array<{ companyId: number; companyName: string; relevance: number }>>(cacheKeyStr);
  if (cached) return cached;

  try {
    // 1. Full-text search on company name and category
    const textResults = await db.$queryRawUnsafe<Array<{
      id: number;
      name: string;
      relevance: number;
    }>>(
      `SELECT
        id,
        name,
        CASE
          WHEN LOWER(name) = LOWER($1) THEN 10.0
          WHEN LOWER(name) LIKE LOWER($1) || '%' THEN 8.0
          WHEN LOWER(name) LIKE '%' || LOWER($1) || '%' THEN 5.0
          WHEN LOWER(category) LIKE '%' || LOWER($1) || '%' THEN 3.0
          ELSE 0.0
        END AS relevance
      FROM companies
      WHERE
        LOWER(name) LIKE '%' || LOWER($1) || '%'
        OR LOWER(category) LIKE '%' || LOWER($1) || '%'
        OR LOWER(short_name) LIKE '%' || LOWER($1) || '%'
      ORDER BY relevance DESC
      LIMIT $2`,
      query,
      limit,
    );

    // 2. Semantic search on embeddings
    const semanticResults = await semanticSearch(query, limit, 0.3);

    // 3. Merge and deduplicate
    const companyMap = new Map<number, { name: string; relevance: number }>();

    for (const r of textResults) {
      companyMap.set(r.id, { name: r.name, relevance: r.relevance });
    }

    for (const r of semanticResults) {
      const existing = companyMap.get(r.companyId);
      const semanticScore = r.similarity * 5; // Normalize to comparable scale
      if (existing) {
        existing.relevance = Math.max(existing.relevance, semanticScore);
      } else {
        companyMap.set(r.companyId, { name: r.company.name, relevance: semanticScore });
      }
    }

    const merged = Array.from(companyMap.entries())
      .map(([companyId, { name, relevance }]) => ({ companyId, companyName: name, relevance }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    await setCache(cacheKeyStr, merged);
    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ query, error: message }, "Company search failed");
    return [];
  }
}
