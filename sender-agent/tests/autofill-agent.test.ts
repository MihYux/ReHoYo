import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROJECT } from "@/lib/contracts";
import { generateProjectAutofill } from "@/lib/autofill-agent";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZHIPU_API_KEY;
});

describe("project autofill agent integration", () => {
  it("runs form, document, and GLM Web Search tools before returning cited fields", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    let chatCall = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/web_search")) {
        expect(JSON.parse(String(init?.body)).search_intent).toBe(false);
        return jsonResponse({ search_result: [{ title: "《星穹远征》官方公告", content: "游戏名称为星穹远征。", link: "https://game.example.com/official", media: "游戏官网", publish_date: "2026-07-01" }] });
      }
      chatCall += 1;
      if (chatCall === 1) return jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [
        { id: "form", type: "function", function: { name: "read_current_form", arguments: "{}" } },
        { id: "docs", type: "function", function: { name: "list_uploaded_documents", arguments: "{}" } },
      ] } }] });
      if (chatCall === 2) return jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [
        { id: "internal", type: "function", function: { name: "search_internal_documents", arguments: JSON.stringify({ query: "版本目标", limit: 2 }) } },
      ] } }] });
      if (chatCall === 3) return jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [
        { id: "web", type: "function", function: { name: "web_search_public_facts", arguments: JSON.stringify({ query: "星穹远征 官方 游戏名称", recency: "oneYear" }) } },
      ] } }] });
      return jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ suggestions: [
        { field: "gameName", value: "星穹远征", confidence: "high", evidenceIds: ["WEB-001"] },
        { field: "objective", value: "通过新主线提升回流玩家首周参与", confidence: "high", evidenceIds: ["DOC-source-1-1"] },
      ], warnings: [] }) } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateProjectAutofill(EMPTY_PROJECT, [{ id: "source-1", name: "版本目标.md", status: "parsed", extractedText: "版本目标：通过新主线提升回流玩家首周参与。" }]);

    expect(result.suggestions.map((item) => item.field)).toEqual(["gameName", "objective"]);
    expect(result.evidence.map((item) => item.id)).toEqual(["DOC-source-1-1", "WEB-001"]);
    expect(result.toolTrace.map((item) => item.tool)).toEqual(["read_current_form", "list_uploaded_documents", "search_internal_documents", "web_search_public_facts"]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const firstChatBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const webTool = firstChatBody.tools.find((item: { function: { name: string } }) => item.function.name === "web_search_public_facts");
    expect(webTool.function.parameters.properties.query.maxLength).toBe(70);
  });

  it("rejects a result that skips required GLM Web Search for blank public fields", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    let chatCall = 0;
    const fetchMock = vi.fn(async () => {
      chatCall += 1;
      if (chatCall === 1) return jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [
        { id: "form", type: "function", function: { name: "read_current_form", arguments: "{}" } },
        { id: "docs", type: "function", function: { name: "list_uploaded_documents", arguments: "{}" } },
      ] } }] });
      return jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ suggestions: [], warnings: ["无公开信息"] }) } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateProjectAutofill(EMPTY_PROJECT, [
      { id: "source-1", name: "版本资料.md", status: "parsed", extractedText: "游戏名称：星穹远征。" },
    ])).rejects.toThrow("GLM Web Search");
  });
});
