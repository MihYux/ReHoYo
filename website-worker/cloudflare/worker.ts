const API_PREFIX = "/api/v1/pet-policy";
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

type PolicyMetadata = {
  policyVersion: string;
  checksum: string;
  publishedAt: string;
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

async function routeApi(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "rehoyo-pet-policy", storage: "cloudflare-kv" }, { headers: { "cache-control": "no-store" } });
  }
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
      if (url.pathname === "/api/health" || url.pathname.startsWith(`${API_PREFIX}/`)) return await routeApi(request, env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ message: "request failed", path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
