// Direct calls to OpenRouter from the device. No backend proxy.
const API_BASE = 'https://openrouter.ai/api/v1';

export async function fetchModels(apiKey) {
  const resp = await fetch(`${API_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`Failed to load models (${resp.status})`);
  const data = await resp.json();
  return (data.data || []).sort((a, b) => a.name.localeCompare(b.name));
}

export async function sendChat(apiKey, model, messages) {
  const resp = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'OpenRouter Chat',
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Chat request failed (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '(empty response)';
}

// Fires the same message history at up to N models in parallel and returns
// one settled result per model, in the same order as `models`. Never throws --
// per-model failures are captured in the result's `error` field so one bad
// model doesn't break the others in a compare run.
export async function sendChatMulti(apiKey, models, messages) {
  const results = await Promise.allSettled(
    models.map((model) => sendChat(apiKey, model, messages))
  );
  return results.map((r, i) => ({
    model: models[i],
    content: r.status === 'fulfilled' ? r.value : null,
    error: r.status === 'rejected' ? r.reason.message : null,
  }));
}
