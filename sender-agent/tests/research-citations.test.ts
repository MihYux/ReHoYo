import { describe, expect, it } from "vitest";
import type { ResearchCitation } from "@/lib/contracts";
import { normalizeResearchCitationIds } from "@/lib/research-citations";

const citations: ResearchCitation[] = ["NA-S001", "NA-S002", "NA-S010"].map((id) => ({
  id, regionId: "region-na", dimension: "market", title: id, url: `https://example.com/${id}`,
  publisher: "", publishedAt: "", snippet: "", query: "", manual: false,
}));

describe("regional research citation normalization", () => {
  it("splits combined source IDs without inventing evidence", () => {
    expect(normalizeResearchCitationIds(["[NA-S001], [NA-S002]"], citations)).toEqual({ ids: ["NA-S001", "NA-S002"], unresolved: [] });
  });

  it("resolves a unique short source number", () => {
    expect(normalizeResearchCitationIds(["S10"], citations)).toEqual({ ids: ["NA-S010"], unresolved: [] });
  });

  it("keeps unknown IDs unresolved instead of guessing", () => {
    expect(normalizeResearchCitationIds(["NA-S999"], citations)).toEqual({ ids: [], unresolved: ["NA-S999"] });
  });
});
