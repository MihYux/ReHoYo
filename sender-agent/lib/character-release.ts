import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import mammoth from "mammoth";
import type { RegionConfig } from "@/lib/contracts";
import type {
  CharacterPlanRelease,
  CharacterReleaseRegion,
  CharacterReleaseSnapshot,
  CharacterReleaseTask,
  CharacterReleaseTaskInput,
} from "@/lib/character-release-types";
import { releaseMetadataReason, validatePlayerVisibleReleaseFields } from "@/lib/release-content-safety";
import { publishPetPolicy } from "@/lib/pet-policy-publisher";

const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_DIR || ".data");
const WORKSPACE_PATH = path.join(DATA_DIR, "character-release-workspace.json");

let writeQueue = Promise.resolve<unknown>(undefined);

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}_${randomUUID()}`; }
function checksum(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function clone<T>(value: T): T { return structuredClone(value); }

function emptySnapshot(): CharacterReleaseSnapshot {
  return { schemaVersion: 1, activeRegionId: "", regions: [], workspaces: {}, auditLog: [], updatedAt: now() };
}

async function readSnapshot() {
  try {
    const parsed = JSON.parse(await fs.readFile(WORKSPACE_PATH, "utf8")) as CharacterReleaseSnapshot;
    if (parsed.schemaVersion !== 1) throw new Error("不支持的角色发行工作区版本。");
    repairSnapshotMetadata(parsed);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySnapshot();
    throw error;
  }
}

async function writeSnapshot(data: CharacterReleaseSnapshot) {
  data.updatedAt = now();
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${WORKSPACE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporary, WORKSPACE_PATH);
}

function serial<T>(operation: () => Promise<T>) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function releaseAgents(region: RegionConfig) {
  return [
    { id: `${region.id}-relationship`, name: `${region.name}关系守护 AI`, description: "检查授权、拒绝、频率和关系边界", enabled: true },
    { id: `${region.id}-voice`, name: `${region.name}三月七表达 AI`, description: "保持三月七的角色语气与互动方式", enabled: true },
    { id: `${region.id}-delivery`, name: `${region.name}发行执行 AI`, description: "执行区域灰度与交付回执", enabled: true },
  ];
}

function segments(region: RegionConfig) {
  const seed = [...region.code].reduce((sum, value) => sum + value.charCodeAt(0), 0);
  return [
    { id: `${region.id}-returning`, name: "剧情向回流玩家", eligible: 4200 + seed * 7, authorized: 3010 + seed * 5, reachable: 2380 + seed * 4, excluded: 210 + seed },
    { id: `${region.id}-affinity`, name: "三月七高亲和玩家", eligible: 3100 + seed * 5, authorized: 2510 + seed * 4, reachable: 2040 + seed * 3, excluded: 126 + seed },
  ];
}

function reconcile(data: CharacterReleaseSnapshot, configs: RegionConfig[]) {
  for (const config of configs) {
    const existing = data.regions.find((item) => item.sourceRegionId === config.id || item.code.toLowerCase() === config.code.toLowerCase());
    const region: CharacterReleaseRegion = existing || {
      id: config.id,
      sourceRegionId: config.id,
      code: config.code.toUpperCase(),
      name: config.name,
      language: config.language,
      timeZone: config.timezone,
      quietHours: { start: "22:00", end: "08:00" },
      releaseAgents: releaseAgents(config),
      segments: segments(config),
    };
    region.sourceRegionId = config.id;
    region.code = config.code.toUpperCase();
    region.name = config.name;
    region.language = config.language;
    region.timeZone = config.timezone;
    if (!existing) data.regions.push(region);
    if (!data.workspaces[region.id]) data.workspaces[region.id] = { regionId: region.id, tasks: [], releases: [], emergencyStoppedAt: null };
  }
  if (!data.activeRegionId || !data.workspaces[data.activeRegionId]) {
    const preferred = configs.find((item) => item.selected) || configs[0];
    data.activeRegionId = data.regions.find((item) => item.sourceRegionId === preferred?.id)?.id || data.regions[0]?.id || "";
  }
  return data;
}

function audit(data: CharacterReleaseSnapshot, regionId: string, action: string, entityId: string, detail: string) {
  data.auditLog.unshift({ id: id("audit"), occurredAt: now(), regionId, action, entityId, detail });
  data.auditLog = data.auditLog.slice(0, 300);
}

function taskStatus(input: CharacterReleaseTaskInput) {
  return input.title.trim() && input.theme.trim() && input.timeWindow.trim() && input.consentConfirmed && input.facts.some((fact) => fact.value.trim()) ? "ready" as const : "draft" as const;
}

function textValue(text: string, labels: string[]) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:#{1,6}|[-*+])\s*/, "").trim()).filter(Boolean);
  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, "i"));
      if (match?.[1]) return match[1].trim();
    }
  }
  return "";
}

type MarkdownSections = Map<string, string[]>;

function normalizedHeading(value: string) {
  return value.replace(/^\d+[.、]\s*/, "").replace(/[*_`]/g, "").trim();
}

