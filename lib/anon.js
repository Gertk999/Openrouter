// Anonymous free-trial tier: talks to our own backend proxy (never touches
// OpenRouter directly, never sees a real OpenRouter key). The backend holds
// one shared OpenRouter key server-side and enforces a lifetime $0.50 spend
// cap per device, keyed by the device id generated here.
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { BACKEND_URL } from '../config';

const DEVICE_ID_KEY = 'anon_device_id';

// Stable per-device id, generated once and kept in the Keychain (survives
// app updates; only resets on a full uninstall+reinstall, matching the
// backend's "lifetime cap per device" design).
export async function getOrCreateDeviceId() {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (id) return id;
  const bytes = Crypto.getRandomBytes(16);
  id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

async function backendFetch(path, options = {}) {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Backend request failed (${resp.status}): ${text}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

export async function fetchAnonModels() {
  const data = await backendFetch('/anon/models');
  return data.models || [];
}

export async function fetchAnonStatus(deviceId) {
  return backendFetch(`/anon/status?device_id=${encodeURIComponent(deviceId)}`);
}

export async function sendAnonChat(deviceId, model, messages) {
  const data = await backendFetch('/anon/chat', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, model, messages }),
  });
  return data.choices?.[0]?.message?.content ?? '(empty response)';
}

export async function creditAnonIap(deviceId, amountUsd) {
  return backendFetch('/anon/iap-credit', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, amount_usd: amountUsd }),
  });
}
