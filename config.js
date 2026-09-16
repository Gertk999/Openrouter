// Single place to configure how the app reaches your backend proxy.
// Backend URL: point this at wherever you deploy the FastAPI proxy
// (e.g. https://your-domain.example or a Tailscale/VPN address).
// Never put an OpenRouter key here -- the app talks only to your backend.
export const BACKEND_URL = "https://your-backend-domain.example";
export const APP_TOKEN = "paste-the-APP_TOKEN-from-backend/.env-here";
