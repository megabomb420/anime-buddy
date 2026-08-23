/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL?: string;
  readonly VITE_AI_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
