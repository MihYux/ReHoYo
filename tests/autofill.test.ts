import { describe, expect, it } from "vitest";
import { EMPTY_PROJECT, ProjectAutofillResponseSchema, type ProjectAutofillResponse } from "@/lib/contracts";
import { mergeAutofillSuggestions } from "@/lib/autofill";
import { rankInternalDocumentChunks } from "@/lib/autofill-agent";

const evidence: ProjectAutofillResponse["evidence"] = [
  { id: "DOC-1", kind: "document", title: "版本规划.docx", snippet: "版本目标", sourceId: "source-1", locator: "片段 1", url: "", publisher: "", publishedAt: "" },
  { id: "WEB-001", kind: "web", title: "官方公告", snippet: "公开信息", sourceId: "", locator: "", url: "https://example.com/news", publisher: "官网", publishedAt: "2026-07-01" },
];

function response(suggestions: ProjectAutofillResponse["suggestions"]): ProjectAutofillResponse {
  return { suggestions, evidence, toolTrace: [], warnings: [] };
}

describe("AI project autofill", () => {
  it("fills only blank fields and preserves campaign settings and manual content", () => {
    const current = { ...EMPTY_PROJECT, gameName: "人工游戏名", campaignStartWeek: -6, campaignEndWeek: 8 };
    const result = mergeAutofillSuggestions(current, response([
      { field: "gameName", value: "网络游戏名", confidence: "high", evidenceIds: ["WEB-001"] },
      { field: "versionName", value: "3.0 新版本", confidence: "high", evidenceIds: ["WEB-001"] },
      { field: "objective", value: "提升回流玩家首周参与", confidence: "medium", evidenceIds: ["DOC-1"] },
    ]));

    expect(result.project.gameName).toBe("人工游戏名");
    expect(result.project.versionName).toBe("3.0 新版本");
    expect(result.project.objective).toBe("提升回流玩家首周参与");
    expect(result.project.campaignStartWeek).toBe(-6);
    expect(result.project.campaignEndWeek).toBe(8);
    expect(result.appliedFields).toEqual(["versionName", "objective"]);
    expect(result.preservedFields).toContain("gameName");
  });

  it("rejects low-confidence, unknown-evidence, and web-only internal suggestions", () => {
    const result = mergeAutofillSuggestions(EMPTY_PROJECT, response([
      { field: "launchDate", value: "2026-09-10", confidence: "low", evidenceIds: ["WEB-001"] },
      { field: "objective", value: "网络推测的经营目标", confidence: "high", evidenceIds: ["WEB-001"] },
      { field: "versionName", value: "无来源版本", confidence: "high", evidenceIds: ["MISSING"] },
      { field: "contentAssets", value: ["官方 PV"], confidence: "medium", evidenceIds: ["WEB-001"] },
    ]));

    expect(result.project.launchDate).toBe("");
    expect(result.project.objective).toBe("");
    expect(result.project.versionName).toBe("");
    expect(result.project.contentAssets).toEqual(["官方 PV"]);
    expect(result.response.warnings).toHaveLength(3);
  });

  it("validates date format and field value types", () => {
    expect(ProjectAutofillResponseSchema.safeParse(response([
      { field: "launchDate", value: "2026/09/10", confidence: "high", evidenceIds: ["WEB-001"] },
    ])).success).toBe(false);
    expect(ProjectAutofillResponseSchema.safeParse(response([
      { field: "platforms", value: "PC", confidence: "high", evidenceIds: ["WEB-001"] },
    ])).success).toBe(false);
  });

  it("ranks matching internal chunks and falls back without exposing paths", () => {
    const sources = [
      { id: "a", name: "经营目标.md", status: "parsed", extractedText: "本版本经营目标是提升回流率。核心 KPI 为首周活跃。" },
      { id: "b", name: "角色资料.txt", status: "parsed", extractedText: "角色青岚采用克制而可靠的表达方式。" },
    ];
    const matched = rankInternalDocumentChunks(sources, "经营目标 KPI", undefined, 2);
    expect(matched[0]).toMatchObject({ sourceId: "a", locator: "片段 1" });
    expect(matched[0]).not.toHaveProperty("filePath");
    expect(rankInternalDocumentChunks(sources, "完全不存在的词", undefined, 2)).toHaveLength(2);
  });
});
