import { describe, expect, it } from "vitest";
import type { PlanAgentPatch, ReleasePlan } from "@/lib/contracts";
import { applyPlanAgentPatch, normalizePlanAgentSummary, planAgentHighlightKey, planFingerprint } from "@/lib/plan-agent";

const plan: ReleasePlan = {
  globalAxis: "以同行关系建立全球认知",
  globalPrinciples: ["角色先于功能"],
  commonMoments: ["T-1 全球预热"],
  globalKpis: ["版本认知"],
  characterSymbiosisRelease: [],
  sourceIds: ["CN-S001"],
  researchRunId: "run-test",
  evidenceMode: "campaign_cutoff",
  evidenceCutoff: "2026-07-24T00:00:00.000Z",
  budgetEnvelope: null,
  qualityGateResults: [],
  inputFingerprint: "test",
  generatedAt: "2026-07-24T10:00:00.000Z",
  regions: [{
    regionId: "region-cn",
    regionName: "中国大陆",
    coreJudgment: "用剧情与角色承接回流",
    materialStrategy: ["角色 PV"],
    socialCadence: ["每周两次"],
    kolPlan: ["剧情向创作者"],
    paidMedia: ["视频素材"],
    partnerships: ["线下展映"],
    timeline: [{ week: "T-1", focus: "关系预热", actions: ["角色来信"] }],
    kpis: ["完播率"],
    budget: ["素材 35%"],
    budgetAllocation: null,
    riskNotes: ["避免剧透"],
    characterRelease: [{
      character: "花火",
      audienceSegment: "回流玩家",
      relationshipStage: "重逢",
      objective: "恢复陪伴感",
      voiceRules: ["克制"],
      contentArc: ["失联到重逢"],
      channels: [{ channel: "微博", frequency: "每周两次", role: "日常陪伴" }],
      tasks: [{ time: "T-2", action: "发布角色来信草案", asset: "手写字图", successSignal: "收藏率" }],
      assetDependencies: ["立绘"],
      sampleTopics: ["航路上的旧物"],
      guardrails: ["不剧透"],
    }],
  }],
};

function patch(value: Partial<PlanAgentPatch>) {
  return {
    scope: "region",
    regionId: "region-cn",
    field: "materialStrategy",
    value: ["以时刻场景美术为核心"],
    reason: "强化场景辨识度",
    sourceIds: ["CN-S001"],
    ...value,
  } as PlanAgentPatch;
}

describe("plan document agent patch engine", () => {
  it("returns a useful reply when a conversational GLM response has an empty summary", () => {
    expect(normalizePlanAgentSummary("", 0)).toContain("请告诉我希望修改的区域");
    expect(normalizePlanAgentSummary("", 2)).toContain("2 项");
    expect(normalizePlanAgentSummary("  已完成调整  ", 1)).toBe("已完成调整");
  });

  it("applies whitelisted global, region and character fields without mutating the input", () => {
    const global = applyPlanAgentPatch(plan, patch({ scope: "global", field: "globalAxis", value: "全球统一强调时刻场景美术" }));
    const regional = applyPlanAgentPatch(global, patch({}));
    const character = applyPlanAgentPatch(regional, patch({ scope: "character", characterIndex: 0, expectedCharacter: "花火", field: "assetDependencies", value: ["时刻场景概念图", "角色实机素材"] }));

    expect(plan.globalAxis).toBe("以同行关系建立全球认知");
    expect(character.globalAxis).toBe("全球统一强调时刻场景美术");
    expect(character.regions[0].materialStrategy).toEqual(["以时刻场景美术为核心"]);
    expect(character.regions[0].characterRelease[0].assetDependencies).toEqual(["时刻场景概念图", "角色实机素材"]);
  });

  it("rejects unknown targets, invalid values and character identity conflicts", () => {
    expect(() => applyPlanAgentPatch(plan, patch({ regionId: "missing" }))).toThrow(/找不到区域/);
    expect(() => applyPlanAgentPatch(plan, patch({ value: "必须是数组" }))).toThrow();
    expect(() => applyPlanAgentPatch(plan, patch({ scope: "character", characterIndex: 0, expectedCharacter: "丹恒", field: "objective", value: "新目标" }))).toThrow(/角色定位冲突/);
    expect(() => applyPlanAgentPatch(plan, { ...patch({}), field: "regionId" } as unknown as PlanAgentPatch)).toThrow();
  });

  it("creates deterministic fingerprints and precise field highlight keys", () => {
    expect(planFingerprint(plan)).toBe(planFingerprint(structuredClone(plan)));
    expect(planFingerprint(applyPlanAgentPatch(plan, patch({})))).not.toBe(planFingerprint(plan));
    expect(planAgentHighlightKey(patch({ scope: "global", field: "globalKpis", value: ["认知提升"] }))).toBe("global:globalKpis");
    expect(planAgentHighlightKey(patch({}))).toBe("region:region-cn:materialStrategy");
    expect(planAgentHighlightKey(patch({ scope: "character", characterIndex: 0, expectedCharacter: "花火", field: "voiceRules", value: ["克制"] }))).toBe("character:region-cn:0:voiceRules");
  });
});
