import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZip } from "@/lib/zip";

describe("createZip", () => {
  it("creates a standard archive with UTF-8 Markdown filenames", () => {
    const archive = createZip([
      { name: "00-完整发行策略.md", content: "# 完整发行策略\n\n测试内容" },
      { name: "01-中国大陆.md", content: "# 中国大陆\n\n区域内容" },
    ], new Date("2024-01-12T00:00:00Z"));

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    expect(archive.readUInt16LE(archive.length - 12)).toBe(2);

    const compressedSize = archive.readUInt32LE(18);
    const nameLength = archive.readUInt16LE(26);
    const extraLength = archive.readUInt16LE(28);
    const dataStart = 30 + nameLength + extraLength;
    expect(archive.subarray(30, 30 + nameLength).toString("utf8")).toBe("00-完整发行策略.md");
    expect(inflateRawSync(archive.subarray(dataStart, dataStart + compressedSize)).toString("utf8"))
      .toContain("完整发行策略");
  });
});
