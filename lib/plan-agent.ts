import { createHash, randomUUID } from "node:crypto";
import { and, desc } from "drizzle-orm";
import { z, type ZodType } from "zod";
import {
  CharacterReleasePlanSchema,
  PlanAgentCharacterFieldSchema,
  PlanAgentGlobalFieldSchema,
  PlanAgentPatchSchema,
  PlanAgentRegionFieldSchema,
  PlanAgentSymbiosisFieldSchema,
  PlanAgentRequestSchema,
  PlanAgentRunRecordSchema,
  RegionReleasePlanSchema,
  RegionalCharacterSymbiosisPlanSchema,
  ReleasePlanSchema,
  type PlanAgentPatch,
  type PlanAgentPhase,
  type PlanAgentRequest,
  type PlanAgentRunRecord,
  type PlanAgentStreamEvent,
  type PlanAgentToolLog,
  type ReleasePlan,
  type ResearchCitation,
} from "@/lib/contracts";
import { citations, db, ensureDb, eq, getCitations, getProject, getRegions, jobs, setPlan } from "@/lib/db";
import { chatJsonWithTools, GlmError, searchWeb, type GlmFunctionTool } from "@/lib/glm";

type Emit = (event: PlanAgentStreamEvent) => void;

const AgentAnswerSchema = z.object({
  summary: z.string().trim().max(1_200).default(""),
  warnings: z.array(z.string().max(500)).max(8).default([]),
});

export function normalizePlanAgentSummary(summary: string, patchCount: number) {
  const clean = summary.trim();
  if (clean) return clean;
  if (patchCount > 0) return `已完成 ${patchCount} 项发行文档修改，并保留未指定的内容。`;
  return "你好，我可以修改全球主轴、区域策略、角色关系型发行或角色共生发行方案。请告诉我希望修改的区域、章节和目标；当前文档尚未发生变化。";
}

const globalFieldSchemas: Record<string, ZodType> = {
  globalAxis: ReleasePlanSchema.shape.globalAxis,
  globalPrinciples: ReleasePlanSchema.shape.globalPrinciples,
  commonMoments: ReleasePlanSchema.shape.commonMoments,
  globalKpis: ReleasePlanSchema.shape.globalKpis,
};

const regionFieldSchemas: Record<string, ZodType> = {
  coreJudgment: RegionReleasePlanSchema.shape.coreJudgment,
  materialStrategy: RegionReleasePlanSchema.shape.materialStrategy,
  socialCadence: RegionReleasePlanSchema.shape.socialCadence,
  kolPlan: RegionReleasePlanSchema.shape.kolPlan,
  paidMedia: RegionReleasePlanSchema.shape.paidMedia,
  partnerships: RegionReleasePlanSchema.shape.partnerships,
  timeline: RegionReleasePlanSchema.shape.timeline,
  kpis: RegionReleasePlanSchema.shape.kpis,
  budget: RegionReleasePlanSchema.shape.budget,
  budgetAllocation: RegionReleasePlanSchema.shape.budgetAllocation,
  riskNotes: RegionReleasePlanSchema.shape.riskNotes,
};

const characterFieldSchemas: Record<string, ZodType> = {
  character: CharacterReleasePlanSchema.shape.character,
  audienceSegment: CharacterReleasePlanSchema.shape.audienceSegment,
  relationshipStage: CharacterReleasePlanSchema.shape.relationshipStage,
  objective: CharacterReleasePlanSchema.shape.objective,
  voiceRules: CharacterReleasePlanSchema.shape.voiceRules,
  contentArc: CharacterReleasePlanSchema.shape.contentArc,
  channels: CharacterReleasePlanSchema.shape.channels,
  tasks: CharacterReleasePlanSchema.shape.tasks,
  assetDependencies: CharacterReleasePlanSchema.shape.assetDependencies,
  sampleTopics: CharacterReleasePlanSchema.shape.sampleTopics,
  guardrails: CharacterReleasePlanSchema.shape.guardrails,
};
const symbiosisFieldSchemas: Record<string, ZodType> = Object.fromEntries(
  PlanAgentSymbiosisFieldSchema.options.map((field) => [field, RegionalCharacterSymbiosisPlanSchema.shape[field]]),
);

