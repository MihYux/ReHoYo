import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import {
  type RegionResearchBatch,
  type RegionResearchBatchItem,
  type ResearchPhase,
} from "@/lib/contracts";
import { db, ensureDb, jobs, projects, regions, researchRuns } from "@/lib/db";
import { GlmError, glmConfiguration } from "@/lib/glm";
import { providerQueryPlanVersion, searchProviderConfiguration } from "@/lib/search-providers";
import { GovernanceError, PROMPT_VERSION } from "@/lib/governance";
import { computeRegionResearchFingerprint, executeRegionResearch, finalizeResearchRun, persistRegionResearch } from "@/lib/region-research";
import { adaptResearchConcurrency, aggregateResearchBatch, researchRetryDelay } from "@/lib/research-scheduler";
import { materializePrewrittenRegionalDemo, prewrittenDemoEnabled, prewrittenDemoJobResult } from "@/lib/prewritten-regional-demo";
import { embeddedDemoDelayMs } from "@/lib/embedded-demo";

type JobRow = typeof jobs.$inferSelect;
type JobOutcome = { jobId: string; kind: "success" | "retry" | "failed"; pressure: boolean };
type BatchRuntime = { promise: Promise<void>; limit: number };

const globalRuntime = globalThis as typeof globalThis & {
  __rehoyoResearchBatches?: Map<string, BatchRuntime>;
  __rehoyoDemoReplays?: Map<string, { sourceBatchId: string; startedAt: number; completesAt: number }>;
};
const runtimes = globalRuntime.__rehoyoResearchBatches || new Map<string, BatchRuntime>();
globalRuntime.__rehoyoResearchBatches = runtimes;
const demoReplays = globalRuntime.__rehoyoDemoReplays || new Map<string, { sourceBatchId: string; startedAt: number; completesAt: number }>();
globalRuntime.__rehoyoDemoReplays = demoReplays;
const DEMO_ETA_SECONDS = process.env.NODE_ENV === "test" ? 0 : Math.max(0, Number(process.env.DEMO_SEARCH_ETA_SECONDS || 25));

function now() {
  return new Date().toISOString();
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/结构校验|无法对应|没有覆盖全部|未返回可引用来源/.test(message)) return false;
  if (error instanceof GlmError) return error.status === 408 || error.status === 429 || error.status >= 500;
  return /timeout|timed out|ECONNRESET|fetch failed/i.test(message);
}

async function setJob(jobId: string, values: Partial<typeof jobs.$inferInsert>) {
  await db.update(jobs).set({ ...values, updatedAt: now() }).where(eq(jobs.id, jobId));
}

async function executeJob(job: JobRow): Promise<JobOutcome> {
  const attempt = job.attempt + 1;
  const inputFingerprint = await computeRegionResearchFingerprint(job.scopeId);
  await setJob(job.id, { status: "processing", phase: "searching", progress: 5, attempt, inputFingerprint, error: "" });
  await db.update(regions).set({ status: "processing", updatedAt: now() }).where(eq(regions.id, job.scopeId));
  try {
    const { result } = await executeRegionResearch(job.scopeId, async (progress) => {
      await setJob(job.id, { phase: progress.phase, progress: progress.progress });
    }, job.externalId);
    await setJob(job.id, { phase: "saving", progress: 92 });
    await persistRegionResearch(job.scopeId, result, job.id);
    return { jobId: job.id, kind: "success", pressure: false };
  } catch (error) {
    const retryable = isRetryable(error);
    const message = error instanceof Error ? error.message : "区域研究失败";
    if (retryable && attempt < 3) {
      await setJob(job.id, { status: "processing", phase: "retry_wait", error: message.slice(0, 1000) });
      const backoff = researchRetryDelay(attempt);
      await delay(backoff);
      await setJob(job.id, { status: "queued", phase: "queued", progress: 0 });
      return { jobId: job.id, kind: "retry", pressure: true };
    }
    await setJob(job.id, { status: "failed", phase: "failed", error: message.slice(0, 1000) });
    await db.update(regions).set({ status: "failed", updatedAt: now() }).where(eq(regions.id, job.scopeId));
    return { jobId: job.id, kind: "failed", pressure: retryable };
  }
}

async function queuedJobs(batchId: string) {
  return db.select().from(jobs).where(and(
    eq(jobs.type, "research"),
    eq(jobs.externalId, batchId),
    eq(jobs.status, "queued"),
  )).orderBy(jobs.createdAt);
}

