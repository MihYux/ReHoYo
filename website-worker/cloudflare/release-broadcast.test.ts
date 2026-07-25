import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function policy(code: "CN" | "JP") {
  const names = { CN: "中国大陆", JP: "日本" };
  return {
    region: {
      id: `region-${code.toLowerCase()}`,
      code,
      name: names[code],
      language: code === "JP" ? "日语" : "简体中文",
      timeZone: code === "JP" ? "Asia/Tokyo" : "Asia/Shanghai",
      quietHours: { start: "22:00", end: "08:00" },
    },
    plan: {
      id: `task-${code.toLowerCase()}`,
      title: `${names[code]}发行方案`,
      objective: "launch",
      theme: "由三月七自然介绍新旅程",
      narrative: "结合当地表达习惯，以低压力方式开启版本对话。",
      timeWindow: "T0 后一次主动对话",
      facts: [{ id: `fact-${code.toLowerCase()}`, label: "版本信息", value: "匹诺康尼的新旅程已经开启。", source: "已审核角色共生方案" }],
    },
    delivery: { messageMode: "release_context", frequencyBypass: true },
    systemPrompt: `使用符合${names[code]}区域习惯的自然表达。`,
  };
}

function batch(batchId = "delivery-global-1") {
  return {
    schemaVersion: 2,
    batchId,
    researchRunId: "research-global-1",
    publishedAt: "2026-07-25T13:00:00.000Z",
    expiresAt: "2026-07-26T13:00:00.000Z",
    rolloutPercent: 100,
    delivery: { messageMode: "release_context", frequencyBypass: true, requiresDeepSeekThinking: true },
    regions: { CN: policy("CN"), JP: policy("JP") },
  };
}

async function publish(value = batch()) {
  return SELF.fetch("https://rehoyo.ccwu.cc/api/v2/release-batches/current", {
    method: "PUT",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("global realtime release batches", () => {
  it("persists one complete checksummed batch and exposes it with an ETag", async () => {
    const response = await publish();
    expect(response.status).toBe(201);
    const result = await response.json<{ checksum: string; status: { shardFailures: number } }>();
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.status.shardFailures).toBe(0);

    const current = await SELF.fetch("https://rehoyo.ccwu.cc/api/v2/release-batches/current");
    expect(current.status).toBe(200);
    expect(current.headers.get("etag")).toBe(`"${result.checksum}"`);
    await expect(current.json()).resolves.toMatchObject({
      batchId: "delivery-global-1",
      rolloutPercent: 100,
      delivery: { messageMode: "release_context", requiresDeepSeekThinking: true },
      regions: { CN: { region: { code: "CN" } }, JP: { region: { code: "JP" } } },
    });
  });

  it("rejects unauthenticated and incomplete batch bodies", async () => {
    const unauthorized = await SELF.fetch("https://rehoyo.ccwu.cc/api/v2/release-batches/current", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch("unauthorized")),
    });
    expect(unauthorized.status).toBe(401);

    const invalid = batch("invalid");
    invalid.regions = {} as typeof invalid.regions;
    const response = await publish(invalid);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_RELEASE_BATCH" });
  });

  it("upgrades a shard socket, broadcasts immediately, and aggregates anonymous acknowledgements", async () => {
    const connected = await SELF.fetch("https://rehoyo.ccwu.cc/api/v2/pet-stream?shard=7&region=JP", {
      headers: { upgrade: "websocket" },
    });
    expect(connected.status).toBe(101);
    const socket = connected.webSocket;
    expect(socket).toBeTruthy();
    socket!.accept();
    const nextMessage = new Promise<string>((resolve) => {
      socket!.addEventListener("message", (event: MessageEvent) => {
        const value = String(event.data);
        if (value.includes('"batchId":"delivery-realtime-2"')) resolve(value);
      });
    });

    const response = await publish(batch("delivery-realtime-2"));
    expect(response.status).toBe(201);
    await expect(nextMessage).resolves.toContain('"batchId":"delivery-realtime-2"');
    socket!.send(JSON.stringify({ type: "release_batch_ack", batchId: "delivery-realtime-2", stage: "received" }));
    socket!.send(JSON.stringify({ type: "release_batch_ack", batchId: "delivery-realtime-2", stage: "generated" }));
    socket!.send(JSON.stringify({ type: "release_batch_ack", batchId: "delivery-realtime-2", stage: "generated" }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    const status = await SELF.fetch("https://rehoyo.ccwu.cc/api/v2/release-batches/delivery-realtime-2/status", {
      headers: { authorization: "Bearer test-token" },
    });
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      status: { onlineConnections: 1, received: 1, generated: 1, degraded: 0, suppressed: 0, failed: 0 },
    });
    socket!.close(1000, "done");
  });
});
