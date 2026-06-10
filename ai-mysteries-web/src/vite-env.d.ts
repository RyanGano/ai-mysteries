/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the book API (e.g. http://localhost:5180). Falls back to the local dev port.
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
