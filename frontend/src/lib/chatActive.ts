const STORAGE_KEY = "learnpath-active-chat-conversation";

export function persistActiveChatConversation(conversationId: string | null): void {
  if (typeof window === "undefined") return;
  if (!conversationId) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, conversationId);
}

export function loadActiveChatConversation(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw && raw.trim() ? raw.trim() : null;
}
