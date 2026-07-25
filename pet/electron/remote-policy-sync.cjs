const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_POLICY_URL = "https://rehoyo.ccwu.cc";
const MAX_POLICY_BYTES = 128 * 1024;

function normalizeRegionCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,24}$/.test(code)) throw new Error("Invalid regional policy code.");
  return code;
}

function profileRegionCode(profile) {
  const known = {
    china: "CN",
    japan: "JP",
    north_america: "NA",
  };
  if (known[profile?.region]) return known[profile.region];
  if (String(profile?.timeZone || "").startsWith("Asia/Shanghai")) return "CN";
  if (String(profile?.timeZone || "").startsWith("Asia/Tokyo")) return "JP";
  return "NA";
}

function validatePolicy(value, expectedCode) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) throw new Error("Unsupported regional policy contract.");
  if (typeof value.policyVersion !== "string" || !value.policyVersion.trim()) throw new Error("Regional policy version is missing.");
  if (typeof value.checksum !== "string" || !/^[a-f0-9]{64}$/.test(value.checksum)) throw new Error("Regional policy checksum is invalid.");
  if (typeof value.systemPrompt !== "string" || !value.systemPrompt.trim() || value.systemPrompt.length > 24_000) throw new Error("Regional system prompt is invalid.");
  if (!value.region || normalizeRegionCode(value.region.code) !== expectedCode) throw new Error("Regional policy does not match this pet.");
  if (!value.plan || typeof value.plan !== "object" || !Array.isArray(value.plan.facts)) throw new Error("Regional policy plan is invalid.");
  if (!Number.isInteger(value.rolloutPercent) || value.rolloutPercent < 1 || value.rolloutPercent > 100) throw new Error("Regional rollout is invalid.");
  const { checksum, ...unsigned } = value;
  const actual = crypto.createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  if (actual !== checksum) throw new Error("Regional policy checksum mismatch.");
  return value;
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

class RemotePolicySync {
  constructor({
    cachePath,
    getRegionCode,
    onPolicy,
    baseUrl = DEFAULT_POLICY_URL,
    intervalMs = 15 * 60 * 1000,
    fetchImpl = globalThis.fetch,
  }) {
    if (!cachePath || typeof getRegionCode !== "function" || typeof onPolicy !== "function" || typeof fetchImpl !== "function") throw new Error("Remote policy sync is not configured.");
    this.cachePath = cachePath;
    this.getRegionCode = getRegionCode;
    this.onPolicy = onPolicy;
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.intervalMs = Math.max(60_000, Number(intervalMs) || 15 * 60 * 1000);
    this.fetchImpl = fetchImpl;
    this.timer = undefined;
    this.syncing = false;
    this.cache = this.#readCache();
  }

  #readCache() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, "utf8"));
      const code = normalizeRegionCode(parsed.regionCode);
      return { ...parsed, regionCode: code, policy: validatePolicy(parsed.policy, code) };
    } catch {
      return null;
    }
  }

  start() {
    if (this.cache?.policy) void Promise.resolve(this.onPolicy(this.cache.policy, { changed: false, source: "cache" })).catch((error) => console.error(`Cached regional policy failed: ${error?.message || error}`));
    this.#backgroundSync();
    if (!this.timer) {
      this.timer = setInterval(() => this.#backgroundSync(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  #backgroundSync() {
    void this.sync().catch((error) => console.error(`Regional policy sync failed: ${error?.message || error}`));
  }

  close() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  getCurrentPolicy() {
    return this.cache?.policy || null;
  }

  getStatus() {
    const regionCode = normalizeRegionCode(this.getRegionCode());
    const current = this.cache?.regionCode === regionCode ? this.cache : null;
    return {
      serviceUrl: this.baseUrl,
      regionCode,
      policyVersion: current?.policy?.policyVersion || "",
      checksum: current?.policy?.checksum || "",
      fetchedAt: current?.fetchedAt || "",
      configured: Boolean(current?.policy),
    };
  }

  async sync() {
    if (this.syncing) return { status: "busy" };
    this.syncing = true;
    try {
      const regionCode = normalizeRegionCode(this.getRegionCode());
      const sameRegion = this.cache?.regionCode === regionCode;
      const headers = { accept: "application/json" };
      if (sameRegion && this.cache?.etag) headers["if-none-match"] = this.cache.etag;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/api/v1/pet-policy/${encodeURIComponent(regionCode)}`, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 304) return { status: "unchanged", policy: this.cache?.policy || null };
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) throw new Error(`Regional policy service returned HTTP ${response.status}.`);
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_POLICY_BYTES) throw new Error("Regional policy response is too large.");
      const policy = validatePolicy(JSON.parse(raw), regionCode);
      const changed = !sameRegion || this.cache?.policy?.policyVersion !== policy.policyVersion || this.cache?.policy?.checksum !== policy.checksum;
      this.cache = {
        schemaVersion: 1,
        regionCode,
        etag: response.headers.get("etag") || `"${policy.checksum}"`,
        fetchedAt: new Date().toISOString(),
        policy,
      };
      atomicWrite(this.cachePath, this.cache);
      if (changed) await this.onPolicy(policy, { changed: true, source: "network" });
      return { status: changed ? "updated" : "unchanged", policy };
    } finally {
      this.syncing = false;
    }
  }
}

module.exports = { DEFAULT_POLICY_URL, RemotePolicySync, normalizeRegionCode, profileRegionCode, validatePolicy };
