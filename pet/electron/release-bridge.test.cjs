const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ReleaseBridgeConsumer, deliveryChecksum } = require("./release-bridge.cjs");

function fixture(deliveryId = "delivery_test") {
  const delivery = {
    schemaVersion: 1, deliveryId, publishedAt: "2026-07-25T00:00:00.000Z", exampleMode: false,
    sourceId: deliveryId, taskId: "task_1", regionId: "region-jp", rolloutPercent: 5,
    region: { id: "region-jp", code: "JP", name: "日本", language: "ja-JP", timeZone: "Asia/Tokyo", quietHours: { start: "22:00", end: "08:00" } },
    plan: { id: "task_1", title: "日本角色共生方案", objective: "recall", theme: "梦境同行", narrative: "低打扰邀请", timeWindow: "T-3", facts: [] },
    source: null,
  };
  return { ...delivery, checksum: deliveryChecksum(delivery) };
}

test("consumes an offline delivery exactly once", async (context) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "march-bridge-"));
  context.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const inbox = path.join(rootDir, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, "delivery_test.json"), JSON.stringify(fixture()));
  const deliveries = [];
  const consumer = new ReleaseBridgeConsumer({ rootDir, onDelivery: async (value) => deliveries.push(value), intervalMs: 60_000 });
  await consumer.scan();
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].deliveryId, "delivery_test");
  fs.writeFileSync(path.join(inbox, "delivery_test.json"), JSON.stringify(fixture()));
  await consumer.scan();
  assert.equal(deliveries.length, 1);
  assert.ok(fs.existsSync(path.join(rootDir, "processed", "delivery_test.receipt.json")));
  consumer.close();
});

test("quarantines corrupted deliveries", async (context) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "march-bridge-bad-"));
  context.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const inbox = path.join(rootDir, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, "delivery_bad.json"), JSON.stringify({ ...fixture("delivery_bad"), checksum: "bad" }));
  const consumer = new ReleaseBridgeConsumer({ rootDir, onDelivery: async () => assert.fail("must not deliver") });
  await consumer.scan();
  assert.equal(fs.readdirSync(path.join(rootDir, "quarantine")).filter((name) => name.endsWith(".json")).length, 1);
  consumer.close();
});

test("quarantines checksum-valid deliveries containing internal metadata", async (context) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "march-bridge-meta-"));
  context.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const inbox = path.join(rootDir, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  const payload = fixture("delivery_metadata");
  payload.plan.theme = "生成时间：2026-07-25T05:50:02.907Z";
  const { checksum: _old, ...delivery } = payload;
  const contaminated = { ...delivery, checksum: deliveryChecksum(delivery) };
  fs.writeFileSync(path.join(inbox, "delivery_metadata.json"), JSON.stringify(contaminated));
  const consumer = new ReleaseBridgeConsumer({ rootDir, onDelivery: async () => assert.fail("must not deliver") });
  await consumer.scan();
  assert.equal(fs.readdirSync(path.join(rootDir, "quarantine")).filter((name) => name.endsWith(".json")).length, 1);
  consumer.close();
});
