import { describe, expect, it } from "vitest";
import { budgetMode, campaignWeeks, differentiationSentenceCount, formatPlanListItem, parsePlanChannel, parsePlanList, parsePlanTask } from "@/lib/workflow";

describe("campaign planning rules", () => {
  it("builds a relative week sequence around launch", () => {
    expect(campaignWeeks(-2, 2)).toEqual(["T-2", "T-1", "T0", "T+1", "T+2"]);
  });

  it("never assumes currency when budget is absent", () => {
    expect(budgetMode("  ")).toBe("ratio");
    expect(budgetMode("人民币 1,200 万")).toBe("amount");
  });

  it("counts a five-sentence regional differentiation paragraph", () => {
    expect(differentiationSentenceCount("第一句。第二句！第三句？Fourth sentence.第五句。")).toBe(5);
    expect(differentiationSentenceCount("第一句。第二句。第三句。第四句。")).toBe(4);
  });

  it("normalizes readable GLM channel and task pipes into strict objects", () => {
    expect(parsePlanChannel("Bilibili｜每周 2 次｜剧情悬念承接")).toEqual({
      channel: "Bilibili",
      frequency: "每周 2 次",
      role: "剧情悬念承接",
    });
    expect(parsePlanTask("T-2｜发布角色短片｜角色 PV｜完播率")).toEqual({
      time: "T-2",
      action: "发布角色短片",
      asset: "角色 PV",
      successSignal: "完播率",
    });
    expect(parsePlanList("角色 PV；角色立绘\n实机录屏")).toEqual(["角色 PV", "角色立绘", "实机录屏"]);
    expect(formatPlanListItem({ theme: "梦境悬疑", action: ["短片", "角色对谈"] })).toBe("theme：梦境悬疑；action：短片、角色对谈");
  });
});
