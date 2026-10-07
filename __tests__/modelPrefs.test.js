import {
  FLAGSHIP_MODEL_IDS,
  buildShortlist,
  groupModelsByProvider,
  filterModelsBySearch,
  rankModelsByPreference,
} from '../lib/modelPrefs';

const models = [
  { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { prompt: '0.000003' } },
  { id: 'openai/gpt-5', name: 'GPT-5', pricing: { prompt: '0.00001' } },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', pricing: { prompt: '0.0000002' } },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', pricing: { prompt: '0.000002' } },
];

test('buildShortlist puts used models first, ranked by count', () => {
  const usage = { 'openai/gpt-5': 5, 'deepseek/deepseek-chat': 2 };
  const list = buildShortlist(models, usage, FLAGSHIP_MODEL_IDS);
  expect(list[0].id).toBe('openai/gpt-5');
  expect(list[1].id).toBe('deepseek/deepseek-chat');
});

test('buildShortlist fills remaining slots with unused flagship defaults', () => {
  const list = buildShortlist(models, {}, ['openai/gpt-5', 'anthropic/claude-sonnet-5']);
  expect(list.map((m) => m.id)).toEqual(['openai/gpt-5', 'anthropic/claude-sonnet-5']);
});

test('groupModelsByProvider groups and sorts by provider name', () => {
  const grouped = groupModelsByProvider(models);
  expect(grouped.map((g) => g.provider)).toEqual(['anthropic', 'deepseek', 'google', 'openai']);
});

test('filterModelsBySearch matches name or id, case-insensitive', () => {
  expect(filterModelsBySearch(models, 'gemini')).toHaveLength(1);
  expect(filterModelsBySearch(models, 'OPENAI')).toHaveLength(1);
  expect(filterModelsBySearch(models, '')).toHaveLength(models.length);
});

test('rankModelsByPreference sorts ascending by price when costPriority=cheap', () => {
  const ranked = rankModelsByPreference(models, { costPriority: 'cheap' });
  expect(ranked[0].id).toBe('deepseek/deepseek-chat');
  expect(ranked[ranked.length - 1].id).toBe('openai/gpt-5');
});

test('rankModelsByPreference leaves order unchanged with no preference', () => {
  const ranked = rankModelsByPreference(models, {});
  expect(ranked).toEqual(models);
});
