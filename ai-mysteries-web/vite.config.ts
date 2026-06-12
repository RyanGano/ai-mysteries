import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// When VITE_PROXY_TARGET is set (in .env.local), the dev server proxies /api to that host —
// browser requests stay same-origin, so this is the way to point a local UI at the prod API
// (whose CORS only trusts the deployed front end). Pair it with an empty VITE_API_BASE_URL so
// the client fetches relative URLs. See .env.example.
export default defineConfig(({ mode }) => {
  // "." resolves against the dev server's cwd (this project dir); avoids needing @types/node.
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    server: env.VITE_PROXY_TARGET
      ? { proxy: { "/api": { target: env.VITE_PROXY_TARGET, changeOrigin: true } } }
      : undefined,
  };
});
