// Mock global fetch for pure network-layer unit tests of openrouter.js.
import { fetchModels, sendChat, sendChatMulti } from '../lib/openrouter';

function mockFetchOnce(body, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('fetchModels', () => {
  it('returns models sorted by name', async () => {
    mockFetchOnce({ data: [{ id: 'b', name: 'Bravo' }, { id: 'a', name: 'Alpha' }] });
    const models = await fetchModels('key');
    expect(models.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('throws on a non-ok response', async () => {
    mockFetchOnce({}, false, 401);
    await expect(fetchModels('key')).rejects.toThrow(/401/);
  });
});

describe('sendChat', () => {
  it('returns the assistant message content', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'hi there' } }] });
    const reply = await sendChat('key', 'model-x', [{ role: 'user', content: 'hi' }]);
    expect(reply).toBe('hi there');
  });

  it('falls back to a placeholder when content is missing', async () => {
    mockFetchOnce({ choices: [{ message: {} }] });
    const reply = await sendChat('key', 'model-x', [{ role: 'user', content: 'hi' }]);
    expect(reply).toBe('(empty response)');
  });

  it('throws with the status and body on failure', async () => {
    mockFetchOnce({ error: 'bad request' }, false, 400);
    await expect(sendChat('key', 'model-x', [])).rejects.toThrow(/400/);
  });
});

describe('sendChatMulti', () => {
  it('fans out to multiple models and returns one result each, in order', async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: `reply-${call}` } }] }),
      });
    });
    const results = await sendChatMulti('key', ['m1', 'm2'], [{ role: 'user', content: 'hi' }]);
    expect(results).toHaveLength(2);
    expect(results[0].model).toBe('m1');
    expect(results[1].model).toBe('m2');
    expect(results[0].error).toBeNull();
  });

  it('captures a per-model error without failing the whole batch', async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({ ok: false, status: 500, text: async () => 'boom' });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    });
    const results = await sendChatMulti('key', ['bad-model', 'good-model'], []);
    expect(results[0].error).toMatch(/500/);
    expect(results[0].content).toBeNull();
    expect(results[1].content).toBe('ok');
    expect(results[1].error).toBeNull();
  });

  it('strips images from the request body for models that lack vision support', async () => {
    const bodies = [];
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      bodies.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    });
    const messages = [{
      role: 'user',
      content: [{ type: 'text', text: 'what is this' }, { type: 'image_url', image_url: { url: 'data:...' } }],
    }];
    const modelInfoById = {
      'vision-model': { id: 'vision-model', architecture: { input_modalities: ['text', 'image'] } },
      'text-model': { id: 'text-model', architecture: { input_modalities: ['text'] } },
    };
    await sendChatMulti('key', ['vision-model', 'text-model'], messages, modelInfoById);
    const visionCallBody = bodies.find((b) => b.model === 'vision-model');
    const textCallBody = bodies.find((b) => b.model === 'text-model');
    expect(Array.isArray(visionCallBody.messages[0].content)).toBe(true);
    expect(typeof textCallBody.messages[0].content).toBe('string');
    expect(textCallBody.messages[0].content).toContain('image omitted');
  });
});
