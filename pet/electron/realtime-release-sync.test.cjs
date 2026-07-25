const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RealtimeReleaseSync, batchShard, validateReleaseBatch } = require("./realtime-release-sync.cjs");

function checksum(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function releaseBatch(id = "delivery-live-1", expired = false) {
  const now = Date.now();
  const publishedAt = new Date(now - (expired ? 48 : 1) * 60 * 60 * 1_000).toISOString();
  const expiresAt = new Date(now + (expired ? -24 : 23) * 60 * 60 * 1_000).toISOString();
  const unsignedPolicy = {
    schemaVersion: 1,
    policyVersion: id,
    publishedAt,
    rolloutPercent: 100,
    delivery: { messageMode: "release_context", frequencyBypass: true },
    region: { id: "region-jp", code: "JP", name: "日本", language: "日语", timeZone: "Asia/Tokyo", quietHours: { start: "22:00", end: "08:00" } },
    plan: { id: "task-jp", title: "日本发行", objective: "launch", theme: "新旅程", narrative: "自然表达", timeWindow: "T0", facts: [{ id: "fact-1", label: "版本信息", value: "匹诺康尼的新旅程已经开启。", source: "已审核角色共生方案" }] },
    systemPrompt: "使用自然的日语区域表达。",
  };
  const policy = { ...unsignedPolicy, checksum: checksum(unsignedPolicy) };
  const unsigned = {
    schemaVersion: 2, batchId: id, researchRunId: "research-1", publishedAt, expiresAt, rolloutPercent: 100,
    delivery: { messageMode: "release_context", frequencyBypass: true, requiresDeepSeekThinking: true },
    regions: { JP: policy },
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

class FakeSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.listeners = new Map(); this.sent = []; }
  addEventListener(name, handler) { const list = this.listeners.get(name) || []; list.push(handler); this.listeners.set(name, list); }
  emit(name, value = {}) { for (const handler of this.listeners.get(name) || []) handler(value); }
  open() { this.readyState = 1; this.emit("open"); }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 3; this.emit("close"); }
}

test("validates nested checksums and deterministically shards without exposing the profile ID", () => {
  const value = releaseBatch();
  assert.equal(validateReleaseBatch(value).batchId, value.batchId);
  assert.equal(batchShard("private-profile"), batchShard("private-profile"));
  value.regions.JP.plan.title = "tampered";
  assert.throws(() => validateReleaseBatch(value), /checksum mismatch/i);
});

test("atomically caches and processes each changed batch once", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rehoyo-realtime-release-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = releaseBatch();
  const applied = [];
  const sync = new RealtimeReleaseSync({
    cachePath: path.join(root, "cache.json"),
    getProfile: () => ({ id: "profile-secret", region: "japan" }),
    onBatch: async (batch, state) => { applied.push({ id: batch.batchId, state }); return { stage: "generated" }; },
    fetchImpl: async (_url, init) => init.headers["if-none-match"]
      ? new Response(null, { status: 304 })
      : new Response(JSON.stringify(value), { status: 200, headers: { etag: `"${value.checksum}"` } }),
    webSocketFactory: () => new FakeSocket("unused"),
  });
  assert.equal((await sync.sync()).status, "updated");
  assert.equal((await sync.sync()).status, "unchanged");
  assert.equal(applied.length, 1);
  const cache = JSON.parse(fs.readFileSync(path.join(root, "cache.json"), "utf8"));
  assert.equal(cache.batch.batchId, value.batchId);
  assert.equal(cache.outcome.stage, "generated");
  assert.ok(cache.processedAt);
});

test("uses the canonical checksum ETag and preserves terminal outcome across an unchanged 200 response", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rehoyo-realtime-etag-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = releaseBatch("delivery-etag");
  const requestEtags = [];
  let applied = 0;
  const sync = new RealtimeReleaseSync({
    cachePath: path.join(root, "cache.json"),
    getProfile: () => ({ id: "profile-secret", region: "japan" }),
    onBatch: async () => { applied += 1; return { stage: "degraded", reasonCode: "provider_unavailable" }; },
    fetchImpl: async (_url, init) => {
      requestEtags.push(init.headers["if-none-match"] || "");
      return new Response(JSON.stringify(value), { status: 200, headers: { etag: `W/"${value.checksum}"` } });
    },
    webSocketFactory: () => new FakeSocket("unused"),
  });
  await sync.sync();
  await sync.sync();
  const cache = JSON.parse(fs.readFileSync(path.join(root, "cache.json"), "utf8"));
  assert.equal(requestEtags[1], `"${value.checksum}"`);
  assert.deepEqual(cache.outcome, { stage: "degraded", reasonCode: "provider_unavailable" });
  assert.equal(applied, 1);
});

test("reacts to a WebSocket notice immediately and reports anonymous receipt stages", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rehoyo-realtime-socket-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let current = null;
  let socket;
  const urls = [];
  const sync = new RealtimeReleaseSync({
    cachePath: path.join(root, "cache.json"),
    getProfile: () => ({ id: "profile-must-not-leak", region: "japan" }),
    onBatch: async () => ({ stage: "degraded", reasonCode: "api_key_missing" }),
    fetchImpl: async () => current
      ? new Response(JSON.stringify(current), { status: 200, headers: { etag: `"${current.checksum}"` } })
      : new Response(null, { status: 404 }),
    webSocketFactory: (url) => { urls.push(url); socket = new FakeSocket(url); return socket; },
    random: () => 0.5,
  });
  sync.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.open();
  current = releaseBatch("delivery-live-2");
  socket.emit("message", { data: JSON.stringify({ type: "release_batch_available", batchId: current.batchId, checksum: current.checksum }) });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(urls[0].includes("shard="));
  assert.ok(urls[0].includes("region=JP"));
  assert.ok(!urls[0].includes("profile-must-not-leak"));
  const frames = socket.sent.map((item) => JSON.parse(item));
  assert.deepEqual(frames.map((item) => item.stage), ["received", "degraded"]);
  assert.ok(frames.every((item) => !Object.hasOwn(item, "profileId")));
  sync.close();
});

test("marks an expired offline batch as non-deliverable while still applying its policy", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rehoyo-expired-release-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const states = [];
  const value = releaseBatch("delivery-expired", true);
  const sync = new RealtimeReleaseSync({
    cachePath: path.join(root, "cache.json"), getProfile: () => ({ id: "p", region: "japan" }),
    onBatch: async (_batch, state) => { states.push(state); return { stage: "suppressed", reasonCode: "release_batch_expired" }; },
    fetchImpl: async () => new Response(JSON.stringify(value), { status: 200 }), webSocketFactory: () => new FakeSocket("unused"),
  });
  await sync.sync();
  assert.equal(states[0].expired, true);
  assert.equal(states[0].shouldDeliver, false);
});
