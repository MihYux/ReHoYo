import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const PET_POLICY_SERVICE_URL = "https://rehoyo.ccwu.cc";

const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_DIR || ".data");
const SETTINGS_PATH = path.join(DATA_DIR, "operator-settings.json");

const StoredSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  glm: z.object({
    apiKey: z.string().max(500),
    model: z.string().min(1).max(100),
    baseUrl: z.string().url().max(500),
  }),
  delivery: z.object({
    publishToken: z.string().max(1000),
  }),
  updatedAt: z.string(),
});

export type StoredOperatorSettings = z.infer<typeof StoredSettingsSchema>;

const SettingsInputSchema = z.object({
  glm: z.object({
    apiKey: z.string().max(500).optional(),
    clearApiKey: z.boolean().optional(),
    model: z.string().trim().min(1).max(100),
    baseUrl: z.string().trim().url().max(500),
  }),
  delivery: z.object({
    publishToken: z.string().max(1000).optional(),
    clearPublishToken: z.boolean().optional(),
  }),
});

let writeQueue = Promise.resolve<unknown>(undefined);

function defaults(): StoredOperatorSettings {
  return {
    schemaVersion: 1,
    glm: {
      apiKey: "",
      model: "glm-5.2",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    },
    delivery: { publishToken: "" },
    updatedAt: new Date(0).toISOString(),
  };
}

function testOverrides(settings: StoredOperatorSettings) {
  if (process.env.NODE_ENV !== "test") return settings;
  return {
    ...settings,
    glm: {
      apiKey: process.env.ZHIPU_API_KEY || settings.glm.apiKey,
      model: process.env.GLM_MODEL || settings.glm.model,
      baseUrl: process.env.GLM_BASE_URL || settings.glm.baseUrl,
    },
  };
}

export function readOperatorSettingsSync(): StoredOperatorSettings {
  try {
    const parsed = StoredSettingsSchema.parse(JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")));
    return testOverrides(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return testOverrides(defaults());
    if (error instanceof SyntaxError || error instanceof z.ZodError) throw new Error("员工端连接设置已损坏，请在设置页重新保存。");
    throw error;
  }
}

export function publicOperatorSettings(settings = readOperatorSettingsSync()) {
  return {
    glm: {
      configured: Boolean(settings.glm.apiKey),
      model: settings.glm.model,
      baseUrl: settings.glm.baseUrl,
    },
    delivery: {
      configured: Boolean(settings.delivery.publishToken),
      serviceUrl: PET_POLICY_SERVICE_URL,
    },
    updatedAt: settings.updatedAt,
  };
}

export function saveOperatorSettings(input: unknown) {
  const parsed = SettingsInputSchema.parse(input);
  const operation = async () => {
    const current = readOperatorSettingsSync();
    const next: StoredOperatorSettings = {
      schemaVersion: 1,
      glm: {
        apiKey: parsed.glm.clearApiKey ? "" : parsed.glm.apiKey?.trim() || current.glm.apiKey,
        model: parsed.glm.model,
        baseUrl: parsed.glm.baseUrl.replace(/\/$/, ""),
      },
      delivery: {
        publishToken: parsed.delivery.clearPublishToken ? "" : parsed.delivery.publishToken?.trim() || current.delivery.publishToken,
      },
      updatedAt: new Date().toISOString(),
    };
    await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    const temporary = `${SETTINGS_PATH}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fsp.rename(temporary, SETTINGS_PATH);
    await fsp.chmod(SETTINGS_PATH, 0o600).catch(() => undefined);
    return publicOperatorSettings(next);
  };
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export const operatorSettingsPath = SETTINGS_PATH;
