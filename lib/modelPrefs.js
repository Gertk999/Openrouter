// Items 9 + 13: model picker simplification + preference-based ranking.
// Everything here is on-device only (AsyncStorage) -- no backend involved.
import AsyncStorage from '@react-native-async-storage/async-storage';

const USAGE_KEY = 'model_usage_counts_v1';
const PREFS_KEY = 'model_prefs_v1';

// Curated flagship shortlist shown by default instead of the full ~100+
// model catalog. Kept small and deliberately opinionated: one strong model
// per major lab, covering the models most people actually want.
export const FLAGSHIP_MODEL_IDS = [
  'anthropic/claude-sonnet-5',
  'openai/gpt-5',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct',
  'x-ai/grok-4',
];

export async function recordModelUsage(modelId) {
  if (!modelId) return;
  const raw = await AsyncStorage.getItem(USAGE_KEY);
  const counts = raw ? JSON.parse(raw) : {};
  counts[modelId] = (counts[modelId] || 0) + 1;
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(counts));
}

export async function getModelUsageCounts() {
  const raw = await AsyncStorage.getItem(USAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

// Builds the default shortlist: models you've actually used, ranked by use
// count (most-used first), followed by any flagship defaults you haven't
// tried yet (so the list never feels empty on first run).
export function buildShortlist(models, usageCounts = {}, flagshipIds = FLAGSHIP_MODEL_IDS) {
  const byId = Object.fromEntries((models || []).map((m) => [m.id, m]));
  const used = Object.keys(usageCounts)
    .filter((id) => byId[id])
    .sort((a, b) => (usageCounts[b] || 0) - (usageCounts[a] || 0))
    .map((id) => byId[id]);
  const usedIds = new Set(used.map((m) => m.id));
  const defaults = flagshipIds.filter((id) => byId[id] && !usedIds.has(id)).map((id) => byId[id]);
  return [...used, ...defaults];
}

export function groupModelsByProvider(models) {
  const groups = {};
  for (const m of models || []) {
    const provider = (m.id || '').split('/')[0] || 'other';
    if (!groups[provider]) groups[provider] = [];
    groups[provider].push(m);
  }
  return Object.keys(groups)
    .sort()
    .map((provider) => ({ provider, models: groups[provider] }));
}

export function filterModelsBySearch(models, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return models;
  return (models || []).filter(
    (m) => (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q)
  );
}

// Item 9: preference-based ranking. Two independent axes, both optional.
//   costPriority: 'cheap' | 'flagship' | null
//   privacyPriority: 'strict' | null
// 'cheap' sorts ascending by prompt token price; 'flagship' just keeps the
// curated/usage order as-is (flagship IDs are already "best quality" picks).
// 'strict' privacy filters out models from providers not in the static ZDR
// allowlist (see lib/privacy.js) rather than just re-ranking.
export async function saveModelPrefs(prefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export async function getModelPrefs() {
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  return raw ? JSON.parse(raw) : { costPriority: null, privacyPriority: null };
}

export function rankModelsByPreference(models, prefs = {}) {
  if (!prefs || !prefs.costPriority) return models;
  const priced = (models || []).map((m) => ({
    m,
    price: parseFloat(m?.pricing?.prompt ?? 'NaN'),
  }));
  if (prefs.costPriority === 'cheap') {
    return priced
      .sort((a, b) => {
        const ap = Number.isNaN(a.price) ? Infinity : a.price;
        const bp = Number.isNaN(b.price) ? Infinity : b.price;
        return ap - bp;
      })
      .map((p) => p.m);
  }
  return models; // 'flagship' keeps existing (usage/curated) order
}
