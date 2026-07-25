const assert = require("node:assert/strict");
const test = require("node:test");
const {
  cloudflarePopupDelivery,
} = require("./cloudflare-popup-policy.cjs");

test("only a real Cloudflare network delivery can request an automatic popup", () => {
  assert.deepEqual(
    cloudflarePopupDelivery("network", "message-1"),
    { source: "cloudflare", messageId: "message-1" },
  );
  assert.deepEqual(
    cloudflarePopupDelivery("http", "message-2"),
    { source: "cloudflare", messageId: "message-2" },
  );
  assert.equal(cloudflarePopupDelivery("cache", "message-3"), null);
  assert.equal(cloudflarePopupDelivery("local_file", "message-4"), null);
  assert.equal(cloudflarePopupDelivery("startup_restore", "message-5"), null);
  assert.equal(cloudflarePopupDelivery("network", ""), null);
});
