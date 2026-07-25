import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import {
  PlanGenerationPreviewSchema,
  ReleasePlanSchema,
  type PlanGenerationPreview,
  type ProjectSnapshot,
  type RegionConfig,
} from "@/lib/contracts";
import { db, ensureDb, getCitations, getProject, getRegions, jobs, projects, regions as regionTable, researchRuns, setPlan } from "@/lib/db";
import { generateGlobalReleaseAxis, generateRegionalReleasePlan } from "@/lib/workflow";
import { fingerprintInputs } from "@/lib/governance";
import { embeddedDemoDelayMs } from "@/lib/embedded-demo";
import { embeddedDemoPlan } from "@/lib/embedded-demo-fixture";

const globalRuntime = globalThis as typeof globalThis & {
  __rehoyoPlanJobs?: Map<string, Promise<void>>;
};
const runtimes = globalRuntime.__rehoyoPlanJobs || new Map<string, Promise<void>>();
globalRuntime.__rehoyoPlanJobs = runtimes;

function now() {
  return new Date().toISOString();
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parsePreview(result: string) {
  return PlanGenerationPreviewSchema.parse(JSON.parse(result));
}

export function planGenerationProgress(preview: PlanGenerationPreview) {
  if (preview.phase === "completed") return 100;
  if (preview.phase === "assembling") return 95;
  if (!preview.global) return preview.phase === "global_axis" ? 8 : 0;
  const regionTotal = Math.max(1, preview.regionOrder.length);
  return Math.min(92, 20 + Math.floor((preview.regions.length / regionTotal) * 70));
}

async function persistPreview(jobId: string, preview: PlanGenerationPreview, values: Partial<typeof jobs.$inferInsert> = {}) {
  const parsed = PlanGenerationPreviewSchema.parse({ ...preview, updatedAt: now() });
  await db.update(jobs).set({
    ...values,
    phase: parsed.phase,
    progress: planGenerationProgress(parsed),
    result: JSON.stringify(parsed),
    updatedAt: parsed.updatedAt,
  }).where(eq(jobs.id, jobId));
  return parsed;
}

function sameRegionSnapshot(preview: PlanGenerationPreview, regionIds: string[]) {
  return preview.regionOrder.length === regionIds.length
    && preview.regionOrder.every((region, index) => region.id === regionIds[index]);
}

function inputFingerprint(project: ProjectSnapshot, regions: RegionConfig[]) {
  const projectInput = {
    gameName: project.gameName,
    versionName: project.versionName,
    launchDate: project.launchDate,
    platforms: project.platforms,
    campaignStartWeek: project.campaignStartWeek,
    campaignEndWeek: project.campaignEndWeek,
    objective: project.objective,
    sellingPoints: project.sellingPoints,
    contentAssets: project.contentAssets,
    businessGoal: project.businessGoal,
    totalBudget: project.totalBudget,
    kpis: project.kpis,
    characterProfiles: project.characterProfiles,
    constraints: project.constraints,
    brief: project.brief,
  };
  const regionInput = regions.map((region) => ({
    id: region.id,
    code: region.code,
    name: region.name,
    language: region.language,
    timezone: region.timezone,
    note: region.note,
    analysis: region.analysis,
  }));
  return createHash("sha256").update(JSON.stringify({ project: projectInput, regions: regionInput })).digest("hex");
}

async function runPlanJob(jobId: string) {
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.type !== "plan" || job.status === "completed" || job.status === "failed") return;

  let preview = parsePreview(job.result);
  await db.update(jobs).set({
    status: "processing",
    attempt: job.attempt + 1,
    error: "",
    updatedAt: now(),
  }).where(eq(jobs.id, jobId));

  try {
    const [project, allRegions, citations] = await Promise.all([getProject(), getRegions(), getCitations()]);
    if (project.updatedAt !== preview.projectUpdatedAt) {
      throw new Error("生成期间版本或区域资料已发生变化。实时草稿已保留，请重新生成最新方案。");
    }
    const selected = allRegions.filter((region) => (project.embeddedDemo?.eligible || region.selected) && region.status === "quality_passed" && region.analysis && !region.analysis.differentiation?.provisional);
    if (!selected.length || !sameRegionSnapshot(preview, selected.map((region) => region.id))) {
      throw new Error("生成期间已审核区域集合发生变化。实时草稿已保留，请重新生成最新方案。");
    }
    if (preview.inputFingerprint && preview.inputFingerprint !== inputFingerprint(project, selected)) {
      throw new Error("生成期间版本或区域内容已发生变化。实时草稿已保留，请重新生成最新方案。");
    }

    if (project.embeddedDemo?.eligible) {
      const startedAt = Date.now();
      const totalDelay = embeddedDemoDelayMs();
      const plan = embeddedDemoPlan(project.activeResearchRunId);
      preview = await persistPreview(jobId, { ...preview, phase: "global_axis", activeRegionIds: [] });
      await delay(Math.max(0, Math.floor(totalDelay * 0.35) - (Date.now() - startedAt)));
      preview = await persistPreview(jobId, {
        ...preview,
        global: {
          globalAxis: plan.globalAxis,
          globalPrinciples: plan.globalPrinciples,
          commonMoments: plan.commonMoments,
          globalKpis: plan.globalKpis,
          sourceIds: plan.sourceIds,
        },
        sourceIds: plan.sourceIds,
        completedSections: 1,
        phase: "regional_plans",
        activeRegionIds: preview.regionOrder.map((region) => region.id),
      });
      await delay(Math.max(0, Math.floor(totalDelay * 0.75) - (Date.now() - startedAt)));
      preview = await persistPreview(jobId, {
        ...preview,
        regions: structuredClone(plan.regions),
        characterSymbiosisRelease: structuredClone(plan.characterSymbiosisRelease),
        completedSections: preview.totalSections,
        phase: "assembling",
        activeRegionIds: [],
      });
      await delay(Math.max(0, totalDelay - (Date.now() - startedAt)));
      await setPlan(plan, "needs_review");
      await persistPreview(jobId, { ...preview, phase: "completed", completedSections: preview.totalSections }, { status: "completed", progress: 100, error: "" });
      return;
    }

    if (!preview.global) {
      preview = await persistPreview(jobId, { ...preview, phase: "global_axis", activeRegionIds: [] });
      const global = await generateGlobalReleaseAxis(project, selected, citations);
      preview = await persistPreview(jobId, {
        ...preview,
        global,
        sourceIds: global.sourceIds,
        completedSections: 1,
        phase: "regional_plans",
      });
    }

    const completed = new Map(preview.regions.map((region) => [region.regionId, region]));
    const completedSymbiosis = new Map(preview.characterSymbiosisRelease.map((item) => [item.regionId, item]));
    const pending = preview.regionOrder.filter((region) => !completed.has(region.id));
    let cursor = 0;
    let firstError: unknown = null;
    let writeChain = Promise.resolve();
    const active = new Set<string>();

    const commit = (update: (current: PlanGenerationPreview) => PlanGenerationPreview) => {
      writeChain = writeChain.then(async () => {
        preview = await persistPreview(jobId, update(preview));
      });
      return writeChain;
    };

    const worker = async () => {
      while (!firstError) {
        const order = cursor;
        cursor += 1;
        const target = pending[order];
        if (!target) return;
        const region = selected.find((item) => item.id === target.id);
        if (!region) throw new Error(`找不到区域 ${target.name}。`);
        active.add(region.id);
        await commit((current) => ({ ...current, phase: "regional_plans", activeRegionIds: Array.from(active) }));
        try {
          const regionCitations = citations.filter((citation) => citation.regionId === region.id);
          const generated = await generateRegionalReleasePlan(project, region, regionCitations, preview.global!);
          completed.set(region.id, generated.region);
          completedSymbiosis.set(region.id, generated.characterSymbiosis);
          active.delete(region.id);
          await commit((current) => ({
            ...current,
            phase: "regional_plans",
            activeRegionIds: Array.from(active),
            regions: preview.regionOrder.flatMap((item) => {
              const value = completed.get(item.id);
              return value ? [value] : [];
            }),
            characterSymbiosisRelease: preview.regionOrder.flatMap((item) => {
              const value = completedSymbiosis.get(item.id);
              return value ? [value] : [];
            }),
            sourceIds: Array.from(new Set([...current.sourceIds, ...generated.sourceIds])),
            completedSections: 1 + completed.size,
          }));
        } catch (error) {
          active.delete(region.id);
          firstError = error;
          await commit((current) => ({ ...current, activeRegionIds: Array.from(active) }));
        }
      }
    };

    const configuredConcurrency = Math.max(2, Math.min(7, Number(process.env.PLAN_GENERATION_CONCURRENCY || 7)));
    await Promise.all(Array.from({ length: Math.min(configuredConcurrency, pending.length) }, () => worker()));
    await writeChain;
    if (firstError) throw firstError;

    preview = await persistPreview(jobId, { ...preview, phase: "assembling", activeRegionIds: [] });
    const global = preview.global!;
    const capTotal = project.budgetEnvelope?.regionalCapTotal || 0;
    const baseCap = selected.length ? Math.floor((capTotal / selected.length) * 100) / 100 : 0;
    const orderedRegions = preview.regionOrder.map((item, index) => {
      const region = completed.get(item.id)!;
      const amount = index === preview.regionOrder.length - 1 ? Math.round((capTotal - baseCap * index) * 100) / 100 : baseCap;
      return { ...region, budgetAllocation: { amount, cap: amount, currency: "CNY" as const, unit: "万元" as const } };
    });
    const plan = ReleasePlanSchema.parse({
      globalAxis: global.globalAxis,
      globalPrinciples: global.globalPrinciples,
      commonMoments: global.commonMoments,
      globalKpis: global.globalKpis,
      regions: orderedRegions,
      characterSymbiosisRelease: preview.regionOrder.map((item) => completedSymbiosis.get(item.id)),
      sourceIds: preview.sourceIds,
      researchRunId: project.activeResearchRunId,
      evidenceMode: project.evidenceMode,
      evidenceCutoff: project.evidenceCutoff,
      budgetEnvelope: project.budgetEnvelope,
      qualityGateResults: [],
      inputFingerprint: fingerprintInputs(project, selected, citations),
      generatedAt: now(),
    });
    if (plan.regions.length !== preview.regionOrder.length) throw new Error("区域方案尚未全部完成，无法汇总最终文档。");
    if (plan.characterSymbiosisRelease.length !== preview.regionOrder.length) throw new Error("角色共生发行方案尚未覆盖全部区域。");
    await setPlan(plan);
    preview = await persistPreview(jobId, {
      ...preview,
      phase: "completed",
      completedSections: preview.totalSections,
    }, { status: "completed", progress: 100, error: "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "发行方案生成失败";
    const failedPreview = { ...preview, phase: "failed" as const, activeRegionIds: [] };
    await persistPreview(jobId, failedPreview, { status: "failed", error: message.slice(0, 1200) }).catch(() => undefined);
    await db.update(projects).set({ planStatus: "failed", updatedAt: now() }).where(eq(projects.id, "current")).catch(() => undefined);
  }
}

export function kickPlanGeneration(jobId: string) {
  const existing = runtimes.get(jobId);
  if (existing) return existing;
  const promise = runPlanJob(jobId).finally(() => runtimes.delete(jobId));
  runtimes.set(jobId, promise);
  return promise;
}

export async function getPlanGenerationJob(jobId: string) {
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.type !== "plan") throw new Error("发行方案任务不存在。");
  return { job, preview: parsePreview(job.result) };
}

export async function createPlanGenerationJob() {
  await ensureDb();
  const [active] = await db.select().from(jobs).where(and(
    eq(jobs.type, "plan"),
    or(eq(jobs.status, "queued"), eq(jobs.status, "processing")),
  )).orderBy(desc(jobs.createdAt)).limit(1);
  if (active) {
    void kickPlanGeneration(active.id);
    return getPlanGenerationJob(active.id);
  }

  const [project, regionRows] = await Promise.all([getProject(), getRegions()]);
  if (project.embeddedDemo?.eligible) {
    await db.update(regionTable).set({ selected: true, updatedAt: now() }).where(eq(regionTable.projectId, "current"));
  }
  const regions = project.embeddedDemo?.eligible ? await getRegions() : regionRows;
  const [researchRun] = project.activeResearchRunId ? await db.select().from(researchRuns).where(eq(researchRuns.id, project.activeResearchRunId)).limit(1) : [];
  if (!researchRun || researchRun.synthesisStatus !== "completed" || researchRun.status !== "quality_passed") throw new Error("Cross-region synthesis has not passed all automated quality gates.");
  const selected = regions.filter((region) => project.embeddedDemo?.eligible || region.selected);
  if (!selected.length) throw new Error("请至少选择一个发行区域。");
  if (selected.some((region) => region.status !== "quality_passed" || !region.analysis || region.analysis.differentiation?.provisional)) {
    throw new Error("所有选定区域审核通过后才能生成发行方案。");
  }

  const timestamp = now();
  const id = randomUUID();
  const preview = PlanGenerationPreviewSchema.parse({
    version: 1,
    projectUpdatedAt: timestamp,
    inputFingerprint: inputFingerprint(project, selected),
    phase: "queued",
    global: null,
    regions: [],
    characterSymbiosisRelease: [],
    regionOrder: selected.map((region) => ({ id: region.id, name: region.name })),
    activeRegionIds: [],
    sourceIds: [],
    completedSections: 0,
    totalSections: selected.length + 1,
    startedAt: timestamp,
    updatedAt: timestamp,
  });
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ planStatus: "processing", updatedAt: timestamp }).where(eq(projects.id, "current"));
    await tx.insert(jobs).values({
      id,
      projectId: "current",
      type: "plan",
      scopeId: "current",
      externalId: "",
      status: "queued",
      phase: "queued",
      progress: 0,
      attempt: 0,
      result: JSON.stringify(preview),
      error: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  void kickPlanGeneration(id);
  return getPlanGenerationJob(id);
}

export async function resumePlanGenerationJob(jobId: string) {
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.type !== "plan" || job.status !== "failed") throw new Error("没有可继续的失败方案任务。");
  const [project, regions] = await Promise.all([getProject(), getRegions()]);
  const selected = regions.filter((region) => region.selected && region.status === "quality_passed" && region.analysis && !region.analysis.differentiation?.provisional);
  const preview = parsePreview(job.result);
  if (!sameRegionSnapshot(preview, selected.map((region) => region.id))) {
    const message = "区域集合已经变化，不能继续旧草稿，请重新生成。";
    await db.update(jobs).set({ error: message, updatedAt: now() }).where(eq(jobs.id, jobId));
    throw new Error(message);
  }
  const fingerprint = inputFingerprint(project, selected);
  if (preview.inputFingerprint && preview.inputFingerprint !== fingerprint) {
    const message = "版本或区域内容已经变化，不能继续旧草稿，请重新生成。";
    await db.update(jobs).set({ error: message, updatedAt: now() }).where(eq(jobs.id, jobId));
    throw new Error(message);
  }
  const timestamp = now();
  const next = PlanGenerationPreviewSchema.parse({
    ...preview,
    projectUpdatedAt: timestamp,
    inputFingerprint: fingerprint,
    phase: preview.global ? "regional_plans" : "queued",
    activeRegionIds: [],
    updatedAt: timestamp,
  });
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ planStatus: "processing", updatedAt: timestamp }).where(eq(projects.id, "current"));
    await tx.update(jobs).set({
      status: "queued",
      phase: next.phase,
      progress: planGenerationProgress(next),
      result: JSON.stringify(next),
      error: "",
      updatedAt: timestamp,
    }).where(eq(jobs.id, jobId));
  });
  void kickPlanGeneration(jobId);
  return getPlanGenerationJob(jobId);
}
