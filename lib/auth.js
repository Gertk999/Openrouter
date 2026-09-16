// PKCE OAuth against OpenRouter, entirely on-device. No backend involved.
// The resulting user API key is stored in the phone's encrypted keychain
// (expo-secure-store) and never leaves the device except to OpenRouter itself.
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

const KEY_STORAGE_KEY = 'openrouter_api_key';

function randomVerifier(length = 64) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = Crypto.getRandomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// Headless PKCE flow: OpenRouter's /auth endpoint doesn't reliably honor
// custom exp:// / dev-tunnel callback URLs -- confirmed by testing: it
// silently drops back to their homepage instead of following the redirect,
// even though the same flow works perfectly with a real https:// callback.
// OpenRouter's own docs describe exactly this case: omit callback_url
// entirely and OpenRouter shows the authorization code on screen instead of
// redirecting. The user copies it and pastes it into the app. Swap back to
// the auto-redirect flow once we have a real production https domain
// (EAS build) -- this is the bulletproof path for Expo Go testing.
let pendingVerifier = null;

export async function startOpenRouterLogin() {
  const codeVerifier = randomVerifier();
  pendingVerifier = codeVerifier;
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const authUrl =
    `https://openrouter.ai/auth?code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256&key_label=OpenRouterChatMobile`;

  console.log('[auth] authUrl (headless) =', authUrl);
  await WebBrowser.openBrowserAsync(authUrl);
}

export async function finishOpenRouterLogin(pastedCode) {
  const code = (pastedCode || '').trim();
  if (!code) throw new Error('Paste the code OpenRouter showed you first.');
  if (!pendingVerifier) throw new Error('Start the login step first.');

  const resp = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: pendingVerifier,
      code_challenge_method: 'S256',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Key exchange failed (${resp.status}): ${text}`);
  }

  const { key } = await resp.json();
  if (!key) throw new Error('No API key in exchange response');

  await SecureStore.setItemAsync(KEY_STORAGE_KEY, key);
  pendingVerifier = null;
  return key;
}

export async function getStoredKey() {
  return SecureStore.getItemAsync(KEY_STORAGE_KEY);
}

export async function logout() {
  await SecureStore.deleteItemAsync(KEY_STORAGE_KEY);
}
