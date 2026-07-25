import { describe, expect, it } from "vitest";
import { buildHumanContract, calculateEvidenceCutoff, canonicalizeUrl, fingerprintInputs, parseBudgetEnvelope, scanRedlines, textSimilarity, validateEvidence, validateMarch7Symbiosis, validatePlanApproval } from "@/lib/governance";
import type { ProjectSnapshot, RegionConfig, RegionalCharacterSymbiosisPlan, ReleasePlan, ResearchCitation } from "@/lib/contracts";

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

  it("fingerprints business inputs without self-invalidating on audit timestamps or unselected regions", () => {
    const selected = { id: "cn", selected: true, status: "quality_passed", analysis: { generatedAt: "2024-02-01" } } as RegionConfig;
    const unselected = { id: "kr", selected: false, status: "draft" } as RegionConfig;
    const before = fingerprintInputs(project({ updatedAt: "2024-02-01" }), [selected], [citation()]);
    const afterSave = fingerprintInputs(project({ updatedAt: "2024-02-02" }), [unselected, selected], [citation()]);
    const changedBudget = fingerprintInputs(project({ updatedAt: "2024-02-02", totalBudget: "总预算6,000万元", budgetConfirmed: true }), [selected], [citation()]);
    expect(afterSave).toBe(before);
    expect(changedBudget).not.toBe(before);
  });

  it("requires March 7th to introduce Black Swan from a first-person Penacony-interest objective", () => {
    const plan = {
      regionId: "cn",
      regionName: "中国大陆",
      symbiosisObjective: "由三月七以同行者视角介绍黑天鹅，激发玩家对匹诺康尼的兴趣。",
      targetPlayerGroups: ["剧情玩家"],
      characterSuitableVersionMessages: ["我想带你认识黑天鹅，也一起看看匹诺康尼。"],
      communicationEntryPointsAndScenes: ["三月七以第一人称邀请玩家同行"],
      recommendedTimingAndFrequency: ["上线前一周一次"],
      toneExpressionAndCulturalNotes: ["好奇、真诚、不剧透"],
      prohibitedBehaviorsAndRiskBoundaries: ["不替玩家下结论"],
      expectedEffectsAndMetrics: ["玩家对匹诺康尼产生兴趣"],
      characterTasks: [{ character: "三月七", objective: "我来介绍黑天鹅并邀请你探索匹诺康尼", playerSegment: "剧情玩家", versionMessage: "我在匹诺康尼遇见了黑天鹅", communicationAngle: "我想听听你怎么看", interactionScene: "桌宠对话", timing: "T-1", frequency: "每周一次", tone: "好奇", culturalNotes: ["不剧透"], prohibitedBehaviors: ["不强推"], riskBoundaries: ["拒绝后停止"], expectedEffect: "产生世界兴趣", metrics: [{ name: "兴趣率", target: "+5%", measurementWindow: "7天" }] }],
      regionalStrategyLinks: ["连接区域剧情内容"],
      sourceIds: ["snapshot-1"],
    } satisfies RegionalCharacterSymbiosisPlan;
    expect(validateMarch7Symbiosis(plan)).toEqual([]);
    const broken = { ...plan, characterTasks: [{ ...plan.characterTasks[0], character: "黑天鹅", objective: "推动回流玩家开启主线", versionMessage: "新版本现已开放", communicationAngle: "强调开启主线" }] };
    expect(validateMarch7Symbiosis(broken).map((item) => item.code)).toEqual(expect.arrayContaining(["INVALID_SYMBIOSIS_CHARACTER", "INVALID_MARCH7_PERSPECTIVE"]));
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
