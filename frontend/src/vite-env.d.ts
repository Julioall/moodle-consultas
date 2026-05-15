interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare class Worker {
  constructor(...args: any[]);
  postMessage(...args: any[]): void;
  terminate(): void;
  onmessage: unknown;
}
