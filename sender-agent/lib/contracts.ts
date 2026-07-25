import { z } from "zod";

export const WorkflowStatusSchema = z.enum([
  "draft",
  "processing",
  "needs_review",
  "approved",
  "stale",
  "failed",
  "evidence_gap",
  "blocked",
  "quality_passed",
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const EvidenceModeSchema = z.enum(["campaign_cutoff", "latest"]);
export type EvidenceMode = z.infer<typeof EvidenceModeSchema>;

export const QualityViolationSchema = z.object({
  code: z.string().min(1),
  ruleId: z.string().min(1),
  severity: z.enum(["hard", "warning"]),
  message: z.string().min(1),
  path: z.string().default(""),
  repairable: z.boolean().default(false),
});
export type QualityViolation = z.infer<typeof QualityViolationSchema>;

export const HumanRequirementSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["objective", "priority", "fact", "required", "forbidden", "budget", "evidence", "format"]),
  text: z.string().min(1),
  source: z.enum(["project", "brief", "human"]).default("human"),
});
export const HumanContractSchema = z.object({
  version: z.literal(2),
  approved: z.boolean(),
  instructionOrder: z.array(z.string()).length(6),
  requirements: z.array(HumanRequirementSchema),
});
export type HumanContract = z.infer<typeof HumanContractSchema>;

export const BudgetEnvelopeSchema = z.object({
  currency: z.literal("CNY"),
  unit: z.literal("万元"),
  total: z.number().nonnegative(),
  lockedProduction: z.number().nonnegative(),
  allocatable: z.number().nonnegative(),
  riskReserve: z.number().nonnegative(),
  regionalCapTotal: z.number().nonnegative(),
  confirmed: z.boolean(),
});
export type BudgetEnvelope = z.infer<typeof BudgetEnvelopeSchema>;

export const ProjectInputSchema = z.object({
  gameName: z.string().trim().max(120).default(""),
  versionName: z.string().trim().max(120).default(""),
  launchDate: z.string().default(""),
  platforms: z.array(z.string().trim().max(40)).max(12).default([]),
  campaignStartWeek: z.number().int().min(-52).max(0).default(-8),
  campaignEndWeek: z.number().int().min(0).max(52).default(4),
  objective: z.string().max(4000).default(""),
  sellingPoints: z.array(z.string().max(1000)).max(30).default([]),
  contentAssets: z.array(z.string().max(1000)).max(50).default([]),
  businessGoal: z.string().max(4000).default(""),
  totalBudget: z.string().max(120).default(""),
  budgetConfirmed: z.boolean().default(false),
  kpis: z.array(z.string().max(500)).max(30).default([]),
  characterProfiles: z.array(z.string().max(2000)).max(30).default([]),
  constraints: z.string().max(4000).default(""),
  evidenceMode: EvidenceModeSchema.default("campaign_cutoff"),
  planningAsOfDate: z.string().default(""),
  planningAsOfConfirmed: z.boolean().default(false),
});
export type ProjectInput = z.infer<typeof ProjectInputSchema>;

export const AutofillFieldSchema = z.enum([
  "gameName",
  "versionName",
  "launchDate",
  "platforms",
  "objective",
  "sellingPoints",
  "contentAssets",
  "businessGoal",
  "totalBudget",
  "kpis",
  "characterProfiles",
  "constraints",
]);
export type AutofillField = z.infer<typeof AutofillFieldSchema>;

const STRING_AUTOFILL_FIELDS = new Set<AutofillField>([
  "gameName",
  "versionName",
  "launchDate",
  "objective",
  "businessGoal",
  "totalBudget",
  "constraints",
]);

export const AutofillSuggestionSchema = z.object({
  field: AutofillFieldSchema,
  value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceIds: z.array(z.string().min(1)).min(1).max(20),
}).superRefine((suggestion, context) => {
  const expectsString = STRING_AUTOFILL_FIELDS.has(suggestion.field);
  if (expectsString !== (typeof suggestion.value === "string")) {
    context.addIssue({ code: "custom", message: `${suggestion.field} 的值类型不正确`, path: ["value"] });
  }
  if (suggestion.field === "launchDate" && typeof suggestion.value === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(suggestion.value)) {
    context.addIssue({ code: "custom", message: "计划上线日期必须使用 YYYY-MM-DD 格式", path: ["value"] });
  }
});
export type AutofillSuggestion = z.infer<typeof AutofillSuggestionSchema>;

