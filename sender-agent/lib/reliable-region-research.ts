import { z } from "zod";
import { RegionAnalysisSchema, type ProjectSnapshot, type QualityViolation, type RegionAnalysis, type RegionConfig, type ResearchCitation, type VersionBrief } from "@/lib/contracts";
import { verifyEvidencePage } from "@/lib/evidence-verifier";
import { chatJson } from "@/lib/glm";
import { canonicalizeUrl, stableHash, validateEvidence } from "@/lib/governance";
import { regionResearchProfile, researchInputFingerprintValue, type ResearchDimension } from "@/lib/region-profiles";
import { normalizeResearchCitationIds } from "@/lib/research-citations";
import { searchWithProvider, type SearchProviderName } from "@/lib/search-providers";
import { gameEvidenceSeeds } from "@/lib/game-evidence-cache";

const dimensions: ResearchDimension[] = ["player", "market", "sentiment", "culture"];
const CandidateAnalysisSchema = RegionAnalysisSchema.extend({ differentiators: z.array(z.string()).max(0).default([]), differentiation: z.null().default(null) });

export type ReliableResearchProgress = { phase: "searching" | "verifying" | "quality_check" | "synthesizing"; progress: number; dimension?: ResearchDimension };

export type ResearchDiagnostic = {
  url: string;
  dimension: ResearchDimension;
  status: string;
  reason: string;
  provider?: SearchProviderName | "curated_web" | "verifier";
  round?: number;
  query?: string;
  requestId?: string;
  resultCount?: number;
  acceptedCount?: number;
  latencyMs?: number;
  rateLimited?: boolean;
  credits?: number;
  source?: "live" | "cache";
  cachedAt?: string;
};

export type EvidenceDiscovery = {
  id: string;
  runId: string;
  regionId: string;
  dimension: ResearchDimension;
  snapshotId: string;
  canonicalSourceId: string;
  provider: SearchProviderName | "curated_web";
  query: string;
  round: number;
  rank: number;
  score: number;
  requestId: string;
  claimedPublishedAt: string;
  discoveredAt: string;
};

export type ProviderStats = Record<SearchProviderName, { requests: number; cached: number; results: number; accepted: number; failures: number; latencyMs: number; credits: number }>;

export type ReliableRegionResearchResult = {
  analysis: RegionAnalysis | null;
  citations: ResearchCitation[];
  violations: QualityViolation[];
  diagnostics: ResearchDiagnostic[];
  discoveries: EvidenceDiscovery[];
  providerStats: ProviderStats;
  transportFailed: boolean;
  inputFingerprint: string;
};

function emptyProviderStats(): ProviderStats {
  return {
    glm: { requests: 0, cached: 0, results: 0, accepted: 0, failures: 0, latencyMs: 0, credits: 0 },
  };
}

function qualityViolation(code: string, ruleId: string, message: string, path: string): QualityViolation {
  return { code, ruleId, severity: "hard", message, path, repairable: false };
}

function qualityTier(url: string, publisher: string): ResearchCitation["qualityTier"] {
  const value = `${url} ${publisher}`;
  if (/\.(gov|go\.jp|go\.kr)(\.|\/|$)|government|statistics/i.test(value)) return "primary";
  if (/reuters|bloomberg|nikkei|gamesindustry|newzoo|sensor tower|data\.ai/i.test(value)) return "authoritative";
  if (/hoyolab|reddit|forum|5ch|dcinside|bbs|community/i.test(value)) return "community";
  return publisher ? "trade" : "unknown";
}

function baseProjectValidation(project: ProjectSnapshot) {
  const violations: QualityViolation[] = [];
  if (project.evidenceMode === "campaign_cutoff" && (!project.planningAsOfConfirmed || !project.planningAsOfDate)) violations.push(qualityViolation("MISSING_PLANNING_SNAPSHOT", "EVIDENCE-CUTOFF-000", "Approved input does not contain a confirmed data-freeze date.", "project.planningAsOfDate"));
  return violations;
}

export function currentResearchInputFingerprint(project: ProjectSnapshot, region: RegionConfig, manualSources: ResearchCitation[]) {
  const profile = regionResearchProfile(region.code);
  return stableHash(researchInputFingerprintValue(profile, project.evidenceCutoff, manualSources.map((item) => item.id)));
}

