import {
  CharacterReleasePlanSchema,
  CharacterSymbiosisTaskSchema,
  GlobalReleaseAxisSchema,
  RegionAnalysisSchema,
  RegionalDifferentiationSchema,
  RegionalCharacterSymbiosisPlanSchema,
  RegionReleasePlanSchema,
  ReleasePlanSchema,
  VersionBriefSchema,
  type GlobalReleaseAxis,
  type ProjectSnapshot,
  type RegionConfig,
  type RegionReleasePlan,
  type RegionalCharacterSymbiosisPlan,
  type ResearchCitation,
  type ReleasePlan,
  type VersionBrief,
} from "@/lib/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { chatJson, searchWeb } from "@/lib/glm";
import { chunkText } from "@/lib/files";
import { normalizeResearchCitationIds } from "@/lib/research-citations";
import { canonicalizeUrl, stableHash } from "@/lib/governance";

const jsonShape = {
  brief: "executiveSummary:string, dataFreezeDate:YYYY-MM-DD, goals:string[], sellingPoints:string[], assetInventory:string[], businessExpectations:string[], characterProfiles:string[], constraints:string[], sourceFacts:{text:string,sourceId:string,locator:string,category:'goal'|'selling_point'|'asset'|'business'|'character'|'constraint'|'other'}[]",
  analysis: "playerSignals[], marketEnvironment[], sentimentAndCompetition[], culturalMoments[]；每条为 {text,citationIds[],confidence: high|medium|low}；另含 differentiators[], risks[], researchNote, generatedAt",
  plan: "globalAxis, globalPrinciples[], commonMoments[], globalKpis[], regions[], characterSymbiosisRelease[], sourceIds[], generatedAt；每个 region 保留既有字段；characterSymbiosisRelease 为可单独传给下游 Agent 的逐区域结构化模块",
};

export async function generateVersionBrief(project: ProjectSnapshot, sourceContent: Array<{ id: string; name: string; text: string }>): Promise<VersionBrief> {
  const freezeFact = sourceContent.flatMap((source) => {
    const match = source.text.match(/(?:数据冻结(?:时间|日期)?|data\s*freeze(?:\s*date)?)[^\d]{0,20}(20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})/i);
    return match ? [{ sourceId: source.id, date: `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` }] : [];
  })[0];
  const chunks = sourceContent.flatMap((source) => chunkText(source.text).map((text, index) => ({ sourceId: source.id, name: source.name, locator: `片段 ${index + 1}`, text }))).slice(0, 24);
  const locatorsBySource = new Map<string, string[]>();
  chunks.forEach((chunk) => locatorsBySource.set(chunk.sourceId, [...(locatorsBySource.get(chunk.sourceId) || []), chunk.locator]));
  const groups = chunks.length ? Array.from({ length: Math.ceil(chunks.length / 3) }, (_, index) => chunks.slice(index * 3, index * 3 + 3)) : [[]];
  const partials: VersionBrief[] = [];
  for (const group of groups) {
    const evidence = group.map((chunk) => `\n<SOURCE id="${chunk.sourceId}" name="${chunk.name}" locator="${chunk.locator}">\n${chunk.text}\n</SOURCE>`).join("\n");
    partials.push(await chatJson(
      VersionBriefSchema,
      "你是全球游戏发行策略团队的版本信息分析员。只提取输入中能够支持的事实，不补造版本功能、预算或角色设定。各内容数组应合并同义项，通常保留 3–8 条，每条尽量不超过 120 个汉字。sourceFacts 必须保留 sourceId 与定位说明；每条只承载一个可核验事实，并覆盖资料中实际出现的目标、卖点、资产、经营、角色与限制，通常输出 8–20 条。category 只能使用 goal、selling_point、asset、business、character、constraint、other 之一，禁止翻译或自创分类。locator 必须逐字复制 SOURCE 标签的 locator 属性，不得附加章节名或自行细化定位。",
      `请把结构化录入和内部资料整理成版本简报。JSON 字段：${jsonShape.brief}\n结构化录入：${JSON.stringify(project)}\n内部资料：${evidence || "无上传资料，仅使用结构化录入。"}`,
      { maxTokens: 8_000 },
    ));
  }
  const result = partials.length === 1 ? partials[0] : await chatJson(
    VersionBriefSchema,
    "你负责合并分段版本简报。去重、解决表述冲突，但不能增加分段结果中不存在的事实。各内容数组合并同义项后通常保留 3–8 条，每条尽量不超过 120 个汉字。sourceFacts 保持原子化并覆盖已有业务分类；必须原样保留 sourceFacts 的 sourceId 与 locator；category 只能使用 goal、selling_point、asset、business、character、constraint、other 之一。",
    `结构化录入：${JSON.stringify(project)}\n分段简报：${JSON.stringify(partials)}\n输出字段：${jsonShape.brief}`,
    { maxTokens: 9_000 },
  );
  const sourceFacts = result.sourceFacts.flatMap((fact) => {
    const allowedLocators = locatorsBySource.get(fact.sourceId);
    if (!allowedLocators?.length) return [];
    const locator = allowedLocators.find((item) => item === fact.locator)
      || allowedLocators.find((item) => fact.locator.startsWith(item));
    return locator ? [{ ...fact, locator }] : [];
  });
  const dataFreezeDate = freezeFact?.date || result.dataFreezeDate || "";
  const freezeSourceFact = freezeFact && !sourceFacts.some((fact) => fact.text.includes(freezeFact.date))
    ? [{ text: `数据冻结日期：${freezeFact.date}`, sourceId: freezeFact.sourceId, locator: locatorsBySource.get(freezeFact.sourceId)?.[0] || "片段 1", category: "other" as const }]
    : [];
  return { ...result, dataFreezeDate, sourceFacts: [...sourceFacts, ...freezeSourceFact] };
}

