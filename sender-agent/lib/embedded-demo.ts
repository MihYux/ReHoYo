export const EMBEDDED_DEMO_VERSION = "hsr2-release-v1";
export const EMBEDDED_DEMO_FILE_NAME = "【内部模拟】崩坏星穹铁道2.0版本发行执行层输入材料.md";

const REQUIRED_MARKERS = [
  "《崩坏：星穹铁道》",
  "2.0「假如在午夜入梦」",
  "数据冻结时间：2024 年 1 月 2 日",
  "版本上线时间：2024 年 2 月 6 日",
  "产品侧版本移交单",
  "版本经营目标输入",
] as const;

export type EmbeddedDemoState = { eligible: boolean; fixtureVersion: string };
export type EmbeddedDemoSource = { name: string; extractedText: string };

function normalize(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

export function isEmbeddedDemoDocument(source: EmbeddedDemoSource) {
  const name = normalize(source.name).trim();
  const text = normalize(source.extractedText);
  return name === EMBEDDED_DEMO_FILE_NAME && REQUIRED_MARKERS.every((marker) => text.includes(marker));
}

export function embeddedDemoState(sources: EmbeddedDemoSource[]): EmbeddedDemoState {
  return { eligible: sources.some(isEmbeddedDemoDocument), fixtureVersion: EMBEDDED_DEMO_VERSION };
}

export function embeddedDemoDelayMs() {
  if (process.env.NODE_ENV === "test") return Math.max(0, Number(process.env.EMBEDDED_DEMO_DELAY_MS || 0));
  return Math.max(5_000, Math.min(6_000, Number(process.env.EMBEDDED_DEMO_DELAY_MS || 5_500)));
}

export function waitForEmbeddedDemo() {
  return new Promise((resolve) => setTimeout(resolve, embeddedDemoDelayMs()));
}
