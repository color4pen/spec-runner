import { loadOptionalProviderSdk } from "../shared/provider-sdk-loader.js";

export const CLAUDE_AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

/**
 * Minimal PermissionResult type compatible with the SDK's full definition.
 * Only the variants needed by the workspace write guard are declared here.
 */
export type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

/**
 * Permission callback for controlling tool usage.
 * Structurally compatible with the SDK's `CanUseTool` type:
 * the SDK calls (toolName, input, opts) and our guard ignores opts.
 * opts: Record<string, unknown> accepts the SDK's { signal, toolUseID, ... } object.
 */
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  opts: Record<string, unknown>,
) => Promise<PermissionResult>;

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
    },
    importer: deps.importer ?? ((specifier) => import(specifier)),
  });
  const mod = sdk as Partial<ClaudeAgentSdk>;
  if (typeof mod.query !== "function" || typeof mod.createSdkMcpServer !== "function") {
    throw new Error(`${CLAUDE_AGENT_SDK_PACKAGE} did not expose the expected Claude Agent SDK API.`);
  }
  return mod as ClaudeAgentSdk;
}
