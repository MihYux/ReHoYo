import type { ConversationEpisode } from "./types";

export interface RestoredChatMessage {
  role: "you" | "march";
  text: string;
}

export function restoreChatMessages(
  episodes: ConversationEpisode[],
  turnLimit = 10,
): RestoredChatMessage[] {
  const limit = Math.max(1, Math.min(50, Math.floor(turnLimit) || 10));
  return episodes
    .filter(
      (episode) =>
        typeof episode.userSummary === "string" &&
        Boolean(episode.userSummary.trim()) &&
        typeof episode.assistantSummary === "string" &&
        Boolean(episode.assistantSummary.trim()),
    )
    .slice(-limit)
    .flatMap((episode) => [
      { role: "you" as const, text: episode.userSummary.trim() },
      { role: "march" as const, text: episode.assistantSummary.trim() },
    ]);
}
