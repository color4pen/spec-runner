import { describe, expect, it } from "vitest";
import { ClaudeCodeRunner } from "../../../src/adapter/claude-code/agent-runner.js";
import { queryOneShot } from "../../../src/adapter/claude-code/query-one-shot.js";
import { CLAUDE_AGENT_SDK_PACKAGE, loadClaudeAgentSdk } from "../../../src/adapter/claude-code/sdk-loader.js";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import { CODEX_SDK_PACKAGE, loadCodexSdk } from "../../../src/adapter/codex/sdk-loader.js";
import { ERROR_CODES, SpecRunnerError } from "../../../src/errors.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

function missingModuleError(packageName: string): Error {
  return Object.assign(
    new Error(`Cannot find package '${packageName}' imported from /tmp/specrunner-test.js`),
    { code: "ERR_MODULE_NOT_FOUND" },
  );
}

function assertMissingProviderError(err: unknown, packageName: string): boolean {
  expect(err).toBeInstanceOf(SpecRunnerError);
  const specrunnerError = err as SpecRunnerError;
  expect(specrunnerError.code).toBe(ERROR_CODES.PROVIDER_SDK_MISSING);
  expect(specrunnerError.message).toContain(packageName);
  expect(specrunnerError.hint).toContain(`bun add ${packageName}`);
  return true;
}

const config: SpecRunnerConfig = { version: 1, runtime: "local", agents: {} };

describe("provider SDK loaders", () => {
  it("normalizes a missing Claude Agent SDK package with install guidance", async () => {
    const loadSdk = () => loadClaudeAgentSdk({
      importer: async () => {
        throw missingModuleError(CLAUDE_AGENT_SDK_PACKAGE);
      },
    });
    const runner = new ClaudeCodeRunner({ _loadSdkFn: loadSdk });

    await expect(runner.run({} as AgentRunContext)).rejects.toSatisfy((err) =>
      assertMissingProviderError(err, CLAUDE_AGENT_SDK_PACKAGE),
    );
  });

  it("normalizes a missing Codex SDK package with install guidance", async () => {
    const loadSdk = () => loadCodexSdk({
      importer: async () => {
        throw missingModuleError(CODEX_SDK_PACKAGE);
      },
    });
    const runner = new CodexAgentRunner({ _loadSdkFn: loadSdk });

    await expect(runner.run({} as AgentRunContext)).rejects.toSatisfy((err) =>
      assertMissingProviderError(err, CODEX_SDK_PACKAGE),
    );
  });

  it("uses the same guided error for queryOneShot default Claude SDK loading", async () => {
    const loadSdk = () => loadClaudeAgentSdk({
      importer: async () => {
        throw missingModuleError(CLAUDE_AGENT_SDK_PACKAGE);
      },
    });

    await expect(
      queryOneShot({ systemPrompt: "sys", prompt: "user" }, config, undefined, loadSdk),
    ).rejects.toSatisfy((err) => assertMissingProviderError(err, CLAUDE_AGENT_SDK_PACKAGE));
  });

  it("does not label unrelated import failures as missing optional provider SDKs", async () => {
    const cause = Object.assign(
      new Error("Cannot find package 'some-transitive-package' imported from sdk internals"),
      { code: "ERR_MODULE_NOT_FOUND" },
    );

    await expect(loadClaudeAgentSdk({
      importer: async () => {
        throw cause;
      },
    })).rejects.toBe(cause);
  });
});
