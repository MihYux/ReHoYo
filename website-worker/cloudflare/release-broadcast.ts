import { DurableObject } from "cloudflare:workers";

export const RELEASE_BATCH_KEY = "release-batch:CURRENT";
export const PET_STREAM_SHARD_COUNT = 32;
export const MAX_RELEASE_BATCH_BYTES = 1024 * 1024;

const encoder = new TextEncoder();
const terminalStages = new Set(["generated", "degraded", "suppressed", "failed"] as const);

export type ReleaseAckStage = "received" | "generated" | "degraded" | "suppressed" | "failed";
export type ReleaseNotice = {
  type: "release_batch_available";
  batchId: string;
  publishedAt: string;
  checksum: string;
};

export type ReleasePolicy = {
  schemaVersion: 1;
  policyVersion: string;
  publishedAt: string;
  rolloutPercent: 100;
  delivery: { messageMode: "release_context"; frequencyBypass: true };
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
    facts: Array<{ id: string; label: string; value: string; source: string }>;
  };
  systemPrompt: string;
  checksum: string;
};

export type ReleaseBatch = {
  schemaVersion: 2;
  batchId: string;
  researchRunId: string;
  publishedAt: string;
  expiresAt: string;
  rolloutPercent: 100;
  delivery: {
    messageMode: "release_context";
    frequencyBypass: true;
    requiresDeepSeekThinking: true;
  };
  regions: Record<string, ReleasePolicy>;
  checksum: string;
};

export type ReleaseBatchStatus = {
  batchId: string;
  onlineConnections: number;
  notified: number;
  received: number;
  generated: number;
  degraded: number;
  suppressed: number;
  failed: number;
  shardFailures: number;
};

type RealtimeEnv = {
  PET_POLICIES: KVNamespace;
  PET_STREAM: DurableObjectNamespace<PetBroadcastShard>;
};

type SocketAttachment = {
  sessionId: string;
  region: string;
  batches: Record<string, { notified?: true; received?: true; terminal?: Exclude<ReleaseAckStage, "received"> }>;
};

type ReceiptRow = {
  batch_id: string;
  online_at_broadcast: number;
  notified: number;
  received: number;
  generated: number;
  degraded: number;
  suppressed: number;
  failed: number;
};

function shortString(value: unknown, name: string, max: number) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${name} is invalid`);
  return result;
}

function isoDate(value: unknown, name: string) {
  const result = shortString(value, name, 64);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${name} is invalid`);
  return result;
}

function regionCode(value: unknown) {
  const result = shortString(value, "region.code", 24).toUpperCase();
  if (!/^[A-Z0-9_-]{2,24}$/.test(result)) throw new Error("region.code is invalid");
  return result;
}

