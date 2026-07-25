import { createHash } from "node:crypto";
import type {
  BudgetEnvelope,
  HumanContract,
  ProjectSnapshot,
  QualityViolation,
  RegionConfig,
  ReleasePlan,
  ResearchCitation,
  VersionBrief,
} from "@/lib/contracts";

export const GOVERNANCE_VERSION = "governance-v2-datafreeze";
export const PROMPT_VERSION = "regional-intelligence-v3";
export const COMMON_TOPIC_KEYS = new Set(["vision-pro", "metalfx", "package-size", "jazz-aesthetic", "global-benefit"]);

export class GovernanceError extends Error {
  status = 409;
  constructor(message: string, public violations: QualityViolation[]) {
    super(message);
  }
}

function hard(code: string, ruleId: string, message: string, path = "", repairable = false): QualityViolation {
  return { code, ruleId, severity: "hard", message, path, repairable };
}

export function calculateEvidenceCutoff(launchDate: string, campaignStartWeek: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) return "";
  const value = new Date(`${launchDate}T23:59:59.999Z`);
  value.setUTCDate(value.getUTCDate() + campaignStartWeek * 7);
  return value.toISOString();
}

export function planningEvidenceCutoff(planningAsOfDate: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(planningAsOfDate) ? `${planningAsOfDate}T23:59:59.999Z` : "";
}

export function canonicalizeUrl(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "spm", "from", "ref"].forEach((key) => url.searchParams.delete(key));
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildHumanContract(
  project: Pick<ProjectSnapshot, "objective" | "businessGoal" | "sellingPoints" | "constraints" | "totalBudget" | "planningAsOfDate" | "briefStatus">,
  brief: VersionBrief | null,
): HumanContract {
  const requirements: HumanContract["requirements"] = [];
  const add = (id: string, category: HumanContract["requirements"][number]["category"], text: string, source: "project" | "brief" = "project") => {
    if (text.trim()) requirements.push({ id, category, text: text.trim(), source });
  };
  add("HC-OBJECTIVE-001", "objective", project.objective);
  add("HC-PRIORITY-001", "priority", project.businessGoal);
  project.sellingPoints.forEach((text, index) => add(`HC-REQUIRED-${String(index + 1).padStart(3, "0")}`, "required", text));
  add("HC-FORBIDDEN-001", "forbidden", project.constraints);
  add("HC-BUDGET-001", "budget", project.totalBudget);
  add("HC-EVIDENCE-001", "evidence", `历史规划只可使用 ${project.planningAsOfDate || "待确认"} 及之前发布且经页面验证的证据。`);
  add("HC-FORMAT-001", "format", "区域差异必须为五句单段结构，每句具备可追溯本地证据。", "project");
  brief?.constraints.forEach((text, index) => add(`VB-FORBIDDEN-${String(index + 1).padStart(3, "0")}`, "forbidden", text, "brief"));
  return {
    version: 2,
    approved: project.briefStatus === "approved",
    instructionOrder: ["product_safety", "human_contract", "version_brief", "current_human_request", "model_creativity", "web_content"],
    requirements,
  };
}

