import { describe, expect, it } from "vitest";
import {
  createImportedCharacterReleaseTask,
  parseCharacterReleaseMarkdown,
  repairSnapshotMetadata,
  resolveGlobalReleaseBatch,
} from "@/lib/character-release";
import type { CharacterReleaseRegion, CharacterReleaseSnapshot } from "@/lib/character-release-types";

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

function region(id: string, code: string, name: string): CharacterReleaseRegion {
  return {
    id, sourceRegionId: id, code, name, language: "zh-CN", timeZone: "Asia/Shanghai",
    quietHours: { start: "22:00", end: "08:00" }, releaseAgents: [], segments: [],
  };
}

describe("global realtime release coverage", () => {
  it("selects the newest ready task from the same research run in every region", () => {
    const cnOld = createImportedCharacterReleaseTask("cn", "cn-old.md", markdown, { researchRunId: "run-global" });
    const cnNew = createImportedCharacterReleaseTask("cn", "cn-new.md", markdown, { researchRunId: "run-global" });
    const jp = createImportedCharacterReleaseTask("jp", "jp.md", markdown.replace("中国大陆区域", "日本区域"), { researchRunId: "run-global" });
    cnOld.id = "cn-old"; cnOld.updatedAt = "2026-07-24T00:00:00.000Z";
    cnNew.id = "cn-new"; cnNew.updatedAt = "2026-07-25T00:00:00.000Z";
    jp.id = "jp-task";
    const snapshot: CharacterReleaseSnapshot = {
      schemaVersion: 1, activeRegionId: "cn", regions: [region("cn", "CN", "中国大陆"), region("jp", "JP", "日本")],
      workspaces: {
        cn: { regionId: "cn", tasks: [cnOld, cnNew], releases: [], emergencyStoppedAt: null },
        jp: { regionId: "jp", tasks: [jp], releases: [], emergencyStoppedAt: null },
      },
      auditLog: [], updatedAt: "2026-07-25T00:00:00.000Z",
    };
    const coverage = resolveGlobalReleaseBatch(snapshot, "cn", "cn-new");
    expect(coverage.missing).toEqual([]);
    expect(coverage.entries.map((item) => item.task.id)).toEqual(["cn-new", "jp-task"]);
  });

  it("blocks missing, mismatched, and paused regions", () => {
    const cn = createImportedCharacterReleaseTask("cn", "cn.md", markdown, { researchRunId: "run-global" });
    const jp = createImportedCharacterReleaseTask("jp", "jp.md", markdown, { researchRunId: "another-run" });
    const snapshot: CharacterReleaseSnapshot = {
      schemaVersion: 1, activeRegionId: "cn", regions: [region("cn", "CN", "中国大陆"), region("jp", "JP", "日本")],
      workspaces: {
        cn: { regionId: "cn", tasks: [cn], releases: [], emergencyStoppedAt: null },
        jp: { regionId: "jp", tasks: [jp], releases: [], emergencyStoppedAt: "2026-07-25T00:00:00.000Z" },
      },
      auditLog: [], updatedAt: "2026-07-25T00:00:00.000Z",
    };
    expect(resolveGlobalReleaseBatch(snapshot, "cn", cn.id).missing).toEqual([
      { regionId: "jp", regionName: "日本", reason: "区域已暂停" },
    ]);
    snapshot.workspaces.jp.emergencyStoppedAt = null;
    expect(resolveGlobalReleaseBatch(snapshot, "cn", cn.id).missing[0].reason).toBe("缺少同批次已审核策略");
  });
});