function normalizeFact(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} is invalid`);
  const item = value as Record<string, unknown>;
  return {
    id: shortString(item.id, `${path}.id`, 160),
    label: shortString(item.label, `${path}.label`, 160),
    value: shortString(item.value, `${path}.value`, 2_000),
    source: shortString(item.source, `${path}.source`, 300),
  };
}

function normalizePolicy(value: unknown, expectedCode: string, batchId: string, publishedAt: string): Omit<ReleasePolicy, "checksum"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`regions.${expectedCode} is invalid`);
  const input = value as Record<string, unknown>;
  const region = input.region as Record<string, unknown> | undefined;
  const quietHours = region?.quietHours as Record<string, unknown> | undefined;
  const plan = input.plan as Record<string, unknown> | undefined;
  const delivery = input.delivery as Record<string, unknown> | undefined;
  if (!region || !quietHours || !plan || !delivery) throw new Error(`regions.${expectedCode} is incomplete`);
  const code = regionCode(region.code);
  if (code !== expectedCode) throw new Error(`regions.${expectedCode} has a mismatched region code`);
  if (delivery.messageMode !== "release_context" || delivery.frequencyBypass !== true) throw new Error(`regions.${expectedCode}.delivery is invalid`);
  const objective = shortString(plan.objective, `regions.${expectedCode}.plan.objective`, 20);
  if (!["preheat", "launch", "sustain", "recall"].includes(objective)) throw new Error(`regions.${expectedCode}.plan.objective is invalid`);
  const facts = Array.isArray(plan.facts)
    ? plan.facts.map((item, index) => normalizeFact(item, `regions.${expectedCode}.plan.facts[${index}]`))
    : [];
  if (!facts.length || facts.length > 30) throw new Error(`regions.${expectedCode}.plan.facts must contain 1-30 facts`);
  return {
    schemaVersion: 1,
    policyVersion: batchId,
    publishedAt,
    rolloutPercent: 100,
    delivery: { messageMode: "release_context", frequencyBypass: true },
    region: {
      id: shortString(region.id, `regions.${expectedCode}.region.id`, 160),
      code,
      name: shortString(region.name, `regions.${expectedCode}.region.name`, 120),
      language: shortString(region.language, `regions.${expectedCode}.region.language`, 80),
      timeZone: shortString(region.timeZone, `regions.${expectedCode}.region.timeZone`, 80),
      quietHours: {
        start: shortString(quietHours.start, `regions.${expectedCode}.region.quietHours.start`, 8),
        end: shortString(quietHours.end, `regions.${expectedCode}.region.quietHours.end`, 8),
      },
    },
    plan: {
      id: shortString(plan.id, `regions.${expectedCode}.plan.id`, 160),
      title: shortString(plan.title, `regions.${expectedCode}.plan.title`, 300),
      objective: objective as ReleasePolicy["plan"]["objective"],
      theme: shortString(plan.theme, `regions.${expectedCode}.plan.theme`, 2_000),
      narrative: shortString(plan.narrative, `regions.${expectedCode}.plan.narrative`, 8_000),
      timeWindow: shortString(plan.timeWindow, `regions.${expectedCode}.plan.timeWindow`, 2_000),
      facts,
    },
    systemPrompt: shortString(input.systemPrompt, `regions.${expectedCode}.systemPrompt`, 24_000),
  };
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeReleaseBatch(value: unknown): Promise<ReleaseBatch> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Release batch body must be an object");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 2 || input.rolloutPercent !== 100) throw new Error("Unsupported release batch contract");
  const delivery = input.delivery as Record<string, unknown> | undefined;
  if (!delivery || delivery.messageMode !== "release_context" || delivery.frequencyBypass !== true || delivery.requiresDeepSeekThinking !== true) {
    throw new Error("Release batch delivery is invalid");
  }
  const batchId = shortString(input.batchId, "batchId", 160);
  const researchRunId = shortString(input.researchRunId, "researchRunId", 160);
  const publishedAt = isoDate(input.publishedAt, "publishedAt");
  const expiresAt = isoDate(input.expiresAt, "expiresAt");
  const lifetime = Date.parse(expiresAt) - Date.parse(publishedAt);
  if (lifetime <= 0 || lifetime > 7 * 24 * 60 * 60 * 1_000) throw new Error("expiresAt must be after publishedAt and within 7 days");
  if (!input.regions || typeof input.regions !== "object" || Array.isArray(input.regions)) throw new Error("regions must be an object");
  const entries = Object.entries(input.regions as Record<string, unknown>);
  if (!entries.length || entries.length > 32) throw new Error("regions must contain 1-32 policies");
  const regions: Record<string, ReleasePolicy> = {};
  for (const [rawCode, rawPolicy] of entries) {
    const code = regionCode(rawCode);
    if (regions[code]) throw new Error(`Duplicate region ${code}`);
    const normalized = normalizePolicy(rawPolicy, code, batchId, publishedAt);
    regions[code] = { ...normalized, checksum: await sha256(JSON.stringify(normalized)) };
  }
  const unsigned = {
    schemaVersion: 2 as const,
    batchId,
    researchRunId,
    publishedAt,
    expiresAt,
    rolloutPercent: 100 as const,
    delivery: {
      messageMode: "release_context" as const,
      frequencyBypass: true as const,
      requiresDeepSeekThinking: true as const,
    },
    regions,
  };
  return { ...unsigned, checksum: await sha256(JSON.stringify(unsigned)) };
}

export function releaseNotice(batch: ReleaseBatch): ReleaseNotice {
  return { type: "release_batch_available", batchId: batch.batchId, publishedAt: batch.publishedAt, checksum: batch.checksum };
}

function parseAttachment(ws: WebSocket): SocketAttachment {
  const parsed = ws.deserializeAttachment() as SocketAttachment | null;
  if (parsed?.sessionId && parsed.region && parsed.batches && typeof parsed.batches === "object") return parsed;
  return { sessionId: crypto.randomUUID(), region: "UNKNOWN", batches: {} };
}

function trimBatches(value: SocketAttachment["batches"]) {
  return Object.fromEntries(Object.entries(value).slice(-4));
}

export class PetBroadcastShard extends DurableObject<RealtimeEnv> {
  constructor(ctx: DurableObjectState, env: RealtimeEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS receipt_counts (
          batch_id TEXT PRIMARY KEY,
          online_at_broadcast INTEGER NOT NULL DEFAULT 0,
          notified INTEGER NOT NULL DEFAULT 0,
          received INTEGER NOT NULL DEFAULT 0,
          generated INTEGER NOT NULL DEFAULT 0,
          degraded INTEGER NOT NULL DEFAULT 0,
          suppressed INTEGER NOT NULL DEFAULT 0,
          failed INTEGER NOT NULL DEFAULT 0
        )
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const url = new URL(request.url);
    const region = regionCode(url.searchParams.get("region") || "");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`region:${region}`]);
    const attachment: SocketAttachment = { sessionId: crypto.randomUUID(), region, batches: {} };
    const encodedNotice = request.headers.get("x-rehoyo-current-batch");
    if (encodedNotice) {
      try {
        const notice = JSON.parse(decodeURIComponent(encodedNotice)) as ReleaseNotice;
        if (notice.type === "release_batch_available") {
          server.send(JSON.stringify(notice));
          attachment.batches[notice.batchId] = { notified: true };
          this.ensureReceipt(notice.batchId);
          this.increment(notice.batchId, "notified");
        }
      } catch {
        // The periodic HTTP fallback remains available if the connection hint is malformed.
      }
    }
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(notice: ReleaseNotice): Promise<{ onlineConnections: number; notified: number }> {
    const sockets = this.ctx.getWebSockets();
    let notified = 0;
    this.ensureReceipt(notice.batchId);
    this.ctx.storage.sql.exec(
      "UPDATE receipt_counts SET online_at_broadcast = MAX(online_at_broadcast, ?) WHERE batch_id = ?",
      sockets.length,
      notice.batchId,
    );
    for (const socket of sockets) {
      try {
        const attachment = parseAttachment(socket);
        const state = attachment.batches[notice.batchId] || {};
        socket.send(JSON.stringify(notice));
        if (!state.notified) {
          state.notified = true;
          notified += 1;
        }
        attachment.batches[notice.batchId] = state;
        attachment.batches = trimBatches(attachment.batches);
        socket.serializeAttachment(attachment);
      } catch {
        // A closing socket is excluded from successful notification counts.
      }
    }
    if (notified) this.increment(notice.batchId, "notified", notified);
    return { onlineConnections: sockets.length, notified };
  }

  async status(batchId: string): Promise<Omit<ReleaseBatchStatus, "shardFailures">> {
    const row = this.ctx.storage.sql.exec<ReceiptRow>("SELECT * FROM receipt_counts WHERE batch_id = ?", batchId).toArray()[0];
    return {
      batchId,
      onlineConnections: this.ctx.getWebSockets().length,
      notified: row?.notified || 0,
      received: row?.received || 0,
      generated: row?.generated || 0,
      degraded: row?.degraded || 0,
      suppressed: row?.suppressed || 0,
      failed: row?.failed || 0,
    };
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 2_048) return;
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(message) as Record<string, unknown>;
    } catch {
      return;
    }
    if (input.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (input.type !== "release_batch_ack") return;
    const batchId = shortString(input.batchId, "batchId", 160);
    const stage = shortString(input.stage, "stage", 24) as ReleaseAckStage;
    if (stage !== "received" && !terminalStages.has(stage as Exclude<ReleaseAckStage, "received">)) return;
    const attachment = parseAttachment(ws);
    const state = attachment.batches[batchId] || {};
    this.ensureReceipt(batchId);
    if (!state.received) {
      state.received = true;
      this.increment(batchId, "received");
    }
    if (stage !== "received" && !state.terminal) {
      state.terminal = stage;
      this.increment(batchId, stage);
    }
    attachment.batches[batchId] = state;
    attachment.batches = trimBatches(attachment.batches);
    ws.serializeAttachment(attachment);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private ensureReceipt(batchId: string) {
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO receipt_counts (batch_id) VALUES (?)", batchId);
  }

  private increment(batchId: string, column: Exclude<ReleaseAckStage, "received"> | "received" | "notified", amount = 1) {
    const allowed = new Set(["notified", "received", "generated", "degraded", "suppressed", "failed"]);
    if (!allowed.has(column)) return;
    this.ctx.storage.sql.exec(`UPDATE receipt_counts SET ${column} = ${column} + ? WHERE batch_id = ?`, amount, batchId);
  }
}

async function shardCallWithRetry<T>(call: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function broadcastReleaseBatch(env: RealtimeEnv, batch: ReleaseBatch): Promise<ReleaseBatchStatus> {
  const notice = releaseNotice(batch);
  const results = await Promise.allSettled(Array.from({ length: PET_STREAM_SHARD_COUNT }, (_, index) =>
    shardCallWithRetry(() => env.PET_STREAM.getByName(`pet-stream-${index}`).broadcast(notice))));
  let onlineConnections = 0;
  let notified = 0;
  let shardFailures = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      onlineConnections += result.value.onlineConnections;
      notified += result.value.notified;
    } else shardFailures += 1;
  }
  return { batchId: batch.batchId, onlineConnections, notified, received: 0, generated: 0, degraded: 0, suppressed: 0, failed: 0, shardFailures };
}

export async function aggregateReleaseStatus(env: RealtimeEnv, batchId: string): Promise<ReleaseBatchStatus> {
  const results = await Promise.allSettled(Array.from({ length: PET_STREAM_SHARD_COUNT }, (_, index) =>
    env.PET_STREAM.getByName(`pet-stream-${index}`).status(batchId)));
  const status: ReleaseBatchStatus = { batchId, onlineConnections: 0, notified: 0, received: 0, generated: 0, degraded: 0, suppressed: 0, failed: 0, shardFailures: 0 };
  for (const result of results) {
    if (result.status === "rejected") {
      status.shardFailures += 1;
      continue;
    }
    for (const key of ["onlineConnections", "notified", "received", "generated", "degraded", "suppressed", "failed"] as const) {
      status[key] += result.value[key];
    }
  }
  return status;
}
