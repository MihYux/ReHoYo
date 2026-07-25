import {
  aggregateReleaseStatus,
  broadcastReleaseBatch,
  MAX_RELEASE_BATCH_BYTES,
  normalizeReleaseBatch,
  PET_STREAM_SHARD_COUNT,
  RELEASE_BATCH_KEY,
  releaseNotice,
  type ReleaseBatch,
} from "./release-broadcast";

const API_PREFIX = "/api/v1/pet-policy";
const GLOBAL_COMMAND_PATH = "/api/v1/pet-command/global";
const RELEASE_BATCH_PATH = "/api/v2/release-batches/current";
const PET_STREAM_PATH = "/api/v2/pet-stream";
const MAX_POLICY_BYTES = 128 * 1024;
const textEncoder = new TextEncoder();

type PetFact = { id: string; label: string; value: string; source: string };

type PetPolicy = {
  schemaVersion: 1;
  policyVersion: string;
  publishedAt: string;
  rolloutPercent: number;
  delivery: {
    messageMode: "casual_check_in";
    frequencyBypass: boolean;
  };
  region: {
    id: string;
    code: string;
    name: string;
    language: string;
    timeZone: string;
    quietHours: { start: string; end: string };
  };
  plan: {
    id: string;
    title: string;
    objective: "preheat" | "launch" | "sustain" | "recall";
    theme: string;
    narrative: string;
    timeWindow: string;
    facts: PetFact[];
  };
  systemPrompt: string;
  checksum: string;
};

type GlobalPetCommand = {
  schemaVersion: 1;
  commandVersion: string;
  publishedAt: string;
  rolloutPercent: number;
  delivery: {
    messageMode: "casual_check_in";
    frequencyBypass: true;
  };
  checksum: string;
};

type PolicyMetadata = {
  policyVersion: string;
  checksum: string;
  publishedAt: string;
};

type CommandMetadata = {
  commandVersion: string;
  checksum: string;
  publishedAt: string;
};

type ReleaseBatchMetadata = {
  batchId: string;
  researchRunId: string;
  checksum: string;
  publishedAt: string;
  expiresAt: string;
};

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { ...init, headers });
}

function publicHeaders(etag: string) {
  return {
    "access-control-allow-origin": "*",
    // Keep the payload in KV's edge cache, but revalidate HTTP clients so their
    // If-None-Match header reliably reaches the Worker and can return 304.
    "cache-control": "public, no-cache",
    etag,
    "x-content-type-options": "nosniff",
  };
}

function stringField(value: unknown, name: string, max: number, allowEmpty = false) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > max) throw new Error(`${name} is invalid`);
  return normalized;
}

function regionCode(value: unknown) {
  const code = stringField(value, "region.code", 24).toUpperCase();
  if (!/^[A-Z0-9_-]{2,24}$/.test(code)) throw new Error("region.code is invalid");
  return code;
}

function fact(value: unknown, index: number): PetFact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`plan.facts[${index}] is invalid`);
  const item = value as Record<string, unknown>;
  return {
    id: stringField(item.id, `plan.facts[${index}].id`, 160),
    label: stringField(item.label, `plan.facts[${index}].label`, 160),
    value: stringField(item.value, `plan.facts[${index}].value`, 2_000),
    source: stringField(item.source, `plan.facts[${index}].source`, 300),
  };
}

