import { describe, expect, it } from "vitest";
import { ProjectAutofillResponseSchema, ReleasePlanSchema } from "@/lib/contracts";
import { embeddedDemoAutofillResponse, embeddedDemoFixture, embeddedDemoPlan } from "@/lib/embedded-demo-fixture";
import { EMBEDDED_DEMO_FILE_NAME, embeddedDemoState, isEmbeddedDemoDocument } from "@/lib/embedded-demo";

const canonicalText = `# 《崩坏：星穹铁道》2.0「假如在午夜入梦」版本发行执行层输入材料\r\n\r\n> 数据冻结时间：2024 年 1 月 2 日\r\n> 版本上线时间：2024 年 2 月 6 日\r\n# 1｜产品侧版本移交单\r\n# 2｜版本经营目标输入`;

describe("embedded HSR 2.0 workflow fixture", () => {
  it("matches the normalized target name and required content markers", () => {
    expect(isEmbeddedDemoDocument({ name: EMBEDDED_DEMO_FILE_NAME.normalize("NFD"), extractedText: canonicalText })).toBe(true);
    expect(embeddedDemoState([
      { name: "other.md", extractedText: "unrelated" },
      { name: EMBEDDED_DEMO_FILE_NAME, extractedText: canonicalText },
    ]).eligible).toBe(true);
  });

  it("does not match similar names or incomplete documents", () => {
    expect(isEmbeddedDemoDocument({ name: `副本-${EMBEDDED_DEMO_FILE_NAME}`, extractedText: canonicalText })).toBe(false);
    expect(isEmbeddedDemoDocument({ name: EMBEDDED_DEMO_FILE_NAME, extractedText: canonicalText.replace("版本经营目标输入", "") })).toBe(false);
  });

  it("ships schema-valid autofill, brief and seven-region plan data", () => {
    const autofill = ProjectAutofillResponseSchema.parse(embeddedDemoAutofillResponse());
    expect(autofill.executionMode).toBe("embedded_fixture");
    expect(autofill.replacementProject).toEqual(embeddedDemoFixture.input);
    expect(embeddedDemoFixture.brief.dataFreezeDate).toBe("2024-01-02");
    const plan = ReleasePlanSchema.parse(embeddedDemoPlan("runtime-research-id"));
    expect(plan.regions).toHaveLength(7);
    expect(plan.characterSymbiosisRelease).toHaveLength(7);
    const japan = plan.characterSymbiosisRelease.find((item) => item.regionId === "region-jp");
    expect(japan?.symbiosisObjective).toBe("通过三月七与玩家之间已有的长期陪伴关系，自然传递新版本「匹诺康尼」相关信息，重点提升老玩家回流率和版本预约率。");
    expect(japan?.targetPlayerGroups).toEqual([
      "近30天未登录的老玩家",
      "曾重点培养三月七或经常与三月七互动的玩家",
      "对剧情、角色关系和声优内容关注度较高的玩家",
    ]);
    expect(japan?.characterSuitableVersionMessages).toEqual([
      "匹诺康尼新地图即将开放",
      "新版本存在与“梦境”相关的重要剧情",
      "新角色黑天鹅即将登场",
      "版本预约与回归奖励信息",
    ]);
    expect(japan?.communicationEntryPointsAndScenes).toContain("玩家长时间未登录后，三月七主动表达想念。");
    expect(japan?.prohibitedBehaviorsAndRiskBoundaries).toContain("不得虚构与玩家不存在的共同记忆。");
    expect(japan?.characterTasks[0].frequency).toBe("7天内最多2条");
    expect(plan.globalAxis).toContain("前半黑天鹅以虚无命途持续伤害为商业化核心");
    expect(plan.globalAxis).not.toContain("前半黑天鹅以记忆命途持续伤害为商业化核心");
    expect(plan.researchRunId).toBe("runtime-research-id");
    expect(plan.sourceIds.every((id) => !embeddedDemoFixture.sourceRefs.some((reference) => reference.id === id))).toBe(true);
  });
});
