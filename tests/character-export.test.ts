import { describe, expect, it } from "vitest";
import type { ProjectSnapshot, RegionalCharacterSymbiosisPlan, ReleasePlan } from "@/lib/contracts";
import { characterSymbiosisToMarkdown } from "@/lib/markdown";

const item: RegionalCharacterSymbiosisPlan = {
  regionId: "region-jp", regionName: "日本", symbiosisObjective: "通过角色陪伴提升回流与预约。",
  targetPlayerGroups: ["近30天未登录玩家"], characterSuitableVersionMessages: ["匹诺康尼即将开放"],
  communicationEntryPointsAndScenes: ["从久未见面切入"], recommendedTimingAndFrequency: ["上线前三天轻量提醒"],
  toneExpressionAndCulturalNotes: ["自然克制"], prohibitedBehaviorsAndRiskBoundaries: ["不得催促登录"],
  expectedEffectsAndMetrics: ["提升回流率"], regionalStrategyLinks: ["jp-return"], sourceIds: ["JP-S001"],
  characterTasks: [{ character: "三月七", objective: "version_recall", playerSegment: "returning_story_player", versionMessage: "新的梦境世界即将开放", communicationAngle: "从近期忙碌或久未见面切入", interactionScene: "玩家查看桌宠时", timing: "上线前3天", frequency: "七天最多两次", tone: "陪伴式轻邀请", culturalNotes: ["避免强推"], prohibitedBehaviors: ["不得连续催促"], riskBoundaries: ["拒绝后停止"], expectedEffect: "恢复版本兴趣", metrics: [{ name: "回流率", target: "+5%", measurementWindow: "7天" }] }],
};

describe("character symbiosis Markdown export", () => {
  it("locks every region to the same six-section structure and list sizes", () => {
    const project = { gameName: "崩坏：星穹铁道", versionName: "2.0", launchDate: "2024-02-06" } as ProjectSnapshot;
    const plan = { generatedAt: "2024-01-12", regions: [{ regionId: "region-jp", regionName: "日本", materialStrategy: ["角色短片"], characterRelease: [{ audienceSegment: "剧情玩家" }] }], characterSymbiosisRelease: [item] } as ReleasePlan;
    const output = characterSymbiosisToMarkdown(project, plan, item);
    const bullets = (start: string, end: string) => output.match(new RegExp(`${start}\\s*([\\s\\S]*?)\\s*${end}`))?.[1].match(/^- /gm)?.length;
    expect(output.match(/^### [1-6]\./gm)).toHaveLength(6);
    expect(bullets("### 2\\. 目标玩家群体", "### 3\\.")).toBe(3);
    expect(bullets("### 3\\. 可传递的版本信息", "### 4\\.")).toBe(4);
    expect(bullets("推荐场景：", "### 5\\.")).toBe(4);
    const payload = JSON.parse(output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] || "{}");
    expect(payload.memory_requirements).toHaveLength(3);
    expect(payload.risk_rules).toHaveLength(4);
    expect(payload.character).toBe("March 7th");
    expect(output).not.toMatch(/黑天鹅|花火|YouTube|B站|抖音|Facebook/);
    expect(output).toContain("我已经准备好相机了");
    expect(output).toContain("### 6. 对话示例");
  });
});
