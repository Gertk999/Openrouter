// Single place to configure how the app reaches your backend proxy.
// This is ONLY used for the anonymous free-trial tier (item 2/11/12).
// Personal OpenRouter-login users never touch this -- their traffic goes
// straight from the device to openrouter.ai (see lib/openrouter.js).
//
// DEV NOTE: this points at a temporary Cloudflare quick tunnel for the dev
// backend running on the agent's VM. It WILL break/change if that tunnel
// restarts. Replace with a real stable domain once the production backend
// VM exists.
export const BACKEND_URL = "https://routing-john-stickers-displays.trycloudflare.com";
