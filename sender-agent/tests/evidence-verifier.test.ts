import { describe, expect, it } from "vitest";
import { extractPublishedDateSignals, inferContentMarket, inferPublisherMarketStrict, scoreEvidenceRelevanceStrict } from "@/lib/evidence-verifier";
import { regionResearchProfile } from "@/lib/region-profiles";

describe("evidence semantic relevance", () => {
  const sea = regionResearchProfile("sea");

  it("rejects generic software, pharmaceutical, and sports pages", () => {
    expect(scoreEvidenceRelevanceStrict("Atlassian Confluence REST API platform documentation for Southeast Asia", sea, "market")).toBe(0);
    expect(scoreEvidenceRelevanceStrict("Pfizer Pride community journal in Southeast Asia", sea, "sentiment")).toBe(0);
    expect(scoreEvidenceRelevanceStrict("Asian Games sponsorship and sports calendar for Southeast Asia", sea, "culture")).toBe(0);
  });

  it("rejects employment and company-review pages even when they mention game production", () => {
    expect(scoreEvidenceRelevanceStrict("Japan video game production employee review salary and recruitment", sea, "sentiment")).toBe(0);
  });

  it("requires both a games anchor and the requested dimension", () => {
    expect(scoreEvidenceRelevanceStrict("Southeast Asia mobile game market revenue report 2023", sea, "market")).toBeGreaterThanOrEqual(0.9);
    expect(scoreEvidenceRelevanceStrict("Southeast Asia mobile game release announcement", sea, "player")).toBeLessThan(0.45);
  });

  it("does not match short Latin market tokens inside unrelated words", () => {
    const europe = regionResearchProfile("eu");
    expect(inferPublisherMarketStrict(new URL("https://example.com"), "A queueing theory paper about gaming", europe)).toBe("global");
    expect(inferPublisherMarketStrict(new URL("https://example.com"), "EU video game market report", europe)).toBe("eu");
  });

  it("requires two agreeing non-metadata date signals", () => {
    expect(extractPublishedDateSignals("<html></html>", "https://example.com/2023/08/12/report", "Published 2023-08-12")).toMatchObject({ date: "2023-08-12", signals: 2 });
    expect(extractPublishedDateSignals("<html></html>", "https://example.com/report", "Updated 2023-08-12")).toMatchObject({ date: "", signals: 0 });
  });

  it("classifies regional content independently from publisher domain", () => {
    expect(inferContentMarket("Japan mobile game player survey", regionResearchProfile("jp"))).toBe("jp");
    expect(inferContentMarket("Global mobile game player survey", regionResearchProfile("jp"))).toBe("global");
  });
});
