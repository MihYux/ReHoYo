const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RemotePolicySync, profileRegionCode } = require("./remote-policy-sync.cjs");

function policy(version = "policy-1") {
  const value = {
    schemaVersion: 1,
    policyVersion: version,
    publishedAt: "2026-07-25T00:00:00.000Z",
    rolloutPercent: 100,
    region: { id: "region-jp", code: "JP", name: "日本", language: "ja-JP", timeZone: "Asia/Tokyo", quietHours: { start: "22:00", end: "08:00" } },
    plan: { id: "task-1", title: "日本策略", objective: "launch", theme: "同行", narrative: "自然表达", timeWindow: "T-3", facts: [] },
    systemPrompt: "使用自然的日语区域表达，并尊重玩家拒绝。",
  };
  return { ...value, checksum: crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}

test("maps the companion profile to the published region code", () => {
  assert.equal(profileRegionCode({ region: "china" }), "CN");
  assert.equal(profileRegionCode({ region: "japan" }), "JP");
  assert.equal(profileRegionCode({ region: "north_america" }), "NA");
});

test("uses etag and applies only a changed policy version", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rehoyo-policy-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const requests = [];
  const applied = [];
  let current = policy();
  const fetchImpl = async (_url, init) => {
    requests.push(init);
    if (init.headers["if-none-match"] === `"${current.checksum}"`) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(current), { status: 200, headers: { etag: `"${current.checksum}"` } });
  };
  const sync = new RemotePolicySync({ cachePath: path.join(root, "cache.json"), getRegionCode: () => "JP", onPolicy: async (value) => applied.push(value.policyVersion), fetchImpl });
  assert.equal((await sync.sync()).status, "updated");
  assert.equal((await sync.sync()).status, "unchanged");
  current = policy("policy-2");
  assert.equal((await sync.sync()).status, "updated");
  assert.deepEqual(applied, ["policy-1", "policy-2"]);
  assert.equal(requests[1].headers["if-none-match"], `"${policy().checksum}"`);
});
