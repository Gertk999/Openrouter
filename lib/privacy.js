// Item 10: data-privacy grading per model/provider.
// Static table from OpenRouter's documented provider data-retention policy
// (https://openrouter.ai/docs/guides/privacy/provider-logging). Refresh
// periodically -- OpenRouter doesn't expose this as a per-model API field
// as of writing, so this has to be hand-maintained.
//
// Grade A = zero retention + does not train on prompts
// Grade B = retained for a known bounded period + does not train
// Grade C = unknown retention period, or provider may train on prompts
export const PROVIDER_PRIVACY_GRADES = {
  openai: 'A',
  anthropic: 'A',
  google: 'B',
  'x-ai': 'B',
  'meta-llama': 'B',
  mistralai: 'B',
  deepseek: 'C',
  liquid: 'C',
  nvidia: 'C',
  'thinking-machines': 'C',
};

export function providerFromModelId(modelId) {
  return (modelId || '').split('/')[0] || '';
}

export function privacyGradeForModel(modelId) {
  return PROVIDER_PRIVACY_GRADES[providerFromModelId(modelId)] || 'C';
}

export const ZDR_PROVIDERS = Object.keys(PROVIDER_PRIVACY_GRADES).filter(
  (p) => PROVIDER_PRIVACY_GRADES[p] === 'A'
);

// Live enforcement option: rather than trusting the static grade table,
// set `provider: { zdr: true }` on the request body -- OpenRouter then
// only routes to endpoints it guarantees are zero-data-retention, and
// rejects/omits everything else itself.
export function applyZdrPreference(requestBody, zdrEnabled) {
  if (!zdrEnabled) return requestBody;
  return { ...requestBody, provider: { ...(requestBody.provider || {}), zdr: true } };
}

export function filterModelsByZdr(models, zdrEnabled) {
  if (!zdrEnabled) return models;
  return (models || []).filter((m) => privacyGradeForModel(m.id) === 'A');
}
