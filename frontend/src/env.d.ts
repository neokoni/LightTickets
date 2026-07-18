/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly LT_APP_VERSION: string;
  readonly LT_BUILD_COMMIT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
