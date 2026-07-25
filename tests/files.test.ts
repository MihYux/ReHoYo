import { describe, expect, it } from "vitest";
import { chunkText, normalizeExtension, validateUpload } from "@/lib/files";

describe("file validation", () => {
  it("normalizes and accepts supported office formats", () => {
    expect(normalizeExtension("版本经营表.XLSX")).toBe(".xlsx");
    expect(validateUpload("版本经营表.xlsx", 1024)).toBe(".xlsx");
    expect(validateUpload("发行说明.docx", 2048)).toBe(".docx");
  });

  it("rejects unknown formats and oversized spreadsheets", () => {
    expect(() => validateUpload("archive.zip", 100)).toThrow("不支持");
    expect(() => validateUpload("budget.xlsx", 11 * 1024 * 1024)).toThrow("10MB");
  });

  it("chunks long text with overlap without losing the tail", () => {
    const text = "A".repeat(45_000) + "END";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(3);
    expect(chunks.at(-1)).toContain("END");
    expect(chunks[0].slice(-1000)).toBe(chunks[1].slice(0, 1000));
  });
});
