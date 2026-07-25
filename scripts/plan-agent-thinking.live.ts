import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { z } from "zod";
import { PlanAgentPatchSchema, type ReleasePlan } from "@/lib/contracts";
import { chatJsonWithTools, type GlmFunctionTool } from "@/lib/glm";
import { applyPlanAgentPatch } from "@/lib/plan-agent";

function loadLocalKey() {
  if (process.env.ZHIPU_API_KEY) return;
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    const line = fs.readFileSync(filepath, "utf8").split(/\r?\n/).find((item) => item.trim().startsWith("ZHIPU_API_KEY="));
    if (line) process.env.ZHIPU_API_KEY = line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

const plan: ReleasePlan = {
  globalAxis: "以同行关系建立全球认知",
  globalPrinciples: ["角色先于功能"],
  commonMoments: ["T-1 全球预热"],
  globalKpis: ["版本认知"],
  characterSymbiosisRelease: [],
  sourceIds: [],
  researchRunId: "live-isolated",
  evidenceMode: "campaign_cutoff",
  evidenceCutoff: "2026-07-25T00:00:00.000Z",
  budgetEnvelope: null,
  qualityGateResults: [],
  inputFingerprint: "live-isolated",
  generatedAt: "2026-07-25T00:00:00.000Z",
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
    characterRelease: [],
  }],
};

const tools: GlmFunctionTool[] = [{
  type: "function",
  function: {
    name: "read_plan_section",
    description: "读取要修改的区域方案；修改前必须调用。",
    parameters: { type: "object", properties: { regionId: { type: "string", enum: ["region-cn"] } }, required: ["regionId"], additionalProperties: false },
  },
}, {
  type: "function",
  function: {
    name: "apply_plan_patch",
    description: "修改已读取的发行方案字段。",
    parameters: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          properties: {
            scope: { type: "string", enum: ["region"] },
            regionId: { type: "string", enum: ["region-cn"] },
            field: { type: "string", enum: ["materialStrategy"] },
            value: { type: "array", items: { type: "string" }, minItems: 1 },
            reason: { type: "string" },
            sourceIds: { type: "array", items: { type: "string" } },
          },
          required: ["scope", "regionId", "field", "value", "reason"],
          additionalProperties: false,
        },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
}];

test("real GLM thinks between tools and edits a validated plan in memory", async () => {
  loadLocalKey();
  expect(process.env.ZHIPU_API_KEY, "ZHIPU_API_KEY is required for the live test").toBeTruthy();
  let workingPlan = structuredClone(plan);
  let read = false;
  let applied = false;

  const answer = await chatJsonWithTools(
    z.object({ summary: z.string().min(1), warnings: z.array(z.string()).default([]) }),
    "你是发行文档编辑 Agent。内部完成推理但不要输出思维链。必须先读取目标，再调用补丁工具完成修改，最后只返回 JSON 摘要。",
    "将中国大陆素材策略改为以时刻场景美术为核心。只修改 materialStrategy，保持其他字段不变。",
    tools,
    async (name, argumentsValue) => {
      if (name === "read_plan_section") {
        read = true;
        return workingPlan.regions[0];
      }
      if (name === "apply_plan_patch") {
        if (!read) return { applied: 0, retryable: true, error: "请先读取目标章节" };
        const args = z.object({ patch: PlanAgentPatchSchema }).parse(argumentsValue);
        workingPlan = applyPlanAgentPatch(workingPlan, args.patch);
        applied = true;
        return { applied: 1 };
      }
      throw new Error(`unexpected tool: ${name}`);
    },
    { thinking: true, reasoningEffort: "high", maxRounds: 6, maxToolCalls: 8, maxTokens: 8_000 },
  );

  expect(read).toBe(true);
  expect(applied).toBe(true);
  expect(workingPlan.regions[0].materialStrategy.join(" ")).toContain("时刻场景美术");
  expect(workingPlan.regions[0].socialCadence).toEqual(plan.regions[0].socialCadence);
  expect(answer.summary).toBeTruthy();
});
