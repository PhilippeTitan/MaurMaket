// Shared in-process activity markers used by the messaging and offer routes.
// These are intentionally ephemeral: presence and open-chat state expire without client polling.
const presenceMap = new Map();
const activeConversationMap = new Map();

export function touchPresence(userId) {
  if (userId) presenceMap.set(userId, Date.now());
}

export function markConversationActive(userId, conversationId) {
  if (userId && conversationId) activeConversationMap.set(userId, { conversationId, seenAt: Date.now() });
}

export function isConversationOpen(userId, conversationId) {
  const active = activeConversationMap.get(userId);
  return !!active && active.conversationId === conversationId && Date.now() - active.seenAt < 30000;
}

export function isOnline(userId) {
  const ts = presenceMap.get(userId);
  return !!ts && Date.now() - ts < 15000;
}

export function lastSeen(userId) {
  return presenceMap.get(userId) || null;
}
