import { describe, expect, it } from "vitest";
import type { ConversationEpisode } from "./types";
import { restoreChatMessages } from "./chat-history";

function episode(index: number): ConversationEpisode {
  return {
    id: `episode-${index}`,
    conversationId: "desktop-chat",
    turnId: `turn-${index}`,
    createdAt: `2026-07-2${index}T00:00:00.000Z`,
    expiresAt: "2026-10-25T00:00:00.000Z",
    userSummary: `用户消息 ${index}`,
    assistantSummary: `三月七回复 ${index}`,
    topics: [],
    replySource: "model",
  };
}

describe("persistent chat history", () => {
  it("restores complete turns in chronological order", () => {
    expect(restoreChatMessages([episode(1), episode(2)], 10)).toEqual([
      { role: "you", text: "用户消息 1" },
      { role: "march", text: "三月七回复 1" },
      { role: "you", text: "用户消息 2" },
      { role: "march", text: "三月七回复 2" },
    ]);
  });

  it("keeps only the requested number of complete turns", () => {
    expect(restoreChatMessages([episode(1), episode(2)], 1)).toEqual([
      { role: "you", text: "用户消息 2" },
      { role: "march", text: "三月七回复 2" },
    ]);
  });
});
