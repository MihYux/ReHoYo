import type { RegionResearchBatch, RegionResearchBatchItem } from "@/lib/contracts";

export type AdaptiveResearchState = {
  limit: number;
  consecutiveSuccesses: number;
};

export function adaptResearchConcurrency(
  state: AdaptiveResearchState,
  outcome: { kind: "success" | "retry" | "failed"; pressure: boolean },
): AdaptiveResearchState {
  if (outcome.kind === "success") {
    const consecutiveSuccesses = state.consecutiveSuccesses + 1;
    if (consecutiveSuccesses >= 2 && state.limit < 4) {
      return { limit: state.limit + 1, consecutiveSuccesses: 0 };
    }
    return { ...state, consecutiveSuccesses };
  }
  return {
    limit: outcome.pressure ? Math.max(1, Math.floor(state.limit / 2)) : state.limit,
    consecutiveSuccesses: 0,
  };
}

export function researchRetryDelay(attempt: number, jitter = Math.floor(Math.random() * 500)) {
  return (2 ** Math.max(1, attempt)) * 1000 + Math.max(0, Math.min(499, jitter));
}

export function aggregateResearchBatch(items: RegionResearchBatchItem[]): Pick<RegionResearchBatch, "status" | "total" | "queued" | "processing" | "completed" | "qualityPassed" | "evidenceGap" | "failed"> {
  const qualityPassed = items.filter((item) => item.status === "quality_passed").length;
  const evidenceGap = items.filter((item) => item.status === "evidence_gap").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const processing = items.filter((item) => item.status === "processing").length;
  const queued = items.filter((item) => item.status === "queued").length;
  const completed = qualityPassed + evidenceGap + failed;
  const status = completed === items.length && failed === 0
    ? "completed"
    : completed === items.length
      ? "failed"
      : processing || completed
        ? "processing"
        : "queued";
  return { status, total: items.length, queued, processing, completed, qualityPassed, evidenceGap, failed };
}
