const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

function defaultBridgeRoot() {
  return process.env.MARCH7TH_BRIDGE_DIR
    ? path.resolve(process.env.MARCH7TH_BRIDGE_DIR)
    : path.join(os.homedir(), ".rehoyo", "march7th-bridge");
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, filePath);
}

function deliveryChecksum(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

class ReleaseBridgeConsumer {
  constructor({ rootDir = defaultBridgeRoot(), onDelivery, intervalMs = 700 }) {
    if (typeof onDelivery !== "function") throw new Error("Release bridge requires onDelivery.");
    this.rootDir = rootDir;
    this.inboxDir = path.join(rootDir, "inbox");
    this.processedDir = path.join(rootDir, "processed");
    this.quarantineDir = path.join(rootDir, "quarantine");
    this.onDelivery = onDelivery;
    this.intervalMs = intervalMs;
    this.timer = undefined;
    this.scanning = false;
  }

  start() {
    fs.mkdirSync(this.inboxDir, { recursive: true });
    fs.mkdirSync(this.processedDir, { recursive: true });
    fs.mkdirSync(this.quarantineDir, { recursive: true });
    void this.scan();
    if (!this.timer) this.timer = setInterval(() => void this.scan(), this.intervalMs);
    this.timer.unref?.();
  }

  close() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      fs.mkdirSync(this.inboxDir, { recursive: true });
      fs.mkdirSync(this.processedDir, { recursive: true });
      fs.mkdirSync(this.quarantineDir, { recursive: true });
      const files = fs.readdirSync(this.inboxDir).filter((name) => name.endsWith(".json")).sort();
      for (const name of files) await this.#consume(name);
    } finally {
      this.scanning = false;
    }
  }

  async #consume(name) {
    const sourcePath = path.join(this.inboxDir, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      const { checksum, ...delivery } = parsed;
      if (parsed.schemaVersion !== 1 || typeof parsed.deliveryId !== "string" || !parsed.deliveryId) {
        throw new Error("Invalid delivery contract");
      }
      if (path.basename(name, ".json") !== parsed.deliveryId) throw new Error("Delivery filename mismatch");
      if (typeof checksum !== "string" || checksum !== deliveryChecksum(delivery)) throw new Error("Delivery checksum mismatch");
      const receiptPath = path.join(this.processedDir, `${parsed.deliveryId}.receipt.json`);
      if (!fs.existsSync(receiptPath)) {
        await this.onDelivery(delivery);
        atomicWrite(receiptPath, `${JSON.stringify({ deliveryId: parsed.deliveryId, processedAt: new Date().toISOString(), checksum }, null, 2)}\n`);
      }
      fs.unlinkSync(sourcePath);
    } catch (error) {
      const destination = path.join(this.quarantineDir, `${Date.now()}-${name}`);
      try { fs.renameSync(sourcePath, destination); } catch { /* Another scan may have moved it. */ }
      atomicWrite(`${destination}.error.txt`, `${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

module.exports = { ReleaseBridgeConsumer, defaultBridgeRoot, deliveryChecksum };