function markdownSections(content: string): MarkdownSections {
  const sections = new Map<string, string[]>();
  let current = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const heading = rawLine.match(/^\s*#{2,6}\s+(.+?)\s*$/);
    if (heading) {
      current = normalizedHeading(heading[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!current) continue;
    const clean = rawLine
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*-\s*\*\*(.+?)\*\*\s*[：:]\s*/, "$1：")
      .trim();
    if (clean) sections.get(current)?.push(clean);
  }
  return sections;
}

function sectionLines(sections: MarkdownSections, names: string[]) {
  for (const [heading, lines] of sections) {
    if (names.some((name) => heading.includes(name))) return lines;
  }
  return [];
}

function safeLines(lines: string[], field: "theme" | "narrative" | "timeWindow" | "fact") {
  return lines.filter((line) => !releaseMetadataReason(line, field));
}

export function parseCharacterReleaseMarkdown(content: string, fileName: string) {
  const sections = markdownSections(content);
  const objective = safeLines(sectionLines(sections, ["共生发行目标", "任务目标"]), "theme");
  const versionFacts = safeLines(sectionLines(sections, ["可传递的版本信息", "适合由角色传递的版本信息", "版本信息"]), "fact");
  const communication = safeLines(sectionLines(sections, ["沟通切入点与互动场景", "角色沟通切入点", "沟通切入点"]), "narrative");
  const tone = safeLines(sectionLines(sections, ["语气、表达和文化注意事项", "语气"]), "narrative");
  const timing = safeLines(sectionLines(sections, ["推荐触达时机与频率", "时机与频率"]), "timeWindow");
  const firstHeading = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/\s*[·|-]\s*角色共生发行方案\s*$/, "").trim();
  const title = !releaseMetadataReason(firstHeading, "title")
    ? firstHeading
    : path.basename(fileName, path.extname(fileName)).replace(/[-_]/g, " ");
  return {
    title: title || "角色共生发行方案",
    theme: objective[0] || "",
    narrative: [...communication, ...tone].join("；"),
    timeWindow: timing.join("；"),
    facts: versionFacts,
  };
}

export function repairSnapshotMetadata(data: CharacterReleaseSnapshot) {
  for (const workspace of Object.values(data.workspaces || {})) {
    for (const task of workspace.tasks || []) {
      if (!task.sourceDocument?.content) continue;
      const parsed = parseCharacterReleaseMarkdown(task.sourceDocument.content, task.sourceDocument.name);
      const repaired: string[] = [];
      if (releaseMetadataReason(task.title, "title") && parsed.title) { task.title = parsed.title; repaired.push("title"); }
      if (releaseMetadataReason(task.theme, "theme") && parsed.theme) { task.theme = parsed.theme; repaired.push("theme"); }
      if (releaseMetadataReason(task.narrative, "narrative") && parsed.narrative) { task.narrative = parsed.narrative; repaired.push("narrative"); }
      if (releaseMetadataReason(task.timeWindow, "timeWindow") && parsed.timeWindow) { task.timeWindow = parsed.timeWindow; repaired.push("timeWindow"); }
      const cleanFacts = (task.facts || []).filter((fact) =>
        !releaseMetadataReason(fact.label, "fact") &&
        !releaseMetadataReason(fact.value, "fact") &&
        !releaseMetadataReason(fact.source, "fact"));
      if (cleanFacts.length !== (task.facts || []).length) {
        const existingValues = new Set(cleanFacts.map((fact) => fact.value));
        for (const value of parsed.facts) {
          if (!existingValues.has(value)) cleanFacts.push({ id: id("fact"), label: "版本信息", value, source: "已审核角色共生方案" });
        }
        task.facts = cleanFacts;
        repaired.push("facts");
      }
      if (repaired.length) {
        task.status = taskStatus(task);
        task.updatedAt = now();
        audit(data, task.regionId, "task.metadata_repaired", task.id, `Repaired fields: ${repaired.join(", ")}`);
      }
    }
  }
}

