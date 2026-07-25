import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function loadEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnv();

describe("live historical search providers", () => {
  it("returns public URLs from every configured provider without persistence", async () => {
    const { searchProviderConfiguration, searchWithProvider } = await import("@/lib/search-providers");
    const { verifyEvidencePage } = await import("@/lib/evidence-verifier");
    const { regionResearchProfile } = await import("@/lib/region-profiles");
    const configuration = searchProviderConfiguration();
    const providers = (["glm"] as const).filter((provider) => configuration[provider].configured);
    expect(providers.length).toBeGreaterThan(0);
    const request = { query: "Japan video game players market survey 2023", regionCode: "jp", regionName: "Japan", language: "Japanese", dimension: "player" as const, endDate: "2024-01-12", maxResults: 3, round: 1 };
    const results = await Promise.all(providers.map((provider) => searchWithProvider(provider, request)));
    const verification = await Promise.all(results.map(async (result) => {
      const hit = result.hits[0];
      if (!hit) return { provider: result.provider, status: "no_result", url: "" };
      const page = await verifyEvidencePage({ url: hit.url, claimedPublishedAt: hit.claimedPublishedAt, profile: regionResearchProfile("jp"), dimension: "player" });
      return { provider: result.provider, status: page.verificationStatus, url: hit.url, verifiedPublishedAt: page.verifiedPublishedAt, reason: page.rejectionReason };
    }));
    const summary = results.map((result) => ({ provider: result.provider, requestId: result.requestId, results: result.hits.length, latencyMs: result.latencyMs, rateLimited: result.rateLimited, error: result.error || "", urls: result.hits.slice(0, 3).map((hit) => hit.url) }));
    process.stdout.write(`${JSON.stringify({ configuration, summary, verification }, null, 2)}\n`);
    for (const result of results) {
      expect(result.error, `${result.provider} live error`).toBeUndefined();
      expect(result.hits.length, `${result.provider} returned no URLs`).toBeGreaterThan(0);
      expect(result.hits.every((hit) => hit.url.startsWith("https://"))).toBe(true);
    }
  }, 120_000);
});
