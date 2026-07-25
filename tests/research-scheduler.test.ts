import { describe, expect, it } from "vitest";
import type { RegionResearchBatchItem } from "@/lib/contracts";
import { adaptResearchConcurrency, aggregateResearchBatch, researchRetryDelay } from "@/lib/research-scheduler";

function item(status: RegionResearchBatchItem["status"]): RegionResearchBatchItem {
  return { jobId: crypto.randomUUID(), regionId: crypto.randomUUID(), regionName: "区域", status, phase: status === "failed" ? "failed" : status === "quality_passed" ? "quality_passed" : "queued", progress: status === "quality_passed" ? 100 : 0, attempt: 0, error: "" };
}

describe("adaptive regional research scheduler", () => {
  it("raises concurrency after two successes and halves it under API pressure", () => {
    let state = { limit: 2, consecutiveSuccesses: 0 };
    state = adaptResearchConcurrency(state, { kind: "success", pressure: false });
    state = adaptResearchConcurrency(state, { kind: "success", pressure: false });
    expect(state.limit).toBe(3);
    state = adaptResearchConcurrency(state, { kind: "success", pressure: false });
    state = adaptResearchConcurrency(state, { kind: "success", pressure: false });
    expect(state.limit).toBe(4);
    state = adaptResearchConcurrency(state, { kind: "retry", pressure: true });
    expect(state).toEqual({ limit: 2, consecutiveSuccesses: 0 });
    state = adaptResearchConcurrency(state, { kind: "failed", pressure: true });
    expect(state.limit).toBe(1);
  });

  it("calculates bounded exponential retry waits", () => {
    expect(researchRetryDelay(1, 0)).toBe(2000);
    expect(researchRetryDelay(2, 250)).toBe(4250);
    expect(researchRetryDelay(3, 999)).toBe(8499);
  });

  it("aggregates queued, partial failure, and complete batches", () => {
    expect(aggregateResearchBatch([item("queued"), item("queued")]).status).toBe("queued");
    const failed = aggregateResearchBatch([item("quality_passed"), item("failed")]);
    expect(failed).toMatchObject({ status: "failed", qualityPassed: 1, failed: 1 });
    expect(aggregateResearchBatch([item("quality_passed"), item("quality_passed")]).status).toBe("completed");
  });

});
