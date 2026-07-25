const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RemoteCommandSync } = require("./remote-command-sync.cjs");

function command(version = "command-1", rolloutPercent = 100) {
  const value = {
    schemaVersion: 1,
    commandVersion: version,
    publishedAt: "2026-07-25T00:00:00.000Z",
    rolloutPercent,
    delivery: { messageMode: "casual_check_in", frequencyBypass: true },
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
