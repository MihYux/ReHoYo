import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import {
  EMPTY_PROJECT,
  PRESET_REGIONS,
  ProjectInputSchema,
  RegionAnalysisSchema,
  ReleasePlanSchema,
  VersionBriefSchema,
  type ProjectInput,
  type ProjectSnapshot,
  type RegionConfig,
  type ResearchCitation,
  type SourceDocument,
} from "@/lib/contracts";
import { buildHumanContract, GOVERNANCE_VERSION, parseBudgetEnvelope, planningEvidenceCutoff } from "@/lib/governance";
import { claimEvidence, citations, evidenceDiscoveries, evidenceSnapshotDimensions, evidenceSnapshotRegions, evidenceSnapshots, evidenceSources, jobs, projects, regions, researchRuns, schemaMigrations, searchResultCache, sources } from "@/lib/db/schema";

const dataDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_DIR || ".data");
export const uploadDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const client = createClient({ url: `file:${path.join(dataDir, "rehoyo.db").replace(/\\/g, "/")}` });
export const db = drizzle(client, { schema: { projects, regions, sources, citations, jobs, researchRuns, evidenceSources, evidenceSnapshots, evidenceSnapshotRegions, evidenceSnapshotDimensions, evidenceDiscoveries, searchResultCache, claimEvidence, schemaMigrations } });