async function runBatch(batchId: string, runtime: BatchRuntime) {
  const startedAt = Date.now();
  let consecutiveSuccesses = 0;
  const active = new Map<string, Promise<JobOutcome>>();
  try {
    while (true) {
      const queued = await queuedJobs(batchId);
      const available = queued.filter((job) => !active.has(job.id));
      while (active.size < runtime.limit && available.length) {
        const job = available.shift();
        if (!job) break;
        active.set(job.id, executeJob(job));
      }
      if (!active.size) break;
      const outcome = await Promise.race(active.values());
      active.delete(outcome.jobId);
      const adjusted = adaptResearchConcurrency({ limit: runtime.limit, consecutiveSuccesses }, outcome);
      runtime.limit = adjusted.limit;
      consecutiveSuccesses = adjusted.consecutiveSuccesses;
    }
  } finally {
    await Promise.allSettled(active.values());
  }
  const remainingDemoDelay = DEMO_ETA_SECONDS * 1000 - (Date.now() - startedAt);
  if (remainingDemoDelay > 0) await delay(remainingDemoDelay);
  await finalizeResearchRun(batchId);
}

export function kickResearchBatch(batchId: string) {
  const existing = runtimes.get(batchId);
  if (existing) return existing.promise;
  const runtime: BatchRuntime = { promise: Promise.resolve(), limit: 2 };
  const promise = (async () => {
    await ensureDb();
    if (await prewrittenDemoEnabled()) {
      const startedAt = Date.now();
      const demoDelay = embeddedDemoDelayMs();
      await db.update(jobs).set({ status: "processing", phase: "searching", progress: 10, updatedAt: now() }).where(and(eq(jobs.type, "research"), eq(jobs.externalId, batchId)));
      const firstStage = Math.max(0, Math.floor(demoDelay * 0.5) - (Date.now() - startedAt));
      if (firstStage) await delay(firstStage);
      await db.update(jobs).set({ phase: "synthesizing", progress: 72, updatedAt: now() }).where(and(eq(jobs.type, "research"), eq(jobs.externalId, batchId)));
      const finalStage = Math.max(0, demoDelay - (Date.now() - startedAt));
      if (finalStage) await delay(finalStage);
      await materializePrewrittenRegionalDemo(batchId);
      return;
    }
    await db.update(jobs).set({ status: "queued", phase: "queued", updatedAt: now() }).where(and(
      eq(jobs.type, "research"),
      eq(jobs.externalId, batchId),
      eq(jobs.status, "processing"),
    ));
    await runBatch(batchId, runtime);
  })().finally(() => runtimes.delete(batchId));
  runtime.promise = promise;
  runtimes.set(batchId, runtime);
  return promise;
}

