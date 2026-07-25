import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { QualityViolation } from "@/lib/contracts";
import { claimEvidence, db, ensureDb, evidenceDiscoveries, evidenceSnapshotDimensions, evidenceSnapshotRegions, evidenceSnapshots, evidenceSources, getCitations, getProject, getRegions, jobs, projects, regions, researchRuns } from "@/lib/db";
import { glmConfiguration } from "@/lib/glm";
import { PROMPT_VERSION, stableHash, validateRegionalAnalysis } from "@/lib/governance";
import { currentResearchInputFingerprint, researchRegionReliably, type ReliableResearchProgress, type ReliableRegionResearchResult } from "@/lib/reliable-region-research";
import { synthesizeRegionalDifferentiation } from "@/lib/workflow";
import { providerQueryPlanVersion, searchProviderConfiguration } from "@/lib/search-providers";

export type RegionResearchResult = ReliableRegionResearchResult;
export type RegionResearchProgress = ReliableResearchProgress;

export async function executeRegionResearch(
  regionId: string,
  onProgress?: (progress: RegionResearchProgress) => void | Promise<void>,
  requestedRunId?: string,
) {
  await ensureDb();
  const project = await getProject();
  if (project.briefStatus !== "approved" || !project.brief) throw new Error("An approved version brief is required before research can start.");
  if (project.evidenceMode === "campaign_cutoff" && (!project.planningAsOfConfirmed || !project.planningAsOfDate)) throw new Error("The approved input has no confirmed data-freeze date.");
  const allRegions = await getRegions();
  const region = allRegions.find((item) => item.id === regionId);
  if (!region || !region.selected) throw new Error("The requested release region is not selected.");
  const manualSources = (await getCitations(regionId)).filter((item) => item.manual);
  const runId = requestedRunId || project.activeResearchRunId || randomUUID();
  if (!project.activeResearchRunId) {
    const timestamp = new Date().toISOString();
    await db.insert(researchRuns).values({
      id: runId,
      projectId: "current",
      batchId: runId,
      evidenceMode: project.evidenceMode,
      cutoffAt: project.evidenceCutoff,
      planningAsOfDate: project.planningAsOfDate,
      promptVersion: PROMPT_VERSION,
      model: glmConfiguration().model,
      providerConfig: JSON.stringify(searchProviderConfiguration()),
      queryPlanVersion: providerQueryPlanVersion(),
      status: "processing",
      synthesisStatus: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.update(projects).set({ activeResearchRunId: runId, updatedAt: timestamp }).where(eq(projects.id, "current"));
  }
  const result = await researchRegionReliably(project, project.brief, region, manualSources, onProgress, runId);
  return { region, result };
}

export async function computeRegionResearchFingerprint(regionId: string) {
  const project = await getProject();
  const region = (await getRegions()).find((item) => item.id === regionId);
  if (!region) throw new Error("Region not found.");
  const manualSources = (await getCitations(regionId)).filter((item) => item.manual);
  return currentResearchInputFingerprint(project, region, manualSources);
}

export async function persistRegionResearch(regionId: string, result: RegionResearchResult, jobId?: string) {
  const timestamp = new Date().toISOString();
  const hardFailures = result.violations.filter((item) => item.severity === "hard");
  const passed = Boolean(result.analysis) && hardFailures.length === 0;
  await db.transaction(async (tx) => {
    for (const item of result.citations) {
      const canonicalSourceId = item.canonicalSourceId || stableHash(item.url);
      await tx.insert(evidenceSources).values({ id: canonicalSourceId, canonicalUrl: item.url, title: item.title, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
      await tx.insert(evidenceSnapshots).values({
        id: item.id,
        sourceId: canonicalSourceId,
        runId: item.researchRunId || "",
        projectId: "current",
        regionId,
        dimension: item.dimension,
        displayId: item.displayId || item.id,
        title: item.title,
        url: item.url,
        publisher: item.publisher,
        publishedAt: item.publishedAt,
        snippet: item.snippet,
        query: item.query,
        language: item.language || "",
        marketScope: item.marketScope || "",
        qualityTier: item.qualityTier || "unknown",
        contentHash: item.contentHash || "",
        retrievedAt: item.retrievedAt || timestamp,
        origin: item.origin || "research",
        verificationStatus: item.verificationStatus || "unreachable",
        claimedPublishedAt: item.claimedPublishedAt || "",
        verifiedPublishedAt: item.verifiedPublishedAt || "",
        detectedLanguage: item.detectedLanguage || "",
        publisherMarket: item.publisherMarket || "global",
        contentMarket: item.contentMarket || "global",
        claimScope: item.claimScope || "global_context",
        relevanceScore: item.relevanceScore || 0,
        rejectionReason: item.rejectionReason || "",
      }).onConflictDoNothing();
      await tx.insert(evidenceSnapshotRegions).values({
        id: stableHash(`${item.id}:${regionId}:region`),
        snapshotId: item.id,
        regionId,
        displayId: item.displayId || item.id,
        localEvidence: Boolean(item.localEvidence),
      }).onConflictDoNothing();
      for (const dimension of item.supportedDimensions || [item.dimension]) {
        await tx.insert(evidenceSnapshotDimensions).values({
          id: stableHash(`${item.id}:${regionId}:${dimension}`),
          snapshotId: item.id,
          regionId,
          dimension,
          query: item.query,
        }).onConflictDoNothing();
      }
    }
    for (const discovery of result.discoveries) await tx.insert(evidenceDiscoveries).values(discovery).onConflictDoNothing();
    if (result.analysis) {
      const claimGroups = [result.analysis.playerSignals, result.analysis.marketEnvironment, result.analysis.sentimentAndCompetition, result.analysis.culturalMoments];
      for (let groupIndex = 0; groupIndex < claimGroups.length; groupIndex += 1) {
        for (let claimIndex = 0; claimIndex < claimGroups[groupIndex].length; claimIndex += 1) {
          const claim = claimGroups[groupIndex][claimIndex];
          for (const requirementId of claim.requirementIds) for (const snapshotId of claim.citationSnapshotIds) {
            await tx.insert(claimEvidence).values({ id: randomUUID(), runId: result.citations[0]?.researchRunId || "", regionId, claimPath: `${groupIndex}.${claimIndex}`, requirementId, snapshotId });
          }
        }
      }
    }
    const failed = result.transportFailed;
    await tx.update(regions).set({ analysis: result.analysis ? JSON.stringify(result.analysis) : null, status: passed ? "quality_passed" : failed ? "failed" : "evidence_gap", updatedAt: timestamp }).where(eq(regions.id, regionId));
    await tx.update(projects).set({ planStatus: "stale", updatedAt: timestamp }).where(eq(projects.id, "current"));
    if (jobId) {
      await tx.update(jobs).set({
        status: passed ? "quality_passed" : failed ? "failed" : "evidence_gap",
        phase: passed ? "quality_passed" : failed ? "failed" : "evidence_gap",
        progress: 100,
        inputFingerprint: result.inputFingerprint,
        result: JSON.stringify({ violations: result.violations, diagnostics: result.diagnostics, providerStats: result.providerStats }),
        error: hardFailures.map((item) => item.message).join("\n").slice(0, 1000),
        updatedAt: timestamp,
      }).where(eq(jobs.id, jobId));
    }
  });
  return passed;
}

export async function finalizeResearchRun(runId: string) {
  const project = await getProject();
  const allRegions = await getRegions();
  const selected = allRegions.filter((item) => item.selected);
  const qualified = selected.filter((item) => item.status === "quality_passed" && item.analysis);
  const missingRegionIds = selected.filter((item) => item.status !== "quality_passed" || !item.analysis).map((item) => item.id);
  const allCitations = await getCitations();
  const violations: QualityViolation[] = [];
  let synthesisStatus: "provisional" | "completed" | "blocked" = qualified.length >= 2 ? (missingRegionIds.length ? "provisional" : "completed") : "blocked";
  let differentiations = new Map<string, NonNullable<(typeof qualified)[number]["analysis"]>["differentiation"]>();
  if (qualified.length >= 2) {
    try {
      const synthesisRegions = allRegions.map((item) => ({ ...item, selected: qualified.some((candidate) => candidate.id === item.id) }));
      differentiations = await synthesizeRegionalDifferentiation(project, synthesisRegions, allCitations);
    } catch (error) {
      synthesisStatus = "blocked";
      violations.push({ code: "SYNTHESIS_FAILED", ruleId: "DIFF-SYNTHESIS-001", severity: "hard", message: error instanceof Error ? error.message : "Cross-region synthesis failed.", path: "researchRun", repairable: true });
    }
  }
  await db.transaction(async (tx) => {
    if (synthesisStatus !== "blocked") {
      const candidates = new Map(allRegions.map((item) => [item.id, item]));
      for (const region of qualified) {
        const differentiation = differentiations.get(region.id) || null;
        if (!differentiation) continue;
        differentiation.provisional = synthesisStatus === "provisional";
        differentiation.missingRegionIds = missingRegionIds;
        const analysis = { ...region.analysis!, differentiation, differentiators: [differentiation.paragraph] };
        candidates.set(region.id, { ...region, analysis });
      }
      for (const region of qualified) {
        const candidate = candidates.get(region.id)!;
        const regionViolations = validateRegionalAnalysis(candidate, allCitations, project, Array.from(candidates.values()));
        violations.push(...regionViolations);
        if (candidate.analysis?.differentiation) candidate.analysis.differentiation.quality.violations = regionViolations;
        const passed = !regionViolations.some((item) => item.severity === "hard");
        await tx.update(regions).set({ analysis: JSON.stringify(candidate.analysis), status: passed ? "quality_passed" : "evidence_gap", updatedAt: new Date().toISOString() }).where(eq(regions.id, region.id));
      }
    }
    const hard = violations.some((item) => item.severity === "hard");
    await tx.update(researchRuns).set({ status: hard || synthesisStatus === "blocked" ? "blocked" : (synthesisStatus === "provisional" ? "needs_review" : "quality_passed"), synthesisStatus, quality: JSON.stringify(violations), updatedAt: new Date().toISOString() }).where(eq(researchRuns.id, runId));
  });
  return violations;
}
