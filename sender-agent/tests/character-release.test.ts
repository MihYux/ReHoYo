import { describe, expect, it } from "vitest";
import {
  createImportedCharacterReleaseTask,
  parseCharacterReleaseMarkdown,
  repairSnapshotMetadata,
} from "@/lib/character-release";
import type { CharacterReleaseSnapshot } from "@/lib/character-release-types";

const markdown = `# 崩坏：星穹铁道 · 2.0 · 角色共生发行方案

生成时间：2026-07-25T05:50:02.907Z

## 中国大陆区域

### 共生发行目标

由三月七以同行者视角介绍黑天鹅，激发玩家对匹诺康尼的兴趣。

### 可传递的版本信息
- 匹诺康尼是全新世界大版本，含梦境都市与新主线悬念。

### 沟通切入点与互动场景
- 我们初抵梦境都市，向玩家介绍黑天鹅带来的记忆线索。

### 推荐触达时机与频率
- T-8 至 T-5，每周一次。

### 语气、表达和文化注意事项
- 亲切好奇的第一人称同行者语气。`;

describe("character release imports", () => {
  it("parses heading sections and excludes document metadata", () => {
    const parsed = parseCharacterReleaseMarkdown(markdown, "中国大陆-角色共生发行方案.md");
    expect(parsed.theme).toContain("三月七以同行者视角介绍黑天鹅");
    expect(parsed.narrative).toContain("初抵梦境都市");
    expect(parsed.narrative).toContain("亲切好奇");
    expect(parsed.timeWindow).toContain("T-8 至 T-5");
    expect(parsed.facts).toEqual(["匹诺康尼是全新世界大版本，含梦境都市与新主线悬念。"]) ;
    expect(JSON.stringify(parsed)).not.toContain("2026-07-25T05:50:02.907Z");
  });

  it("keeps the exact regional markdown as immutable source metadata", () => {
    const task = createImportedCharacterReleaseTask("region-cn", "中国大陆-角色共生发行方案.md", markdown, {
      researchRunId: "run-1",
      planGeneratedAt: "2026-07-25T00:00:00.000Z",
    });
    expect(task.sourceDocument?.content).toBe(markdown);
    expect(task.sourceDocument?.researchRunId).toBe("run-1");
    expect(task.theme).not.toContain("生成时间");
    expect(task.facts).toHaveLength(1);
    expect(task.status).toBe("ready");
  });

  it("repairs contaminated tasks in place without changing release or source identity", () => {
    const task = createImportedCharacterReleaseTask("region-cn", "中国大陆-角色共生发行方案.md", markdown);
    task.id = "task-existing";
    task.theme = "生成时间：2026-07-25T05:50:02.907Z";
    task.facts = [{ id: "fact-old", label: "内容校验值", value: "a".repeat(64), source: "中国大陆-角色共生发行方案.md" }];
    const snapshot: CharacterReleaseSnapshot = {
      schemaVersion: 1,
      activeRegionId: "region-cn",
      regions: [],
      workspaces: { "region-cn": { regionId: "region-cn", tasks: [task], releases: [{ id: "release-old", deliveryId: "delivery-old", regionId: "region-cn", taskId: task.id, rolloutPercent: 100, exampleMode: false, checksum: "source-checksum", status: "published", publishedAt: "2026-07-25" }], emergencyStoppedAt: null } },
      auditLog: [],
      updatedAt: "2026-07-25",
    };
    const originalSource = structuredClone(task.sourceDocument);
    repairSnapshotMetadata(snapshot);
    expect(task.id).toBe("task-existing");
    expect(task.theme).toContain("三月七以同行者视角介绍黑天鹅");
    expect(task.facts[0].value).toContain("匹诺康尼");
    expect(task.sourceDocument).toEqual(originalSource);
    expect(snapshot.workspaces["region-cn"].releases[0].id).toBe("release-old");
    expect(snapshot.auditLog[0].action).toBe("task.metadata_repaired");
    repairSnapshotMetadata(snapshot);
    expect(snapshot.auditLog.filter((item) => item.action === "task.metadata_repaired")).toHaveLength(1);
  });
});
