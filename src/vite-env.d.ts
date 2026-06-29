declare module '*.css';

interface ImportMetaEnv {
  readonly MODE: string;
  readonly DEV: boolean;
  readonly VITE_GIT_COMMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