const dimensionDefinitions = [
  { key: "player", label: "当地玩家信号", range: "近 12 个月" },
  { key: "market", label: "市场环境", range: "近 12 个月" },
  { key: "sentiment", label: "舆情与竞品", range: "近 90 天" },
  { key: "culture", label: "文化节点", range: "未来 12 个月" },
] as const;

const localizedResearchTerms: Record<string, Record<(typeof dimensionDefinitions)[number]["key"], string>> = {
  cn: { player: "玩家行为", market: "游戏市场", sentiment: "玩家舆情竞品", culture: "文化节日档期" },
  jp: { player: "プレイヤー行動", market: "ゲーム市場", sentiment: "評判 競合", culture: "文化 イベント 時期" },
  kr: { player: "플레이어 행동", market: "게임 시장", sentiment: "여론 경쟁작", culture: "문화 행사 시기" },
  na: { player: "player behavior", market: "games market", sentiment: "sentiment competitors", culture: "cultural calendar" },
  eu: { player: "player behavior Europe", market: "games market Europe", sentiment: "sentiment competitors Europe", culture: "cultural calendar Europe" },
  sea: { player: "player behavior Southeast Asia", market: "games market Southeast Asia", sentiment: "sentiment competitors SEA", culture: "cultural calendar SEA" },
  hmt: { player: "玩家行為", market: "遊戲市場", sentiment: "玩家輿情競品", culture: "文化節日檔期" },
};

function detectSourceLanguage(value: string) {
  if (/[가-힯]/.test(value)) return "韩语";
  if (/[぀-ヿ]/.test(value)) return "日语";
  const visible = value.replace(/\s/g, "");
  if (visible && (visible.match(/[A-Za-z]/g)?.length || 0) / visible.length > 0.55) return "英语";
  if (/[㐀-鿿]/.test(value)) return "中文";
  return "未知";
}

function inferQualityTier(url: string, publisher: string): ResearchCitation["qualityTier"] {
  if (/\.(gov|go\.jp|go\.kr)(\.|\/|$)|政府|統計|统计/i.test(`${url} ${publisher}`)) return "primary";
  if (/reuters|bloomberg|nikkei|gamesindustry|newzoo|data\.ai|sensor tower/i.test(`${url} ${publisher}`)) return "authoritative";
  if (/reddit|forum|贴吧|5ch|dcinside/i.test(`${url} ${publisher}`)) return "community";
  return publisher ? "trade" : "unknown";
}

export function differentiationSentenceCount(value: string) {
  return value.split(/[。！？.!?]+/).map((sentence) => sentence.trim()).filter(Boolean).length;
}

const DifferentiationParagraphSchema = z.string()
  .min(180)
  .max(420)
  .refine((value) => differentiationSentenceCount(value) === 5, "DIFFERENTIATION 必须是恰好五句话的单段文字");

