export type ChatScrollMessage = {
  id: number;
  role: "assistant" | "user";
};

export type ChatScrollTarget =
  { kind: "message"; messageId: number; block: "start" } | { kind: "bottom"; block: "end" };

export function getChatScrollTarget(
  messages: readonly ChatScrollMessage[],
  isLoading: boolean
): ChatScrollTarget {
  const latestMessage = messages.at(-1);

  if (latestMessage?.role === "assistant" && messages.length > 1 && !isLoading) {
    const latestUserMessage = messages.findLast((message) => message.role === "user");

    if (latestUserMessage) {
      return { kind: "message", messageId: latestUserMessage.id, block: "start" };
    }
  }

  return { kind: "bottom", block: "end" };
}