export async function getResearchBatch(batchId: string): Promise<RegionResearchBatch> {
  const replay = demoReplays.get(batchId);
  if (replay) {
    const source = await getResearchBatch(replay.sourceBatchId);
    const timestamp = Date.now();
    const remaining = Math.max(0, Math.ceil((replay.completesAt - timestamp) / 1000));
    const ratio = Math.min(1, (timestamp - replay.startedAt) / Math.max(1, replay.completesAt - replay.startedAt));
    const replayItems = source.items.map((item) => ({
      ...item,
      ...(remaining ? { status: "processing" as const, phase: "searching" as const, progress: Math.min(90, 5 + Math.floor(ratio * 85)), error: "" } : {}),
      diagnostics: remaining ? [] : item.diagnostics?.map((diagnostic) => diagnostic.status === "search_completed" ? { ...diagnostic, status: "cache_replayed", source: "cache" as const, reason: "已复用历史检索结果。" } : diagnostic),
      providerStats: Object.fromEntries(Object.entries(item.providerStats || {}).map(([provider, stats]) => [provider, { ...stats, cached: stats.cached + stats.requests, requests: 0, latencyMs: 0 }])),
    }));
    return {
      ...source,
      id: batchId,
      status: remaining ? "processing" : source.status,
      queued: 0,
      processing: remaining ? source.total : 0,
      completed: remaining ? 0 : source.completed,
      qualityPassed: remaining ? 0 : source.qualityPassed,
      evidenceGap: remaining ? 0 : source.evidenceGap,
      failed: remaining ? 0 : source.failed,
      synthesisStatus: remaining ? "pending" : source.synthesisStatus,
      activeConcurrency: remaining ? 2 : 0,
      demoCacheReplay: true,
      etaSeconds: remaining,
      items: replayItems,
      createdAt: new Date(replay.startedAt).toISOString(),
      updatedAt: new Date(timestamp).toISOString(),
    };
  }
  await ensureDb();
  const rows = await db.select({ job: jobs, regionName: regions.name, regionStatus: regions.status }).from(jobs)
    .leftJoin(regions, eq(regions.id, jobs.scopeId))
    .where(and(eq(jobs.type, "research"), eq(jobs.externalId, batchId)))
    .orderBy(jobs.createdAt);
  if (!rows.length) throw new Error("研究批次不存在。");
  const [run] = await db.select().from(researchRuns).where(eq(researchRuns.id, batchId)).limit(1);
  let embeddedFixture = false;
  try { embeddedFixture = Boolean(JSON.parse(run?.providerConfig || "{}").embeddedFixture); } catch { embeddedFixture = false; }
  const synthesisSettled = Boolean(run && run.synthesisStatus !== "pending");
  const items: RegionResearchBatchItem[] = rows.map(({ job, regionName, regionStatus }) => {
    let details: { diagnostics?: RegionResearchBatchItem["diagnostics"]; violations?: RegionResearchBatchItem["violations"]; providerStats?: RegionResearchBatchItem["providerStats"] } = {};
    try { details = job.result ? JSON.parse(job.result) : {}; } catch { details = {}; }
    const effectiveStatus = synthesisSettled && ["quality_passed", "evidence_gap", "failed"].includes(regionStatus || "")
      ? regionStatus as RegionResearchBatchItem["status"]
      : job.status as RegionResearchBatchItem["status"];
    const effectivePhase = synthesisSettled && ["quality_passed", "evidence_gap", "failed"].includes(effectiveStatus)
      ? effectiveStatus as ResearchPhase
      : (job.phase || "queued") as ResearchPhase;
    return ({
    jobId: job.id,
    regionId: job.scopeId,
    regionName: regionName || job.scopeId,
    status: effectiveStatus,
    phase: effectivePhase,
    progress: job.progress,
    attempt: job.attempt,
    error: job.error,
    diagnostics: details.diagnostics || [],
    violations: details.violations || [],
    providerStats: details.providerStats || {},
  });
  });
  const aggregated = aggregateResearchBatch(items);
  const summary = aggregated.status === "completed" && !synthesisSettled
    ? { ...aggregated, status: "processing" as const }
    : aggregated;
  const elapsedSeconds = Math.floor((Date.now() - new Date(rows[0].job.createdAt).getTime()) / 1000);
  const cachedCalls = items.reduce((sum, item) => sum + Object.values(item.providerStats || {}).reduce((providerSum, stats) => providerSum + (stats.cached || 0), 0), 0);
  const liveCalls = items.reduce((sum, item) => sum + Object.values(item.providerStats || {}).reduce((providerSum, stats) => providerSum + (stats.requests || 0), 0), 0);
  const isCacheReplay = cachedCalls > 0 && liveCalls === 0;
  return {
    id: batchId,
    ...summary,
    activeConcurrency: runtimes.get(batchId)?.limit || Math.max(1, summary.processing),
    demoCacheReplay: isCacheReplay,
    executionMode: embeddedFixture ? "embedded_fixture" : "live",
    etaSeconds: summary.status === "processing" && isCacheReplay ? Math.max(0, DEMO_ETA_SECONDS - elapsedSeconds) : 0,
    providers: searchProviderConfiguration(),
    synthesisStatus: (run?.synthesisStatus || "pending") as RegionResearchBatch["synthesisStatus"],
    items,
    createdAt: rows[0].job.createdAt,
    updatedAt: [run?.updatedAt || "", ...rows.map((row) => row.job.updatedAt)].reduce((latest, value) => value > latest ? value : latest, rows[0].job.updatedAt),
  };
}

export async function createDemoResearchReplay(sourceBatchId: string) {
  const source = await getResearchBatch(sourceBatchId);
  if (source.status !== "completed") throw new Error("Only a completed research batch can be replayed from cache.");
  const replayId = `demo-${randomUUID()}`;
  const startedAt = Date.now();
  demoReplays.set(replayId, { sourceBatchId, startedAt, completesAt: startedAt + DEMO_ETA_SECONDS * 1000 });
  return getResearchBatch(replayId);
}