function queryForRound(project: ProjectSnapshot, region: RegionConfig, dimension: ResearchDimension, round: number) {
  const profile = regionResearchProfile(region.code);
  const base = profile.queries[dimension][round].replace(/抽卡|賭博|赌博|博彩/gi, "角色收集");
  const cutoffYear = project.planningAsOfDate ? Number(project.planningAsOfDate.slice(0, 4)) : new Date().getFullYear();
  const years = project.evidenceMode === "campaign_cutoff" ? `${Math.max(2019, cutoffYear - 3)}-${cutoffYear - 1}` : `${cutoffYear}`;
  const roundIntent = round === 0 ? "report survey" : round === 1 ? "players platform culture regulation" : "historical statistics community";
  return `"${profile.gameName}" 2.0 Penacony 匹诺康尼 ${profile.marketTokens[0]} ${base} ${roundIntent} ${years}`.replace(/\s+/g, " ").trim();
}

function isHsr2Evidence(text: string) {
  return /(version\s*2\.0|ver\.?\s*2\.0|v2\.0|2\.0\s*版本|2\.0\s*버전|penacony|匹诺康尼|匹諾康尼|ピノコニー|페나코니|black swan|sparkle|花火|黑天鹅|黑天鵝|ブラックスワン|블랙\s*스완|white night|misha|米沙)/i.test(text);
}

function hasDimensionCoverage(accepted: Map<string, { citation: ResearchCitation; dimensions: Set<ResearchDimension> }>, dimension: ResearchDimension) {
  return Array.from(accepted.values()).filter((item) => item.dimensions.has(dimension)).length >= 2;
}

function interleaveProviderHits(results: Array<{ hits: Array<{ url: string }> }>) {
  const output: Array<(typeof results)[number]["hits"][number]> = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...results.map((result) => result.hits.length));
  for (let rank = 0; rank < max && output.length < 8; rank += 1) for (const result of results) {
    const hit = result.hits[rank];
    if (!hit?.url || seen.has(hit.url)) continue;
    seen.add(hit.url);
    output.push(hit);
    if (output.length >= 8) break;
  }
  return output;
}

