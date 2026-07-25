import { z } from "zod";
import {
  AutofillModelOutputSchema,
  AutofillToolTraceSchema,
  ProjectAutofillResponseSchema,
  ProjectInputSchema,
  type AutofillEvidence,
  type AutofillToolTrace,
  type ProjectAutofillResponse,
  type ProjectInput,
} from "@/lib/contracts";
import { filterAutofillResponse } from "@/lib/autofill";
import { chunkText } from "@/lib/files";
import { chatJsonWithTools, GlmError, searchWeb, type GlmFunctionTool } from "@/lib/glm";

export type AutofillSource = {
  id: string;
  name: string;
  status: string;
  extractedText: string;
};

const PUBLIC_AUTOFILL_FIELDS = ["gameName", "versionName", "launchDate", "platforms", "contentAssets"] as const;

const ToolNameSchema = AutofillToolTraceSchema.shape.tool;
const EmptyArgumentsSchema = z.object({}).passthrough();
const InternalSearchArgumentsSchema = z.object({
  query: z.string().trim().min(1).max(160),
  sourceIds: z.array(z.string()).max(20).optional(),
  limit: z.number().int().min(1).max(6).default(4),
});
const WebSearchArgumentsSchema = z.object({
  query: z.string().trim().min(1).max(70),
  recency: z.enum(["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"]).default("noLimit"),
});

const AUTOFILL_TOOLS: GlmFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "read_current_form",
      description: "读取用户当前尚未保存的版本录入字段。用于识别哪些字段为空，严禁建议覆盖非空字段。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_uploaded_documents",
      description: "列出当前项目上传文档的名称、解析状态和文本长度，不返回本地路径。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_internal_documents",
      description: "按关键词检索已解析的内部文档。经营目标、预算、KPI、角色和限制等内部字段必须使用本工具返回的 DOC 证据。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "用空格分隔的精确业务关键词，最长 160 字符" },
          sourceIds: { type: "array", items: { type: "string" }, maxItems: 20 },
          limit: { type: "integer", minimum: 1, maximum: 6, default: 4 },
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
      description: "使用智谱 Web Search 查询公开事实。仅可用于游戏名、版本名、上线日期、平台和公开发布资产，不能用于经营目标、预算、KPI、角色关系或品牌限制。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 70, description: "简短的公开信息检索词，包含空格与标点在内不得超过 70 字符" },
          recency: { type: "string", enum: ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"], default: "noLimit" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_date",
      description: "获取 Asia/Shanghai 时区的当前日期，用于判断公告和计划上线日期的时效。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

function termsForQuery(query: string) {
  const normalized = query.toLocaleLowerCase();
  const terms = new Set(normalized.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length > 1));
  for (const sequence of normalized.match(/[\p{Script=Han}]{3,}/gu) || []) {
    terms.add(sequence);
    for (let index = 0; index < sequence.length - 1; index += 1) terms.add(sequence.slice(index, index + 2));
  }
  return Array.from(terms).sort((a, b) => b.length - a.length).slice(0, 40);
}

function occurrences(text: string, term: string) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(term, offset)) >= 0) {
    count += 1;
    offset += Math.max(1, term.length);
  }
  return count;
}

