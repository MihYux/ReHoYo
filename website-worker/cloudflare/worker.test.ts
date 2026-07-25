import { describe, expect, it, vi } from "vitest";
import worker from "./worker";

const policy = {
  schemaVersion: 1,
  policyVersion: "policy-1",
  publishedAt: "2026-07-25T00:00:00.000Z",
  rolloutPercent: 100,
  delivery: { messageMode: "casual_check_in", frequencyBypass: true },
  region: { id: "region-jp", code: "JP", name: "日本", language: "ja-JP", timeZone: "Asia/Tokyo", quietHours: { start: "22:00", end: "08:00" } },
  plan: { id: "task-1", title: "日本策略", objective: "launch", theme: "同行", narrative: "自然表达", timeWindow: "T-3", facts: [] },
  systemPrompt: "使用自然的日语区域表达。",
  checksum: "a".repeat(64),
};

function environment(value: typeof policy | null = policy) {
  return {
    PUBLISH_TOKEN: "test-token",
    PET_POLICIES: {
      getWithMetadata: vi.fn(async () => ({ value, metadata: null, cacheStatus: null })),
      put: vi.fn(async () => undefined),
    },
    ASSETS: { fetch: vi.fn(async () => new Response("site", { status: 200 })) },
  } as Env;
}

describe("pet policy worker", () => {
  it("serves a region policy with an etag and public cache policy", async () => {
    const response = await worker.fetch(new Request("https://rehoyo.ccwu.cc/api/v1/pet-policy/jp"), environment(), {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(`"${policy.checksum}"`);
    expect(response.headers.get("cache-control")).toBe("public, no-cache");
    await expect(response.json()).resolves.toMatchObject({ policyVersion: "policy-1" });
  });

  it("returns 304 when the desktop pet already has the same policy", async () => {
    const response = await worker.fetch(new Request("https://rehoyo.ccwu.cc/api/v1/pet-policy/JP", { headers: { "if-none-match": `"${policy.checksum}"` } }), environment(), {} as ExecutionContext);
    expect(response.status).toBe(304);
  });

  it("keeps the public website on the static asset binding", async () => {
    const env = environment();
    const response = await worker.fetch(new Request("https://rehoyo.ccwu.cc/"), env, {} as ExecutionContext);
    expect(await response.text()).toBe("site");
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it("stores the casual dispatch mode and frequency instruction", async () => {
    const env = environment(null);
    const response = await worker.fetch(new Request("https://rehoyo.ccwu.cc/api/v1/pet-policy/JP", {
      method: "PUT",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify(policy),
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(201);
    const stored = JSON.parse((env.PET_POLICIES.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as string);
    expect(stored.delivery).toEqual({ messageMode: "casual_check_in", frequencyBypass: true });
  });
});
