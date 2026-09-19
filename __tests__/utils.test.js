import { colorForIndex, sortModelsByName, buildMessageContent, canAddModel, toggleModelSelection, COMPARE_MODEL_CAP, COMPARE_COLORS, modelSupportsVision, hasImageAttachment, filterModelsForAttachments, stripUnsupportedImages } from '../lib/utils';

describe('colorForIndex', () => {
  it('returns the 3 fixed compare colors in order', () => {
    expect(colorForIndex(0)).toBe(COMPARE_COLORS[0]);
    expect(colorForIndex(1)).toBe(COMPARE_COLORS[1]);
    expect(colorForIndex(2)).toBe(COMPARE_COLORS[2]);
  });

  it('wraps around for indices beyond the palette size', () => {
    expect(colorForIndex(3)).toBe(COMPARE_COLORS[0]);
  });
});

describe('sortModelsByName', () => {
  it('sorts models alphabetically by name, falling back to id', () => {
    const input = [{ id: 'b', name: 'Bravo' }, { id: 'a', name: 'Alpha' }, { id: 'c' }];
    const sorted = sortModelsByName(input);
    expect(sorted.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'b', name: 'Bravo' }, { id: 'a', name: 'Alpha' }];
    const original = [...input];
    sortModelsByName(input);
    expect(input).toEqual(original);
  });

  it('handles empty/undefined input', () => {
    expect(sortModelsByName([])).toEqual([]);
    expect(sortModelsByName(undefined)).toEqual([]);
  });
});

describe('buildMessageContent', () => {
  it('returns a plain string when there are no attachments', () => {
    expect(buildMessageContent('hello', [])).toBe('hello');
  });

  it('trims plain text content', () => {
    expect(buildMessageContent('  hello  ', [])).toBe('hello');
  });

  it('builds a content-parts array with an image_url part for image attachments', () => {
    const result = buildMessageContent('describe this', [{ type: 'image', uri: 'data:image/jpeg;base64,abc' }]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.find((p) => p.type === 'image_url').image_url.url).toBe('data:image/jpeg;base64,abc');
    expect(result.find((p) => p.type === 'text').text).toBe('describe this');
  });

  it('inlines plain text file contents into the text part', () => {
    const result = buildMessageContent('check this file', [{ type: 'file', name: 'notes.txt', content: 'file body' }]);
    const textPart = result.find((p) => p.type === 'text');
    expect(textPart.text).toContain('check this file');
    expect(textPart.text).toContain('notes.txt');
    expect(textPart.text).toContain('file body');
  });

  it('supports multiple images and files combined', () => {
    const result = buildMessageContent('multi', [
      { type: 'image', uri: 'uri1' },
      { type: 'image', uri: 'uri2' },
      { type: 'file', name: 'a.txt', content: 'A' },
    ]);
    const imageParts = result.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(2);
  });
});

describe('canAddModel', () => {
  it('allows adding while under the cap', () => {
    expect(canAddModel(['a', 'b'], 3)).toBe(true);
  });

  it('blocks adding once the cap is reached', () => {
    expect(canAddModel(['a', 'b', 'c'], 3)).toBe(false);
  });

  it('defaults to the standard compare cap of 3', () => {
    expect(canAddModel(['a', 'b', 'c'])).toBe(false);
    expect(COMPARE_MODEL_CAP).toBe(3);
  });
});

describe('toggleModelSelection', () => {
  it('adds a model when under the cap', () => {
    expect(toggleModelSelection(['a'], 'b', 3)).toEqual(['a', 'b']);
  });

  it('removes a model already selected', () => {
    expect(toggleModelSelection(['a', 'b'], 'a', 3)).toEqual(['b']);
  });

  it('refuses to add beyond the cap', () => {
    expect(toggleModelSelection(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
  });

  it('enforces the 3-model cap by default', () => {
    expect(toggleModelSelection(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
  });
});

describe('modelSupportsVision', () => {
  it('returns true when architecture.input_modalities includes image', () => {
    expect(modelSupportsVision({ architecture: { input_modalities: ['text', 'image'] } })).toBe(true);
  });

  it('returns false when architecture.input_modalities excludes image', () => {
    expect(modelSupportsVision({ architecture: { input_modalities: ['text'] } })).toBe(false);
  });

  it('fails open (assumes vision-capable) when architecture info is missing', () => {
    expect(modelSupportsVision({ id: 'unknown-model' })).toBe(true);
    expect(modelSupportsVision(undefined)).toBe(true);
  });
});

describe('hasImageAttachment', () => {
  it('detects an image attachment among mixed types', () => {
    expect(hasImageAttachment([{ type: 'file' }, { type: 'image' }])).toBe(true);
  });

  it('returns false when there are no attachments or no images', () => {
    expect(hasImageAttachment([])).toBe(false);
    expect(hasImageAttachment([{ type: 'file' }])).toBe(false);
  });
});

describe('filterModelsForAttachments', () => {
  const vision = { id: 'vision-model', architecture: { input_modalities: ['text', 'image'] } };
  const textOnly = { id: 'text-model', architecture: { input_modalities: ['text'] } };

  it('returns the full list unchanged when there is no image attached', () => {
    expect(filterModelsForAttachments([vision, textOnly], [])).toEqual([vision, textOnly]);
  });

  it('narrows to vision-capable models when an image is attached', () => {
    expect(filterModelsForAttachments([vision, textOnly], [{ type: 'image' }])).toEqual([vision]);
  });
});

describe('stripUnsupportedImages', () => {
  const imageMessage = {
    role: 'user',
    content: [{ type: 'text', text: 'look at this' }, { type: 'image_url', image_url: { url: 'data:...' } }],
  };
  const textMessage = { role: 'user', content: 'just text' };

  it('leaves messages untouched when the model supports vision', () => {
    expect(stripUnsupportedImages([imageMessage, textMessage], true)).toEqual([imageMessage, textMessage]);
  });

  it('replaces image parts with a text placeholder when the model lacks vision support', () => {
    const result = stripUnsupportedImages([imageMessage, textMessage], false);
    expect(result[0].content).toBe('look at this\n[image omitted — this model does not support image input]');
    expect(result[1]).toEqual(textMessage);
  });

  it('does not error on plain-string content when stripping', () => {
    expect(stripUnsupportedImages([textMessage], false)).toEqual([textMessage]);
  });
});
