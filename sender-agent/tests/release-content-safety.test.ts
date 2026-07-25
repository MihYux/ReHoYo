import { describe, expect, it } from "vitest";
import { releaseMetadataReason, validatePlayerVisibleReleaseFields } from "@/lib/release-content-safety";

describe("release content metadata guard", () => {
  it.each([
    ["生成时间：2026-07-25T05:50:02.907Z", "internal_label"],
    ["2026-07-25T05:50:02.907Z", "machine_timestamp"],
    ["a".repeat(64), "checksum"],
    ["task_123456789", "internal_id"],
    ["C:\\internal\\release.json", "file_path"],
  ])("blocks %s", (value, reason) => expect(releaseMetadataReason(value)).toBe(reason));

  it("allows normal player-facing dates", () => {
    expect(releaseMetadataReason("新版本将于 2026 年 7 月 30 日上线")).toBeNull();
  });

  it("reports exact contaminated delivery fields", () => {
    const result = validatePlayerVisibleReleaseFields({ theme: "生成时间：2026-07-25T05:50:02.907Z", facts: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("theme");
  });
});
