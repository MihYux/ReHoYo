const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_COMMAND_URL = "https://rehoyo.ccwu.cc/api/v1/pet-command/global";
const MAX_COMMAND_BYTES = 16 * 1024;

function validateCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) throw new Error("Unsupported global pet command contract.");
  if (typeof value.commandVersion !== "string" || !value.commandVersion.trim()) throw new Error("Global command version is missing.");
  if (typeof value.publishedAt !== "string" || !Number.isFinite(Date.parse(value.publishedAt))) throw new Error("Global command publish time is invalid.");
  if (!Number.isInteger(value.rolloutPercent) || value.rolloutPercent < 1 || value.rolloutPercent > 100) throw new Error("Global command rollout is invalid.");
  if (value.delivery?.messageMode !== "casual_check_in" || value.delivery?.frequencyBypass !== true) throw new Error("Global command delivery is invalid.");
  if (typeof value.checksum !== "string" || !/^[a-f0-9]{64}$/.test(value.checksum)) throw new Error("Global command checksum is invalid.");
  const { checksum, ...unsigned } = value;
  const actual = crypto.createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  if (actual !== checksum) throw new Error("Global command checksum mismatch.");
  return value;
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

class RemoteCommandSync {
  constructor({
    cachePath,
    onCommand,
    url = DEFAULT_COMMAND_URL,
    intervalMs = 60_000,
    fetchImpl = globalThis.fetch,
  }) {
    if (!cachePath || typeof onCommand !== "function" || typeof fetchImpl !== "function") throw new Error("Remote command sync is not configured.");
    this.cachePath = cachePath;
    this.onCommand = onCommand;
    this.url = String(url);
    this.intervalMs = Math.max(60_000, Number(intervalMs) || 60_000);
    this.fetchImpl = fetchImpl;
    this.timer = undefined;
    this.syncing = false;
    this.cache = this.#readCache();
  }

  #readCache() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, "utf8"));
      return { ...parsed, command: validateCommand(parsed.command) };
    } catch {
      return null;
    }
  }

  start() {
    if (this.cache?.command) void Promise.resolve(this.onCommand(this.cache.command, { changed: false, source: "cache" })).catch((error) => console.error(`Cached global command failed: ${error?.message || error}`));
    this.#backgroundSync();
    if (!this.timer) {
      this.timer = setInterval(() => this.#backgroundSync(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  #backgroundSync() {
    void this.sync().catch((error) => console.error(`Global pet command sync failed: ${error?.message || error}`));
  }

  close() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async sync() {
    if (this.syncing) return { status: "busy" };
    this.syncing = true;
    try {
      const headers = { accept: "application/json", "cache-control": "no-cache" };
      if (this.cache?.etag) headers["if-none-match"] = this.cache.etag;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let response;
      try {
        response = await this.fetchImpl(this.url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 304) return { status: "unchanged", command: this.cache?.command || null };
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) throw new Error(`Global command service returned HTTP ${response.status}.`);
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_COMMAND_BYTES) throw new Error("Global command response is too large.");
      const command = validateCommand(JSON.parse(raw));
      const changed = this.cache?.command?.commandVersion !== command.commandVersion || this.cache?.command?.checksum !== command.checksum;
      this.cache = {
        schemaVersion: 1,
        etag: response.headers.get("etag") || `"${command.checksum}"`,
        fetchedAt: new Date().toISOString(),
        command,
      };
      atomicWrite(this.cachePath, this.cache);
      if (changed) await this.onCommand(command, { changed: true, source: "network" });
      return { status: changed ? "updated" : "unchanged", command };
    } finally {
      this.syncing = false;
    }
  }
}

module.exports = { DEFAULT_COMMAND_URL, RemoteCommandSync, validateCommand };