export async function createResearchBatch() {
  await ensureDb();
  const embeddedDemo = await prewrittenDemoEnabled();
  const [active] = await db.select().from(jobs).where(and(
    eq(jobs.type, "research"),
    or(eq(jobs.status, "queued"), eq(jobs.status, "processing")),
  )).orderBy(desc(jobs.createdAt)).limit(1);
  if (active?.externalId) {
    void kickResearchBatch(active.externalId);
    return getResearchBatch(active.externalId);
  }
  const regionRows = await db.select().from(regions).orderBy(regions.createdAt);
  if (!regionRows.length) throw new Error("没有可研究的发行区域。");
  const [currentProject] = await db.select().from(projects).where(eq(projects.id, "current")).limit(1);
  if (currentProject?.activeResearchRunId && !embeddedDemo) {
    const previous = await db.select().from(jobs).where(and(eq(jobs.type, "research"), eq(jobs.externalId, currentProject.activeResearchRunId)));
    if (previous.length === regionRows.length) {
      const unchanged = await Promise.all(regionRows.map(async (region) => previous.find((job) => job.scopeId === region.id)?.inputFingerprint === await computeRegionResearchFingerprint(region.id)));
      if (unchanged.every(Boolean)) {
        const previousBatch = await getResearchBatch(currentProject.activeResearchRunId);
        if (previousBatch.status === "completed") return createDemoResearchReplay(currentProject.activeResearchRunId);
        throw new GovernanceError("Research inputs have not changed.", [{ code: "UNCHANGED_RETRY_INPUTS", ruleId: "RETRY-INPUT-001", severity: "hard", message: "Cutoff, region profiles, query plans, and manual sources are unchanged.", path: "researchBatch", repairable: false }]);
      }
    }
  }
  const batchId = randomUUID();
  const timestamp = now();
  await db.transaction(async (tx) => {
    const projectRows = await tx.select().from(projects).where(eq(projects.id, "current")).limit(1);
    const project = projectRows[0];
    const cutoff = project?.evidenceMode === "campaign_cutoff" && project.planningAsOfDate
      ? `${project.planningAsOfDate}T23:59:59.999Z`
      : "";
    if (project?.evidenceMode === "campaign_cutoff" && (!project.planningAsOfDate || !project.planningAsOfConfirmed)) throw new Error("The approved input has no confirmed data-freeze date.");
    await tx.insert(researchRuns).values({ id: batchId, projectId: "current", batchId, evidenceMode: project?.evidenceMode || "campaign_cutoff", cutoffAt: cutoff, planningAsOfDate: project?.planningAsOfDate || "", promptVersion: PROMPT_VERSION, model: glmConfiguration().model, providerConfig: JSON.stringify(embeddedDemo ? { embeddedFixture: true } : searchProviderConfiguration()), queryPlanVersion: providerQueryPlanVersion(), status: "processing", synthesisStatus: "pending", createdAt: timestamp, updatedAt: timestamp });
    await tx.update(regions).set({ selected: true, updatedAt: timestamp });
    await tx.update(projects).set({ planStatus: "stale", activeResearchRunId: batchId, updatedAt: timestamp }).where(eq(projects.id, "current"));
    await tx.insert(jobs).values(regionRows.map((region) => ({
      id: randomUUID(),
      projectId: "current",
      type: "research",
      scopeId: region.id,
      externalId: batchId,
      status: "queued",
      phase: "queued",
      progress: 0,
      attempt: 0,
      error: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      result: embeddedDemo ? prewrittenDemoJobResult() : "",
    })));
  });
  void kickResearchBatch(batchId);
  return getResearchBatch(batchId);
}

export async function retryResearchBatch(batchId: string) {
  await ensureDb();
  const failed = await db.select().from(jobs).where(and(
    eq(jobs.type, "research"),
    eq(jobs.externalId, batchId),
    or(eq(jobs.status, "failed"), eq(jobs.status, "evidence_gap")),
  ));
  if (!failed.length) throw new Error("当前批次没有可重试的失败区域。");
  for (const job of failed) {
    const nextFingerprint = await computeRegionResearchFingerprint(job.scopeId);
    if (job.inputFingerprint && job.inputFingerprint === nextFingerprint) {
      throw new GovernanceError("Retry inputs have not changed.", [{ code: "UNCHANGED_RETRY_INPUTS", ruleId: "RETRY-INPUT-001", severity: "hard", message: "Cutoff, region profile, query plan, and manual sources are unchanged.", path: `jobs.${job.id}`, repairable: false }]);
    }
  }
  await db.update(jobs).set({
    status: "queued",
    phase: "queued",
    progress: 0,
    error: "",
    updatedAt: now(),
  }).where(and(eq(jobs.type, "research"), eq(jobs.externalId, batchId), or(eq(jobs.status, "failed"), eq(jobs.status, "evidence_gap"))));
  void kickResearchBatch(batchId);
  return getResearchBatch(batchId);
}
