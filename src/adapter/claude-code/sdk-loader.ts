import { loadOptionalProviderSdk } from "../shared/provider-sdk-loader.js";

export const CLAUDE_AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

export type ClaudeSdkQuery = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncGenerator<unknown, void>;

export type ClaudeSdkCreateMcpServer = (params: Record<string, unknown>) => unknown;

export interface ClaudeAgentSdk {
  query: ClaudeSdkQuery;
  createSdkMcpServer: ClaudeSdkCreateMcpServer;
}

export type ClaudeAgentSdkLoader = () => Promise<ClaudeAgentSdk>;

export interface ClaudeAgentSdkLoaderDeps {
  importer?: (specifier: string) => Promise<unknown>;
}

export async function loadClaudeAgentSdk(deps: ClaudeAgentSdkLoaderDeps = {}): Promise<ClaudeAgentSdk> {
  const sdk = await loadOptionalProviderSdk({
    info: {
      providerName: "Claude",
      packageName: CLAUDE_AGENT_SDK_PACKAGE,
      installCommand: `bun add ${CLAUDE_AGENT_SDK_PACKAGE}`,
    },
    importer: deps.importer ?? ((specifier) => import(specifier)),
  });
  const mod = sdk as Partial<ClaudeAgentSdk>;
  if (typeof mod.query !== "function" || typeof mod.createSdkMcpServer !== "function") {
    throw new Error(`${CLAUDE_AGENT_SDK_PACKAGE} did not expose the expected Claude Agent SDK API.`);
  }
  return mod as ClaudeAgentSdk;
}
