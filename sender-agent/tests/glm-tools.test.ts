import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJsonWithTools, type GlmFunctionTool } from "@/lib/glm";

const tool: GlmFunctionTool = {
  type: "function",
  function: { name: "read_test", description: "test", parameters: { type: "object", properties: {} } },
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZHIPU_API_KEY;
});

describe("GLM tool loop", () => {
  it("executes an allowed tool and returns validated JSON", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "read_test", arguments: "{}" } }] } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ answer: "done" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const execute = vi.fn(async () => ({ value: "tool-result" }));

    const result = await chatJsonWithTools(z.object({ answer: z.string() }), "system", "user", [tool], execute);

    expect(result).toEqual({ answer: "done" });
    expect(execute).toHaveBeenCalledWith("read_test", {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enables GLM thinking and preserves reasoning content between tool rounds", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: "", reasoning_content: "private-reasoning", tool_calls: [{ id: "call-thinking", type: "function", function: { name: "read_test", arguments: "{}" } }] } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ answer: "edited" }), reasoning_content: "private-follow-up" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatJsonWithTools(z.object({ answer: z.string() }), "system", "user", [tool], async () => ({ section: "current" }), { thinking: true, reasoningEffort: "high" })).resolves.toEqual({ answer: "edited" });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstBody.thinking).toEqual({ type: "enabled" });
    expect(firstBody.reasoning_effort).toBe("high");
    expect(secondBody.messages.find((message: { role: string }) => message.role === "assistant").reasoning_content).toBe("private-reasoning");
  });

  it("repairs invalid final JSON once without another tool call", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ answer: 42 }) } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ answer: "repaired" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatJsonWithTools(z.object({ answer: z.string() }), "system", "user", [tool], async () => null)).resolves.toEqual({ answer: "repaired" });
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(repairBody.tools).toBeUndefined();
  });

  it("forces a tool-free final JSON after the last allowed tool round", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const toolMessage = (id: string) => jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id, type: "function", function: { name: "read_test", arguments: "{}" } }] } }] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolMessage("call-1"))
      .mockResolvedValueOnce(toolMessage("call-2"))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: "assistant", content: JSON.stringify({ answer: "forced-final" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const execute = vi.fn(async () => ({ value: "enough-context" }));

    await expect(chatJsonWithTools(z.object({ answer: z.string() }), "system", "user", [tool], execute, { maxRounds: 2 })).resolves.toEqual({ answer: "forced-final" });

    expect(execute).toHaveBeenCalledTimes(2);
    const forcedBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(forcedBody.tools).toBeUndefined();
    expect(forcedBody.messages.at(-1).content).toContain("工具阶段已经结束");
  });

  it("rejects malformed tool arguments and tool-call overflow", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "read_test", arguments: "{" } }] } }] })));
    await expect(chatJsonWithTools(z.object({ answer: z.string() }), "system", "user", [tool], async () => null)).rejects.toThrow("参数不是有效 JSON");

    const calls = [1, 2].map((value) => ({ id: `call-${value}`, type: "function" as const, function: { name: "read_test", arguments: "{}" } }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { role: "assistant", content: "", tool_calls: calls } }] })));
    await expect(chatJsonWithTools(z.object({ answer: z.string() }), "system", "user", [tool], async () => null, { maxToolCalls: 1 })).rejects.toThrow("调用次数超过限制");
  });
});