const RegionAnalysisGenerationSchema = RegionAnalysisSchema.extend({
  differentiators: z.array(DifferentiationParagraphSchema).max(0).default([]),
  differentiation: z.null().default(null),
});

const DifferentiationBundleSchema = z.object({
  regions: z.array(z.object({ regionId: z.string(), differentiation: RegionalDifferentiationSchema })),
});

export type PeerRegionDifferentiation = {
  name: string;
  differentiators: string[];
};

export type RegionResearchProgress = {
  phase: "searching" | "synthesizing";
  progress: number;
  dimension?: (typeof dimensionDefinitions)[number]["key"];
};

export async function researchRegion(
  project: ProjectSnapshot,
  brief: VersionBrief,
  region: RegionConfig,
  manualCitations: ResearchCitation[] = [],
  onProgress?: (progress: RegionResearchProgress) => void | Promise<void>,
  peerRegions: PeerRegionDifferentiation[] = [],
  researchRunId: string = randomUUID(),
) {
  const date = project.evidenceMode === "campaign_cutoff" ? project.evidenceCutoff.slice(0, 10) : new Date().toISOString().slice(0, 10);
  let completedSearches = 0;
  const searches = await Promise.all(dimensionDefinitions.map(async (dimension) => {
    const term = localizedResearchTerms[region.code]?.[dimension.key] || `${region.language} ${dimension.label}`;
    const query = `${region.name} ${term} ${project.gameName} ${project.versionName} ${date}`.slice(0, 70);
    const results = await searchWeb(query);
    completedSearches += 1;
    await onProgress?.({ phase: "searching", dimension: dimension.key, progress: 10 + completedSearches * 14 });
    return { dimension, query, results };
  }));
  const deduped = new Map<string, ResearchCitation>(manualCitations.map((item) => [canonicalizeUrl(item.url), item]));
  let serial = 1;
  for (const search of searches) {
    for (const item of search.results) {
      if (!item.link) continue;
      let canonicalUrl: string;
      try { canonicalUrl = canonicalizeUrl(item.link); } catch { continue; }
      if (deduped.has(canonicalUrl)) continue;
      if (project.evidenceMode === "campaign_cutoff" && item.publish_date && new Date(item.publish_date).getTime() > new Date(project.evidenceCutoff).getTime()) continue;
      const retrievedAt = new Date().toISOString();
      const displayId = `${region.code.toUpperCase()}-S${String(serial++).padStart(3, "0")}`;
      deduped.set(canonicalUrl, {
        id: randomUUID(),
        displayId,
        researchRunId,
        canonicalSourceId: stableHash(canonicalUrl),
        regionId: region.id,
        dimension: search.dimension.key,
        title: item.title || item.link,
        url: item.link,
        publisher: item.media || "",
        publishedAt: item.publish_date || "",
        snippet: item.content || "",
        query: search.query,
        manual: false,
        origin: "research",
        retrievedAt,
        contentHash: stableHash(`${item.title}\n${item.content}\n${item.publish_date || ""}`),
        language: detectSourceLanguage(`${item.title} ${item.content}`),
        marketScope: region.code,
        qualityTier: inferQualityTier(canonicalUrl, item.media || ""),
      });
    }
  }
  const citationList = Array.from(deduped.values()).slice(0, 28);
  if (!citationList.length) throw new Error("联网检索未返回可引用来源，请调整区域备注后重试。");
  await onProgress?.({ phase: "synthesizing", progress: 76 });
  const regionalBrief = {
    executiveSummary: brief.executiveSummary,
    goals: brief.goals,
    sellingPoints: brief.sellingPoints,
    assetInventory: brief.assetInventory,
    businessExpectations: brief.businessExpectations,
    characterProfiles: brief.characterProfiles,
    constraints: brief.constraints,
  };
  const currentRegionContext = {
    id: region.id,
    code: region.code,
    name: region.name,
    language: region.language,
    timezone: region.timezone,
    note: region.note,
  };
  const differentiationRules = [
    "differentiators 必须只包含一个字符串，该字符串是恰好五句话、180—420 字的连续段落，不得使用列表、换行或小标题。",
    "五句话采用完全一致的结构：第1句写本区独有的玩家动机或行为，第2句写本区独有的渠道或平台生态，第3句写本区独有的文化语境或时间节点，第4句写本区独有的竞争或商业约束，第5句必须点名至少一个其他已选区域并说明本区应采取的不同发行取舍。",
    "每句话只承载一个主题；不要复述其他区域已经使用的主题、案例、产品或技术名词。某主题若在两个或更多区域都成立，它是共同背景，不得写入 DIFFERENTIATION。",
    "Apple Metal、Vision Pro 等平台技术不得作为差异点，除非公开来源证明它只对本区具有决定性影响，且同行区域差异段落没有使用该主题。",
    "五句话的长度应尽量均衡，并只写由本区公开来源支持的具体差异。",
  ].join("\n");
  const governedClaimRules = "每个 ResearchClaim 必须同时填写 requirementIds、citationIds 和 citationSnapshotIds。requirementIds 只能逐字复制 HUMAN CONTRACT 的稳定 ID；两个 citation 字段必须包含相同的不可变证据快照 UUID。当前阶段不得生成区域差异，differentiators 返回 []、differentiation 返回 null。";
  const analysis = await chatJson(
    RegionAnalysisGenerationSchema,
    `你是游戏全球发行研究员。版本简报只提供背景，不能作为区域判断的引用。所有判断都必须且只能引用“公开来源”中的 id，不能引用其他 UUID、创造 URL 或创造编号。citationIds 数组中的每一项只能放一个完整 id，必须逐字复制，不得把多个编号合并成一项。JSON 字段：${jsonShape.analysis}\n${differentiationRules}\n${governedClaimRules}`,
    `HUMAN CONTRACT：${JSON.stringify(project.humanContract)}\n版本简报（无引用编号）：${JSON.stringify(regionalBrief)}\n当前区域（不含旧分析，禁止沿用旧差异点）：${JSON.stringify(currentRegionContext)}\n其他已选区域及其已有差异段落（仅用于识别和排除重复主题）：${JSON.stringify(peerRegions)}\n公开来源（唯一允许引用的证据）：${JSON.stringify(citationList)}\n只生成证据支持的候选判断，不生成差异段落。`,
    { maxTokens: 9_000, maxAttempts: 3, repairInstruction: "修复全部结构、引用和人工约束关联错误；只能复用给定证据快照 ID，不得发明事实或证据。" },
  );
  const unresolved = new Set<string>();
  const normalizeClaims = (claims: typeof analysis.playerSignals) => claims.map((claim) => {
    const normalized = normalizeResearchCitationIds(claim.citationIds, citationList);
    normalized.unresolved.forEach((id) => unresolved.add(id));
    return { ...claim, citationIds: normalized.ids, citationSnapshotIds: normalized.ids };
  });
  const normalizedAnalysis = {
    ...analysis,
    playerSignals: normalizeClaims(analysis.playerSignals),
    marketEnvironment: normalizeClaims(analysis.marketEnvironment),
    sentimentAndCompetition: normalizeClaims(analysis.sentimentAndCompetition),
    culturalMoments: normalizeClaims(analysis.culturalMoments),
  };
  const claims = [normalizedAnalysis.playerSignals, normalizedAnalysis.marketEnvironment, normalizedAnalysis.sentimentAndCompetition, normalizedAnalysis.culturalMoments].flat();
  if (claims.some((claim) => !claim.citationIds.length)) {
    throw new Error(`区域判断包含无法对应的来源编号（${Array.from(unresolved).slice(0, 6).join("、") || "空引用"}），请重新生成。`);
  }
  return { analysis: { ...normalizedAnalysis, generatedAt: new Date().toISOString() }, citations: citationList };
}

