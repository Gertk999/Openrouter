import {
  privacyGradeForModel,
  applyZdrPreference,
  filterModelsByZdr,
  ZDR_PROVIDERS,
} from '../lib/privacy';

test('privacyGradeForModel grades known providers correctly', () => {
  expect(privacyGradeForModel('anthropic/claude-sonnet-5')).toBe('A');
  expect(privacyGradeForModel('google/gemini-2.5-pro')).toBe('B');
  expect(privacyGradeForModel('deepseek/deepseek-chat')).toBe('C');
});

test('privacyGradeForModel defaults unknown providers to C', () => {
  expect(privacyGradeForModel('some-new-lab/model-x')).toBe('C');
});

test('applyZdrPreference adds provider.zdr only when enabled', () => {
  const body = { model: 'x', messages: [] };
  expect(applyZdrPreference(body, false)).toEqual(body);
  expect(applyZdrPreference(body, true)).toEqual({ ...body, provider: { zdr: true } });
});

test('filterModelsByZdr keeps only grade-A models when enabled', () => {
  const models = [{ id: 'anthropic/claude-sonnet-5' }, { id: 'deepseek/deepseek-chat' }];
  expect(filterModelsByZdr(models, true)).toEqual([{ id: 'anthropic/claude-sonnet-5' }]);
  expect(filterModelsByZdr(models, false)).toEqual(models);
});

test('ZDR_PROVIDERS only contains grade-A providers', () => {
  expect(ZDR_PROVIDERS).toContain('openai');
  expect(ZDR_PROVIDERS).toContain('anthropic');
  expect(ZDR_PROVIDERS).not.toContain('deepseek');
});
