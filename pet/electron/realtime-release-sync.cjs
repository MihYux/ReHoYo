const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { profileRegionCode } = require("./remote-policy-sync.cjs");

const DEFAULT_RELEASE_BASE_URL = "https://rehoyo.ccwu.cc";
const SHARD_COUNT = 32;
const MAX_BATCH_BYTES = 1024 * 1024;
const TERMINAL_STAGES = new Set(["generated", "degraded", "suppressed", "failed"]);

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function batchShard(profileId) {
  const prefix = hash(String(profileId || "anonymous")).slice(0, 8);
  return Number.parseInt(prefix, 16) % SHARD_COUNT;
}

function checksumObject(value) {
  return hash(JSON.stringify(value));
}

function validatePolicy(value, expectedCode, batch) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) throw new Error(`Release policy ${expectedCode} is invalid.`);
  if (value.policyVersion !== batch.batchId || value.publishedAt !== batch.publishedAt || value.rolloutPercent !== 100) throw new Error(`Release policy ${expectedCode} version is invalid.`);
  if (value.delivery?.messageMode !== "release_context" || value.delivery?.frequencyBypass !== true) throw new Error(`Release policy ${expectedCode} delivery is invalid.`);
  if (String(value.region?.code || "").toUpperCase() !== expectedCode) throw new Error(`Release policy ${expectedCode} region is invalid.`);
  if (!value.plan || !Array.isArray(value.plan.facts) || !value.plan.facts.length) throw new Error(`Release policy ${expectedCode} plan is invalid.`);
  if (typeof value.systemPrompt !== "string" || !value.systemPrompt.trim() || value.systemPrompt.length > 24_000) throw new Error(`Release policy ${expectedCode} system prompt is invalid.`);
  if (typeof value.checksum !== "string" || !/^[a-f0-9]{64}$/.test(value.checksum)) throw new Error(`Release policy ${expectedCode} checksum is invalid.`);
  const { checksum, ...unsigned } = value;
  if (checksumObject(unsigned) !== checksum) throw new Error(`Release policy ${expectedCode} checksum mismatch.`);
  return value;
}

function validateReleaseBatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 2) throw new Error("Unsupported global release batch contract.");
  if (typeof value.batchId !== "string" || !value.batchId.trim()) throw new Error("Release batch ID is missing.");
  if (typeof value.researchRunId !== "string" || !value.researchRunId.trim()) throw new Error("Release research run ID is missing.");
  if (!Number.isFinite(Date.parse(value.publishedAt)) || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.parse(value.publishedAt)) throw new Error("Release batch time window is invalid.");
  if (value.rolloutPercent !== 100) throw new Error("Realtime release batch must use 100% rollout.");
  if (value.delivery?.messageMode !== "release_context" || value.delivery?.frequencyBypass !== true || value.delivery?.requiresDeepSeekThinking !== true) throw new Error("Realtime release delivery is invalid.");
  if (!value.regions || typeof value.regions !== "object" || Array.isArray(value.regions) || !Object.keys(value.regions).length) throw new Error("Release batch regions are missing.");
  for (const [rawCode, policy] of Object.entries(value.regions)) {
    const code = rawCode.toUpperCase();
    if (!/^[A-Z0-9_-]{2,24}$/.test(code) || rawCode !== code) throw new Error("Release batch region code is invalid.");
    validatePolicy(policy, code, value);
  }
  if (typeof value.checksum !== "string" || !/^[a-f0-9]{64}$/.test(value.checksum)) throw new Error("Release batch checksum is invalid.");
  const { checksum, ...unsigned } = value;
  if (checksumObject(unsigned) !== checksum) throw new Error("Release batch checksum mismatch.");
  return value;
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

class RealtimeReleaseSync {
  constructor({
    cachePath,
    getProfile,
    onBatch,
    baseUrl = DEFAULT_RELEASE_BASE_URL,
    pollIntervalMs = 60_000,
    fetchImpl = globalThis.fetch,
    webSocketFactory = (url) => new WebSocket(url),
    random = Math.random,
  }) {
    if (!cachePath || typeof getProfile !== "function" || typeof onBatch !== "function" || typeof fetchImpl !== "function" || typeof webSocketFactory !== "function") throw new Error("Realtime release sync is not configured.");
    this.cachePath = cachePath;
    this.getProfile = getProfile;
    this.onBatch = onBatch;
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.pollIntervalMs = Math.max(60_000, Number(pollIntervalMs) || 60_000);
    this.fetchImpl = fetchImpl;
    this.webSocketFactory = webSocketFactory;
    this.random = random;
    this.cache = this.#readCache();
    this.socket = null;
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.closed = false;
    this.syncing = false;
    this.applying = false;
    this.pendingAcks = [];
  }

