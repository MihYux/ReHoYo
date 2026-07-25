import { describe, expect, it } from "vitest";
import { RegionalCharacterSymbiosisPlanSchema, RegionAnalysisSchema, ReleasePlanSchema, VersionBriefSchema } from "@/lib/contracts";

describe("GLM structured output contracts", () => {
  it("requires immutable citations and human requirements for every regional claim", () => {
    const base = {
      playerSignals: [{ text: "玩家偏好长线角色关系内容", citationIds: [], citationSnapshotIds: [], requirementIds: [], claimScope: "regional", dimension: "player", confidence: "medium" }],
      marketEnvironment: [], sentimentAndCompetition: [], culturalMoments: [], differentiators: [], differentiation: null,
      risks: [], researchNote: "", generatedAt: new Date().toISOString(),
    };
    expect(RegionAnalysisSchema.safeParse(base).success).toBe(false);
    expect(RegionAnalysisSchema.safeParse({ ...base, playerSignals: [{ ...base.playerSignals[0], citationIds: ["snapshot-1"], citationSnapshotIds: ["snapshot-1"], requirementIds: ["HC-OBJECTIVE-001"] }] }).success).toBe(true);
  });

  it("rejects incomplete version briefs and release plans", () => {
    expect(VersionBriefSchema.safeParse({ executiveSummary: "x" }).success).toBe(false);
    expect(ReleasePlanSchema.safeParse({ globalAxis: "x", regions: [] }).success).toBe(false);
  });

  it("requires a stable region-scoped character symbiosis handoff", () => {
    const value = {
      regionId: "region-jp", regionName: "日本", symbiosisObjective: "用角色陪伴承接回流",
      targetPlayerGroups: ["剧情向回流玩家"], characterSuitableVersionMessages: ["匹诺康尼是全新世界"],
      communicationEntryPointsAndScenes: ["角色来信回应当地讨论"], recommendedTimingAndFrequency: ["T-2 起每周两次"],
      toneExpressionAndCulturalNotes: ["克制、尊重二创语境"], prohibitedBehaviorsAndRiskBoundaries: ["不得剧透死亡与身份反转"],
      expectedEffectsAndMetrics: ["提升回流主线开启率"], regionalStrategyLinks: ["日本剧情角色策略"], sourceIds: ["snapshot-jp-1"],
      characterTasks: [{ character: "黑天鹅", objective: "建立悬疑陪伴", playerSegment: "剧情向回流玩家", versionMessage: "梦境存在未解危机", communicationAngle: "以记忆片段邀请推理", interactionScene: "X 话题回复与角色来信", timing: "T-2 至 T+1", frequency: "每周两次", tone: "含蓄克制", culturalNotes: ["不替玩家下结论"], prohibitedBehaviors: ["不披露死亡"], riskBoundaries: ["不暗示未确认身份"], expectedEffect: "提高剧情讨论与回流", metrics: [{ name: "主线开启率", target: "+8%", measurementWindow: "T0 至 T+1" }] }],
    };
    expect(RegionalCharacterSymbiosisPlanSchema.safeParse(value).success).toBe(true);
    expect(RegionalCharacterSymbiosisPlanSchema.safeParse({ ...value, characterTasks: [] }).success).toBe(false);
  });
});