function normalizePolicy(value: unknown): Omit<PetPolicy, "checksum"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Policy body must be an object");
  const input = value as Record<string, unknown>;
  const region = input.region as Record<string, unknown> | undefined;
  const plan = input.plan as Record<string, unknown> | undefined;
  const quietHours = region?.quietHours as Record<string, unknown> | undefined;
  if (input.schemaVersion !== 1 || !region || !plan || !quietHours) throw new Error("Unsupported policy contract");
  const objective = stringField(plan.objective, "plan.objective", 20);
  if (!["preheat", "launch", "sustain", "recall"].includes(objective)) throw new Error("plan.objective is invalid");
  const rolloutPercent = Number(input.rolloutPercent);
  if (!Number.isInteger(rolloutPercent) || rolloutPercent < 1 || rolloutPercent > 100) throw new Error("rolloutPercent must be 1-100");
  const facts = Array.isArray(plan.facts) ? plan.facts.map(fact) : [];
  if (facts.length > 30) throw new Error("plan.facts exceeds 30 items");
  const delivery = input.delivery as Record<string, unknown> | undefined;
  if (!delivery || delivery.messageMode !== "casual_check_in" || typeof delivery.frequencyBypass !== "boolean") {
    throw new Error("delivery is invalid");
  }
  return {
    schemaVersion: 1,
    policyVersion: stringField(input.policyVersion, "policyVersion", 160),
    publishedAt: stringField(input.publishedAt, "publishedAt", 64),
    rolloutPercent,
    delivery: {
      messageMode: "casual_check_in",
      frequencyBypass: delivery.frequencyBypass,
    },
    region: {
      id: stringField(region.id, "region.id", 160),
      code: regionCode(region.code),
      name: stringField(region.name, "region.name", 120),
      language: stringField(region.language, "region.language", 80),
      timeZone: stringField(region.timeZone, "region.timeZone", 80),
      quietHours: {
        start: stringField(quietHours.start, "region.quietHours.start", 8),
        end: stringField(quietHours.end, "region.quietHours.end", 8),
      },
    },
    plan: {
      id: stringField(plan.id, "plan.id", 160),
      title: stringField(plan.title, "plan.title", 300),
      objective: objective as PetPolicy["plan"]["objective"],
      theme: stringField(plan.theme, "plan.theme", 2_000),
      narrative: stringField(plan.narrative, "plan.narrative", 8_000),
      timeWindow: stringField(plan.timeWindow, "plan.timeWindow", 2_000),
      facts,
    },
    systemPrompt: stringField(input.systemPrompt, "systemPrompt", 24_000),
  };
}

