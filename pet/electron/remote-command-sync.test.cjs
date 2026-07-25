const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RemoteCommandSync, validateCommand } = require("./remote-command-sync.cjs");

function command(version = "command-1", rolloutPercent = 100) {
  const value = {
    schemaVersion: 1,
    commandVersion: version,
    publishedAt: "2026-07-25T00:00:00.000Z",
    rolloutPercent,
    delivery: { messageMode: "release_context", frequencyBypass: true, demoMode: true },
    region: { id: "region-cn", code: "CN", name: "中国大陆" },
    plan: {
      id: "task-demo", title: "匹诺康尼同行", objective: "launch",
      theme: "由三月七介绍黑天鹅并邀请玩家了解匹诺康尼",
      narrative: "以同行者口吻自然交流", timeWindow: "T0", facts: [],
    },
  };
  return { ...value, checksum: crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}

test("all regions consume the same changed global command exactly once", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rehoyo-global-command-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const applied = [];
  const requests = [];
  let current = command();
  const sync = new RemoteCommandSync({
    cachePath: path.join(root, "cache.json"),
    onCommand: async (value) => applied.push(value.commandVersion),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (init.headers["if-none-match"] === `"${current.checksum}"`) return new Response(null, { status: 304 });
      return new Response(JSON.stringify(current), { status: 200, headers: { etag: `"${current.checksum}"` } });
    },
  });
  assert.equal((await sync.sync()).status, "updated");
  assert.equal((await sync.sync()).status, "unchanged");
  current = command("command-2", 50);
  assert.equal((await sync.sync()).status, "updated");
  assert.deepEqual(applied, ["command-1", "command-2"]);
  assert.ok(requests.every((item) => item.url.endsWith("/api/v1/pet-command/global")));
});

test("accepts the previous casual demo command during a rolling deployment", () => {
  const legacy = command("command-legacy-demo");
  legacy.delivery.messageMode = "casual_check_in";
  delete legacy.region;
  delete legacy.plan;
  const { checksum, ...unsigned } = legacy;
  legacy.checksum = crypto.createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  assert.equal(validateCommand(legacy).delivery.messageMode, "casual_check_in");
});