export function rankInternalDocumentChunks(sources: AutofillSource[], query: string, sourceIds?: string[], limit = 4) {
  const selectedIds = sourceIds?.length ? new Set(sourceIds) : null;
  const terms = termsForQuery(query);
  const normalizedQuery = query.toLocaleLowerCase().trim();
  const candidates = sources
    .filter((source) => source.extractedText.trim() && (!selectedIds || selectedIds.has(source.id)))
    .flatMap((source) => chunkText(source.extractedText, 4_000, 300).map((content, index) => {
      const haystack = content.toLocaleLowerCase();
      const name = source.name.toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + occurrences(haystack, term) * Math.min(8, term.length) + occurrences(name, term) * 12, 0)
        + (normalizedQuery && haystack.includes(normalizedQuery) ? 30 : 0);
      return { sourceId: source.id, name: source.name, locator: `片段 ${index + 1}`, chunkIndex: index, content, score };
    }));
  const matched = candidates.filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);
  if (matched.length) return matched.slice(0, limit);
  const firstPerSource = new Map<string, (typeof candidates)[number]>();
  candidates.forEach((candidate) => { if (!firstPerSource.has(candidate.sourceId)) firstPerSource.set(candidate.sourceId, candidate); });
  return Array.from(firstPerSource.values()).slice(0, Math.min(limit, 3));
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function generateProjectAutofill(projectInput: ProjectInput, sourceRows: AutofillSource[]): Promise<ProjectAutofillResponse> {
  const project = ProjectInputSchema.parse(projectInput);
  const requiresWebVerification = PUBLIC_AUTOFILL_FIELDS.some((field) => {
    const value = project[field];
    return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
  });
  const evidence = new Map<string, AutofillEvidence>();
  const webEvidenceByUrl = new Map<string, string>();
  const toolTrace: AutofillToolTrace[] = [];
  let webSerial = 1;

  const executeTool = async (rawName: string, rawArguments: unknown) => {
    const nameResult = ToolNameSchema.safeParse(rawName);
    if (!nameResult.success) throw new GlmError(`不允许调用工具 ${rawName}。`, 502);
    const name = nameResult.data;
    try {
      if (name === "read_current_form") {
        EmptyArgumentsSchema.parse(rawArguments);
        toolTrace.push({ tool: name, status: "completed", resultCount: 1, label: "读取当前录入" });
        return project;
      }
      if (name === "list_uploaded_documents") {
        EmptyArgumentsSchema.parse(rawArguments);
        const documents = sourceRows.map((source) => ({ id: source.id, name: source.name, status: source.status, extractedLength: source.extractedText.length }));
        toolTrace.push({ tool: name, status: "completed", resultCount: documents.length, label: "检查上传资料" });
        return documents;
      }
      if (name === "search_internal_documents") {
        const args = InternalSearchArgumentsSchema.parse(rawArguments);
        const results = rankInternalDocumentChunks(sourceRows, args.query, args.sourceIds, args.limit);
        const toolResults = results.map((result) => {
          const id = `DOC-${result.sourceId}-${result.chunkIndex + 1}`;
          if (!evidence.has(id)) {
            evidence.set(id, {
              id,
              kind: "document",
              title: result.name,
              snippet: result.content.replace(/\s+/g, " ").slice(0, 360),
              sourceId: result.sourceId,
              locator: result.locator,
              url: "",
              publisher: "",
              publishedAt: "",
            });
          }
          return { evidenceId: id, sourceId: result.sourceId, title: result.name, locator: result.locator, content: result.content };
        });
        toolTrace.push({ tool: name, status: "completed", resultCount: toolResults.length, label: args.query });
        return toolResults;
      }
      if (name === "web_search_public_facts") {
        const args = WebSearchArgumentsSchema.parse(rawArguments);
        const results = await searchWeb(args.query, { count: 5, recency: args.recency, contentSize: "medium" });
        const toolResults = results.filter((result) => result.link).slice(0, 5).map((result) => {
          const normalizedContent = (result.content || "").replace(/\s+/g, " ").slice(0, 1_800);
          let id = webEvidenceByUrl.get(result.link);
          if (!id) {
            id = `WEB-${String(webSerial++).padStart(3, "0")}`;
            webEvidenceByUrl.set(result.link, id);
            evidence.set(id, {
              id,
              kind: "web",
              title: result.title || result.link,
              snippet: normalizedContent.slice(0, 360),
              sourceId: "",
              locator: "",
              url: result.link,
              publisher: result.media || "",
              publishedAt: result.publish_date || "",
            });
          }
          return { evidenceId: id, title: result.title, content: normalizedContent, url: result.link, publisher: result.media, publishedAt: result.publish_date };
        });
        toolTrace.push({ tool: name, status: "completed", resultCount: toolResults.length, label: args.query });
        return toolResults;
      }
      EmptyArgumentsSchema.parse(rawArguments);
      const date = shanghaiDate();
      toolTrace.push({ tool: name, status: "completed", resultCount: 1, label: date });
      return { date, timezone: "Asia/Shanghai" };
    } catch (error) {
      toolTrace.push({ tool: name, status: "failed", resultCount: 0, label: (error as Error).message.slice(0, 160) });
      throw error;
    }
  };

  const modelOutput = await chatJsonWithTools(
    AutofillModelOutputSchema,
    `你是游戏全球发行工作台的版本资料整理员。先在同一轮调用 read_current_form 与 list_uploaded_documents，识别空字段和可用资料。随后优先只调用一次 search_internal_documents，用一个综合查询覆盖全部待填字段，limit 设为 6；确有必要时最多调用两次。当 gameName、versionName、launchDate、platforms、contentAssets 中任一字段为空时，必须调用 web_search_public_facts 交叉核验公开信息；即使内部资料已有答案也不能跳过。Web Search 通常只调用一次；仅当首次返回 0 条结果时允许更换更短关键词再试一次，最多两次。query 必须精简到 70 字符以内，优先使用“游戏名 版本名 官方公告”形式。完成内部检索、Web Search 和可选的 get_current_date 后，立即输出最终 JSON。联网时优先采用游戏官网、官方公告和可信媒体；精确上线日期必须在来源摘要中有明确表述，不能使用传闻或推测。内部资料与网络信息冲突时以内部资料为准。无法确定时不要猜测，保持字段缺失并写入 warnings。

可输出字段：gameName, versionName, launchDate, platforms, objective, sellingPoints, contentAssets, businessGoal, totalBudget, kpis, characterProfiles, constraints。launchDate 使用 YYYY-MM-DD。gameName、versionName、launchDate、platforms、contentAssets 可以引用 DOC 或 WEB 证据。objective、sellingPoints、businessGoal、totalBudget、kpis、characterProfiles、constraints 必须至少引用一个 DOC 证据。不要为当前非空字段生成 suggestion。每条 suggestion 的 evidenceIds 必须逐字使用工具返回的 evidenceId。

最终 JSON 结构：{"suggestions":[{"field":"字段名","value":"字符串或字符串数组","confidence":"high|medium|low","evidenceIds":["证据编号"]}],"warnings":["无法填写的原因"]}`,
    "请使用只读工具分析当前录入和上传资料，并为所有有可靠证据的空字段生成自动填写结果。",
    AUTOFILL_TOOLS,
    executeTool,
    { maxRounds: 6, maxToolCalls: 10, maxToolResultChars: 50_000, maxTokens: 8_000 },
  );

  const completedTools = new Set(toolTrace.filter((trace) => trace.status === "completed").map((trace) => trace.tool));
  if (!completedTools.has("read_current_form") || !completedTools.has("list_uploaded_documents")) {
    throw new GlmError("AI 未完成当前录入与上传资料检查，请重试。", 502);
  }
  if (requiresWebVerification && !completedTools.has("web_search_public_facts")) {
    throw new GlmError("AI 未完成公开信息的 GLM Web Search 核验，请重试。", 502);
  }

  const response = ProjectAutofillResponseSchema.parse({
    ...modelOutput,
    evidence: Array.from(evidence.values()),
    toolTrace,
  });
  return filterAutofillResponse(project, response);
}
