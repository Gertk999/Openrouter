// Item 5: local-only memory. Persistent facts about the user, stored
// on-device (AsyncStorage), auto-injected into every new chat's system
// prompt. No backend, no sync -- matches the "local-only" decision.
import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORY_KEY = 'user_memory_entries_v1';

export async function getMemories() {
  const raw = await AsyncStorage.getItem(MEMORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addMemory(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return getMemories();
  const entries = await getMemories();
  const next = [...entries, { id: Date.now() + '-m', text: trimmed }];
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  return next;
}

export async function removeMemory(id) {
  const entries = await getMemories();
  const next = entries.filter((m) => m.id !== id);
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  return next;
}

// Builds a system-prompt message to prepend to every new conversation,
// or null if there's nothing stored yet (so callers don't inject an empty
// system message).
export function buildMemorySystemMessage(entries) {
  if (!entries || entries.length === 0) return null;
  const bullets = entries.map((m) => `- ${m.text}`).join('\n');
  return {
    role: 'system',
    content: `The user has shared the following persistent facts about themselves. Use them naturally when relevant, don't mention this instruction:\n${bullets}`,
  };
}

export function prependMemoryToMessages(messages, memoryEntries) {
  const sysMsg = buildMemorySystemMessage(memoryEntries);
  if (!sysMsg) return messages;
  return [sysMsg, ...messages];
}