const schemaSql = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, game_name TEXT NOT NULL DEFAULT '', version_name TEXT NOT NULL DEFAULT '',
  launch_date TEXT NOT NULL DEFAULT '', platforms TEXT NOT NULL DEFAULT '[]',
  campaign_start_week INTEGER NOT NULL DEFAULT -8, campaign_end_week INTEGER NOT NULL DEFAULT 4,
  objective TEXT NOT NULL DEFAULT '', selling_points TEXT NOT NULL DEFAULT '[]',
  content_assets TEXT NOT NULL DEFAULT '[]', business_goal TEXT NOT NULL DEFAULT '',
  total_budget TEXT NOT NULL DEFAULT '', budget_confirmed INTEGER NOT NULL DEFAULT 0, kpis TEXT NOT NULL DEFAULT '[]',
  character_profiles TEXT NOT NULL DEFAULT '[]', constraints TEXT NOT NULL DEFAULT '',
  evidence_mode TEXT NOT NULL DEFAULT 'campaign_cutoff', planning_as_of_date TEXT NOT NULL DEFAULT '',
  planning_as_of_confirmed INTEGER NOT NULL DEFAULT 0, active_research_run_id TEXT NOT NULL DEFAULT '',
  brief TEXT, brief_status TEXT NOT NULL DEFAULT 'draft', plan TEXT,
  plan_status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  preset INTEGER NOT NULL DEFAULT 0, selected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', analysis TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, extension TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream', size INTEGER NOT NULL,
  file_path TEXT NOT NULL, parser TEXT NOT NULL DEFAULT 'pending', status TEXT NOT NULL DEFAULT 'uploaded',
  extracted_text TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, region_id TEXT NOT NULL, dimension TEXT NOT NULL,
  title TEXT NOT NULL, url TEXT NOT NULL, publisher TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '', query TEXT NOT NULL DEFAULT '', manual INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'research', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, scope_id TEXT NOT NULL,
  external_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT '', attempt INTEGER NOT NULL DEFAULT 0, input_fingerprint TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, batch_id TEXT NOT NULL DEFAULT '', evidence_mode TEXT NOT NULL,
  cutoff_at TEXT NOT NULL DEFAULT '', planning_as_of_date TEXT NOT NULL DEFAULT '', prompt_version TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'processing',
  provider_config TEXT NOT NULL DEFAULT '{}', query_plan_version TEXT NOT NULL DEFAULT '',
  quality TEXT NOT NULL DEFAULT '[]', synthesis_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_sources (
  id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, run_id TEXT NOT NULL, project_id TEXT NOT NULL, region_id TEXT NOT NULL,
  dimension TEXT NOT NULL, display_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, publisher TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '', snippet TEXT NOT NULL DEFAULT '', query TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT '',
  market_scope TEXT NOT NULL DEFAULT '', quality_tier TEXT NOT NULL DEFAULT 'unknown', content_hash TEXT NOT NULL,
  retrieved_at TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'research', verification_status TEXT NOT NULL DEFAULT 'unreachable',
  claimed_published_at TEXT NOT NULL DEFAULT '', verified_published_at TEXT NOT NULL DEFAULT '', detected_language TEXT NOT NULL DEFAULT '',
  publisher_market TEXT NOT NULL DEFAULT '', content_market TEXT NOT NULL DEFAULT '', claim_scope TEXT NOT NULL DEFAULT 'global_context', relevance_score REAL NOT NULL DEFAULT 0, rejection_reason TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS evidence_snapshot_regions (
  id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, region_id TEXT NOT NULL, display_id TEXT NOT NULL, local_evidence INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS evidence_snapshot_dimensions (
  id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, region_id TEXT NOT NULL, dimension TEXT NOT NULL, query TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS claim_evidence (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, region_id TEXT NOT NULL, claim_path TEXT NOT NULL,
  requirement_id TEXT NOT NULL, snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_discoveries (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, region_id TEXT NOT NULL, dimension TEXT NOT NULL,
  snapshot_id TEXT NOT NULL, canonical_source_id TEXT NOT NULL, provider TEXT NOT NULL, query TEXT NOT NULL,
  round INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL DEFAULT 0, request_id TEXT NOT NULL DEFAULT '',
  claimed_published_at TEXT NOT NULL DEFAULT '', discovered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS search_result_cache (
  cache_key TEXT PRIMARY KEY, provider TEXT NOT NULL, query TEXT NOT NULL, region_code TEXT NOT NULL,
  dimension TEXT NOT NULL, cutoff_at TEXT NOT NULL DEFAULT '', query_plan_version TEXT NOT NULL,
  payload TEXT NOT NULL, hit_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
`;

let readyPromise: Promise<void> | null = null;
export function ensureDb() {
  if (!readyPromise) {
    readyPromise = client.executeMultiple(schemaSql).then(async () => {
      const jobColumns = await client.execute("PRAGMA table_info(jobs)");
      const jobColumnNames = new Set(jobColumns.rows.map((row) => String(row.name)));
      if (!jobColumnNames.has("phase")) await client.execute("ALTER TABLE jobs ADD COLUMN phase TEXT NOT NULL DEFAULT ''");
      if (!jobColumnNames.has("attempt")) await client.execute("ALTER TABLE jobs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0");
      if (!jobColumnNames.has("result")) await client.execute("ALTER TABLE jobs ADD COLUMN result TEXT NOT NULL DEFAULT ''");
      if (!jobColumnNames.has("input_fingerprint")) await client.execute("ALTER TABLE jobs ADD COLUMN input_fingerprint TEXT NOT NULL DEFAULT ''");
      const citationColumns = await client.execute("PRAGMA table_info(citations)");
      const citationColumnNames = new Set(citationColumns.rows.map((row) => String(row.name)));
      if (!citationColumnNames.has("origin")) await client.execute("ALTER TABLE citations ADD COLUMN origin TEXT NOT NULL DEFAULT 'research'");
      const projectColumns = await client.execute("PRAGMA table_info(projects)");
      const projectColumnNames = new Set(projectColumns.rows.map((row) => String(row.name)));
      if (!projectColumnNames.has("evidence_mode")) await client.execute("ALTER TABLE projects ADD COLUMN evidence_mode TEXT NOT NULL DEFAULT 'campaign_cutoff'");
      if (!projectColumnNames.has("active_research_run_id")) await client.execute("ALTER TABLE projects ADD COLUMN active_research_run_id TEXT NOT NULL DEFAULT ''");
      if (!projectColumnNames.has("budget_confirmed")) await client.execute("ALTER TABLE projects ADD COLUMN budget_confirmed INTEGER NOT NULL DEFAULT 0");
      if (!projectColumnNames.has("planning_as_of_date")) await client.execute("ALTER TABLE projects ADD COLUMN planning_as_of_date TEXT NOT NULL DEFAULT ''");
      if (!projectColumnNames.has("planning_as_of_confirmed")) await client.execute("ALTER TABLE projects ADD COLUMN planning_as_of_confirmed INTEGER NOT NULL DEFAULT 0");
      const runColumns = await client.execute("PRAGMA table_info(research_runs)");
      const runColumnNames = new Set(runColumns.rows.map((row) => String(row.name)));
      if (!runColumnNames.has("planning_as_of_date")) await client.execute("ALTER TABLE research_runs ADD COLUMN planning_as_of_date TEXT NOT NULL DEFAULT ''");
      if (!runColumnNames.has("synthesis_status")) await client.execute("ALTER TABLE research_runs ADD COLUMN synthesis_status TEXT NOT NULL DEFAULT 'pending'");
      if (!runColumnNames.has("provider_config")) await client.execute("ALTER TABLE research_runs ADD COLUMN provider_config TEXT NOT NULL DEFAULT '{}'");
      if (!runColumnNames.has("query_plan_version")) await client.execute("ALTER TABLE research_runs ADD COLUMN query_plan_version TEXT NOT NULL DEFAULT ''");
      const snapshotColumns = await client.execute("PRAGMA table_info(evidence_snapshots)");
      const snapshotColumnNames = new Set(snapshotColumns.rows.map((row) => String(row.name)));
      const snapshotAdditions: Array<[string, string]> = [
        ["verification_status", "TEXT NOT NULL DEFAULT 'unreachable'"],
        ["claimed_published_at", "TEXT NOT NULL DEFAULT ''"],
        ["verified_published_at", "TEXT NOT NULL DEFAULT ''"],
        ["detected_language", "TEXT NOT NULL DEFAULT ''"],
        ["publisher_market", "TEXT NOT NULL DEFAULT ''"],
        ["content_market", "TEXT NOT NULL DEFAULT ''"],
        ["claim_scope", "TEXT NOT NULL DEFAULT 'global_context'"],
        ["relevance_score", "REAL NOT NULL DEFAULT 0"],
        ["rejection_reason", "TEXT NOT NULL DEFAULT ''"],
      ];
      for (const [name, definition] of snapshotAdditions) {
        if (!snapshotColumnNames.has(name)) await client.execute(`ALTER TABLE evidence_snapshots ADD COLUMN ${name} ${definition}`);
      }
      const existing = await db.select().from(projects).where(eq(projects.id, "current")).limit(1);
      if (!existing.length) {
        const now = new Date().toISOString();
        await db.insert(projects).values({ id: "current", createdAt: now, updatedAt: now });
        await db.insert(regions).values(
          PRESET_REGIONS.map((region) => ({
            id: `region-${region.code}`,
            projectId: "current",
            ...region,
            preset: true,
            selected: ["jp", "kr", "na"].includes(region.code),
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
      const applied = await db.select().from(schemaMigrations).where(eq(schemaMigrations.id, GOVERNANCE_VERSION)).limit(1);
      if (!applied.length) {
        const migrationAt = new Date().toISOString();
        await db.transaction(async (tx) => {
          await tx.delete(claimEvidence);
          await tx.delete(evidenceDiscoveries);
          await tx.delete(evidenceSnapshotDimensions);
          await tx.delete(evidenceSnapshotRegions);
          await tx.delete(evidenceSnapshots);
          await tx.delete(evidenceSources);
          await tx.delete(researchRuns);
          await tx.delete(citations);
          await tx.delete(jobs);
          await tx.update(regions).set({ analysis: null, status: "draft", updatedAt: migrationAt });
          const [currentProject] = await tx.select().from(projects).where(eq(projects.id, "current")).limit(1);
          const existingBrief = currentProject?.brief ? json<Record<string, unknown>>(currentProject.brief, {}) : {};
          const dataFreezeDate = typeof existingBrief.dataFreezeDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(existingBrief.dataFreezeDate)
            ? existingBrief.dataFreezeDate
            : "2024-01-12";
          await tx.update(projects).set({
            brief: currentProject?.brief ? JSON.stringify({ ...existingBrief, dataFreezeDate }) : currentProject?.brief,
            planningAsOfDate: dataFreezeDate,
            planningAsOfConfirmed: Boolean(currentProject?.brief),
            plan: null,
            planStatus: "draft",
            activeResearchRunId: "",
            updatedAt: migrationAt,
          }).where(eq(projects.id, "current"));
          await tx.insert(schemaMigrations).values({ id: GOVERNANCE_VERSION, appliedAt: migrationAt });
        });
      }
    });
  }
  return readyPromise;
}

function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getProject(): Promise<ProjectSnapshot> {
  await ensureDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, "current")).limit(1);
  const input = ProjectInputSchema.parse({
    gameName: row.gameName,
    versionName: row.versionName,
    launchDate: row.launchDate,
    platforms: json(row.platforms, []),
    campaignStartWeek: row.campaignStartWeek,
    campaignEndWeek: row.campaignEndWeek,
    objective: row.objective,
    sellingPoints: json(row.sellingPoints, []),
    contentAssets: json(row.contentAssets, []),
    businessGoal: row.businessGoal,
    totalBudget: row.totalBudget,
    budgetConfirmed: row.budgetConfirmed,
    kpis: json(row.kpis, []),
    characterProfiles: json(row.characterProfiles, []),
    constraints: row.constraints,
    evidenceMode: row.evidenceMode,
    planningAsOfDate: row.planningAsOfDate,
    planningAsOfConfirmed: row.planningAsOfConfirmed,
  });
  const brief = row.brief ? VersionBriefSchema.parse(json(row.brief, null)) : null;
  const base = {
    id: row.id,
    ...input,
    brief,
    briefStatus: row.briefStatus as ProjectSnapshot["briefStatus"],
    plan: row.plan ? ReleasePlanSchema.parse(json(row.plan, null)) : null,
    planStatus: row.planStatus as ProjectSnapshot["planStatus"],
    evidenceCutoff: input.evidenceMode === "campaign_cutoff" ? planningEvidenceCutoff(input.planningAsOfDate) : "",
    activeResearchRunId: row.activeResearchRunId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return { ...base, humanContract: buildHumanContract(base as ProjectSnapshot, brief), budgetEnvelope: parseBudgetEnvelope(input.totalBudget, input.budgetConfirmed) };
}

export async function updateProject(input: ProjectInput) {
  await ensureDb();
  const current = await getProject();
  const parsed = ProjectInputSchema.parse(input);
  const briefStatus = current.briefStatus === "approved" ? "stale" : current.briefStatus;
  const planStatus = current.plan ? "stale" : current.planStatus;
  await db.update(projects).set({
    gameName: parsed.gameName,
    versionName: parsed.versionName,
    launchDate: parsed.launchDate,
    platforms: JSON.stringify(parsed.platforms),
    campaignStartWeek: parsed.campaignStartWeek,
    campaignEndWeek: parsed.campaignEndWeek,
    objective: parsed.objective,
    sellingPoints: JSON.stringify(parsed.sellingPoints),
    contentAssets: JSON.stringify(parsed.contentAssets),
    businessGoal: parsed.businessGoal,
    totalBudget: parsed.totalBudget,
    budgetConfirmed: parsed.budgetConfirmed,
    kpis: JSON.stringify(parsed.kpis),
    characterProfiles: JSON.stringify(parsed.characterProfiles),
    constraints: parsed.constraints,
    evidenceMode: parsed.evidenceMode,
    planningAsOfDate: parsed.planningAsOfDate,
    planningAsOfConfirmed: parsed.planningAsOfConfirmed,
    briefStatus,
    planStatus,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, "current"));
  if (current.briefStatus === "approved") {
    await db.update(regions).set({ status: "stale", updatedAt: new Date().toISOString() }).where(eq(regions.projectId, "current"));
  }
  return getProject();
}

export async function getRegions(): Promise<RegionConfig[]> {
  await ensureDb();
  const rows = await db.select().from(regions);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    language: row.language,
    timezone: row.timezone,
    note: row.note,
    preset: row.preset,
    selected: row.selected,
    status: row.status as RegionConfig["status"],
    analysis: row.analysis ? RegionAnalysisSchema.parse(json(row.analysis, null)) : null,
  }));
}

export async function getSources(): Promise<SourceDocument[]> {
  await ensureDb();
  const rows = await db.select().from(sources);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    extension: row.extension,
    mimeType: row.mimeType,
    size: row.size,
    parser: row.parser as SourceDocument["parser"],
    status: row.status as SourceDocument["status"],
    extractedLength: row.extractedText.length,
    error: row.error,
    createdAt: row.createdAt,
  }));
}

export async function getCitations(regionId?: string): Promise<ResearchCitation[]> {
  await ensureDb();
  const project = await getProject();
  const snapshotRows = project.activeResearchRunId ? await db.select().from(evidenceSnapshots) : [];
  const regionLinks = project.activeResearchRunId
    ? (regionId
      ? await db.select().from(evidenceSnapshotRegions).where(eq(evidenceSnapshotRegions.regionId, regionId))
      : await db.select().from(evidenceSnapshotRegions))
    : [];
  const dimensionLinks = project.activeResearchRunId
    ? (regionId
      ? await db.select().from(evidenceSnapshotDimensions).where(eq(evidenceSnapshotDimensions.regionId, regionId))
      : await db.select().from(evidenceSnapshotDimensions))
    : [];
  const rows = regionId
    ? await db.select().from(citations).where(eq(citations.regionId, regionId))
    : await db.select().from(citations);
  const snapshotsById = new Map(snapshotRows.filter((row) => row.runId === project.activeResearchRunId).map((row) => [row.id, row]));
  const immutable = regionLinks.flatMap((link) => {
    const row = snapshotsById.get(link.snapshotId);
    if (!row) return [];
    const dimensions = dimensionLinks.filter((item) => item.snapshotId === row.id && item.regionId === link.regionId);
    const supportedDimensions = Array.from(new Set(dimensions.map((item) => item.dimension))) as ResearchCitation["supportedDimensions"];
    return [{
      id: row.id,
      displayId: link.displayId,
      researchRunId: row.runId,
      canonicalSourceId: row.sourceId,
      regionId: link.regionId,
      dimension: (supportedDimensions?.[0] || row.dimension) as ResearchCitation["dimension"],
      supportedDimensions,
      title: row.title,
      url: row.url,
      publisher: row.publisher,
      publishedAt: row.verifiedPublishedAt || row.publishedAt,
      claimedPublishedAt: row.claimedPublishedAt,
      verifiedPublishedAt: row.verifiedPublishedAt,
      snippet: row.snippet,
      query: dimensions.map((item) => item.query).filter(Boolean).join(" | ") || row.query,
      manual: row.origin === "manual",
      origin: row.origin as ResearchCitation["origin"],
      retrievedAt: row.retrievedAt,
      contentHash: row.contentHash,
      language: row.language,
      detectedLanguage: row.detectedLanguage,
      marketScope: row.marketScope,
      publisherMarket: row.publisherMarket,
      contentMarket: row.contentMarket,
      claimScope: row.claimScope as ResearchCitation["claimScope"],
      qualityTier: row.qualityTier as ResearchCitation["qualityTier"],
      verificationStatus: row.verificationStatus as ResearchCitation["verificationStatus"],
      relevanceScore: row.relevanceScore,
      rejectionReason: row.rejectionReason,
      localEvidence: link.localEvidence,
    }];
  });
  return [...immutable, ...rows.map((row) => ({
    id: row.id,
    displayId: row.id,
    researchRunId: "",
    canonicalSourceId: "",
    regionId: row.regionId,
    dimension: row.dimension as ResearchCitation["dimension"],
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    publishedAt: row.publishedAt,
    snippet: row.snippet,
    query: row.query,
    manual: row.manual,
    origin: (row.origin || (row.manual ? "manual" : "research")) as ResearchCitation["origin"],
    retrievedAt: row.createdAt,
    contentHash: "",
    language: "",
    marketScope: "",
    qualityTier: "unknown" as const,
    verificationStatus: (row.manual ? "manual" : "unreachable") as ResearchCitation["verificationStatus"],
    claimedPublishedAt: row.publishedAt,
    verifiedPublishedAt: row.manual ? row.publishedAt : "",
    detectedLanguage: "",
    publisherMarket: "",
    contentMarket: "",
    claimScope: "global_context" as const,
    supportedDimensions: [row.dimension] as ResearchCitation["supportedDimensions"],
    relevanceScore: row.manual ? 1 : 0,
    rejectionReason: row.manual ? "" : "legacy source has not been page-verified",
    localEvidence: false,
  }))];
}

export async function resetWorkspace() {
  await ensureDb();
  await db.delete(claimEvidence);
  await db.delete(evidenceDiscoveries);
  await db.delete(evidenceSnapshotDimensions);
  await db.delete(evidenceSnapshotRegions);
  await db.delete(evidenceSnapshots);
  await db.delete(evidenceSources);
  await db.delete(researchRuns);
  await db.delete(jobs);
  await db.delete(citations);
  await db.delete(sources);
  await db.delete(regions);
  await db.delete(projects);
  readyPromise = null;
  await ensureDb();
  return getProject();
}

export async function setBrief(brief: unknown, status: ProjectSnapshot["briefStatus"] = "needs_review") {
  const parsed = VersionBriefSchema.parse(brief);
  await db.update(projects).set({
    brief: JSON.stringify(parsed),
    briefStatus: status,
    planningAsOfDate: parsed.dataFreezeDate,
    planningAsOfConfirmed: Boolean(parsed.dataFreezeDate),
    planStatus: "stale",
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, "current"));
  return getProject();
}

export async function setPlan(plan: unknown, status: ProjectSnapshot["planStatus"] = "needs_review") {
  const parsed = ReleasePlanSchema.parse(plan);
  await db.update(projects).set({ plan: JSON.stringify(parsed), planStatus: status, updatedAt: new Date().toISOString() }).where(eq(projects.id, "current"));
  return getProject();
}

export { client, claimEvidence, citations, evidenceDiscoveries, evidenceSnapshotDimensions, evidenceSnapshotRegions, evidenceSnapshots, evidenceSources, jobs, projects, regions, researchRuns, schemaMigrations, searchResultCache, sources, eq, EMPTY_PROJECT };
