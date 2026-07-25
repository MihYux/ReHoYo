import { describe, expect, it } from "vitest";
import { createImportedCharacterReleaseTask } from "@/lib/character-release";

const markdown = `# 角色共生发行方案

## 日本区域

### 1. 共生发行目标

通过三月七与日本玩家之间已有的长期陪伴关系，自然传递新版本信息。
`;

describe("character release imports", () => {
  it("keeps the exact regional markdown as the immutable source", () => {
    const task = createImportedCharacterReleaseTask("region-jp", "01-日本-角色共生发行方案.md", markdown, {
      researchRunId: "run-1",
      planGeneratedAt: "2026-07-25T00:00:00.000Z",
    });
    expect(task.sourceDocument?.content).toBe(markdown);
    expect(task.sourceDocument?.researchRunId).toBe("run-1");
    expect(task.status).toBe("ready");
  });

  it("creates a new task version without changing the source checksum", () => {
    const first = createImportedCharacterReleaseTask("region-jp", "01-日本-角色共生发行方案.md", markdown);
    const second = createImportedCharacterReleaseTask("region-jp", "01-日本-角色共生发行方案.md", markdown);
    expect(first.id).not.toBe(second.id);
    expect(first.sourceDocument?.checksum).toBe(second.sourceDocument?.checksum);
  });
});