  #readCache() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, "utf8"));
      return { ...parsed, batch: validateReleaseBatch(parsed.batch) };
    } catch {
      return null;
    }
  }

  start() {
    this.closed = false;
    if (this.cache?.batch) void this.#applyCurrent({ changed: false, source: "cache" });
    this.#connect();
    void this.sync().catch((error) => console.error(`Realtime release sync failed: ${error?.message || error}`));
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => void this.sync().catch((error) => console.error(`Realtime release fallback sync failed: ${error?.message || error}`)), this.pollIntervalMs);
      this.pollTimer.unref?.();
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.pollTimer);
    clearTimeout(this.reconnectTimer);
    this.pollTimer = null;
    this.reconnectTimer = null;
    try { this.socket?.close(1000, "app closing"); } catch {}
    this.socket = null;
  }

  getStatus() {
    return {
      serviceUrl: this.baseUrl,
      batchId: this.cache?.batch?.batchId || "",
      fetchedAt: this.cache?.fetchedAt || "",
      processedAt: this.cache?.processedAt || "",
      connected: this.socket?.readyState === 1,
    };
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
        response = await this.fetchImpl(`${this.baseUrl}/api/v2/release-batches/current`, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 304) {
        if (this.cache?.batch && !this.cache.processedAt) await this.#applyCurrent({ changed: false, source: "http" });
        return { status: "unchanged", batch: this.cache?.batch || null };
      }
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) throw new Error(`Realtime release service returned HTTP ${response.status}.`);
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_BATCH_BYTES) throw new Error("Realtime release batch is too large.");
      const batch = validateReleaseBatch(JSON.parse(raw));
      const changed = this.cache?.batch?.batchId !== batch.batchId || this.cache?.batch?.checksum !== batch.checksum;
      this.cache = {
        schemaVersion: 1,
        etag: response.headers.get("etag") || `"${batch.checksum}"`,
        fetchedAt: new Date().toISOString(),
        batch,
        ...(changed ? {} : this.cache?.processedAt ? { processedAt: this.cache.processedAt } : {}),
      };
      atomicWrite(this.cachePath, this.cache);
      if (changed || !this.cache.processedAt) await this.#applyCurrent({ changed, source: "network" });
      return { status: changed ? "updated" : "unchanged", batch };
    } finally {
      this.syncing = false;
    }
  }

  async #applyCurrent({ changed, source }) {
    if (this.applying || !this.cache?.batch) return;
    this.applying = true;
    try {
      const batch = this.cache.batch;
      const expired = Date.parse(batch.expiresAt) <= Date.now();
      const shouldDeliver = !this.cache.processedAt && !expired;
      if (!this.cache.processedAt) this.#sendAck(batch.batchId, "received");
      let outcome;
      try {
        outcome = await this.onBatch(batch, { changed, source, expired, shouldDeliver });
      } catch (error) {
        outcome = { stage: "failed", reasonCode: error?.code || "batch_apply_failed" };
      }
      if (!this.cache.processedAt && outcome && TERMINAL_STAGES.has(outcome.stage)) {
        this.cache.processedAt = new Date().toISOString();
        this.cache.outcome = { stage: outcome.stage, reasonCode: String(outcome.reasonCode || "").slice(0, 80) };
        atomicWrite(this.cachePath, this.cache);
        this.#sendAck(batch.batchId, outcome.stage, outcome.reasonCode);
      }
    } finally {
      this.applying = false;
    }
  }

  #connect() {
    if (this.closed) return;
    const profile = this.getProfile() || {};
    const region = profileRegionCode(profile);
    const shard = batchShard(profile.id);
    const socketBase = this.baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const url = `${socketBase}/api/v2/pet-stream?shard=${shard}&region=${encodeURIComponent(region)}`;
    let socket;
    try {
      socket = this.webSocketFactory(url);
    } catch {
      this.#scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.reconnectAttempt = 0;
      for (const frame of this.pendingAcks.splice(0)) {
        try { socket.send(frame); } catch { this.pendingAcks.unshift(frame); break; }
      }
    });
    socket.addEventListener("message", (event) => {
      let notice;
      try { notice = JSON.parse(String(event.data)); } catch { return; }
      if (notice?.type !== "release_batch_available" || typeof notice.batchId !== "string") return;
      void this.sync().catch((error) => console.error(`Realtime release notification failed: ${error?.message || error}`));
    });
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.#scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      try { socket.close(); } catch {}
    });
  }

  #scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const base = Math.min(30_000, 1_000 * (2 ** Math.min(this.reconnectAttempt, 5)));
    const delay = Math.round(base * (0.75 + this.random() * 0.5));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.#connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  #sendAck(batchId, stage, reasonCode = "") {
    const frame = JSON.stringify({ type: "release_batch_ack", batchId, stage, ...(reasonCode ? { reasonCode: String(reasonCode).slice(0, 80) } : {}) });
    if (this.socket?.readyState === 1) {
      try { this.socket.send(frame); return; } catch {}
    }
    this.pendingAcks.push(frame);
    this.pendingAcks = this.pendingAcks.slice(-8);
  }
}

module.exports = {
  DEFAULT_RELEASE_BASE_URL,
  RealtimeReleaseSync,
  batchShard,
  validateReleaseBatch,
};
