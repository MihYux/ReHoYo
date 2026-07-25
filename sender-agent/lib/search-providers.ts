import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureDb, searchResultCache } from "@/lib/db";
import { searchWeb } from "@/lib/glm";
import type { ResearchDimension } from "@/lib/region-profiles";

export type SearchProviderName = "glm";
export type SearchRequest = { query: string; regionCode: string; regionName: string; language: string; dimension: ResearchDimension; endDate?: string; maxResults?: number; round: number };
export type SearchHit = { provider: SearchProviderName; title: string; url: string; snippet: string; claimedPublishedAt: string; rank: number; score: number; requestId: string; query: string };
export type ProviderSearchResult = { provider: SearchProviderName; requestId: string; query: string; hits: SearchHit[]; latencyMs: number; rateLimited: boolean; credits?: number; error?: string; disabled?: boolean; source: "live" | "cache"; cachedAt?: string };
export type SearchProviderConfiguration = { glm: { configured: boolean; model: string } };

const GLM_MODEL = process.env.GLM_MODEL || "glm-5.2";
const MAX_CONCURRENT_PROVIDER_REQUESTS = 4;
const providerFailures = new Map<SearchProviderName, { count: number; openUntil: number }>();
let activeRequests = 0;
const waiters: Array<() => void> = [];

function cacheKey(provider: SearchProviderName, request: SearchRequest) {
  return createHash("sha256").update(JSON.stringify({
    provider,
    query: request.query.trim().replace(/\s+/g, " "),
    regionCode: request.regionCode,
    dimension: request.dimension,
    endDate: request.endDate || "",
    maxResults: request.maxResults || 8,
    round: request.round,
    queryPlanVersion: providerQueryPlanVersion(),
  })).digest("hex");
}

async function readCachedResult(provider: SearchProviderName, request: SearchRequest) {
  if (process.env.SEARCH_CACHE_ENABLED === "false") return null;
  await ensureDb();
  const key = cacheKey(provider, request);
  const [row] = await db.select().from(searchResultCache).where(eq(searchResultCache.cacheKey, key)).limit(1);
  if (!row) return null;
  const parsed = JSON.parse(row.payload) as Omit<ProviderSearchResult, "source" | "cachedAt" | "latencyMs">;
  await db.update(searchResultCache).set({ hitCount: row.hitCount + 1, lastUsedAt: new Date().toISOString() }).where(eq(searchResultCache.cacheKey, key));
  return { ...parsed, latencyMs: 0, source: "cache" as const, cachedAt: row.createdAt };
}

async function writeCachedResult(provider: SearchProviderName, request: SearchRequest, result: ProviderSearchResult) {
  if (process.env.SEARCH_CACHE_ENABLED === "false" || result.error || !result.hits.length) return;
  await ensureDb();
  const key = cacheKey(provider, request);
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({ ...result, source: undefined, cachedAt: undefined, latencyMs: undefined });
  await db.insert(searchResultCache).values({
    cacheKey: key,
    provider,
    query: request.query,
    regionCode: request.regionCode,
    dimension: request.dimension,
    cutoffAt: request.endDate || "",
    queryPlanVersion: providerQueryPlanVersion(),
    payload,
    hitCount: 0,
    createdAt: timestamp,
    lastUsedAt: timestamp,
  }).onConflictDoUpdate({ target: searchResultCache.cacheKey, set: { payload, lastUsedAt: timestamp } });
}

export function searchProviderConfiguration(): SearchProviderConfiguration {
  return { glm: { configured: Boolean(process.env.ZHIPU_API_KEY), model: GLM_MODEL } };
}

async function withProviderSlot<T>(task: () => Promise<T>) {
  if (activeRequests >= MAX_CONCURRENT_PROVIDER_REQUESTS) await new Promise<void>((resolve) => waiters.push(resolve));
  activeRequests += 1;
  try { return await task(); } finally { activeRequests -= 1; waiters.shift()?.(); }
}

function circuitOpen(provider: SearchProviderName) { return (providerFailures.get(provider)?.openUntil || 0) > Date.now(); }
function recordProviderSuccess(provider: SearchProviderName) { providerFailures.set(provider, { count: 0, openUntil: 0 }); }
function recordProviderFailure(provider: SearchProviderName) {
  const count = (providerFailures.get(provider)?.count || 0) + 1;
  providerFailures.set(provider, { count, openUntil: count >= 3 ? Date.now() + 60_000 : 0 });
}

async function callGlm(request: SearchRequest): Promise<ProviderSearchResult> {
  const started = Date.now();
  const results = await searchWeb(request.query.slice(0, 70), { count: request.maxResults || 8, contentSize: "high", recency: "noLimit" });
  const requestId = `glm-${started}`;
  return { provider: "glm", requestId, query: request.query, hits: results.map((item, index) => ({ provider: "glm", title: item.title, url: item.link, snippet: item.content, claimedPublishedAt: item.publish_date || "", rank: index + 1, score: 0, requestId, query: request.query })), latencyMs: Date.now() - started, rateLimited: false, source: "live" };
}

export async function searchWithProvider(provider: SearchProviderName, request: SearchRequest): Promise<ProviderSearchResult> {
  const cached = await readCachedResult(provider, request);
  if (cached) return cached;
  const configured = searchProviderConfiguration()[provider].configured;
  if (!configured) return { provider, requestId: "", query: request.query, hits: [], latencyMs: 0, rateLimited: false, disabled: true, error: `${provider.toUpperCase()} is not configured.`, source: "live" };
  if (circuitOpen(provider)) return { provider, requestId: "", query: request.query, hits: [], latencyMs: 0, rateLimited: false, error: `${provider.toUpperCase()} circuit is temporarily open.`, source: "live" };
  return withProviderSlot(async () => {
    try {
      const result = await callGlm(request);
      recordProviderSuccess(provider);
      await writeCachedResult(provider, request, result);
      return result;
    } catch (error) {
      recordProviderFailure(provider);
      return { provider, requestId: "", query: request.query, hits: [], latencyMs: 0, rateLimited: Boolean((error as { rateLimited?: boolean }).rateLimited), error: error instanceof Error ? error.message : "Search request failed.", source: "live" };
    }
  });
}

export function providerQueryPlanVersion() { return "glm-hsr-community-cache-v3"; }
