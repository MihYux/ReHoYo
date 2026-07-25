import { describe, expect, it } from "vitest";
import { buildHumanContract, calculateEvidenceCutoff, canonicalizeUrl, parseBudgetEnvelope, scanRedlines, textSimilarity, validateEvidence, validatePlanApproval } from "@/lib/governance";
import type { ProjectSnapshot, RegionConfig, ReleasePlan, ResearchCitation } from "@/lib/contracts";

function project(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  const base = {
    id: "current", gameName: "崩坏：星穹铁道", versionName: "2.0", launchDate: "2024-02-06", platforms: [], campaignStartWeek: 0, campaignEndWeek: 4,
    objective: "发行新版本", sellingPoints: [], contentAssets: [], businessGoal: "增长", totalBudget: "总预算5,800万元，制作锁定610万元，可分配5,190万元，风险储备174万元",
    budgetConfirmed: true, kpis: [], characterProfiles: [], constraints: "禁止角色死亡剧透", evidenceMode: "campaign_cutoff" as const, planningAsOfDate: "2024-02-06", planningAsOfConfirmed: true,
    brief: null, briefStatus: "approved" as const, plan: null, planStatus: "draft" as const, evidenceCutoff: "2024-02-06T23:59:59.999Z",
    activeResearchRunId: "run-1", createdAt: "2024-01-01", updatedAt: "2024-01-01",
  };
  const merged = { ...base, ...overrides } as ProjectSnapshot;
  return { ...merged, humanContract: buildHumanContract(merged, merged.brief), budgetEnvelope: parseBudgetEnvelope(merged.totalBudget, merged.budgetConfirmed) };
}

function citation(overrides: Partial<ResearchCitation> = {}): ResearchCitation {
  return { id: "snapshot-1", displayId: "JP-S005", researchRunId: "run-1", canonicalSourceId: "source-1", regionId: "jp", dimension: "player",
    title: "local source", url: "https://example.jp/a", publisher: "publisher", publishedAt: "2024-02-01", snippet: "evidence", query: "query",
    manual: false, origin: "research", retrievedAt: "2024-02-02", contentHash: "hash", language: "日语", marketScope: "jp", qualityTier: "authoritative", verificationStatus: "verified", claimedPublishedAt: "2024-02-01", verifiedPublishedAt: "2024-02-01", detectedLanguage: "日语", publisherMarket: "jp", supportedDimensions: ["player"], relevanceScore: 1, rejectionReason: "", localEvidence: true, ...overrides };
}

describe("governed regional intelligence", () => {
  it("calculates campaign cutoff and rejects a 2025 source for a 2024 campaign", () => {
    expect(calculateEvidenceCutoff("2024-02-06", -8).slice(0, 10)).toBe("2023-12-12");
    expect(validateEvidence([citation({ publishedAt: "2025-04-01", verifiedPublishedAt: "2025-04-01" })], project()).some((item) => item.code === "POST_CUTOFF_EVIDENCE")).toBe(true);
  });

  it("canonicalizes tracking variants to one global source", () => {
    expect(canonicalizeUrl("https://WWW.Example.com/news/?utm_source=x&b=2&a=1#top")).toBe(canonicalizeUrl("https://example.com/news?a=1&b=2"));
  });

  it("blocks the Japanese Flowfly death/spoiler regression", () => {
    const current = project();
    expect(scanRedlines("以流萤死亡伏笔刺激讨论并揭示结局", current.humanContract).map((item) => item.code)).toContain("REDLINE_LEAKAGE");
  });

  it("parses and reconciles the human budget envelope", () => {
    expect(parseBudgetEnvelope("总预算5,800万元，制作锁定610万元，可分配5,190万元，风险储备174万元", true)).toMatchObject({ total: 5800, lockedProduction: 610, allocatable: 5190, riskReserve: 174, regionalCapTotal: 5016, confirmed: true });
  });

  it("detects highly repeated regional prose", () => {
    const common = "多数玩家关注苹果Metal与Vision Pro技术展示，因此发行需要突出相同的平台体验与全球福利。";
    expect(textSimilarity(common, `${common}并沿用相同素材。`)).toBeGreaterThan(0.42);
  });

  it("rejects the 11,696万元 overflow, stale input, and omission of Europe", () => {
    const current = project();
    const regions = ["cn", "jp", "eu"].map((id) => ({ id, selected: true, status: "quality_passed", analysis: { generatedAt: "2024" } })) as RegionConfig[];
    const plan = { regions: ["cn", "jp"].map((regionId) => ({ regionId, budgetAllocation: { amount: 5848, cap: 5848, currency: "CNY", unit: "万元" } })), sourceIds: [], inputFingerprint: "stale", budgetEnvelope: current.budgetEnvelope, qualityGateResults: [] } as unknown as ReleasePlan;
    const codes = validatePlanApproval(current, regions, [], plan).map((item) => item.code);
    expect(codes).toContain("INCOMPLETE_REGION_COVERAGE");
    expect(codes).toContain("BUDGET_OVERFLOW");
    expect(codes).toContain("STALE_INPUTS");
  });

  it("does not accept CN-S015 as immutable provenance", () => {
    const broken = citation({ id: "CN-S015", researchRunId: "", canonicalSourceId: "", contentHash: "", retrievedAt: "" });
    expect(validateEvidence([broken], project()).some((item) => item.code === "BROKEN_PROVENANCE")).toBe(true);
  });
});