export const AutofillEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["document", "web"]),
  title: z.string().min(1),
  snippet: z.string().default(""),
  sourceId: z.string().default(""),
  locator: z.string().default(""),
  url: z.union([z.string().url(), z.literal("")]).default(""),
  publisher: z.string().default(""),
  publishedAt: z.string().default(""),
});
export type AutofillEvidence = z.infer<typeof AutofillEvidenceSchema>;

export const AutofillToolTraceSchema = z.object({
  tool: z.enum([
    "read_current_form",
    "list_uploaded_documents",
    "search_internal_documents",
    "web_search_public_facts",
    "get_current_date",
  ]),
  status: z.enum(["completed", "failed"]),
  resultCount: z.number().int().min(0),
  label: z.string().default(""),
});
export type AutofillToolTrace = z.infer<typeof AutofillToolTraceSchema>;

export const AutofillModelOutputSchema = z.object({
  suggestions: z.array(AutofillSuggestionSchema).max(12),
  warnings: z.array(z.string()).max(20).default([]),
}).superRefine((output, context) => {
  const seen = new Set<string>();
  output.suggestions.forEach((suggestion, index) => {
    if (seen.has(suggestion.field)) {
      context.addIssue({ code: "custom", message: `字段 ${suggestion.field} 重复`, path: ["suggestions", index, "field"] });
    }
    seen.add(suggestion.field);
  });
});
export type AutofillModelOutput = z.infer<typeof AutofillModelOutputSchema>;

export const ProjectAutofillResponseSchema = AutofillModelOutputSchema.extend({
  evidence: z.array(AutofillEvidenceSchema).max(100),
  toolTrace: z.array(AutofillToolTraceSchema).max(10),
});
export type ProjectAutofillResponse = z.infer<typeof ProjectAutofillResponseSchema>;

export const SourceFactSchema = z.object({
  text: z.string(),
  sourceId: z.string(),
  locator: z.string().default(""),
  category: z.enum(["goal", "selling_point", "asset", "business", "character", "constraint", "other"]),
});
export type SourceFact = z.infer<typeof SourceFactSchema>;

export const VersionBriefSchema = z.object({
  dataFreezeDate: z.string().default(""),
  executiveSummary: z.string(),
  goals: z.array(z.string()),
  sellingPoints: z.array(z.string()),
  assetInventory: z.array(z.string()),
  businessExpectations: z.array(z.string()),
  characterProfiles: z.array(z.string()),
  constraints: z.array(z.string()),
  sourceFacts: z.array(SourceFactSchema).default([]),
});
export type VersionBrief = z.infer<typeof VersionBriefSchema>;

export const RegionConfigSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string().min(1).max(80),
  language: z.string().max(80).default(""),
  timezone: z.string().max(80).default(""),
  note: z.string().max(1000).default(""),
  preset: z.boolean().default(false),
  selected: z.boolean().default(false),
  status: WorkflowStatusSchema.default("draft"),
  analysis: z.lazy(() => RegionAnalysisSchema).nullable().default(null),
});
export type RegionConfig = z.infer<typeof RegionConfigSchema>;

export const CitationOriginSchema = z.enum(["research", "manual", "agent"]);
export type CitationOrigin = z.infer<typeof CitationOriginSchema>;

export const ResearchCitationSchema = z.object({
  id: z.string(),
  displayId: z.string().default(""),
  researchRunId: z.string().default(""),
  canonicalSourceId: z.string().default(""),
  regionId: z.string(),
  dimension: z.enum(["player", "market", "sentiment", "culture", "manual"]),
  title: z.string(),
  url: z.string().url(),
  publisher: z.string().default(""),
  publishedAt: z.string().default(""),
  snippet: z.string().default(""),
  query: z.string().default(""),
  manual: z.boolean().default(false),
  origin: CitationOriginSchema.default("research"),
  retrievedAt: z.string().default(""),
  contentHash: z.string().default(""),
  language: z.string().default(""),
  marketScope: z.string().default(""),
  qualityTier: z.enum(["primary", "authoritative", "trade", "community", "unknown"]).default("unknown"),
  verificationStatus: z.enum(["verified", "discovered", "conflict", "missing_date", "unreachable", "rejected", "manual"]).default("unreachable"),
  claimedPublishedAt: z.string().default(""),
  verifiedPublishedAt: z.string().default(""),
  detectedLanguage: z.string().default(""),
  publisherMarket: z.string().default(""),
  contentMarket: z.string().default(""),
  claimScope: z.enum(["regional", "global_context", "irrelevant"]).default("global_context"),
  supportedDimensions: z.array(z.enum(["player", "market", "sentiment", "culture", "manual"])).default([]),
  relevanceScore: z.number().min(0).max(1).default(0),
  rejectionReason: z.string().default(""),
  localEvidence: z.boolean().default(false),
});
type ResearchCitationOutput = z.infer<typeof ResearchCitationSchema>;
type ResearchCitationMetadataKey = "displayId" | "researchRunId" | "canonicalSourceId" | "origin" | "retrievedAt" | "contentHash" | "language" | "marketScope" | "qualityTier" | "verificationStatus" | "claimedPublishedAt" | "verifiedPublishedAt" | "detectedLanguage" | "publisherMarket" | "contentMarket" | "claimScope" | "supportedDimensions" | "relevanceScore" | "rejectionReason" | "localEvidence";
export type ResearchCitation = Omit<ResearchCitationOutput, ResearchCitationMetadataKey> & Partial<Pick<ResearchCitationOutput, ResearchCitationMetadataKey>>;