export async function researchRegionReliably(project: ProjectSnapshot, brief: VersionBrief, region: RegionConfig, manualSources: ResearchCitation[], onProgress: ((progress: ReliableResearchProgress) => void | Promise<void>) | undefined, researchRunId: string): Promise<ReliableRegionResearchResult> {
  const profile = regionResearchProfile(region.code);
  const inputFingerprint = currentResearchInputFingerprint(project, region, manualSources);
  const earlyViolations = baseProjectValidation(project);
  const providerStats = emptyProviderStats();
  if (earlyViolations.length) return { analysis: null, citations: manualSources, violations: earlyViolations, diagnostics: [], discoveries: [], providerStats, transportFailed: false, inputFingerprint };

  type Candidate = { citation: ResearchCitation; dimensions: Set<ResearchDimension>; queries: Set<string> };
  const accepted = new Map<string, Candidate>();
  const diagnostics: ResearchDiagnostic[] = [];
  const discoveries: EvidenceDiscovery[] = [];
  const pageCache = new Map<string, ReturnType<typeof verifyEvidencePage>>();
  let completedProviderCalls = 0;

  for (const item of manualSources) {
    try {
      const key = canonicalizeUrl(item.url);
      const manualDimensions = (item.supportedDimensions || [item.dimension]).filter((value): value is ResearchDimension => value !== "manual");
      accepted.set(key, { citation: item, dimensions: new Set(manualDimensions), queries: new Set([item.query].filter(Boolean)) });
    } catch {
      diagnostics.push({ url: item.url, dimension: item.dimension === "manual" ? "market" : item.dimension, status: "rejected", reason: "Manual source URL is invalid.", provider: "verifier" });
    }
  }

  // Prime each dimension with game-specific public URLs curated in the repository.
  // These entries never bypass the same HTTPS, date, relevance, locality and cutoff verifier used for live search.
  for (const dimension of dimensions) {
    const seeds = gameEvidenceSeeds(region.code, dimension, project.evidenceMode === "campaign_cutoff" ? project.planningAsOfDate : undefined);
    const verifiedSeeds = await Promise.all(seeds.map(async (seed, index) => ({
      seed,
      rank: index + 1,
      page: await verifyEvidencePage({ url: seed.url, claimedPublishedAt: seed.publishedAt, profile, dimension }),
    })));
    for (const { seed, rank, page } of verifiedSeeds) {
      const afterCutoff = project.evidenceMode === "campaign_cutoff" && page.verifiedPublishedAt
        ? new Date(page.verifiedPublishedAt).getTime() > new Date(project.evidenceCutoff).getTime()
        : false;
      const wrongVersion = page.verificationStatus === "verified" && !isHsr2Evidence(`${page.title} ${page.text.slice(0, 20_000)}`);
      if (page.verificationStatus !== "verified" || afterCutoff || wrongVersion) {
        diagnostics.push({ url: seed.url, dimension, status: afterCutoff ? "post_cutoff" : wrongVersion ? "wrong_version" : page.verificationStatus, reason: afterCutoff ? `Published after ${project.planningAsOfDate}.` : wrongVersion ? "Page does not contain verifiable HSR 2.0/Penacony content." : page.rejectionReason, provider: "curated_web", round: 0, query: `curated:${region.code}:${dimension}` });
        continue;
      }
      const key = page.canonicalUrl;
      const canonicalSourceId = stableHash(key);
      const snapshotId = stableHash(`${researchRunId}:${canonicalSourceId}:${page.contentHash}`).slice(0, 36);
      discoveries.push({ id: stableHash(`${researchRunId}:${region.id}:${dimension}:curated:${key}`), runId: researchRunId, regionId: region.id, dimension, snapshotId, canonicalSourceId, provider: "curated_web", query: `curated:${region.code}:${dimension}`, round: 0, rank, score: page.relevanceScore, requestId: "repo-game-cache-v1", claimedPublishedAt: seed.publishedAt, discoveredAt: new Date().toISOString() });
      const existing = accepted.get(key);
      if (existing) {
        existing.dimensions.add(dimension);
        existing.queries.add(`curated:${region.code}:${dimension}`);
        continue;
      }
      accepted.set(key, { dimensions: new Set([dimension]), queries: new Set([`curated:${region.code}:${dimension}`]), citation: {
        id: snapshotId, displayId: "", researchRunId, canonicalSourceId, regionId: region.id, dimension, supportedDimensions: [dimension],
        title: page.title || seed.title, url: page.canonicalUrl, publisher: page.publisher || "", publishedAt: page.verifiedPublishedAt,
        claimedPublishedAt: seed.publishedAt, verifiedPublishedAt: page.verifiedPublishedAt, snippet: page.text.slice(0, 900), query: `curated:${region.code}:${dimension}`,
        manual: false, origin: "research", retrievedAt: new Date().toISOString(), contentHash: page.contentHash, language: page.detectedLanguage,
        detectedLanguage: page.detectedLanguage, marketScope: page.contentMarket, publisherMarket: page.publisherMarket, contentMarket: page.contentMarket,
        claimScope: page.claimScope, qualityTier: qualityTier(page.canonicalUrl, page.publisher), verificationStatus: page.verificationStatus,
        relevanceScore: page.relevanceScore, rejectionReason: "", localEvidence: page.localEvidence,
      } });
    }
  }

  let completedRounds = 0;
  for (const dimension of dimensions) {
    for (let round = 0; round < 3; round += 1) {
      if (hasDimensionCoverage(accepted, dimension)) break;
      const query = queryForRound(project, region, dimension, round);
      const providers: SearchProviderName[] = ["glm"];
      const request = { query, regionCode: region.code, regionName: region.name, language: region.language || profile.allowedLanguages.join(", "), dimension, endDate: project.evidenceMode === "campaign_cutoff" ? project.planningAsOfDate : undefined, maxResults: 8, round: round + 1 };
      const results = await Promise.all(providers.map((provider) => searchWithProvider(provider, request)));
      completedRounds += 1;
      await onProgress?.({ phase: "searching", dimension, progress: Math.min(50, 8 + completedRounds * 4) });

      for (const result of results) {
        const stats = providerStats[result.provider];
        if (!result.disabled && result.source === "live") stats.requests += 1;
        if (result.source === "cache") stats.cached += 1;
        stats.results += result.hits.length;
        stats.latencyMs += result.latencyMs;
        stats.credits += result.credits || 0;
        if (result.error && !result.disabled) stats.failures += 1;
        if (!result.error && !result.disabled) completedProviderCalls += 1;
        diagnostics.push({ url: query, dimension, status: result.disabled ? "provider_disabled" : result.error ? "search_failed" : result.source === "cache" ? "cache_replayed" : "search_completed", reason: result.error || (result.source === "cache" ? `已复用 ${result.hits.length} 条历史检索结果。` : `返回 ${result.hits.length} 条联网检索结果。`), provider: result.provider, round: round + 1, query, requestId: result.requestId, resultCount: result.hits.length, acceptedCount: 0, latencyMs: result.latencyMs, rateLimited: result.rateLimited, credits: result.credits, source: result.source, cachedAt: result.cachedAt });
      }

      const hits = interleaveProviderHits(results) as Array<(typeof results)[number]["hits"][number]>;
      const roundAccepted: Record<SearchProviderName, number> = { glm: 0 };
      await onProgress?.({ phase: "verifying", dimension, progress: Math.min(72, 30 + completedRounds * 4) });
      const verified = await Promise.all(hits.map(async (hit) => {
        if (!hit.url) return null;
        const cached = pageCache.get(hit.url) || verifyEvidencePage({ url: hit.url, claimedPublishedAt: hit.claimedPublishedAt, profile, dimension });
        pageCache.set(hit.url, cached);
        return { hit, page: await cached };
      }));
      for (const outcome of verified) {
        if (!outcome) continue;
        const { hit, page } = outcome;
        const afterCutoff = project.evidenceMode === "campaign_cutoff" && page.verifiedPublishedAt ? new Date(page.verifiedPublishedAt).getTime() > new Date(project.evidenceCutoff).getTime() : false;
        const wrongVersion = page.verificationStatus === "verified" && !isHsr2Evidence(`${page.title} ${page.text.slice(0, 20_000)}`);
        if (page.verificationStatus !== "verified" || afterCutoff || wrongVersion) {
          diagnostics.push({ url: hit.url, dimension, status: afterCutoff ? "post_cutoff" : wrongVersion ? "wrong_version" : page.verificationStatus, reason: afterCutoff ? `Published after ${project.planningAsOfDate}.` : wrongVersion ? "Page does not contain verifiable HSR 2.0/Penacony content." : page.rejectionReason, provider: hit.provider, round: round + 1, query, requestId: hit.requestId });
          continue;
        }
        providerStats[hit.provider].accepted += 1;
        roundAccepted[hit.provider] += 1;
        const key = page.canonicalUrl;
        const canonicalSourceId = stableHash(key);
        const snapshotId = stableHash(`${researchRunId}:${canonicalSourceId}:${page.contentHash}`).slice(0, 36);
        discoveries.push({ id: stableHash(`${researchRunId}:${region.id}:${dimension}:${hit.provider}:${hit.requestId}:${hit.rank}:${key}`), runId: researchRunId, regionId: region.id, dimension, snapshotId, canonicalSourceId, provider: hit.provider, query, round: round + 1, rank: hit.rank, score: hit.score, requestId: hit.requestId, claimedPublishedAt: hit.claimedPublishedAt, discoveredAt: new Date().toISOString() });
        const existing = accepted.get(key);
        if (existing) {
          existing.dimensions.add(dimension);
          existing.queries.add(query);
          continue;
        }
        accepted.set(key, {
          dimensions: new Set([dimension]), queries: new Set([query]),
          citation: {
            id: snapshotId, displayId: "", researchRunId, canonicalSourceId, regionId: region.id, dimension, supportedDimensions: [dimension],
            title: page.title || hit.title || hit.url, url: page.canonicalUrl, publisher: page.publisher || "", publishedAt: page.verifiedPublishedAt,
            claimedPublishedAt: page.claimedPublishedAt, verifiedPublishedAt: page.verifiedPublishedAt, snippet: page.text.slice(0, 900), query,
            manual: false, origin: "research", retrievedAt: new Date().toISOString(), contentHash: page.contentHash, language: page.detectedLanguage,
            detectedLanguage: page.detectedLanguage, marketScope: page.contentMarket, publisherMarket: page.publisherMarket, contentMarket: page.contentMarket,
            claimScope: page.claimScope, qualityTier: qualityTier(page.canonicalUrl, page.publisher), verificationStatus: page.verificationStatus,
            relevanceScore: page.relevanceScore, rejectionReason: "", localEvidence: page.localEvidence,
          },
        });
      }
      for (const result of results) {
        const diagnostic = [...diagnostics].reverse().find((item) => item.provider === result.provider && item.requestId === result.requestId && (item.status === "search_completed" || item.status === "cache_replayed"));
        if (diagnostic) diagnostic.acceptedCount = roundAccepted[result.provider];
      }
    }
  }

  const citations = Array.from(accepted.values()).map((item, index) => ({ ...item.citation, displayId: `${region.code.toUpperCase()}-S${String(index + 1).padStart(3, "0")}`, dimension: Array.from(item.dimensions)[0], supportedDimensions: Array.from(item.dimensions), query: Array.from(item.queries).join(" | ") }));
  await onProgress?.({ phase: "quality_check", progress: 78 });
  const transportFailed = completedProviderCalls === 0;
  const evidenceViolations = transportFailed
    ? [qualityViolation("ALL_SEARCH_PROVIDERS_FAILED", "SEARCH-TRANSPORT-001", "No configured search provider completed a request.", `regions.${region.id}`)]
    : validateEvidence(citations, project, region.id);
  if (evidenceViolations.some((item) => item.severity === "hard")) return { analysis: null, citations, violations: evidenceViolations, diagnostics, discoveries, providerStats, transportFailed, inputFingerprint };

  await onProgress?.({ phase: "synthesizing", progress: 82 });
  const allowedRequirementIds = project.humanContract.requirements.map((item) => item.id);
  const analysis = await chatJson(CandidateAnalysisSchema,
    "Generate evidence-grounded regional research JSON. Every claim must include claimScope, dimension, requirementIds, citationIds, and citationSnapshotIds. Regional claims require local evidence for the same dimension. Global sources can only support global_context. Do not generate differentiation yet: differentiators=[] and differentiation=null. Never invent requirement IDs or citations.",
    `HUMAN CONTRACT: ${JSON.stringify(project.humanContract)}\nAllowed requirement IDs: ${JSON.stringify(allowedRequirementIds)}\nRegion: ${JSON.stringify(region)}\nApproved brief context: ${JSON.stringify(brief)}\nVerified evidence: ${JSON.stringify(citations)}`,
    { maxTokens: 9_000, maxAttempts: 3, repairInstruction: "Repair invalid IDs, dimensions, scopes, and citation links using only the supplied contract and verified evidence. Do not invent evidence." });
  const sourceIds = new Set(citations.map((item) => item.id));
  const requirementIds = new Set(allowedRequirementIds);
  const violations: QualityViolation[] = [];
  const groups: Array<[keyof Pick<RegionAnalysis, "playerSignals" | "marketEnvironment" | "sentimentAndCompetition" | "culturalMoments">, ResearchDimension]> = [["playerSignals", "player"], ["marketEnvironment", "market"], ["sentimentAndCompetition", "sentiment"], ["culturalMoments", "culture"]];
  for (const [key, dimension] of groups) {
    analysis[key] = analysis[key].map((claim, index) => {
      const normalized = normalizeResearchCitationIds(claim.citationSnapshotIds.length ? claim.citationSnapshotIds : claim.citationIds, citations);
      const next = { ...claim, dimension, citationIds: normalized.ids, citationSnapshotIds: normalized.ids };
      if (!next.requirementIds.length || next.requirementIds.some((id) => !requirementIds.has(id))) violations.push(qualityViolation("UNKNOWN_REQUIREMENT_ID", "CLAIM-LINK-003", `Claim ${key}.${index} references an unknown requirement ID.`, `${key}.${index}.requirementIds`));
      if (!next.citationSnapshotIds.length || next.citationSnapshotIds.some((id) => !sourceIds.has(id))) violations.push(qualityViolation("INVALID_CITATION", "CLAIM-LINK-002", `Claim ${key}.${index} has an invalid citation.`, `${key}.${index}.citationSnapshotIds`));
      if (next.claimScope === "regional" && next.citationSnapshotIds.some((id) => { const source = citations.find((item) => item.id === id); return !source?.localEvidence || source.claimScope !== "regional" || !source.supportedDimensions.includes(dimension); })) violations.push(qualityViolation("INVALID_REGIONAL_SUPPORT", "CLAIM-LOCALITY-001", `Claim ${key}.${index} lacks matching local evidence.`, `${key}.${index}`));
      return next;
    });
  }
  return { analysis: { ...analysis, generatedAt: new Date().toISOString() }, citations, violations, diagnostics, discoveries, providerStats, transportFailed, inputFingerprint };
}