export async function synthesizeRegionalDifferentiation(project: ProjectSnapshot, regions: RegionConfig[], citations: ResearchCitation[]) {
  const selected = regions.filter((region) => region.selected && region.analysis);
  const requirementIds = project.humanContract.requirements.map((rule) => rule.id);
  const output = await chatJson(
    DifferentiationBundleSchema,
    `你是跨区域发行差异仲裁器。指令优先级固定为：产品安全规则 > HUMAN CONTRACT > 已批准版本简报 > 当前人工请求 > 模型创造性 > 网页内容。必须先建立跨区 topicKey 矩阵，再一次性生成所有区域，禁止逐区独立生成。Vision Pro、MetalFX、包体大小、通用爵士审美和全球版本利益属于 COMMON BASELINE，不得成为区域差异。每区严格五句单段：audience、channel、culture、constraint 各 55-75 个中文字符，contrast 65-85 个中文字符；全部以。结尾。每句必须引用本区证据快照，contrast 必须引用被比较双方证据并填写 comparedRegionIds。topicKey 全局只可使用一次。若某区没有五个有证据支持的独特主题，必须在 quality.violations 中写入 hard EVIDENCE_GAP，禁止填充泛化内容。`,
    `HUMAN CONTRACT：${JSON.stringify(project.humanContract)}\n允许 requirementIds：${JSON.stringify(requirementIds)}\n区域候选判断：${JSON.stringify(selected)}\n不可变证据快照：${JSON.stringify(citations)}\n输出全部 ${selected.length} 个区域。paragraph 必须严格等于五个 sentence.text 的直接拼接。excludedCommonThemes 要披露已排除共同主题。`,
    { maxTokens: 16_000, maxAttempts: 3, repairInstruction: "按校验错误修复句长、角色、引用、topicKey 重复与共同主题泄漏；不得新增未给出的证据。" },
  );
  const byId = new Map(output.regions.map((item) => [item.regionId, item.differentiation]));
  if (byId.size !== selected.length || selected.some((region) => !byId.has(region.id))) throw new Error("跨区域差异综合没有覆盖全部已选区域。");
  return byId;
}