export const ResearchClaimSchema = z.object({
  text: z.string(),
  citationIds: z.array(z.string()).min(1),
  citationSnapshotIds: z.array(z.string()).min(1),
  requirementIds: z.array(z.string()).min(1),
  claimScope: z.enum(["regional", "global_context"]),
  dimension: z.enum(["player", "market", "sentiment", "culture"]),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ResearchClaim = z.infer<typeof ResearchClaimSchema>;

export const DifferentiationSentenceRoleSchema = z.enum(["audience", "channel", "culture", "constraint", "contrast"]);
export const DifferentiationSentenceSchema = z.object({
  role: DifferentiationSentenceRoleSchema,
  topicKey: z.string().min(2),
  text: z.string().min(1),
  citationSnapshotIds: z.array(z.string()).min(1),
  requirementIds: z.array(z.string()).min(1),
  comparedRegionIds: z.array(z.string()).default([]),
});
export const RegionalDifferentiationSchema = z.object({
  paragraph: z.string(),
  sentences: z.array(DifferentiationSentenceSchema).length(5),
  excludedCommonThemes: z.array(z.string()).default([]),
  provisional: z.boolean().default(false),
  missingRegionIds: z.array(z.string()).default([]),
  quality: z.object({
    uniquenessScore: z.number().min(0).max(1),
    evidenceCoverage: z.number().min(0).max(1),
    violations: z.array(QualityViolationSchema).default([]),
  }),
});
export type RegionalDifferentiation = z.infer<typeof RegionalDifferentiationSchema>;

export const RegionAnalysisSchema = z.object({
  playerSignals: z.array(ResearchClaimSchema),
  marketEnvironment: z.array(ResearchClaimSchema),
  sentimentAndCompetition: z.array(ResearchClaimSchema),
  culturalMoments: z.array(ResearchClaimSchema),
  differentiators: z.array(z.string()),
  differentiation: RegionalDifferentiationSchema.nullable().default(null),
  risks: z.array(z.string()),
  researchNote: z.string().default(""),
  generatedAt: z.string(),
});
export type RegionAnalysis = z.infer<typeof RegionAnalysisSchema>;

export const CharacterReleasePlanSchema = z.object({
  character: z.string(),
  audienceSegment: z.string(),
  relationshipStage: z.string(),
  objective: z.string(),
  voiceRules: z.array(z.string()),
  contentArc: z.array(z.string()),
  channels: z.array(z.object({ channel: z.string(), frequency: z.string(), role: z.string() })),
  tasks: z.array(z.object({ time: z.string(), action: z.string(), asset: z.string(), successSignal: z.string() })),
  assetDependencies: z.array(z.string()),
  sampleTopics: z.array(z.string()),
  guardrails: z.array(z.string()),
});
export type CharacterReleasePlan = z.infer<typeof CharacterReleasePlanSchema>;

export const CharacterSymbiosisTaskSchema = z.object({
  character: z.string().min(1),
  objective: z.string().min(1),
  playerSegment: z.string().min(1),
  versionMessage: z.string().min(1),
  communicationAngle: z.string().min(1),
  interactionScene: z.string().min(1),
  timing: z.string().min(1),
  frequency: z.string().min(1),
  tone: z.string().min(1),
  culturalNotes: z.array(z.string().min(1)).min(1),
  prohibitedBehaviors: z.array(z.string().min(1)).min(1),
  riskBoundaries: z.array(z.string().min(1)).min(1),
  expectedEffect: z.string().min(1),
  metrics: z.array(z.object({ name: z.string().min(1), target: z.string().min(1), measurementWindow: z.string().min(1) })).min(1),
});
export type CharacterSymbiosisTask = z.infer<typeof CharacterSymbiosisTaskSchema>;

export const RegionalCharacterSymbiosisPlanSchema = z.object({
  regionId: z.string().min(1),
  regionName: z.string().min(1),
  symbiosisObjective: z.string().min(1),
  targetPlayerGroups: z.array(z.string().min(1)).min(1),
  characterSuitableVersionMessages: z.array(z.string().min(1)).min(1),
  communicationEntryPointsAndScenes: z.array(z.string().min(1)).min(1),
  recommendedTimingAndFrequency: z.array(z.string().min(1)).min(1),
  toneExpressionAndCulturalNotes: z.array(z.string().min(1)).min(1),
  prohibitedBehaviorsAndRiskBoundaries: z.array(z.string().min(1)).min(1),
  expectedEffectsAndMetrics: z.array(z.string().min(1)).min(1),
  characterTasks: z.array(CharacterSymbiosisTaskSchema).min(1),
  regionalStrategyLinks: z.array(z.string().min(1)).min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
});
export type RegionalCharacterSymbiosisPlan = z.infer<typeof RegionalCharacterSymbiosisPlanSchema>;

export const RegionReleasePlanSchema = z.object({
  regionId: z.string(),
  regionName: z.string(),
  coreJudgment: z.string(),
  materialStrategy: z.array(z.string()),
  socialCadence: z.array(z.string()),
  kolPlan: z.array(z.string()),
  paidMedia: z.array(z.string()),
  partnerships: z.array(z.string()),
  timeline: z.array(z.object({ week: z.string(), focus: z.string(), actions: z.array(z.string()) })),
  kpis: z.array(z.string()),
  budget: z.array(z.string()),
  budgetAllocation: z.object({
    amount: z.number().nonnegative(),
    currency: z.literal("CNY"),
    unit: z.literal("万元"),
    cap: z.number().nonnegative(),
  }).nullable().default(null),
  riskNotes: z.array(z.string()),
  characterRelease: z.array(CharacterReleasePlanSchema),
});
export type RegionReleasePlan = z.infer<typeof RegionReleasePlanSchema>;

export const ReleasePlanSchema = z.object({
  globalAxis: z.string(),
  globalPrinciples: z.array(z.string()),
  commonMoments: z.array(z.string()),
  globalKpis: z.array(z.string()),
  regions: z.array(RegionReleasePlanSchema),
  characterSymbiosisRelease: z.array(RegionalCharacterSymbiosisPlanSchema).default([]),
  sourceIds: z.array(z.string()),
  researchRunId: z.string().default(""),
  evidenceMode: EvidenceModeSchema.default("campaign_cutoff"),
  evidenceCutoff: z.string().default(""),
  budgetEnvelope: BudgetEnvelopeSchema.nullable().default(null),
  qualityGateResults: z.array(QualityViolationSchema).default([]),
  inputFingerprint: z.string().default(""),
  generatedAt: z.string(),
});
export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;

export const PlanAgentGlobalFieldSchema = z.enum(["globalAxis", "globalPrinciples", "commonMoments", "globalKpis"]);
export const PlanAgentRegionFieldSchema = z.enum([
  "coreJudgment",
  "materialStrategy",
  "socialCadence",
  "kolPlan",
  "paidMedia",
  "partnerships",
  "timeline",
  "kpis",
  "budget",
  "budgetAllocation",
  "riskNotes",
]);
export const PlanAgentCharacterFieldSchema = z.enum([
  "character",
  "audienceSegment",
  "relationshipStage",
  "objective",
  "voiceRules",
  "contentArc",
  "channels",
  "tasks",
  "assetDependencies",
  "sampleTopics",
  "guardrails",
]);
export const PlanAgentSymbiosisFieldSchema = z.enum([
  "symbiosisObjective",
  "targetPlayerGroups",
  "characterSuitableVersionMessages",
  "communicationEntryPointsAndScenes",
  "recommendedTimingAndFrequency",
  "toneExpressionAndCulturalNotes",
  "prohibitedBehaviorsAndRiskBoundaries",
  "expectedEffectsAndMetrics",
  "characterTasks",
  "regionalStrategyLinks",
  "sourceIds",
]);

const PlanAgentPatchBaseSchema = z.object({
  value: z.unknown(),
  reason: z.string().min(1).max(600),
  sourceIds: z.array(z.string()).max(24).default([]),
});

export const PlanAgentPatchSchema = z.discriminatedUnion("scope", [
  PlanAgentPatchBaseSchema.extend({ scope: z.literal("global"), field: PlanAgentGlobalFieldSchema }),
  PlanAgentPatchBaseSchema.extend({ scope: z.literal("region"), regionId: z.string().min(1), field: PlanAgentRegionFieldSchema }),
  PlanAgentPatchBaseSchema.extend({ scope: z.literal("symbiosis"), regionId: z.string().min(1), field: PlanAgentSymbiosisFieldSchema }),
  PlanAgentPatchBaseSchema.extend({
    scope: z.literal("character"),
    regionId: z.string().min(1),
    characterIndex: z.number().int().nonnegative(),
    expectedCharacter: z.string().default(""),
    field: PlanAgentCharacterFieldSchema,
  }),
]);
export type PlanAgentPatch = z.infer<typeof PlanAgentPatchSchema>;

export const PlanAgentRequestSchema = z.object({
  message: z.string().trim().min(2).max(4_000),
  plan: ReleasePlanSchema,
  activeRegionId: z.string().default(""),
});
export type PlanAgentRequest = z.infer<typeof PlanAgentRequestSchema>;

export const PlanAgentPhaseSchema = z.enum(["thinking", "reading", "searching_sources", "searching_web", "editing", "saving", "completed", "failed", "undone"]);
export type PlanAgentPhase = z.infer<typeof PlanAgentPhaseSchema>;

export const PlanAgentToolLogSchema = z.object({
  name: z.string(),
  label: z.string(),
  at: z.string(),
  count: z.number().int().nonnegative().default(0),
});
export type PlanAgentToolLog = z.infer<typeof PlanAgentToolLogSchema>;

export const PlanAgentRunRecordSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  userMessage: z.string(),
  assistantSummary: z.string().default(""),
  activeRegionId: z.string().default(""),
  beforePlan: ReleasePlanSchema,
  afterPlan: ReleasePlanSchema,
  beforeFingerprint: z.string(),
  afterFingerprint: z.string(),
  patches: z.array(PlanAgentPatchSchema),
  toolLog: z.array(PlanAgentToolLogSchema),
  sourceIds: z.array(z.string()),
  startedAt: z.string(),
  updatedAt: z.string(),
  error: z.string().default(""),
  undoneAt: z.string().default(""),
});
export type PlanAgentRunRecord = z.infer<typeof PlanAgentRunRecordSchema>;

