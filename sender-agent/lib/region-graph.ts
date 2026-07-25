import type {
  RegionConfig,
  RegionGraphEdge,
  RegionGraphNode,
  RegionResearchBatch,
  ResearchCitation,
} from "@/lib/contracts";

const DIMENSIONS = ["player", "market", "sentiment", "culture"] as const satisfies readonly ResearchCitation["dimension"][];
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DIMENSION_LABELS: Record<(typeof DIMENSIONS)[number], string> = {
  player: "玩家信号",
  market: "市场环境",
  sentiment: "舆情竞品",
  culture: "文化节点",
};

function regionPosition(index: number, total: number): [number, number, number] {
  if (total === 1) return [4.8, 0, 0];
  const angle = -Math.PI / 2 + index * ((Math.PI * 2) / total);
  return [Math.cos(angle) * 5.6, Math.sin(angle) * 3.45, 0];
}

function dimensionPosition(origin: [number, number, number], index: number): [number, number, number] {
  const angle = -Math.PI / 2 + index * (Math.PI / 2) + origin[0] * 0.025;
  return [origin[0] + Math.cos(angle) * 0.72, origin[1] + Math.sin(angle) * 0.52, 0];
}

function satellitePosition(origin: [number, number, number], dimensionIndex: number, itemIndex: number): [number, number, number] {
  const baseAngle = -Math.PI / 2 + dimensionIndex * (Math.PI / 2);
  const angle = baseAngle + itemIndex * GOLDEN_ANGLE;
  const distance = 0.78 + Math.sqrt(itemIndex + 1) * 0.24;
  return [
    origin[0] + Math.cos(angle) * distance,
    origin[1] + Math.sin(angle) * distance * 0.72,
    0,
  ];
}

function analysisTerms(region: RegionConfig) {
  const content = region.analysis?.differentiators.join(" ").toLocaleLowerCase() || "";
  const terms = new Set(content.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length > 2));
  for (const sequence of content.match(/[\p{Script=Han}]{3,}/gu) || []) {
    for (let index = 0; index < sequence.length - 1; index += 1) terms.add(sequence.slice(index, index + 2));
  }
  return terms;
}

function similarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  const overlap = Array.from(left).filter((term) => right.has(term)).length;
  if (overlap < 2) return 0;
  return overlap / new Set([...left, ...right]).size;
}

function confidenceScore(region: RegionConfig) {
  if (!region.analysis) return 0;
  const claims = [
    ...region.analysis.playerSignals,
    ...region.analysis.marketEnvironment,
    ...region.analysis.sentimentAndCompetition,
    ...region.analysis.culturalMoments,
  ];
  if (!claims.length) return 0;
  const weights = { high: 1, medium: 0.62, low: 0.28 } as const;
  return claims.reduce((sum, claim) => sum + weights[claim.confidence], 0) / claims.length;
}

export function buildRegionGraph(
  regions: RegionConfig[],
  citations: ResearchCitation[],
  batch: RegionResearchBatch | null,
) {
  const orderedRegions = [...regions].sort((left, right) => left.code.localeCompare(right.code));
  const items = new Map(batch?.items.map((item) => [item.regionId, item]) || []);
  const nodes: RegionGraphNode[] = [{
    id: "core",
    kind: "core",
    label: "版本事实基线",
    regionId: "",
    position: [0, 0, 0],
    radius: 1.05,
    status: batch?.status === "processing" ? "processing" : batch?.synthesisStatus === "completed" ? "quality_passed" : batch ? "blocked" : "draft",
  }];
  const edges: RegionGraphEdge[] = [];
  const regionPositions = new Map<string, [number, number, number]>();

  orderedRegions.forEach((region, index) => {
    const position = regionPosition(index, orderedRegions.length);
    regionPositions.set(region.id, position);
    const regionCitations = citations.filter((citation) => citation.regionId === region.id);
    const batchItem = items.get(region.id);
    const status = batchItem?.phase || region.status;
    nodes.push({
      id: `region:${region.id}`,
      kind: "region",
      label: region.name,
      regionId: region.id,
      position,
      radius: 0.54 + Math.min(8, regionCitations.length) * 0.025 + confidenceScore(region) * 0.14,
      status,
    });
    edges.push({ id: `core:${region.id}`, source: "core", target: `region:${region.id}`, kind: "core", strength: 1 });

    const dimensionNodes = new Map<ResearchCitation["dimension"], string>();
    DIMENSIONS.forEach((dimension, dimensionIndex) => {
      const id = `dimension:${region.id}:${dimension}`;
      dimensionNodes.set(dimension, id);
      nodes.push({
        id,
        kind: "dimension",
        label: DIMENSION_LABELS[dimension],
        regionId: region.id,
        position: dimensionPosition(position, dimensionIndex),
        radius: 0.2,
        status,
        dimension,
      });
      edges.push({ id: `${region.id}:${dimension}`, source: `region:${region.id}`, target: id, kind: "dimension", strength: 0.72 });
    });

    regionCitations.forEach((citation, citationIndex) => {
      const id = `evidence:${citation.id}`;
      const dimensionIndex = Math.max(0, DIMENSIONS.indexOf(citation.dimension as (typeof DIMENSIONS)[number]));
      const dimensionItems = regionCitations.slice(0, citationIndex).filter((item) => item.dimension === citation.dimension).length;
      nodes.push({
        id,
        kind: "evidence",
        label: citation.title,
        regionId: region.id,
        position: satellitePosition(position, dimensionIndex, dimensionItems),
        radius: 0.09,
        status: citation.verificationStatus === "verified" || citation.verificationStatus === "manual" ? "quality_passed" : "evidence_gap",
        dimension: citation.dimension,
        citationId: citation.id,
      });
      edges.push({ id: `${region.id}:${citation.id}`, source: dimensionNodes.get(citation.dimension) || `region:${region.id}`, target: id, kind: "evidence", strength: 0.55 });
    });
  });

  const terms = new Map(orderedRegions.map((region) => [region.id, analysisTerms(region)]));
  for (let leftIndex = 0; leftIndex < orderedRegions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < orderedRegions.length; rightIndex += 1) {
      const left = orderedRegions[leftIndex];
      const right = orderedRegions[rightIndex];
      const strength = similarity(terms.get(left.id) || new Set(), terms.get(right.id) || new Set());
      if (strength >= 0.12) {
        edges.push({
          id: `similarity:${left.id}:${right.id}`,
          source: `region:${left.id}`,
          target: `region:${right.id}`,
          kind: "similarity",
          strength,
        });
      }
    }
  }

  return { nodes, edges, regionPositions };
}
