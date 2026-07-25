const ISO_MACHINE_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z\b/i;
const SHA256_VALUE = /\b(?:sha-?256\s*[:=]?\s*)?[a-f0-9]{64}\b/i;
const INTERNAL_ID = /\b(?:task|delivery|release|audit|research(?:_run)?)[_-][a-z0-9_-]{6,}\b/i;
const FILE_PATH = /(?:[a-z]:\\|\.{0,2}[\\/])[^\s]+|[^\s]+\.(?:json|md|markdown|docx|pdf)\b/i;
const INTERNAL_LABEL = /(?:生成时间|导入时间|内容校验值|校验值|文件名|方案文件|研究任务\s*ID|发布\s*ID|任务\s*ID|schemaVersion|generatedAt|importedAt|checksum|sourceDocument|researchRunId|deliveryId|taskId)/i;
const MARKUP_OR_JSON_FIELD = /(?:^|\n)\s*(?:#{1,6}\s+|```|\{\s*"|"(?:schemaVersion|checksum|deliveryId|taskId)"\s*:)/i;

export type ReleaseContentField = "title" | "theme" | "narrative" | "timeWindow" | "fact";

export function releaseMetadataReason(value: unknown, field: ReleaseContentField = "fact") {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "empty";
  if (INTERNAL_LABEL.test(text)) return "internal_label";
  if (ISO_MACHINE_TIMESTAMP.test(text)) return "machine_timestamp";
  if (SHA256_VALUE.test(text)) return "checksum";
  if (INTERNAL_ID.test(text)) return "internal_id";
  if (FILE_PATH.test(text)) return "file_path";
  if (field !== "narrative" && MARKUP_OR_JSON_FIELD.test(text)) return "markup_or_json";
  return null;
}

export function validatePlayerVisibleReleaseFields(input: {
  title?: string;
  theme?: string;
  narrative?: string;
  timeWindow?: string;
  facts?: Array<{ label?: string; value?: string; source?: string }>;
}) {
  const errors: Array<{ field: string; reason: string }> = [];
  for (const field of ["title", "theme", "narrative", "timeWindow"] as const) {
    const reason = releaseMetadataReason(input[field], field);
    if (reason && reason !== "empty") errors.push({ field, reason });
  }
  for (const [index, fact] of (input.facts || []).entries()) {
    for (const key of ["label", "value", "source"] as const) {
      const reason = releaseMetadataReason(fact?.[key], "fact");
      if (reason && reason !== "empty") errors.push({ field: `facts[${index}].${key}`, reason });
    }
  }
  return { valid: errors.length === 0, errors };
}