export function createImportedCharacterReleaseTask(regionId: string, fileName: string, content: string, metadata: { researchRunId?: string; planGeneratedAt?: string } = {}) {
  const importedAt = now();
  const parsed = parseCharacterReleaseMarkdown(content, fileName);
  const title = textValue(content, ["版本任务名称", "方案名称", "版本名称"]) || `${parsed.title} · ${importedAt.slice(0, 10)}`;
  const theme = parsed.theme || textValue(content, ["共生发行目标", "全局主题", "核心主题", "发行主题"]) || "角色共生发行";
  const facts = parsed.facts.map((value) => ({ id: id("fact"), label: "版本信息", value, source: "已审核角色共生方案" }));
  const task: CharacterReleaseTask = {
    id: id("task"), regionId, title, objective: "recall", theme,
    narrative: parsed.narrative || "由三月七从长期陪伴关系和玩家当前状态切入，以低打扰方式自然传递版本信息。",
    timeWindow: parsed.timeWindow || textValue(content, ["发行时间", "时间窗口", "上线时间"]) || "按已审核区域方案执行",
    consentConfirmed: true, facts, status: "ready",
    sourceDocument: { name: fileName, format: path.extname(fileName).slice(1).toLowerCase() || "md", importedAt, checksum: checksum(content), content, ...metadata },
    createdAt: importedAt, updatedAt: importedAt,
  };
  return task;
}

export async function getCharacterReleaseSnapshot(configs: RegionConfig[]) {
  return serial(async () => {
    const data = reconcile(await readSnapshot(), configs);
    await writeSnapshot(data);
    return clone(data);
  });
}

export async function setActiveCharacterReleaseRegion(regionId: string, configs: RegionConfig[]) {
  return serial(async () => {
    const data = reconcile(await readSnapshot(), configs);
    if (!data.workspaces[regionId]) throw new Error("角色发行区域不存在。");
    data.activeRegionId = regionId;
    await writeSnapshot(data);
    return clone(data);
  });
}

export async function addCharacterReleaseRegion(input: Pick<RegionConfig, "code" | "name" | "language" | "timezone">, configs: RegionConfig[]) {
  const synthetic = { ...input, id: `region-custom-${randomUUID()}`, note: "", preset: false, selected: true, status: "draft", analysis: null } as RegionConfig;
  return getCharacterReleaseSnapshot([...configs, synthetic]);
}

export async function saveCharacterReleaseTask(regionId: string, input: CharacterReleaseTaskInput, configs: RegionConfig[]) {
  return serial(async () => {
    const data = reconcile(await readSnapshot(), configs);
    const workspace = data.workspaces[regionId];
    if (!workspace) throw new Error("角色发行区域不存在。");
    const existing = input.id ? workspace.tasks.find((item) => item.id === input.id) : undefined;
    const timestamp = now();
    const task: CharacterReleaseTask = existing ? {
      ...existing, ...input, status: taskStatus(input), updatedAt: timestamp,
    } : {
      ...input, id: id("task"), regionId, status: taskStatus(input), createdAt: timestamp, updatedAt: timestamp,
    };
    if (existing) workspace.tasks = workspace.tasks.map((item) => item.id === existing.id ? task : item);
    else workspace.tasks.unshift(task);
    audit(data, regionId, existing ? "task.updated" : "task.created", task.id, task.title);
    await writeSnapshot(data);
    return clone(data);
  });
}