export type PlanAgentStreamEvent =
  | { type: "started"; runId: string }
  | { type: "phase"; phase: PlanAgentPhase; label: string }
  | { type: "source"; source: ResearchCitation }
  | { type: "patch"; patch: PlanAgentPatch; plan: ReleasePlan; highlightKey: string }
  | { type: "done"; record: PlanAgentRunRecord }
  | { type: "error"; message: string; runId?: string; partialApplied: boolean; canUndo: boolean };

export const GlobalReleaseAxisSchema = ReleasePlanSchema.pick({
  globalAxis: true,
  globalPrinciples: true,
  commonMoments: true,
  globalKpis: true,
  sourceIds: true,
});
export type GlobalReleaseAxis = z.infer<typeof GlobalReleaseAxisSchema>;

export const PlanGenerationPhaseSchema = z.enum([
  "queued",
  "global_axis",
  "regional_plans",
  "assembling",
  "completed",
  "failed",
]);
export type PlanGenerationPhase = z.infer<typeof PlanGenerationPhaseSchema>;

export const PlanGenerationPreviewSchema = z.object({
  version: z.literal(1),
  projectUpdatedAt: z.string(),
  inputFingerprint: z.string().default(""),
  phase: PlanGenerationPhaseSchema,
  global: GlobalReleaseAxisSchema.nullable(),
  regions: z.array(RegionReleasePlanSchema),
  characterSymbiosisRelease: z.array(RegionalCharacterSymbiosisPlanSchema).default([]),
  regionOrder: z.array(z.object({ id: z.string(), name: z.string() })),
  activeRegionIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  completedSections: z.number().int().nonnegative(),
  totalSections: z.number().int().positive(),
  startedAt: z.string(),
  updatedAt: z.string(),
});
export type PlanGenerationPreview = z.infer<typeof PlanGenerationPreviewSchema>;