function pickAmount(text: string, labels: RegExp[]) {
  for (const label of labels) {
    const match = text.match(label);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return 0;
}

export function parseBudgetEnvelope(text: string, confirmed = false): BudgetEnvelope | null {
  if (!text.trim()) return null;
  const total = pickAmount(text, [/(?:总预算|预算总额)[^\d]{0,12}([\d,]+)\s*万元/i, /([\d,]+)\s*万元/]);
  const lockedProduction = pickAmount(text, [/(?:制作|生产|锁定)[^\d]{0,12}([\d,]+)\s*万元/i]);
  const statedAllocatable = pickAmount(text, [/(?:可分配|可投放|发行预算)[^\d]{0,12}([\d,]+)\s*万元/i]);
  const allocatable = statedAllocatable || Math.max(0, total - lockedProduction);
  const statedReserve = pickAmount(text, [/(?:风险准备金|风险储备|预备金)[^\d]{0,12}([\d,]+)\s*万元/i]);
  const riskReserve = statedReserve || Math.ceil(total * 0.03);
  if (!total || !allocatable) return null;
  return { currency: "CNY", unit: "万元", total, lockedProduction, allocatable, riskReserve, regionalCapTotal: Math.max(0, allocatable - riskReserve), confirmed };
}

export function chineseLength(text: string) {
  return Array.from(text.replace(/\s/g, "")).length;
}

export function textSimilarity(left: string, right: string) {
  const grams = (value: string) => new Set(Array.from(value.replace(/[\s，。；：、“”]/g, "")).slice(0, -1).map((char, index, chars) => char + chars[index + 1]));
  const a = grams(left);
  const b = grams(right);
  const intersection = Array.from(a).filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

const REDLINE_PATTERNS = [
  { key: "character-death", pattern: /(死亡|死去|牺牲|阵亡|便当).{0,8}(流萤)|(?:流萤).{0,8}(死亡|死去|牺牲|阵亡|便当)/i },
  { key: "spoiler", pattern: /(剧情结局揭示|死亡伏笔|身份揭晓)/i },
];

export function scanRedlines(text: string, contract: HumanContract) {
  const violations: QualityViolation[] = [];
  for (const item of REDLINE_PATTERNS) {
    if (item.pattern.test(text)) violations.push(hard("REDLINE_LEAKAGE", "SAFE-REDLINE-001", `命中禁用剧情/角色红线：${item.key}`, "analysis", true));
  }
  for (const rule of contract.requirements.filter((item) => item.category === "forbidden")) {
    const terms = rule.text.split(/[，。；;、\s]+/).filter((term) => term.length >= 4);
    if (terms.some((term) => text.includes(term))) violations.push(hard("HUMAN_FORBIDDEN_CONTENT", rule.id, "输出包含人工明确禁止的内容。", "analysis", true));
  }
  return violations;
}

export function validateEvidence(citations: ResearchCitation[], project: ProjectSnapshot, regionId?: string) {
  const violations: QualityViolation[] = [];
  const scoped = regionId ? citations.filter((item) => item.regionId === regionId) : citations;
  const unique = Array.from(new Map(scoped.map((item) => [item.id, item])).values());
  const cutoff = project.evidenceMode === "campaign_cutoff" ? project.evidenceCutoff : "";
  for (const source of unique) {
    const label = source.displayId || source.id;
    if (!source.contentHash || !source.retrievedAt || !source.researchRunId || !source.canonicalSourceId) {
      violations.push(hard("BROKEN_PROVENANCE", "EVIDENCE-IMMUTABLE-001", `来源 ${label} 缺少不可变快照元数据。`, `citations.${source.id}`));
    }
    if (!["verified", "manual"].includes(source.verificationStatus || "unreachable")) {
      violations.push(hard("UNVERIFIED_EVIDENCE", "EVIDENCE-VERIFY-001", `来源 ${label} 未通过页面验证：${source.rejectionReason || source.verificationStatus}。`, `citations.${source.id}`));
    }
    if (cutoff && !source.verifiedPublishedAt) {
      violations.push(hard("MISSING_PUBLICATION_DATE", "EVIDENCE-DATE-001", `历史模式来源 ${label} 缺少已验证发布日期。`, `citations.${source.id}`));
    } else if (cutoff && new Date(source.verifiedPublishedAt || "").getTime() > new Date(cutoff).getTime()) {
      violations.push(hard("POST_CUTOFF_EVIDENCE", "EVIDENCE-CUTOFF-001", `来源 ${label} 晚于规划快照 ${project.planningAsOfDate}。`, `citations.${source.id}`));
    }
    if ((source.relevanceScore || 0) < 0.45) {
      violations.push(hard("SEMANTIC_MISMATCH", "EVIDENCE-RELEVANCE-001", `来源 ${label} 与目标市场或研究维度不匹配。`, `citations.${source.id}`));
    }
  }
  if (regionId && unique.length < 8) violations.push(hard("INSUFFICIENT_SOURCES", "EVIDENCE-COVERAGE-001", `区域至少需要 8 个唯一合格来源，当前为 ${unique.length}。`, `regions.${regionId}`));
  if (regionId) {
    for (const dimension of ["player", "market", "sentiment", "culture"] as const) {
      const count = unique.filter((item) => (item.supportedDimensions || [item.dimension]).includes(dimension)).length;
      if (count < 2) violations.push(hard("INSUFFICIENT_DIMENSION_SOURCES", "EVIDENCE-COVERAGE-002", `${dimension} 维度至少需要 2 个合格来源，当前为 ${count}。`, `regions.${regionId}.${dimension}`));
    }
    const localCount = unique.filter((item) => item.localEvidence).length;
    if (localCount < 5) violations.push(hard("INSUFFICIENT_LOCAL_COVERAGE", "EVIDENCE-LOCALITY-001", `至少需要 5 个本地市场/本地语言来源，当前为 ${localCount}。`, `regions.${regionId}`));
  }
  return violations;
}

export function validateRegionalAnalysis(region: RegionConfig, citations: ResearchCitation[], project: ProjectSnapshot, allRegions: RegionConfig[]) {
  const violations = validateEvidence(citations, project, region.id);
  if (!region.analysis) return [...violations, hard("MISSING_ANALYSIS", "OUTPUT-REGION-001", "区域分析不存在。", `regions.${region.id}`)];
  const analysis = region.analysis;
  violations.push(...scanRedlines(JSON.stringify(analysis), project.humanContract));
  const regionalSources = citations.filter((item) => item.regionId === region.id);
  const sourceIds = new Set(regionalSources.map((item) => item.id));
  const sourceById = new Map(regionalSources.map((item) => [item.id, item]));
  const requirementIds = new Set(project.humanContract.requirements.map((item) => item.id));
  const claims = [analysis.playerSignals, analysis.marketEnvironment, analysis.sentimentAndCompetition, analysis.culturalMoments].flat();
  claims.forEach((claim, index) => {
    if (!claim.requirementIds.length) violations.push(hard("MISSING_REQUIREMENT_LINK", "CLAIM-LINK-001", "判断未关联人工约束。", `claims.${index}`, true));
    const unknown = claim.requirementIds.filter((id) => !requirementIds.has(id));
    if (unknown.length) violations.push(hard("UNKNOWN_REQUIREMENT_ID", "CLAIM-LINK-003", `判断引用了未知人工约束：${unknown.join(", ")}。`, `claims.${index}.requirementIds`, true));
    if (!claim.citationSnapshotIds.length || claim.citationSnapshotIds.some((id) => !sourceIds.has(id))) violations.push(hard("INVALID_CITATION", "CLAIM-LINK-002", "判断引用了不存在的证据快照。", `claims.${index}`, true));
    if (claim.claimScope === "regional") {
      const invalid = claim.citationSnapshotIds.some((id) => {
        const source = sourceById.get(id);
        return !source?.localEvidence || !(source.supportedDimensions || [source.dimension]).includes(claim.dimension);
      });
      if (invalid) violations.push(hard("INVALID_REGIONAL_SUPPORT", "CLAIM-LOCALITY-001", "区域判断必须由本地合格证据支持相同研究维度。", `claims.${index}`, true));
    }
  });
  const differentiation = analysis.differentiation;
  if (!differentiation) {
    violations.push(hard("MISSING_DIFFERENTIATION", "DIFF-STRUCTURE-001", "缺少跨区域综合生成的结构化差异。", `regions.${region.id}.differentiation`, true));
    return violations;
  }
  if (differentiation.provisional && !differentiation.missingRegionIds.length) violations.push(hard("INVALID_PROVISIONAL_STATE", "DIFF-PROVISIONAL-001", "临时综合必须列出缺失区域。", `regions.${region.id}.differentiation`));
  const roles = ["audience", "channel", "culture", "constraint", "contrast"];
  differentiation.sentences.forEach((sentence, index) => {
    if (sentence.role !== roles[index]) violations.push(hard("INVALID_SENTENCE_ROLE", "DIFF-STRUCTURE-002", `第 ${index + 1} 句角色不正确。`, `sentences.${index}`, true));
    const length = chineseLength(sentence.text.replace(/。$/, ""));
    const min = index === 4 ? 65 : 55;
    const max = index === 4 ? 85 : 75;
    if (length < min || length > max) violations.push(hard("INVALID_SENTENCE_LENGTH", "DIFF-LENGTH-001", `第 ${index + 1} 句为 ${length} 字，必须为 ${min}-${max} 字。`, `sentences.${index}.text`, true));
    if (!sentence.text.endsWith("。")) violations.push(hard("MISSING_FULL_STOP", "DIFF-STRUCTURE-003", `第 ${index + 1} 句必须以句号结尾。`, `sentences.${index}.text`, true));
    if (!sentence.citationSnapshotIds.length || sentence.citationSnapshotIds.some((id) => !sourceIds.has(id) || !sourceById.get(id)?.localEvidence)) violations.push(hard("INVALID_SENTENCE_CITATION", "DIFF-EVIDENCE-001", `第 ${index + 1} 句缺少本地合格证据。`, `sentences.${index}`, true));
    if (COMMON_TOPIC_KEYS.has(sentence.topicKey)) violations.push(hard("COMMON_TOPIC_IN_DIFFERENTIATION", "DIFF-UNIQUE-001", `${sentence.topicKey} 属于共同基线。`, `sentences.${index}.topicKey`, true));
    if (index === 4 && (!sentence.comparedRegionIds.length || sentence.citationSnapshotIds.length < 2)) violations.push(hard("INVALID_CONTRAST", "DIFF-CONTRAST-001", "第 5 句必须点名对比区域并引用双方证据。", `sentences.${index}`, true));
  });
  const ownTopics = new Set(differentiation.sentences.map((item) => item.topicKey));
  for (const peer of allRegions.filter((item) => item.id !== region.id && item.analysis?.differentiation)) {
    const peerTopics = new Set(peer.analysis!.differentiation!.sentences.map((item) => item.topicKey));
    for (const topic of ownTopics) if (peerTopics.has(topic)) violations.push(hard("DUPLICATE_TOPIC_KEY", "DIFF-UNIQUE-002", `主题 ${topic} 已用于 ${peer.name}。`, `regions.${region.id}`, true));
    if (textSimilarity(differentiation.paragraph, peer.analysis!.differentiation!.paragraph) >= 0.42) violations.push(hard("PAIRWISE_SIMILARITY", "DIFF-UNIQUE-003", `与 ${peer.name} 的差异段落过于相似。`, `regions.${region.id}`, true));
  }
  return violations;
}

export function fingerprintInputs(project: ProjectSnapshot, regions: RegionConfig[], citations: ResearchCitation[]) {
  return stableHash(JSON.stringify({ projectUpdatedAt: project.updatedAt, brief: project.brief, regions: regions.map((r) => [r.id, r.status, r.analysis?.generatedAt]), snapshots: citations.map((c) => c.id).sort() }));
}

export function validatePlanApproval(project: ProjectSnapshot, regions: RegionConfig[], citations: ResearchCitation[], plan: ReleasePlan) {
  const violations: QualityViolation[] = [];
  const selected = regions.filter((item) => item.selected && item.status === "quality_passed");
  const allSelected = regions.filter((item) => item.selected);
  if (selected.length !== allSelected.length) violations.push(hard("REGIONAL_QUALITY_INCOMPLETE", "PLAN-COVERAGE-000", "所有已选区域必须先自动通过质量门。", "plan.regions"));
  if (selected.some((item) => item.analysis?.differentiation?.provisional)) violations.push(hard("PROVISIONAL_DIFFERENTIATION", "PLAN-COVERAGE-002", "临时差异综合不可用于最终方案。", "plan.regions"));
  const expected = selected.map((item) => item.id).sort();
  const actual = plan.regions.map((item) => item.regionId).sort();
  if (new Set(actual).size !== actual.length || JSON.stringify(expected) !== JSON.stringify(actual)) violations.push(hard("INCOMPLETE_REGION_COVERAGE", "PLAN-COVERAGE-001", "方案必须且只能包含全部已选且质量通过的区域各一次。", "plan.regions"));
  const symbiosisPlans = plan.characterSymbiosisRelease || [];
  const symbiosisActual = symbiosisPlans.map((item) => item.regionId).sort();
  if (new Set(symbiosisActual).size !== symbiosisActual.length || JSON.stringify(expected) !== JSON.stringify(symbiosisActual)) violations.push(hard("INCOMPLETE_SYMBIOSIS_COVERAGE", "SYMBIOSIS-COVERAGE-001", "角色共生发行方案必须且只能覆盖每个已选区域一次。", "plan.characterSymbiosisRelease"));
  const validSnapshots = new Set(citations.map((item) => item.id));
  if (plan.sourceIds.some((id) => !validSnapshots.has(id))) violations.push(hard("INVALID_PLAN_SOURCE", "PLAN-PROVENANCE-001", "方案引用了不存在的证据快照。", "plan.sourceIds"));
  symbiosisPlans.forEach((item, index) => {
    if (item.sourceIds.some((id) => !validSnapshots.has(id))) violations.push(hard("INVALID_SYMBIOSIS_SOURCE", "SYMBIOSIS-PROVENANCE-001", `${item.regionName}角色共生任务引用了无效证据。`, `plan.characterSymbiosisRelease.${index}.sourceIds`));
    for (let peerIndex = index + 1; peerIndex < symbiosisPlans.length; peerIndex += 1) {
      const peer = symbiosisPlans[peerIndex];
      const itemTalkTrack = item.characterTasks.map((task) => `${task.versionMessage}${task.communicationAngle}${task.interactionScene}${task.tone}`).join("");
      const peerTalkTrack = peer.characterTasks.map((task) => `${task.versionMessage}${task.communicationAngle}${task.interactionScene}${task.tone}`).join("");
      if (textSimilarity(itemTalkTrack, peerTalkTrack) >= 0.55) violations.push(hard("SYMBIOSIS_TALK_TRACK_REUSE", "SYMBIOSIS-UNIQUE-001", `${item.regionName} 与 ${peer.regionName} 共用了过于相似的角色话术。`, `plan.characterSymbiosisRelease.${index}`, true));
    }
  });
  if (plan.inputFingerprint !== fingerprintInputs(project, regions, citations)) violations.push(hard("STALE_INPUTS", "PLAN-STALE-001", "方案输入已变化，必须重新生成。", "plan.inputFingerprint"));
  const envelope = plan.budgetEnvelope;
  if (!envelope?.confirmed) violations.push(hard("UNCONFIRMED_BUDGET", "BUDGET-CONFIRM-001", "结构化预算尚未由已批准输入确认。", "plan.budgetEnvelope"));
  if (envelope) {
    const allocations = plan.regions.map((item) => item.budgetAllocation?.amount ?? Number.NaN);
    if (allocations.some(Number.isNaN)) violations.push(hard("INVALID_BUDGET", "BUDGET-STRUCTURE-001", "每个区域必须有结构化 CNY 预算。", "plan.regions"));
    const sum = allocations.filter(Number.isFinite).reduce((a, b) => a + b, 0);
    if (sum + envelope.riskReserve > envelope.allocatable) violations.push(hard("BUDGET_OVERFLOW", "BUDGET-RECONCILE-001", `区域预算 ${sum} 万元加单一储备 ${envelope.riskReserve} 万元超过可分配 ${envelope.allocatable} 万元。`, "plan.budgetEnvelope"));
    if (envelope.riskReserve < 174) violations.push(hard("RESERVE_TOO_LOW", "BUDGET-RESERVE-001", "全局风险储备不得低于 174 万元。", "plan.budgetEnvelope.riskReserve"));
  }
  violations.push(...scanRedlines(JSON.stringify(plan), project.humanContract));
  return violations;
}

export function assertNoHardViolations(message: string, violations: QualityViolation[]) {
  const hardViolations = violations.filter((item) => item.severity === "hard");
  if (hardViolations.length) throw new GovernanceError(message, hardViolations);
}