export async function importCharacterReleaseText(regionId: string, fileName: string, content: string, configs: RegionConfig[], metadata: { researchRunId?: string; planGeneratedAt?: string } = {}) {
  return serial(async () => {
    const data = reconcile(await readSnapshot(), configs);
    const workspace = data.workspaces[regionId];
    if (!workspace) throw new Error("角色发行区域不存在。");
    const region = data.regions.find((item) => item.id === regionId)!;
    if (!content.trim()) throw new Error("导入文件没有可用文字。");
    const declared = content.match(/^##\s+(.+?)区域\s*$/m)?.[1]?.trim();
    if (declared && declared !== region.name) throw new Error(`方案区域“${declared}”与当前${region.name}工作区不匹配。`);
    const task = createImportedCharacterReleaseTask(regionId, fileName, content, metadata);
    workspace.tasks.unshift(task);
    data.activeRegionId = regionId;
    audit(data, regionId, "task.imported", task.id, `${fileName} · ${task.sourceDocument?.checksum.slice(0, 12)}`);
    await writeSnapshot(data);
    return { data: clone(data), taskId: task.id, source: clone(task.sourceDocument) };
  });
}

export async function parseCharacterReleaseUpload(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (![".docx", ".pdf", ".md", ".txt"].includes(extension)) throw new Error("仅支持 DOCX、PDF、Markdown 和 TXT 方案。");
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("方案文件必须小于 15 MB。");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (extension === ".docx") return (await mammoth.extractRawText({ buffer })).value;
  if (extension === ".pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    return (await pdfParse(buffer)).text;
  }
  return buffer.toString("utf8");
}

export async function publishCharacterRelease(regionId: string, taskId: string, rolloutPercent: number, exampleMode: boolean, configs: RegionConfig[]) {
  return serial(async () => {
    const data = reconcile(await readSnapshot(), configs);
    const workspace = data.workspaces[regionId];
    const region = data.regions.find((item) => item.id === regionId);
    const task = workspace?.tasks.find((item) => item.id === taskId);
    if (!workspace || !region || !task) throw new Error("待发布的区域方案不存在。");
    if (workspace.emergencyStoppedAt) throw new Error("当前区域处于紧急暂停状态。");
    const percent = exampleMode ? 100 : Number(rolloutPercent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) throw new Error("灰度比例必须在 1% 到 100% 之间。");
    if (task.status !== "ready") throw new Error("方案尚未满足发布条件。");
    const fieldValidation = validatePlayerVisibleReleaseFields(task);
    if (!fieldValidation.valid) {
      const detail = fieldValidation.errors.map((item) => `${item.field}: ${item.reason}`).join("；");
      throw new Error(`发行内容包含后台元数据，已阻止进入桌宠队列：${detail}`);
    }
    const publishedAt = now();
    const deliveryId = id("delivery");
    const remote = await publishPetPolicy({ policyVersion: deliveryId, publishedAt, rolloutPercent: percent, region, task });
    const release: CharacterPlanRelease = {
      id: id("release"), deliveryId, regionId, taskId, rolloutPercent: percent, exampleMode,
      checksum: remote.checksum, status: "published", publishedAt, channel: "cloudflare_kv",
    };
    workspace.releases.unshift(release);
    audit(data, regionId, exampleMode ? "plan.example_published" : "plan.published", release.id, `${percent}% · Cloudflare KV · ${deliveryId}`);
    await writeSnapshot(data);
    return clone(data);
  });
}

export async function setCharacterReleaseEmergency(regionId: string, enabled: boolean, configs: RegionConfig[]) {
  return serial(async () => {
    const data = reconcile(await readSnapshot(), configs);
    const workspace = data.workspaces[regionId];
    if (!workspace) throw new Error("角色发行区域不存在。");
    workspace.emergencyStoppedAt = enabled ? now() : null;
    audit(data, regionId, enabled ? "workspace.emergency_stopped" : "workspace.resumed", regionId, enabled ? "人工紧急暂停" : "人工恢复");
    await writeSnapshot(data);
    return clone(data);
  });
}

export const characterReleasePaths = { workspace: WORKSPACE_PATH };