export type ProjectSnapshot = ProjectInput & {
  id: string;
  brief: VersionBrief | null;
  briefStatus: WorkflowStatus;
  plan: ReleasePlan | null;
  planStatus: WorkflowStatus;
  humanContract: HumanContract;
  budgetEnvelope: BudgetEnvelope | null;
  evidenceCutoff: string;
  planningAsOfDate: string;
  planningAsOfConfirmed: boolean;
  activeResearchRunId: string;
  createdAt: string;
  updatedAt: string;
};

export type SourceDocument = {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  parser: "local" | "cloud" | "pending";
  status: "uploaded" | "processing" | "parsed" | "needs_cloud" | "failed";
  extractedLength: number;
  error: string;
  createdAt: string;
};

export type GenerationJob = {
  id: string;
  type: "cloud_parse" | "brief" | "research" | "plan" | "plan_agent";
  scopeId: string;
  status: "queued" | "processing" | "completed" | "failed" | "evidence_gap" | "needs_review" | "blocked" | "quality_passed";
  progress: number;
  phase: ResearchPhase | PlanGenerationPhase | PlanAgentPhase | "";
  attempt: number;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export const ResearchPhaseSchema = z.enum([
  "queued",
  "searching",
  "verifying",
  "quality_check",
  "synthesizing",
  "provisional_synthesis",
  "saving",
  "quality_passed",
  "blocked",
  "evidence_gap",
  "retry_wait",
  "failed",
]);
export type ResearchPhase = z.infer<typeof ResearchPhaseSchema>;

export type RegionResearchBatchItem = {
  jobId: string;
  regionId: string;
  regionName: string;
  status: GenerationJob["status"];
  phase: ResearchPhase;
  progress: number;
  attempt: number;
  error: string;
  diagnostics?: Array<{ url: string; dimension: string; status: string; reason: string; provider?: "glm" | "curated_web" | "verifier"; round?: number; query?: string; requestId?: string; resultCount?: number; acceptedCount?: number; latencyMs?: number; rateLimited?: boolean; credits?: number; source?: "live" | "cache"; cachedAt?: string }>;
  providerStats?: Record<string, { requests: number; cached: number; results: number; accepted: number; failures: number; latencyMs: number; credits: number }>;
  violations?: QualityViolation[];
};

export type RegionResearchBatch = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  total: number;
  queued: number;
  processing: number;
  completed: number;
  qualityPassed: number;
  evidenceGap: number;
  failed: number;
  synthesisStatus: "pending" | "provisional" | "completed" | "blocked";
  activeConcurrency: number;
  demoCacheReplay: boolean;
  etaSeconds: number;
  providers?: {
    glm: { configured: boolean; model: string };
  };
  items: RegionResearchBatchItem[];
  createdAt: string;
  updatedAt: string;
};

