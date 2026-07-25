import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".md", ".txt"] as const;
export const MAX_PROJECT_BYTES = 100 * 1024 * 1024;
export const MAX_FILES = 20;

export function normalizeExtension(name: string) {
  return path.extname(name).toLowerCase();
}

export function validateUpload(name: string, size: number) {
  const extension = normalizeExtension(name);
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new Error("不支持此文件格式");
  }
  const limit = [".xlsx", ".xls", ".csv"].includes(extension) ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (size <= 0 || size > limit) {
    throw new Error(`文件大小需小于 ${Math.round(limit / 1024 / 1024)}MB`);
  }
  return extension;
}

export function safeFileName(name: string) {
  const base = path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return base.slice(0, 140) || "source-file";
}

export function chunkText(text: string, size = 20_000, overlap = 1_000) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += size - overlap) {
    chunks.push(normalized.slice(start, start + size));
    if (start + size >= normalized.length) break;
  }
  return chunks;
}

async function workbookToText(filePath: string) {
  const sheets = await readXlsxFile(filePath);
  return sheets.map(({ sheet, data }) => {
    const rows = data.slice(0, 5000).map((row, index) => `R${index + 1}\t${row.map((cell) => cell == null ? "" : String(cell)).join("\t")}`);
    return `## 工作表：${sheet}\n${rows.join("\n")}`;
  }).join("\n\n");
}

export async function parseLocalFile(filePath: string, extension: string) {
  const buffer = await fs.readFile(filePath);
  if ([".txt", ".md"].includes(extension)) {
    return { text: buffer.toString("utf8"), needsCloud: false };
  }
  if (extension === ".xlsx") {
    return { text: await workbookToText(filePath), needsCloud: false };
  }
  if (extension === ".csv") {
    return { text: buffer.toString("utf8"), needsCloud: false };
  }
  if (extension === ".xls") {
    return { text: "", needsCloud: true };
  }
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, needsCloud: result.value.trim().length < 200 };
  }
  if (extension === ".pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const minimum = Math.max(200, result.numpages * 50);
    return { text: result.text, needsCloud: result.text.trim().length < minimum };
  }
  return { text: "", needsCloud: true };
}

export function humanFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