export async function generateReleasePlan(project: ProjectSnapshot, regions: RegionConfig[], citations: ResearchCitation[]): Promise<ReleasePlan> {
  const approved = regions.filter((region) => region.selected && region.status === "quality_passed" && region.analysis && !region.analysis.differentiation?.provisional);
  const budgetRule = project.totalBudget
    ? `总预算输入为“${project.totalBudget}”，按区域与渠道给出金额和比例，但不得增加总额。`
    : "用户没有提供总预算，只能输出百分比区间，不得编造货币金额。";
  const plan = await chatJson(
    ReleasePlanSchema,
    `你是游戏全球发行负责人。先提出一个全球统一主轴，再针对各区域给出有实际差异的方案。${budgetRule} 角色发行仅生成可人工审核的任务草案，不得声称已发布、已联系或已投放。JSON 字段：${jsonShape.plan}。characterRelease 每项必须符合字段 ${Object.keys(CharacterReleasePlanSchema.shape).join(", ")}。`,
    `项目：${JSON.stringify(project)}\n已审核区域判断：${JSON.stringify(approved)}\n可用来源：${JSON.stringify(citations)}\n计划窗口：T${project.campaignStartWeek} 至 T+${project.campaignEndWeek}，输出周级时间表。`,
    { creative: true, maxTokens: 16_000 },
  );
  const selectedIds = new Set(approved.map((region) => region.id));
  if (plan.regions.some((region) => !selectedIds.has(region.regionId))) {
    throw new Error("发行方案返回了未审核区域，请重新生成。");
  }
  const returnedIds = new Set(plan.regions.map((region) => region.regionId));
  if (returnedIds.size !== selectedIds.size || Array.from(selectedIds).some((id) => !returnedIds.has(id))) {
    throw new Error("发行方案没有覆盖全部已审核区域，请重新生成。");
  }
  const validSourceIds = new Set(citations.map((source) => source.id));
  return { ...plan, sourceIds: plan.sourceIds.filter((id) => validSourceIds.has(id)), generatedAt: new Date().toISOString() };
}

export function parsePlanChannel(value: string) {
  const [channel = "", frequency = "", role = ""] = value.split(/\s*[|｜]\s*/);
  return { channel, frequency, role };
}

export function parsePlanTask(value: string) {
  const [time = "", action = "", asset = "", successSignal = ""] = value.split(/\s*[|｜]\s*/);
  return { time, action, asset, successSignal };
}

export function parsePlanList(value: string) {
  return value.split(/\r?\n|[；;]/).map((item) => item.trim()).filter(Boolean);
}

