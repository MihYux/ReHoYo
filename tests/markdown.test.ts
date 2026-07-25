import { describe, expect, it } from "vitest";
import { markdownWordCount, planToMarkdown, regionPlanToMarkdown } from "@/lib/markdown";
import type { ProjectSnapshot, ReleasePlan } from "@/lib/contracts";

const project: ProjectSnapshot = {
  id: "current", gameName: "星穹远征", versionName: "逆光航路", launchDate: "2026-09-12", platforms: ["PC"], campaignStartWeek: -8, campaignEndWeek: 4,
  objective: "回流", sellingPoints: [], contentAssets: [], businessGoal: "", totalBudget: "", kpis: [], characterProfiles: [], constraints: "", budgetConfirmed: false, evidenceMode: "campaign_cutoff", planningAsOfDate: "2026-07-24", planningAsOfConfirmed: true,
  brief: null, briefStatus: "approved", plan: null, planStatus: "needs_review", humanContract: { version: 2, approved: false, instructionOrder: ["project", "brief", "human", "regional", "evidence", "format"], requirements: [] }, budgetEnvelope: null, evidenceCutoff: "", activeResearchRunId: "", createdAt: "2026-07-24", updatedAt: "2026-07-24",
};

const plan: ReleasePlan = {
  globalAxis: "在逆光中重建同行关系", globalPrinciples: ["角色先于功能"], commonMoments: ["T-1 角色来信"], globalKpis: ["版本认知"], characterSymbiosisRelease: [], sourceIds: ["JP-S001"], researchRunId: "run-test", evidenceMode: "campaign_cutoff", evidenceCutoff: "2026-07-24T00:00:00.000Z", budgetEnvelope: null, qualityGateResults: [], inputFingerprint: "test", generatedAt: "2026-07-24T10:00:00Z",
  regions: [{ regionId: "region-jp", regionName: "日本", coreJudgment: "以角色关系承接回流", materialStrategy: ["角色短片"], socialCadence: ["每周两次"], kolPlan: ["剧情向创作者"], paidMedia: ["视频素材"], partnerships: ["线下展映"], timeline: [{ week: "T-1", focus: "关系预热", actions: ["角色来信"] }], kpis: ["完播率"], budget: ["素材 35%"], budgetAllocation: null, riskNotes: ["避免剧透"], characterRelease: [{ character: "岚音", audienceSegment: "回流玩家", relationshipStage: "重逢", objective: "恢复陪伴感", voiceRules: ["克制"], contentArc: ["失联到重逢"], channels: [{ channel: "X", frequency: "每周两次", role: "日常陪伴" }], tasks: [{ time: "T-2", action: "发布角色来信草案", asset: "手写字图", successSignal: "收藏率" }], assetDependencies: ["立绘"], sampleTopics: ["航路上的旧物"], guardrails: ["不剧透"] }], }],
};

describe("markdown export", () => {
  it("contains the global axis, role boundary and source list", () => {
    const output = planToMarkdown(project, plan, [{ id: "JP-S001", regionId: "region-jp", dimension: "player", title: "日本玩家趋势", url: "https://example.com/source", publisher: "研究媒体", publishedAt: "2026-07-01", snippet: "", query: "", manual: false }]);
    expect(output).toContain("全球统一主轴");
    expect(output).toContain("AI 角色关系型发行");
    expect(output).toContain("不代表已执行任何触达");
    expect(output).toContain("资产依赖");
    expect(output).toContain("立绘");
    expect(output).toContain("https://example.com/source");
  });

  it("creates a standalone regional Markdown file longer than 75 words", () => {
    const citations = [{ id: "JP-S001", regionId: "region-jp", dimension: "player" as const, title: "日本玩家趋势", url: "https://example.com/source", publisher: "研究媒体", publishedAt: "2026-07-01", snippet: "", query: "", manual: false }];
    const output = regionPlanToMarkdown(project, plan, plan.regions[0], citations);
    expect(output).toContain("日本发行策略");
    expect(output).toContain("本区域来源");
    expect(markdownWordCount(output)).toBeGreaterThan(75);
  });
});
