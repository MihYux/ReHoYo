import { describe, expect, it } from "vitest";
import { selectBalancedDemoEvidence } from "@/lib/prewritten-regional-demo";

describe("prewritten regional evidence balance", () => {
  it.each(["cn", "jp", "kr", "na", "eu", "sea", "hmt"])("gives %s at least 30 sources with 70% player voice", (regionCode) => {
    const evidence = selectBalancedDemoEvidence(regionCode);
    expect(evidence.length).toBe(33);
    expect(evidence.filter((item) => item.focus === "player")).toHaveLength(24);
    expect(evidence.filter((item) => item.focus === "player").length / evidence.length).toBeGreaterThanOrEqual(0.7);
    expect(new Set(evidence.map((item) => item.seed.url)).size).toBe(evidence.length);
    expect(evidence.filter((item) => item.focus === "market")).toHaveLength(3);
    expect(evidence.filter((item) => item.focus === "sentiment")).toHaveLength(3);
    expect(evidence.filter((item) => item.focus === "culture")).toHaveLength(3);
    expect(evidence.every((item) => item.local)).toBe(true);
  });
});