function clonePlan(plan: ReleasePlan) {
  return structuredClone(plan);
}

export function planFingerprint(plan: ReleasePlan) {
  return createHash("sha256").update(JSON.stringify(ReleasePlanSchema.parse(plan))).digest("hex");
}

export function planAgentHighlightKey(patch: PlanAgentPatch) {
  if (patch.scope === "global") return `global:${patch.field}`;
  if (patch.scope === "region") return `region:${patch.regionId}:${patch.field}`;
  if (patch.scope === "symbiosis") return `symbiosis:${patch.regionId}:${patch.field}`;
  return `character:${patch.regionId}:${patch.characterIndex}:${patch.field}`;
}

export function applyPlanAgentPatch(inputPlan: ReleasePlan, inputPatch: PlanAgentPatch) {
  const plan = clonePlan(ReleasePlanSchema.parse(inputPlan));
  const patch = PlanAgentPatchSchema.parse(inputPatch);
  if (patch.scope === "global") {
    const value = globalFieldSchemas[patch.field].parse(patch.value);
    (plan as unknown as Record<string, unknown>)[patch.field] = value;
  } else if (patch.scope === "symbiosis") {
    const symbiosis = plan.characterSymbiosisRelease.find((item) => item.regionId === patch.regionId);
    if (!symbiosis) throw new GlmError(`找不到区域 ${patch.regionId} 的角色共生发行方案。`, 400);
    const value = symbiosisFieldSchemas[patch.field].parse(patch.value);
    (symbiosis as unknown as Record<string, unknown>)[patch.field] = value;
  } else {
    const region = plan.regions.find((item) => item.regionId === patch.regionId);
    if (!region) throw new GlmError(`找不到区域 ${patch.regionId}。`, 400);
    if (patch.scope === "region") {
      const value = regionFieldSchemas[patch.field].parse(patch.value);
      (region as unknown as Record<string, unknown>)[patch.field] = value;
    } else {
      const character = region.characterRelease[patch.characterIndex];
      if (!character) throw new GlmError(`找不到 ${region.regionName} 的第 ${patch.characterIndex + 1} 个角色方案。`, 400);
      if (patch.expectedCharacter && character.character !== patch.expectedCharacter) {
        throw new GlmError(`角色定位冲突：期望“${patch.expectedCharacter}”，当前为“${character.character}”。`, 409);
      }
      const value = characterFieldSchemas[patch.field].parse(patch.value);
      (character as unknown as Record<string, unknown>)[patch.field] = value;
    }
  }
  return ReleasePlanSchema.parse(plan);
}

function now() {
  return new Date().toISOString();
}

