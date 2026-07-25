import { describe, expect, it } from "vitest";
import { PlanGenerationPreviewSchema, type PlanGenerationPreview } from "@/lib/contracts";
import { planGenerationProgress } from "@/lib/plan-generation";

function preview(overrides: Partial<PlanGenerationPreview> = {}): PlanGenerationPreview {
  return PlanGenerationPreviewSchema.parse({
    version: 1,
    projectUpdatedAt: "2026-07-24T10:00:00.000Z",
    phase: "queued",
    global: null,
    regions: [],
    regionOrder: [
      { id: "region-jp", name: "日本" },
      { id: "region-na", name: "北美" },
    ],
    activeRegionIds: [],
    sourceIds: [],
    completedSections: 0,
    totalSections: 3,
    startedAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    ...overrides,
  });
}

describe("plan generation preview", () => {
  it("reports deterministic progress as persisted sections arrive", () => {
    expect(planGenerationProgress(preview())).toBe(0);
    expect(planGenerationProgress(preview({ phase: "global_axis" }))).toBe(8);
    expect(planGenerationProgress(preview({
      phase: "regional_plans",
      global: { globalAxis: "主轴", globalPrinciples: [], commonMoments: [], globalKpis: [], sourceIds: [] },
      completedSections: 1,
    }))).toBe(20);
    expect(planGenerationProgress(preview({
      phase: "regional_plans",
      global: { globalAxis: "主轴", globalPrinciples: [], commonMoments: [], globalKpis: [], sourceIds: [] },
      regions: [{
        regionId: "region-jp",
        regionName: "日本",
        coreJudgment: "判断",
        materialStrategy: [],
        socialCadence: [],
        kolPlan: [],
        paidMedia: [],
        partnerships: [],
        timeline: [],
        kpis: [],
        budget: [],
        budgetAllocation: null,
        riskNotes: [],
        characterRelease: [],
      }],
      completedSections: 2,
    }))).toBe(55);
    expect(planGenerationProgress(preview({ phase: "assembling" }))).toBe(95);
    expect(planGenerationProgress(preview({ phase: "completed" }))).toBe(100);
  });

  it("rejects previews that cannot be resumed safely", () => {
    expect(() => PlanGenerationPreviewSchema.parse({ ...preview(), totalSections: 0 })).toThrow();
    expect(() => PlanGenerationPreviewSchema.parse({ ...preview(), phase: "unknown" })).toThrow();
  });
});
