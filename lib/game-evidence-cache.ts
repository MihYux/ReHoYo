import verifiedSeeds from "@/lib/verified-hsr2-evidence-cache.json";
import webResearchedSeeds from "@/lib/web-researched-hsr2-evidence-cache.json";
import type { ResearchDimension } from "@/lib/region-profiles";

export type GameEvidenceSeed = {
  regionCode: string;
  title: string;
  url: string;
  publishedAt: string;
  dimensions: ResearchDimension[];
  query: string;
  discoveredAt: string;
  verifiedAt?: string;
  verificationStatus?: "verified" | "discovered";
  voiceType?: "player" | "general";
  description?: string;
  takeaway?: string;
};

// GLM-discovered HSR 2.0/Penacony candidates. Discovery metadata is never evidence:
// every page is fetched and verified again for topic, market, language, date and cutoff.
export const GAME_EVIDENCE_CACHE = [...verifiedSeeds, ...webResearchedSeeds] as GameEvidenceSeed[];

export function gameEvidenceSeeds(regionCode: string, dimension: ResearchDimension, cutoff?: string) {
  return GAME_EVIDENCE_CACHE.filter((seed) => seed.regionCode === regionCode && seed.dimensions.includes(dimension) && (!cutoff || !seed.publishedAt || seed.publishedAt <= cutoff));
}