export function formatPlanListItem(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatPlanListItem).filter(Boolean).join("、");
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${key}：${formatPlanListItem(item)}`).join("；");
  }
  return "";
}

const FlexibleStringListSchema = z.union([
  z.array(z.unknown()).transform((items) => items.map(formatPlanListItem).filter(Boolean)),
  z.string().transform(parsePlanList),
]);

const FlexibleChannelSchema = z.union([
  CharacterReleasePlanSchema.shape.channels.element,
  z.string().transform(parsePlanChannel),
]);
const FlexibleTaskSchema = z.union([
  CharacterReleasePlanSchema.shape.tasks.element,
  z.string().transform(parsePlanTask),
]);
const FlexibleCharacterReleasePlanSchema = CharacterReleasePlanSchema.extend({
  voiceRules: FlexibleStringListSchema,
  contentArc: FlexibleStringListSchema,
  channels: z.union([z.array(FlexibleChannelSchema), z.string().transform((value) => parsePlanList(value).map(parsePlanChannel))]),
  tasks: z.union([z.array(FlexibleTaskSchema), z.string().transform((value) => parsePlanList(value).map(parsePlanTask))]),
  assetDependencies: FlexibleStringListSchema,
  sampleTopics: FlexibleStringListSchema,
  guardrails: FlexibleStringListSchema,
});
const FlexibleCharacterSymbiosisTaskSchema = CharacterSymbiosisTaskSchema.extend({
  metrics: z.array(z.object({
    name: z.string().min(1),
    target: z.string().min(1),
    measurementWindow: z.string().min(1).default("计划周期内"),
  })).min(1),
});
const FlexibleRegionalCharacterSymbiosisPlanSchema = RegionalCharacterSymbiosisPlanSchema.extend({
  targetPlayerGroups: FlexibleStringListSchema,
  characterSuitableVersionMessages: FlexibleStringListSchema,
  communicationEntryPointsAndScenes: FlexibleStringListSchema,
  recommendedTimingAndFrequency: FlexibleStringListSchema,
  toneExpressionAndCulturalNotes: FlexibleStringListSchema,
  prohibitedBehaviorsAndRiskBoundaries: FlexibleStringListSchema,
  expectedEffectsAndMetrics: FlexibleStringListSchema,
  characterTasks: z.array(FlexibleCharacterSymbiosisTaskSchema).min(1),
});
const FlexibleRegionReleasePlanSchema = RegionReleasePlanSchema.extend({
  materialStrategy: FlexibleStringListSchema,
  socialCadence: FlexibleStringListSchema,
  kolPlan: FlexibleStringListSchema,
  paidMedia: FlexibleStringListSchema,
  partnerships: FlexibleStringListSchema,
  kpis: FlexibleStringListSchema,
  budget: FlexibleStringListSchema,
  riskNotes: FlexibleStringListSchema,
  characterRelease: z.array(FlexibleCharacterReleasePlanSchema),
});
const RegionReleasePlanWithSourcesSchema = FlexibleRegionReleasePlanSchema.extend({
  sourceIds: ReleasePlanSchema.shape.sourceIds,
  characterSymbiosis: FlexibleRegionalCharacterSymbiosisPlanSchema,
});
const RegionReleasePlanDraftSchema = z.union([
  RegionReleasePlanWithSourcesSchema,
  z.object({ region: FlexibleRegionReleasePlanSchema, sourceIds: ReleasePlanSchema.shape.sourceIds, characterSymbiosis: FlexibleRegionalCharacterSymbiosisPlanSchema }).transform(({ region, sourceIds, characterSymbiosis }) => ({ ...region, sourceIds, characterSymbiosis })),
  z.object({ regions: z.array(FlexibleRegionReleasePlanSchema).length(1), sourceIds: ReleasePlanSchema.shape.sourceIds, characterSymbiosis: FlexibleRegionalCharacterSymbiosisPlanSchema }).transform(({ regions, sourceIds, characterSymbiosis }) => ({ ...regions[0], sourceIds, characterSymbiosis })),
]);

export async function generateGlobalReleaseAxis(
  project: ProjectSnapshot,
  regions: RegionConfig[],
  citations: ResearchCitation[],
): Promise<GlobalReleaseAxis> {
  const approved = regions.filter((region) => region.selected && region.status === "quality_passed" && region.analysis && !region.analysis.differentiation?.provisional);
  if (!approved.length) throw new Error("没有可用于生成全球主轴的已审核区域。");
  const validSourceIds = new Set(citations.map((source) => source.id));
  const compactProject = {
    gameName: project.gameName,
    versionName: project.versionName,
    launchDate: project.launchDate,
    campaignStartWeek: project.campaignStartWeek,
    campaignEndWeek: project.campaignEndWeek,
    objective: project.objective,
    sellingPoints: project.sellingPoints,
    businessGoal: project.businessGoal,
    kpis: project.kpis,
    constraints: project.constraints,
  };
  const compactRegions = approved.map((region) => ({ id: region.id, name: region.name, differentiation: region.analysis?.differentiation?.paragraph }));
  const compactCitations = citations.slice(0, 48).map((source) => ({ id: source.id, regionId: source.regionId, title: source.title, publisher: source.publisher, publishedAt: source.publishedAt }));
  const global = await chatJson(
    GlobalReleaseAxisSchema,
    "你是游戏全球发行负责人。只生成跨区域共用的全球主轴，不要提前写区域执行细节。globalAxis 必须是 180–360 个汉字的一段摘要，不得展开逐周计划。globalPrinciples、commonMoments、globalKpis 各输出 3–6 条，每条不超过 100 个汉字。所有 sourceIds 必须逐字复制自可用来源；无法引用时使用空数组。角色发行仅作为人工审核方案，不得声称已执行外部动作。务必保持 JSON 简洁并完整闭合。",
    `项目：${JSON.stringify(compactProject)}\n区域差异摘要：${JSON.stringify(compactRegions)}\n可用来源索引：${JSON.stringify(compactCitations)}\n输出字段：globalAxis, globalPrinciples[], commonMoments[], globalKpis[], sourceIds[]。计划窗口为 T${project.campaignStartWeek} 至 T+${project.campaignEndWeek}。总输出控制在 1400 个汉字以内。`,
    { creative: false, maxTokens: 4_000, maxAttempts: 3, repairInstruction: "globalPrinciples、commonMoments、globalKpis 各最多 4 条。" },
  );
  return { ...global, sourceIds: global.sourceIds.filter((id) => validSourceIds.has(id)) };
}

export async function generateRegionalReleasePlan(
  project: ProjectSnapshot,
  region: RegionConfig,
  citations: ResearchCitation[],
  global: GlobalReleaseAxis,
): Promise<{ region: RegionReleasePlan; characterSymbiosis: RegionalCharacterSymbiosisPlan; sourceIds: string[] }> {
  if (region.status !== "quality_passed" || !region.analysis || region.analysis.differentiation?.provisional) throw new Error(`${region.name}尚未通过最终自动质量门。`);
  const budgetRule = project.totalBudget
    ? `总预算输入为“${project.totalBudget}”，给出本区渠道金额与比例，但不得增加总额。`
    : "用户没有提供总预算，只能输出百分比区间，不得编造货币金额。";
  const validSourceIds = new Set(citations.map((source) => source.id));
  const compactProject = {
    gameName: project.gameName,
    versionName: project.versionName,
    launchDate: project.launchDate,
    campaignStartWeek: project.campaignStartWeek,
    campaignEndWeek: project.campaignEndWeek,
    objective: project.objective,
    sellingPoints: project.sellingPoints,
    contentAssets: project.contentAssets.slice(0, 12),
    businessGoal: project.businessGoal,
    kpis: project.kpis,
    characterProfiles: project.characterProfiles,
    constraints: project.constraints,
    budgetEnvelope: project.budgetEnvelope,
  };
  const compactRegion = {
    id: region.id,
    name: region.name,
    language: region.language,
    timezone: region.timezone,
    differentiation: region.analysis.differentiation,
    playerSignals: region.analysis.playerSignals.map((item) => item.text),
    marketEnvironment: region.analysis.marketEnvironment.map((item) => item.text),
    sentimentAndCompetition: region.analysis.sentimentAndCompetition.map((item) => item.text),
    culturalMoments: region.analysis.culturalMoments.map((item) => item.text),
    risks: region.analysis.risks,
  };
  const compactCitations = citations.slice(0, 12).map((source) => ({ id: source.id, title: source.title, publisher: source.publisher, publishedAt: source.publishedAt, snippet: source.snippet.slice(0, 180) }));
  const draft = await chatJson(
    RegionReleasePlanDraftSchema,
    `你是游戏区域发行负责人。围绕已确定的全球主轴，为指定区域生成有当地差异的完整执行方案。${budgetRule} regionId 与 regionName 必须逐字使用输入值。sourceIds 只能逐字复制自本区公开来源。保留全部传统发行字段，并新增 characterSymbiosis。characterSymbiosis 的唯一发行角色必须是“三月七”（character 固定为“三月七”），所有沟通都从三月七要对玩家说什么的第一人称关系视角设计；不得把黑天鹅、花火或其他版本角色设为发行角色，不得把视频平台、社交平台、KOL 或广告投放写入角色共生任务。角色只传递2.0匹诺康尼世界、新主线、梦境主题、探索机制、上线与回归信息。characterSymbiosis 不是传统宣发复述：必须形成后续共生发行 Agent 可直接执行的角色任务。每项任务必须明确目标玩家、版本信息、沟通切口、互动场景、时机、频率、语气、文化注意、禁止行为、风险边界、预期效果与指标。禁止跨区套话或复制其他区域话术。只生成方案，不得声称已发布、联系或投放。务必返回完整闭合的 JSON。`,
    `项目：${JSON.stringify(compactProject)}\n全球主轴：${JSON.stringify(global)}\n指定区域：${JSON.stringify(compactRegion)}\n本区来源索引：${JSON.stringify(compactCitations)}\n计划窗口：T${project.campaignStartWeek} 至 T+${project.campaignEndWeek}。直接返回单个区域对象。顶层字段必须是 regionId, regionName, coreJudgment, materialStrategy[], socialCadence[], kolPlan[], paidMedia[], partnerships[], timeline[{week,focus,actions[]}], kpis[], budget[], riskNotes[], characterRelease[], characterSymbiosis, sourceIds[]。characterRelease 每项字段为 ${Object.keys(CharacterReleasePlanSchema.shape).join(", ")}。characterSymbiosis 字段为 ${Object.keys(RegionalCharacterSymbiosisPlanSchema.shape).join(", ")}；characterTasks 每项必须包含 ${Object.keys(CharacterSymbiosisTaskSchema.shape).join(", ")}；metrics 每项必须完整包含 name, target, measurementWindow。其 regionId/regionName 必须与指定区域一致，sourceIds 只可引用本区来源。严格限制长度：传统策略数组各 1—2 条；timeline 3 个节点且每个 actions 1 条；characterRelease 只生成 1 个主角色，内部数组各 1 条；characterSymbiosis 各数组 1 条且 characterTasks 只生成 1 项、metrics 只生成 1 项；每段文字不超过 60 个汉字，整个 JSON 不超过 3000 个汉字。`,
    { creative: false, maxTokens: 4_500, maxAttempts: 3, repairInstruction: "传统策略数组各最多 2 条；timeline 3 项且 actions 各 1 条；characterRelease 和 characterTasks 各 1 项；其他数组 1 条；单段不超过 60 个汉字；metrics 必须包含 name、target、measurementWindow。" },
  );
  if (draft.regionId !== region.id || draft.regionName !== region.name) {
    throw new Error(`${region.name}方案返回了错误的区域标识，请重试。`);
  }
  const { sourceIds, characterSymbiosis, ...regionPlan } = draft;
  if (characterSymbiosis.regionId !== region.id || characterSymbiosis.regionName !== region.name) throw new Error(`${region.name}角色共生发行方案发生区域数据混用。`);
  const filteredSourceIds = sourceIds.filter((id) => validSourceIds.has(id));
  const fallbackSourceId = citations[0]?.id;
  const symbiosisSourceIds = characterSymbiosis.sourceIds.filter((id) => validSourceIds.has(id));
  return {
    region: RegionReleasePlanSchema.parse(regionPlan),
    characterSymbiosis: RegionalCharacterSymbiosisPlanSchema.parse({
      ...characterSymbiosis,
      sourceIds: symbiosisSourceIds.length ? symbiosisSourceIds : fallbackSourceId ? [fallbackSourceId] : [],
    }),
    sourceIds: filteredSourceIds.length ? filteredSourceIds : fallbackSourceId ? [fallbackSourceId] : [],
  };
}

export function campaignWeeks(start: number, end: number) {
  const weeks: string[] = [];
  for (let value = start; value <= end; value += 1) weeks.push(value === 0 ? "T0" : value < 0 ? `T${value}` : `T+${value}`);
  return weeks;
}

export function budgetMode(totalBudget: string) {
  return totalBudget.trim() ? "amount" : "ratio";
}
