import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  gameName: text("game_name").notNull().default(""),
  versionName: text("version_name").notNull().default(""),
  launchDate: text("launch_date").notNull().default(""),
  platforms: text("platforms").notNull().default("[]"),
  campaignStartWeek: integer("campaign_start_week").notNull().default(-8),
  campaignEndWeek: integer("campaign_end_week").notNull().default(4),
  objective: text("objective").notNull().default(""),
  sellingPoints: text("selling_points").notNull().default("[]"),
  contentAssets: text("content_assets").notNull().default("[]"),
  businessGoal: text("business_goal").notNull().default(""),
  totalBudget: text("total_budget").notNull().default(""),
  budgetConfirmed: integer("budget_confirmed", { mode: "boolean" }).notNull().default(false),
  kpis: text("kpis").notNull().default("[]"),
  characterProfiles: text("character_profiles").notNull().default("[]"),
  constraints: text("constraints").notNull().default(""),
  evidenceMode: text("evidence_mode").notNull().default("campaign_cutoff"),
  planningAsOfDate: text("planning_as_of_date").notNull().default(""),
  planningAsOfConfirmed: integer("planning_as_of_confirmed", { mode: "boolean" }).notNull().default(false),
  activeResearchRunId: text("active_research_run_id").notNull().default(""),
  brief: text("brief"),
  briefStatus: text("brief_status").notNull().default("draft"),
  plan: text("plan"),
  planStatus: text("plan_status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const researchRuns = sqliteTable("research_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  batchId: text("batch_id").notNull().default(""),
  evidenceMode: text("evidence_mode").notNull(),
  cutoffAt: text("cutoff_at").notNull().default(""),
  planningAsOfDate: text("planning_as_of_date").notNull().default(""),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  providerConfig: text("provider_config").notNull().default("{}"),
  queryPlanVersion: text("query_plan_version").notNull().default(""),
  status: text("status").notNull().default("processing"),
  quality: text("quality").notNull().default("[]"),
  synthesisStatus: text("synthesis_status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const evidenceSources = sqliteTable("evidence_sources", {
  id: text("id").primaryKey(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  title: text("title").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const evidenceSnapshots = sqliteTable("evidence_snapshots", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  runId: text("run_id").notNull(),
  projectId: text("project_id").notNull(),
  regionId: text("region_id").notNull(),
  dimension: text("dimension").notNull(),
  displayId: text("display_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publisher: text("publisher").notNull().default(""),
  publishedAt: text("published_at").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  query: text("query").notNull().default(""),
  language: text("language").notNull().default(""),
  marketScope: text("market_scope").notNull().default(""),
  qualityTier: text("quality_tier").notNull().default("unknown"),
  contentHash: text("content_hash").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  origin: text("origin").notNull().default("research"),
  verificationStatus: text("verification_status").notNull().default("unreachable"),
  claimedPublishedAt: text("claimed_published_at").notNull().default(""),
  verifiedPublishedAt: text("verified_published_at").notNull().default(""),
  detectedLanguage: text("detected_language").notNull().default(""),
  publisherMarket: text("publisher_market").notNull().default(""),
  contentMarket: text("content_market").notNull().default(""),
  claimScope: text("claim_scope").notNull().default("global_context"),
  relevanceScore: real("relevance_score").notNull().default(0),
  rejectionReason: text("rejection_reason").notNull().default(""),
});

export const evidenceSnapshotRegions = sqliteTable("evidence_snapshot_regions", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull(),
  regionId: text("region_id").notNull(),
  displayId: text("display_id").notNull(),
  localEvidence: integer("local_evidence", { mode: "boolean" }).notNull().default(false),
});

export const evidenceSnapshotDimensions = sqliteTable("evidence_snapshot_dimensions", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull(),
  regionId: text("region_id").notNull(),
  dimension: text("dimension").notNull(),
  query: text("query").notNull().default(""),
});

export const claimEvidence = sqliteTable("claim_evidence", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  regionId: text("region_id").notNull(),
  claimPath: text("claim_path").notNull(),
  requirementId: text("requirement_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
});

export const evidenceDiscoveries = sqliteTable("evidence_discoveries", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  regionId: text("region_id").notNull(),
  dimension: text("dimension").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  canonicalSourceId: text("canonical_source_id").notNull(),
  provider: text("provider").notNull(),
  query: text("query").notNull(),
  round: integer("round").notNull(),
  rank: integer("rank").notNull(),
  score: real("score").notNull().default(0),
  requestId: text("request_id").notNull().default(""),
  claimedPublishedAt: text("claimed_published_at").notNull().default(""),
  discoveredAt: text("discovered_at").notNull(),
});

export const searchResultCache = sqliteTable("search_result_cache", {
  cacheKey: text("cache_key").primaryKey(),
  provider: text("provider").notNull(),
  query: text("query").notNull(),
  regionCode: text("region_code").notNull(),
  dimension: text("dimension").notNull(),
  cutoffAt: text("cutoff_at").notNull().default(""),
  queryPlanVersion: text("query_plan_version").notNull(),
  payload: text("payload").notNull(),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
});

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at").notNull(),
});

export const regions = sqliteTable("regions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  language: text("language").notNull().default(""),
  timezone: text("timezone").notNull().default(""),
  note: text("note").notNull().default(""),
  preset: integer("preset", { mode: "boolean" }).notNull().default(false),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("draft"),
  analysis: text("analysis"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  extension: text("extension").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull(),
  filePath: text("file_path").notNull(),
  parser: text("parser").notNull().default("pending"),
  status: text("status").notNull().default("uploaded"),
  extractedText: text("extracted_text").notNull().default(""),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const citations = sqliteTable("citations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  regionId: text("region_id").notNull(),
  dimension: text("dimension").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publisher: text("publisher").notNull().default(""),
  publishedAt: text("published_at").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  query: text("query").notNull().default(""),
  manual: integer("manual", { mode: "boolean" }).notNull().default(false),
  origin: text("origin").notNull().default("research"),
  createdAt: text("created_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull(),
  scopeId: text("scope_id").notNull(),
  externalId: text("external_id").notNull().default(""),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  phase: text("phase").notNull().default(""),
  attempt: integer("attempt").notNull().default(0),
  result: text("result").notNull().default(""),
  inputFingerprint: text("input_fingerprint").notNull().default(""),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