export type RegionGraphNode = {
  id: string;
  kind: "core" | "region" | "dimension" | "evidence";
  label: string;
  regionId: string;
  position: [number, number, number];
  radius: number;
  status: WorkflowStatus | ResearchPhase;
  dimension?: ResearchCitation["dimension"];
  citationId?: string;
};

export type RegionGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "core" | "dimension" | "evidence" | "similarity";
  strength: number;
};

export const PRESET_REGIONS = [
  { code: "cn", name: "中国大陆", language: "简体中文", timezone: "Asia/Shanghai" },
  { code: "jp", name: "日本", language: "日语", timezone: "Asia/Tokyo" },
  { code: "kr", name: "韩国", language: "韩语", timezone: "Asia/Seoul" },
  { code: "na", name: "北美", language: "英语", timezone: "America/Los_Angeles" },
  { code: "eu", name: "欧洲", language: "英语 / 多语言", timezone: "Europe/Berlin" },
  { code: "sea", name: "东南亚", language: "英语 / 当地语言", timezone: "Asia/Singapore" },
  { code: "hmt", name: "港澳台", language: "繁体中文", timezone: "Asia/Hong_Kong" },
] as const;

export const EMPTY_PROJECT: ProjectInput = {
  gameName: "",
  versionName: "",
  launchDate: "",
  platforms: [],
  campaignStartWeek: -8,
  campaignEndWeek: 4,
  objective: "",
  sellingPoints: [],
  contentAssets: [],
  businessGoal: "",
  totalBudget: "",
  budgetConfirmed: false,
  kpis: [],
  characterProfiles: [],
  constraints: "",
  evidenceMode: "campaign_cutoff",
  planningAsOfDate: "",
  planningAsOfConfirmed: false,
};
