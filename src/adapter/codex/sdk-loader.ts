import { loadOptionalProviderSdk } from "../shared/provider-sdk-loader.js";
import type { CodexInstance } from "./agent-runner.js";

export const CODEX_SDK_PACKAGE = "@openai/codex-sdk";

export interface CodexSdk {
  Codex: new () => CodexInstance;
}

export type CodexSdkLoader = () => Promise<CodexSdk>;

export interface CodexSdkLoaderDeps {
  importer?: (specifier: string) => Promise<unknown>;
}

export async function loadCodexSdk(deps: CodexSdkLoaderDeps = {}): Promise<CodexSdk> {
  const sdk = await loadOptionalProviderSdk({
    info: {
      providerName: "OpenAI/Codex",
      packageName: CODEX_SDK_PACKAGE,
      installCommand: `bun add ${CODEX_SDK_PACKAGE}`,
    },
    importer: deps.importer ?? ((specifier) => import(specifier)),
  });
  const mod = sdk as Partial<CodexSdk>;
  if (typeof mod.Codex !== "function") {
    throw new Error(`${CODEX_SDK_PACKAGE} did not expose the expected Codex SDK API.`);
  }
  return mod as CodexSdk;
}
