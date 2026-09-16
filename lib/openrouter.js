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