function parseRecord(value: string) {
  if (!value) return null;
  try {
    return PlanAgentRunRecordSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export async function getPlanAgentHistory(limit = 20) {
  await ensureDb();
  const rows = await db.select().from(jobs).where(eq(jobs.type, "plan_agent")).orderBy(desc(jobs.createdAt)).limit(Math.min(50, Math.max(1, limit)));
  return rows.map((row) => parseRecord(row.result)).filter((record): record is PlanAgentRunRecord => Boolean(record));
}

async function saveRun(record: PlanAgentRunRecord, status: "processing" | "completed" | "failed", phase: PlanAgentPhase, error = "") {
  const progress = status === "completed" ? 100 : status === "failed" ? Math.max(5, Math.min(95, 20 + record.patches.length * 8)) : Math.max(5, Math.min(90, 15 + record.patches.length * 8));
  await db.update(jobs).set({ status, phase, progress, result: JSON.stringify(record), error, updatedAt: record.updatedAt }).where(eq(jobs.id, record.runId));
}

function sourceSearch(citationsValue: ResearchCitation[], input: { query: string; regionId?: string; dimension?: string; limit: number }) {
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  return citationsValue
    .filter((source) => !input.regionId || input.regionId === "all" || source.regionId === input.regionId)
    .filter((source) => !input.dimension || input.dimension === "all" || source.dimension === input.dimension)
    .map((source) => {
      const haystack = `${source.id} ${source.title} ${source.publisher} ${source.snippet} ${source.query}`.toLowerCase();
      return { source, score: terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) };
    })
    .filter((entry) => !terms.length || entry.score > 0)
    .sort((left, right) => right.score - left.score || right.source.publishedAt.localeCompare(left.source.publishedAt))
    .slice(0, input.limit)
    .map(({ source }) => source);
}

function planSection(plan: ReleasePlan, input: { scope: "global" | "region" | "character" | "symbiosis"; regionId?: string; characterIndex?: number }) {
  if (input.scope === "global") return {
    globalAxis: plan.globalAxis,
    globalPrinciples: plan.globalPrinciples,
    commonMoments: plan.commonMoments,
    globalKpis: plan.globalKpis,
  };
  if (input.scope === "symbiosis") {
    const symbiosis = plan.characterSymbiosisRelease.find((item) => item.regionId === input.regionId);
    if (!symbiosis) throw new GlmError(`找不到区域 ${input.regionId || "(空)"} 的角色共生发行方案。`, 400);
    return symbiosis;
  }
  const region = plan.regions.find((item) => item.regionId === input.regionId);
  if (!region) throw new GlmError(`找不到区域 ${input.regionId || "(空)"}。`, 400);
  if (input.scope === "character") {
    const character = region.characterRelease[input.characterIndex || 0];
    if (!character) throw new GlmError("找不到指定角色方案。", 400);
    return character;
  }
  return region;
}

const tools: GlmFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "read_plan_section",
      description: "读取当前发行文档的全球、区域或角色章节。修改前必须先读取目标章节。",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["global", "region", "character", "symbiosis"] },
          regionId: { type: "string" },
          characterIndex: { type: "integer", minimum: 0 },
        },
        required: ["scope"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_existing_sources",
      description: "优先检索已经研究并保存的真实来源。只有不足时才联网。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 160 },
          regionId: { type: "string" },
          dimension: { type: "string", enum: ["all", "player", "market", "sentiment", "culture", "manual"] },
          limit: { type: "integer", minimum: 1, maximum: 12 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search_public_facts",
      description: "现有来源不足时检索公开事实。不得用于虚构内部预算、KPI或经营目标。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 70 },
          regionId: { type: "string" },
          dimension: { type: "string", enum: ["player", "market", "sentiment", "culture", "manual"] },
          recency: { type: "string", enum: ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"] },
          count: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_plan_patch",
      description: "应用经过说明的结构化字段替换。调用前必须读取每个目标章节。可一次修改多个相关字段，但不得改 regionId、regionName、generatedAt 或执行外部动作。",
      parameters: {
        type: "object",
        properties: {
          patches: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              properties: {
                scope: { type: "string", enum: ["global", "region", "character", "symbiosis"], description: "修改全局、区域、传统角色或角色共生章节。" },
                regionId: { type: "string", description: "region/character 必填，必须来自区域索引。" },
                characterIndex: { type: "integer", minimum: 0, description: "character 必填。" },
                expectedCharacter: { type: "string", description: "character 建议填写，用于避免角色错位。" },
                field: { type: "string", enum: Array.from(new Set([...PlanAgentGlobalFieldSchema.options, ...PlanAgentRegionFieldSchema.options, ...PlanAgentCharacterFieldSchema.options, ...PlanAgentSymbiosisFieldSchema.options])) },
                value: { description: "字段的新值。文本字段用字符串；列表字段用字符串数组；timeline/channels/tasks 使用对应结构化对象数组。" },
                reason: { type: "string", minLength: 2, maxLength: 500 },
                sourceIds: { type: "array", maxItems: 24, items: { type: "string" }, description: "实际支持本次修改的来源编号；不需要来源时传空数组。" },
              },
              required: ["scope", "field", "value", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["patches"],
        additionalProperties: false,
      },
    },
  },
];

function phaseLabel(phase: PlanAgentPhase) {
  return {
    thinking: "分析指令与修改范围",
    reading: "读取发行文档",
    searching_sources: "检索已有来源",
    searching_web: "联网补充公开事实",
    editing: "应用结构化修改",
    saving: "校验并保存",
    completed: "文档修改完成",
    failed: "修改中断",
    undone: "修改已撤销",
  }[phase];
}

export async function runPlanAgent(inputValue: PlanAgentRequest, emit: Emit) {
  await ensureDb();
  const input = PlanAgentRequestSchema.parse(inputValue);
  const [active] = await db.select().from(jobs).where(and(eq(jobs.type, "plan_agent"), eq(jobs.status, "processing"))).limit(1);
  if (active) throw new GlmError("已有文档 Agent 正在运行，请等待完成。", 409);

  const runId = `plan-agent-${randomUUID()}`;
  const startedAt = now();
  let workingPlan = clonePlan(input.plan);
  let allSources = await getCitations();
  const regions = await getRegions();
  const recentHistory = (await getPlanAgentHistory(6)).filter((record) => record.runId !== runId);
  const pendingSources = new Map<string, ResearchCitation>();
  const readTargets = new Set<string>();
  let webSearchCount = 0;
  let patchCount = 0;
  const toolLog: PlanAgentToolLog[] = [];
  const patches: PlanAgentPatch[] = [];
  const usedSourceIds = new Set<string>();
  let record: PlanAgentRunRecord = {
    version: 1,
    runId,
    userMessage: input.message,
    assistantSummary: "",
    activeRegionId: input.activeRegionId,
    beforePlan: clonePlan(input.plan),
    afterPlan: clonePlan(input.plan),
    beforeFingerprint: planFingerprint(input.plan),
    afterFingerprint: planFingerprint(input.plan),
    patches: [],
    toolLog: [],
    sourceIds: [],
    startedAt,
    updatedAt: startedAt,
    error: "",
    undoneAt: "",
  };

  await db.insert(jobs).values({
    id: runId,
    projectId: "current",
    type: "plan_agent",
    scopeId: input.activeRegionId || "global",
    status: "processing",
    progress: 5,
    phase: "thinking",
    result: JSON.stringify(record),
    createdAt: startedAt,
    updatedAt: startedAt,
  });
  emit({ type: "started", runId });
  emit({ type: "phase", phase: "thinking", label: phaseLabel("thinking") });

  const logTool = (name: string, label: string, count = 0) => {
    toolLog.push({ name, label, count, at: now() });
  };

  const emitPhase = async (phase: PlanAgentPhase) => {
    emit({ type: "phase", phase, label: phaseLabel(phase) });
    await db.update(jobs).set({ phase, updatedAt: now() }).where(eq(jobs.id, runId));
  };

  const persistPendingSource = async (sourceId: string) => {
    const existing = allSources.find((source) => source.id === sourceId);
    if (existing) return existing.id;
    const pending = pendingSources.get(sourceId);
    if (!pending) return "";
    const duplicate = allSources.find((source) => source.url === pending.url);
    if (duplicate) return duplicate.id;
    await db.insert(citations).values({
      id: pending.id,
      projectId: "current",
      regionId: pending.regionId,
      dimension: pending.dimension,
      title: pending.title,
      url: pending.url,
      publisher: pending.publisher,
      publishedAt: pending.publishedAt,
      snippet: pending.snippet,
      query: pending.query,
      manual: false,
      origin: "agent",
      createdAt: now(),
    });
    allSources = [...allSources, pending];
    return pending.id;
  };

  try {
    logTool("thinking", "启用 GLM 深度推理");
    const answer = await chatJsonWithTools(
      AgentAnswerSchema,
      "你是 ReHoYo 发行文档编辑 Agent。请在内部完成任务分解与推理，不要输出私有思维链。若用户只是问候、闲聊或指令不够明确，不得调用修改工具，也不得编造修改；直接在 summary 中简短回应，并询问要修改的区域、章节和目标。收到明确修改指令后，按顺序执行：识别目标章节；调用 read_plan_section 读取每个目标；检索已有来源；仅在公开事实证据不足时联网；调用 apply_plan_patch 提交最小且完整的字段修改；检查工具返回并在有 retryable 错误时自行纠正。保持全球主轴与区域差异一致，保留没有被要求修改的字段。禁止修改版本资料、区域研究、标识字段或声称执行了发布、投放、私信、KOL 联络。最终 JSON 必须包含非空 summary；未修改时说明文档未变化。",
      `用户指令：${input.message}\n当前上下文区域：${input.activeRegionId || "全球主轴"}\n区域索引：${JSON.stringify(regions.map((region) => ({ id: region.id, name: region.name })))}\n最近对话摘要：${JSON.stringify(recentHistory.map((item) => ({ user: item.userMessage, assistant: item.assistantSummary })).slice(0, 6))}`,
      tools,
      async (name, argumentsValue) => {
        if (name === "read_plan_section") {
          const args = z.object({ scope: z.enum(["global", "region", "character", "symbiosis"]), regionId: z.string().optional(), characterIndex: z.number().int().nonnegative().optional() }).parse(argumentsValue);
          await emitPhase("reading");
          const section = planSection(workingPlan, args);
          const target = args.scope === "global" ? "global" : args.scope === "region" ? `region:${args.regionId}` : args.scope === "symbiosis" ? `symbiosis:${args.regionId}` : `character:${args.regionId}:${args.characterIndex || 0}`;
          readTargets.add(target);
          logTool(name, `读取${args.scope === "global" ? "全球主轴" : args.regionId || "区域"}`);
          return section;
        }
        if (name === "search_existing_sources") {
          await emitPhase("searching_sources");
          const args = z.object({ query: z.string().min(1).max(160), regionId: z.string().optional(), dimension: z.string().optional(), limit: z.number().int().min(1).max(12).default(8) }).parse(argumentsValue);
          const found = sourceSearch(allSources, args);
          logTool(name, `检索已有来源：${args.query}`, found.length);
          return found;
        }
        if (name === "web_search_public_facts") {
          webSearchCount += 1;
          if (webSearchCount > 3) throw new GlmError("本轮联网搜索已达到 3 次上限。", 400);
          await emitPhase("searching_web");
          const args = z.object({
            query: z.string().min(1).max(70),
            regionId: z.string().default(input.activeRegionId || "global"),
            dimension: z.enum(["player", "market", "sentiment", "culture", "manual"]).default("manual"),
            recency: z.enum(["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"]).default("oneYear"),
            count: z.number().int().min(1).max(5).default(5),
          }).parse(argumentsValue);
          const results = await searchWeb(args.query, { count: args.count, recency: args.recency, contentSize: "high" });
          const sources = results.flatMap((result) => {
            try { new URL(result.link); } catch { return []; }
            const source: ResearchCitation = {
              id: `AG-${randomUUID().slice(0, 8).toUpperCase()}`,
              regionId: args.regionId || "global",
              dimension: args.dimension,
              title: result.title,
              url: result.link,
              publisher: result.media || "",
              publishedAt: result.publish_date || "",
              snippet: result.content || "",
              query: args.query,
              manual: false,
              origin: "agent",
            };
            pendingSources.set(source.id, source);
            emit({ type: "source", source });
            return [source];
          });
          logTool(name, `联网检索：${args.query}`, sources.length);
          return sources;
        }
        if (name === "apply_plan_patch") {
          await emitPhase("editing");
          const parsedArgs = z.object({ patches: z.array(PlanAgentPatchSchema).min(1).max(24) }).safeParse(argumentsValue);
          if (!parsedArgs.success) {
            const error = parsedArgs.error.message.slice(0, 1_200);
            logTool(name, "补丁参数校验失败");
            return { applied: 0, retryable: true, error: `补丁结构无效：${error}` };
          }
          const args = parsedArgs.data;
          patchCount += args.patches.length;
          if (patchCount > 24) throw new GlmError("本轮字段修改超过 24 项，请拆分指令。", 400);
          const unreadTargets = args.patches.flatMap((patch) => {
            const target = patch.scope === "global" ? "global" : patch.scope === "region" ? `region:${patch.regionId}` : patch.scope === "symbiosis" ? `symbiosis:${patch.regionId}` : `character:${patch.regionId}:${patch.characterIndex}`;
            return readTargets.has(target) ? [] : [target];
          });
          if (unreadTargets.length) {
            const targets = Array.from(new Set(unreadTargets));
            logTool(name, `拒绝未读取章节：${targets.join("、")}`);
            return { applied: 0, retryable: true, error: `请先调用 read_plan_section 读取这些目标：${targets.join("、")}` };
          }
          try {
            let candidate = workingPlan;
            for (const rawPatch of args.patches) candidate = applyPlanAgentPatch(candidate, rawPatch);
            ReleasePlanSchema.parse(candidate);
          } catch (error) {
            const message = (error as Error).message.slice(0, 1_200);
            logTool(name, "补丁内容校验失败");
            return { applied: 0, retryable: true, error: `补丁未应用：${message}` };
          }
          const staged: Array<{ patch: PlanAgentPatch; plan: ReleasePlan }> = [];
          for (const rawPatch of args.patches) {
            const sourceIds = (await Promise.all(rawPatch.sourceIds.map(persistPendingSource))).filter(Boolean);
            sourceIds.forEach((id) => usedSourceIds.add(id));
            const patch = PlanAgentPatchSchema.parse({ ...rawPatch, sourceIds });
            workingPlan = applyPlanAgentPatch(workingPlan, patch);
            workingPlan = ReleasePlanSchema.parse({ ...workingPlan, sourceIds: Array.from(new Set([...workingPlan.sourceIds, ...sourceIds])) });
            patches.push(patch);
            staged.push({ patch, plan: clonePlan(workingPlan) });
          }
          await emitPhase("saving");
          await setPlan(workingPlan, "needs_review");
          record = PlanAgentRunRecordSchema.parse({
            ...record,
            afterPlan: clonePlan(workingPlan),
            afterFingerprint: planFingerprint(workingPlan),
            patches: [...patches],
            toolLog: [...toolLog],
            sourceIds: [...usedSourceIds],
            updatedAt: now(),
          });
          await saveRun(record, "processing", "saving");
          staged.forEach((item) => emit({ type: "patch", patch: item.patch, plan: item.plan, highlightKey: planAgentHighlightKey(item.patch) }));
          logTool(name, `应用 ${args.patches.length} 项字段修改`, args.patches.length);
          return { applied: args.patches.length, sourceIds: [...usedSourceIds] };
        }
        throw new GlmError(`未知工具：${name}`, 400);
      },
      { maxRounds: 6, maxToolCalls: 10, maxToolResultChars: 50_000, maxTokens: 12_000, thinking: true, reasoningEffort: "high" },
    );

    const assistantSummary = normalizePlanAgentSummary(answer.summary, patches.length);

    record = PlanAgentRunRecordSchema.parse({
      ...record,
      assistantSummary,
      afterPlan: clonePlan(workingPlan),
      afterFingerprint: planFingerprint(workingPlan),
      patches: [...patches],
      toolLog: [...toolLog],
      sourceIds: [...usedSourceIds],
      updatedAt: now(),
    });
    await saveRun(record, "completed", "completed");
    emit({ type: "phase", phase: "completed", label: phaseLabel("completed") });
    emit({ type: "done", record });
    return record;
  } catch (error) {
    const message = (error as Error).message || "文档 Agent 运行失败。";
    record = PlanAgentRunRecordSchema.parse({
      ...record,
      afterPlan: clonePlan(workingPlan),
      afterFingerprint: planFingerprint(workingPlan),
      patches: [...patches],
      toolLog: [...toolLog],
      sourceIds: [...usedSourceIds],
      error: message,
      updatedAt: now(),
    });
    await saveRun(record, "failed", "failed", message);
    emit({ type: "phase", phase: "failed", label: phaseLabel("failed") });
    emit({ type: "error", message, runId, partialApplied: patches.length > 0, canUndo: patches.length > 0 });
    return record;
  }
}

export async function undoPlanAgentRun(runId: string) {
  await ensureDb();
  const [row] = await db.select().from(jobs).where(and(eq(jobs.id, runId), eq(jobs.type, "plan_agent"))).limit(1);
  const record = row ? parseRecord(row.result) : null;
  if (!record) throw new GlmError("找不到该文档 Agent 记录。", 404);
  if (record.undoneAt) throw new GlmError("该次修改已经撤销。", 409);
  const project = await getProject();
  if (!project.plan) throw new GlmError("当前没有发行方案。", 409);
  if (planFingerprint(project.plan) !== record.afterFingerprint) {
    throw new GlmError("方案在本次 Agent 修改后又发生了变化，无法安全撤销。", 409);
  }
  const restored = await setPlan(record.beforePlan, "needs_review");
  const nextRecord = PlanAgentRunRecordSchema.parse({ ...record, undoneAt: now(), updatedAt: now() });
  await saveRun(nextRecord, "completed", "undone");
  return { project: restored, record: nextRecord };
}
