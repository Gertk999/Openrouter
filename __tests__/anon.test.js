// Unit tests for the anonymous free-trial tier's client (device id +
// backend proxy calls). expo-secure-store and expo-crypto are mocked since
// this runs under plain node, not a real device.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
}));
jest.mock('../config', () => ({ BACKEND_URL: 'https://backend.test' }));

const SecureStore = require('expo-secure-store');
const {
  getOrCreateDeviceId,
  fetchAnonModels,
  fetchAnonStatus,
  sendAnonChat,
  creditAnonIap,
} = require('../lib/anon');

function mockFetchOnce(body, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getOrCreateDeviceId', () => {
  it('returns the stored id if one already exists', async () => {
    SecureStore.getItemAsync.mockResolvedValue('existing-id');
    const id = await getOrCreateDeviceId();
    expect(id).toBe('existing-id');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('generates and persists a new id when none exists', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    const id = await getOrCreateDeviceId();
    expect(id).toBe('0102030405060708090a0b0c0d0e0f10');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('anon_device_id', id);
  });
});

describe('fetchAnonModels', () => {
  it('returns the allowed model list', async () => {
    mockFetchOnce({ models: ['a', 'b', 'c'] });
    const models = await fetchAnonModels();
    expect(models).toEqual(['a', 'b', 'c']);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://backend.test/anon/models',
      expect.any(Object)
    );
  });
});

describe('fetchAnonStatus', () => {
  it('passes the device id as a query param', async () => {
    mockFetchOnce({ spend_usd: 0.1, remaining_usd: 0.4, locked: false });
    const status = await fetchAnonStatus('dev-1');
    expect(status.remaining_usd).toBe(0.4);
    expect(global.fetch.mock.calls[0][0]).toBe('https://backend.test/anon/status?device_id=dev-1');
  });
});

describe('sendAnonChat', () => {
  it('returns the assistant message content', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'hello' } }] });
    const reply = await sendAnonChat('dev-1', 'model-x', [{ role: 'user', content: 'hi' }]);
    expect(reply).toBe('hello');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://backend.test/anon/chat');
    expect(JSON.parse(opts.body)).toEqual({
      device_id: 'dev-1',
      model: 'model-x',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('throws with the status attached when the cap is hit (402)', async () => {
    mockFetchOnce({ detail: 'free trial limit reached' }, false, 402);
    await expect(sendAnonChat('dev-1', 'model-x', [])).rejects.toMatchObject({ status: 402 });
  });
});

describe('creditAnonIap', () => {
  it('posts the device id and purchased amount', async () => {
    mockFetchOnce({ ok: true });
    await creditAnonIap('dev-1', 3);
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ device_id: 'dev-1', amount_usd: 3 });
  });
});
