import type { ResearchCitation } from "@/lib/contracts";

export function normalizeResearchCitationIds(rawIds: string[], citations: ResearchCitation[]) {
  const byUpperId = new Map(citations.map((citation) => [citation.id.toUpperCase(), citation.id]));
  const result: string[] = [];
  const unresolved: string[] = [];
  for (const rawId of rawIds) {
    const normalized = rawId.normalize("NFKC").trim().toUpperCase();
    const matches = citations
      .filter((citation) => normalized.includes(citation.id.toUpperCase()))
      .map((citation) => citation.id);
    if (!matches.length) {
      const compact = normalized.replace(/[\[\](){}<>\s]/g, "");
      const direct = byUpperId.get(compact);
      if (direct) matches.push(direct);
    }
    if (!matches.length) {
      const short = normalized.match(/^\[?S?0*(\d{1,3})\]?$/);
      if (short) {
        const suffix = `S${String(Number(short[1])).padStart(3, "0")}`;
        const candidates = citations.filter((citation) => citation.id.toUpperCase().endsWith(suffix));
        if (candidates.length === 1) matches.push(candidates[0].id);
      }
    }
    if (!matches.length) unresolved.push(rawId);
    for (const match of matches) if (!result.includes(match)) result.push(match);
  }
  return { ids: result, unresolved };
}
