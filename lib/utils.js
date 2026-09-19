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

// True if the given OpenRouter model object declares image support in its
// architecture.input_modalities (per the /models API response).
// Models with no architecture info are treated as vision-capable by default
// (fail-open) so an unexpected shape in the API response doesn't silently
// hide every model from the picker.
export function modelSupportsVision(model) {
  const modalities = model && model.architecture && model.architecture.input_modalities;
  if (!Array.isArray(modalities)) return true;
  return modalities.includes('image');
}

export function hasImageAttachment(attachments = []) {
  return attachments.some((a) => a.type === 'image');
}

// Narrows a model list down to vision-capable models when an image is
// attached to the pending message; returns the list unchanged otherwise.
export function filterModelsForAttachments(models, attachments = []) {
  if (!hasImageAttachment(attachments)) return models;
  return models.filter(modelSupportsVision);
}

// For models that don't support image input, replace an image-bearing
// message's content with a plain-text placeholder instead of sending the
// raw image and letting the API call 404. Leaves text-only messages and
// vision-capable models untouched.
export function stripUnsupportedImages(messages, supportsVision) {
  if (supportsVision) return messages;
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const hasImage = m.content.some((p) => p.type === 'image_url');
    if (!hasImage) return m;
    const textParts = m.content.filter((p) => p.type === 'text').map((p) => p.text);
    const combined = [...textParts, '[image omitted — this model does not support image input]'].join('\n');
    return { ...m, content: combined };
  });
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
