import { describe, expect, it } from "vitest";
import type { RegionConfig, ResearchCitation } from "@/lib/contracts";
import { buildRegionGraph } from "@/lib/region-graph";

function region(id: string, code: string, confidence: "high" | "medium" | "low" = "medium"): RegionConfig {
  const claim = { text: `${id} regional signal`, citationIds: [`${id}-1`], citationSnapshotIds: [`${id}-1`], requirementIds: [`req-${id}`], claimScope: "regional" as const, dimension: "player" as const, confidence };
  return {
    id, code, name: id.toUpperCase(), language: "", timezone: "", note: "", preset: true, selected: true, status: "quality_passed",
    analysis: {
      playerSignals: [claim], marketEnvironment: [claim], sentimentAndCompetition: [claim], culturalMoments: [claim],
      differentiators: ["character relationship returning players"], differentiation: null, risks: [], researchNote: "", generatedAt: "2026-07-24T00:00:00.000Z",
    },
  };
}

function citation(regionId: string, index: number, dimension: ResearchCitation["dimension"]): ResearchCitation {
  return { id: `${regionId}-${index}`, regionId, dimension, title: `Source ${index}`, url: `https://example.com/${regionId}/${index}`, publisher: "", publishedAt: "", snippet: "", query: "", manual: false };
}

describe("regional intelligence graph", () => {
  it("keeps region positions stable regardless of input order", () => {
    const left = buildRegionGraph([region("jp", "jp"), region("cn", "cn")], [], null);
    const right = buildRegionGraph([region("cn", "cn"), region("jp", "jp")], [], null);
    expect(left.regionPositions.get("cn")).toEqual(right.regionPositions.get("cn"));
    expect(left.regionPositions.get("jp")).toEqual(right.regionPositions.get("jp"));
    expect(left.nodes.filter((node) => node.kind === "dimension")).toHaveLength(8);
    expect(left.edges.filter((edge) => edge.kind === "dimension")).toHaveLength(8);
  });

  it("includes every evidence source without a regional or global cap", () => {
    const regions = Array.from({ length: 12 }, (_, index) => region(`r${index}`, `r${String(index).padStart(2, "0")}`));
    const citations = regions.flatMap((item) => Array.from({ length: 12 }, (_, index) => citation(item.id, index, ["player", "market", "sentiment", "culture"][index % 4] as ResearchCitation["dimension"])));
    const graph = buildRegionGraph(regions, citations, null);
    const evidence = graph.nodes.filter((node) => node.kind === "evidence");
    expect(evidence).toHaveLength(citations.length);
    for (const item of regions) expect(evidence.filter((node) => node.regionId === item.id)).toHaveLength(12);
  });

  it("uses confidence and source count for region size and creates similarity links", () => {
    const regions = [region("high", "aa", "high"), region("low", "bb", "low")];
    const citations = [citation("high", 1, "player"), citation("low", 1, "player")];
    const graph = buildRegionGraph(regions, citations, null);
    const high = graph.nodes.find((node) => node.id === "region:high");
    const low = graph.nodes.find((node) => node.id === "region:low");
    expect(high?.radius).toBeGreaterThan(low?.radius || 0);
    expect(graph.edges.some((edge) => edge.kind === "similarity")).toBe(true);
  });
});
