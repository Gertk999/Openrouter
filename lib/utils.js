// Pure helper functions, kept dependency-free so they're easy to unit test.

// Fixed 3-color palette for the compare feature. Order maps to selection order.
export const COMPARE_COLORS = ['#2a5cff', '#28a745', '#ff9500'];
export const COMPARE_MODEL_CAP = 3;

export function colorForIndex(index) {
  return COMPARE_COLORS[index % COMPARE_COLORS.length];
}

export function sortModelsByName(models) {
  return [...(models || [])].sort((a, b) => {
    const an = a.name || a.id || '';
    const bn = b.name || b.id || '';
    return an.localeCompare(bn);
  });
}

// Builds an OpenRouter-compatible message `content` value.
// If there are no attachments, returns a plain string (cheapest/most compatible).
// If there are attachments, returns a content-parts array mixing text + image_url
// parts, per OpenRouter's multimodal message format.
export function buildMessageContent(text, attachments = []) {
  const trimmedText = (text || '').trim();
  const images = attachments.filter((a) => a.type === 'image');
  const files = attachments.filter((a) => a.type === 'file');

  if (images.length === 0 && files.length === 0) {
    return trimmedText;
  }

  const parts = [];
  let combinedText = trimmedText;
  // Plain-text file attachments get their content inlined into the prompt text,
  // since chat completion APIs don't accept arbitrary file blobs.
  for (const f of files) {
    combinedText += `\n\n[Attached file: ${f.name}]\n${f.content || ''}`;
  }
  if (combinedText) {
    parts.push({ type: 'text', text: combinedText });
  }
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: img.uri } });
  }
  return parts;
}

export function canAddModel(selected, cap = COMPARE_MODEL_CAP) {
  return selected.length < cap;
}

export function toggleModelSelection(selected, modelId, cap = COMPARE_MODEL_CAP) {
  if (selected.includes(modelId)) {
    return selected.filter((id) => id !== modelId);
  }
  if (selected.length >= cap) {
    return selected;
  }
  return [...selected, modelId];
}