function normalizeCommand(value: unknown): Omit<GlobalPetCommand, "checksum"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Command body must be an object");
  const input = value as Record<string, unknown>;
  const delivery = input.delivery as Record<string, unknown> | undefined;
  const rolloutPercent = Number(input.rolloutPercent);
  if (input.schemaVersion !== 1) throw new Error("Unsupported command contract");
  if (!Number.isInteger(rolloutPercent) || rolloutPercent < 1 || rolloutPercent > 100) throw new Error("rolloutPercent must be 1-100");
  if (!delivery || delivery.messageMode !== "casual_check_in" || delivery.frequencyBypass !== true) {
    throw new Error("delivery is invalid");
  }
  return {
    schemaVersion: 1,
    commandVersion: stringField(input.commandVersion, "commandVersion", 160),
    publishedAt: stringField(input.publishedAt, "publishedAt", 64),
    rolloutPercent,
    delivery: {
      messageMode: "casual_check_in",
      frequencyBypass: true,
    },
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authorized(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const [expectedHash, suppliedHash] = await Promise.all([sha256(secret), sha256(supplied)]);
  return constantTimeEqual(expectedHash, suppliedHash);
}

function keyForRegion(code: string) {
  return `pet-policy:${code}`;
}

const GLOBAL_COMMAND_KEY = "pet-command:GLOBAL";

async function readPolicy(request: Request, env: Env, code: string) {
  const result = await env.PET_POLICIES.getWithMetadata<PetPolicy, PolicyMetadata>(keyForRegion(code), {
    type: "json",
    cacheTtl: 60,
  });
  if (!result.value) return json({ error: "POLICY_NOT_FOUND", region: code }, { status: 404, headers: publicHeaders('"missing"') });
  const etag = `"${result.value.checksum}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: publicHeaders(etag) });
  const body = request.method === "HEAD" ? null : JSON.stringify(result.value);
  return new Response(body, { status: 200, headers: { ...publicHeaders(etag), "content-type": "application/json; charset=utf-8" } });
}

async function publishPolicy(request: Request, env: Env, code: string) {
  if (!(await authorized(request, env.PUBLISH_TOKEN))) return json({ error: "UNAUTHORIZED" }, { status: 401 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_POLICY_BYTES) return json({ error: "POLICY_TOO_LARGE" }, { status: 413 });
  const raw = await request.text();
  if (textEncoder.encode(raw).byteLength > MAX_POLICY_BYTES) return json({ error: "POLICY_TOO_LARGE" }, { status: 413 });
  let normalized: Omit<PetPolicy, "checksum">;
  try {
    normalized = normalizePolicy(JSON.parse(raw));
  } catch (error) {
    return json({ error: "INVALID_POLICY", message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
  if (normalized.region.code !== code) return json({ error: "REGION_MISMATCH" }, { status: 409 });
  const checksum = await sha256(JSON.stringify(normalized));
  const policy: PetPolicy = { ...normalized, checksum };
  const metadata: PolicyMetadata = { policyVersion: policy.policyVersion, checksum, publishedAt: policy.publishedAt };
  await env.PET_POLICIES.put(keyForRegion(code), JSON.stringify(policy), { metadata });
  console.log(JSON.stringify({ message: "pet policy published", region: code, policyVersion: policy.policyVersion, checksum }));
  return json({ ok: true, region: code, policyVersion: policy.policyVersion, checksum, publishedAt: policy.publishedAt }, { status: 201 });
}

async function readGlobalCommand(request: Request, env: Env) {
  const result = await env.PET_POLICIES.getWithMetadata<GlobalPetCommand, CommandMetadata>(GLOBAL_COMMAND_KEY, {
    type: "json",
    cacheTtl: 60,
  });
  if (!result.value) return json({ error: "COMMAND_NOT_FOUND" }, { status: 404, headers: publicHeaders('"missing"') });
  const etag = `"${result.value.checksum}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: publicHeaders(etag) });
  const body = request.method === "HEAD" ? null : JSON.stringify(result.value);
  return new Response(body, { status: 200, headers: { ...publicHeaders(etag), "content-type": "application/json; charset=utf-8" } });
}

async function publishGlobalCommand(request: Request, env: Env) {
  if (!(await authorized(request, env.PUBLISH_TOKEN))) return json({ error: "UNAUTHORIZED" }, { status: 401 });
  const raw = await request.text();
  if (textEncoder.encode(raw).byteLength > MAX_POLICY_BYTES) return json({ error: "COMMAND_TOO_LARGE" }, { status: 413 });
  let normalized: Omit<GlobalPetCommand, "checksum">;
  try {
    normalized = normalizeCommand(JSON.parse(raw));
  } catch (error) {
    return json({ error: "INVALID_COMMAND", message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
  const checksum = await sha256(JSON.stringify(normalized));
  const command: GlobalPetCommand = { ...normalized, checksum };
  const metadata: CommandMetadata = {
    commandVersion: command.commandVersion,
    checksum,
    publishedAt: command.publishedAt,
  };
  await env.PET_POLICIES.put(GLOBAL_COMMAND_KEY, JSON.stringify(command), { metadata });
  console.log(JSON.stringify({ message: "global pet command published", commandVersion: command.commandVersion, checksum }));
  return json({ ok: true, scope: "global", commandVersion: command.commandVersion, checksum, publishedAt: command.publishedAt }, { status: 201 });
}

async function readReleaseBatch(request: Request, env: Env) {
  const result = await env.PET_POLICIES.getWithMetadata<ReleaseBatch, ReleaseBatchMetadata>(RELEASE_BATCH_KEY, {
    type: "json",
    cacheTtl: 60,
  });
  if (!result.value) return json({ error: "RELEASE_BATCH_NOT_FOUND" }, { status: 404, headers: publicHeaders('"missing"') });
  const etag = `"${result.value.checksum}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: publicHeaders(etag) });
  const body = request.method === "HEAD" ? null : JSON.stringify(result.value);
  return new Response(body, { status: 200, headers: { ...publicHeaders(etag), "content-type": "application/json; charset=utf-8" } });
}

async function publishReleaseBatch(request: Request, env: Env) {
  if (!(await authorized(request, env.PUBLISH_TOKEN))) return json({ error: "UNAUTHORIZED" }, { status: 401 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_RELEASE_BATCH_BYTES) return json({ error: "RELEASE_BATCH_TOO_LARGE" }, { status: 413 });
  const raw = await request.text();
  if (textEncoder.encode(raw).byteLength > MAX_RELEASE_BATCH_BYTES) return json({ error: "RELEASE_BATCH_TOO_LARGE" }, { status: 413 });
  let batch: ReleaseBatch;
  try {
    batch = await normalizeReleaseBatch(JSON.parse(raw));
  } catch (error) {
    return json({ error: "INVALID_RELEASE_BATCH", message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
  const metadata: ReleaseBatchMetadata = {
    batchId: batch.batchId,
    researchRunId: batch.researchRunId,
    checksum: batch.checksum,
    publishedAt: batch.publishedAt,
    expiresAt: batch.expiresAt,
  };
  await env.PET_POLICIES.put(RELEASE_BATCH_KEY, JSON.stringify(batch), { metadata });
  await Promise.all(Object.entries(batch.regions).map(([code, policy]) =>
    env.PET_POLICIES.put(keyForRegion(code), JSON.stringify(policy), {
      metadata: { policyVersion: policy.policyVersion, checksum: policy.checksum, publishedAt: policy.publishedAt },
    })));
  const status = await broadcastReleaseBatch(env, batch);
  console.log(JSON.stringify({ message: "global release batch published", researchRunId: batch.researchRunId, checksum: batch.checksum, ...status }));
  return json({ ok: true, batchId: batch.batchId, researchRunId: batch.researchRunId, checksum: batch.checksum, publishedAt: batch.publishedAt, expiresAt: batch.expiresAt, status }, { status: 201 });
}

async function connectPetStream(request: Request, env: Env) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json({ error: "WEBSOCKET_UPGRADE_REQUIRED" }, { status: 426, headers: { upgrade: "websocket" } });
  }
  const url = new URL(request.url);
  const shard = Number(url.searchParams.get("shard"));
  if (!Number.isInteger(shard) || shard < 0 || shard >= PET_STREAM_SHARD_COUNT) return json({ error: "INVALID_SHARD" }, { status: 400 });
  let code: string;
  try {
    code = regionCode(url.searchParams.get("region") || "");
  } catch {
    return json({ error: "INVALID_REGION" }, { status: 400 });
  }
  const headers = new Headers(request.headers);
  const current = await env.PET_POLICIES.get<ReleaseBatch>(RELEASE_BATCH_KEY, "json");
  if (current && Date.parse(current.expiresAt) > Date.now()) {
    headers.set("x-rehoyo-current-batch", encodeURIComponent(JSON.stringify(releaseNotice(current))));
  }
  const target = new URL(request.url);
  target.searchParams.set("region", code);
  return env.PET_STREAM.getByName(`pet-stream-${shard}`).fetch(new Request(target, { method: "GET", headers }));
}

async function readReleaseStatus(request: Request, env: Env, batchId: string) {
  if (!(await authorized(request, env.PUBLISH_TOKEN))) return json({ error: "UNAUTHORIZED" }, { status: 401 });
  return json({ ok: true, status: await aggregateReleaseStatus(env, stringField(batchId, "batchId", 160)) }, { headers: { "cache-control": "no-store" } });
}

async function routeApi(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "rehoyo-pet-policy", storage: "cloudflare-kv" }, { headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === GLOBAL_COMMAND_PATH) {
    if (request.method === "GET" || request.method === "HEAD") return readGlobalCommand(request, env);
    if (request.method === "PUT") return publishGlobalCommand(request, env);
    return json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "GET, HEAD, PUT" } });
  }
  if (url.pathname === RELEASE_BATCH_PATH) {
    if (request.method === "GET" || request.method === "HEAD") return readReleaseBatch(request, env);
    if (request.method === "PUT") return publishReleaseBatch(request, env);
    return json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "GET, HEAD, PUT" } });
  }
  if (url.pathname === PET_STREAM_PATH && request.method === "GET") return connectPetStream(request, env);
  const statusMatch = url.pathname.match(/^\/api\/v2\/release-batches\/([^/]+)\/status$/);
  if (statusMatch && request.method === "GET") return readReleaseStatus(request, env, decodeURIComponent(statusMatch[1]));
  const match = url.pathname.match(/^\/api\/v1\/pet-policy\/([^/]+)$/);
  if (!match) return json({ error: "NOT_FOUND" }, { status: 404 });
  let code: string;
  try {
    code = regionCode(decodeURIComponent(match[1]));
  } catch {
    return json({ error: "INVALID_REGION" }, { status: 400 });
  }
  if (request.method === "GET" || request.method === "HEAD") return readPolicy(request, env, code);
  if (request.method === "PUT") return publishPolicy(request, env, code);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "if-none-match",
        "access-control-max-age": "86400",
      },
    });
  }
  return json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "GET, HEAD, PUT, OPTIONS" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" || url.pathname === GLOBAL_COMMAND_PATH || url.pathname.startsWith(`${API_PREFIX}/`) || url.pathname.startsWith("/api/v2/")) return await routeApi(request, env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ message: "request failed", path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

export { PetBroadcastShard } from "./release-broadcast";
