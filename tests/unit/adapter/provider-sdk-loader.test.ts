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

async function expectMissingProviderError(promise: Promise<unknown>, packageName: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${packageName} loader to reject`);
  } catch (err) {
    assertMissingProviderError(err, packageName);
  }
}

const config: SpecRunnerConfig = { version: 1, runtime: "local", agents: {} };

function makeMinimalClaudeRunContext(): AgentRunContext {
  return {
    step: {
      name: "test-step",
      agent: { model: "claude-opus-4-5" },
      buildMessage: () => "test prompt",
      resultFilePath: () => null,
    } as unknown as AgentRunContext["step"],
    state: {} as AgentRunContext["state"],
    branch: "feat/test",
    slug: "test-slug",
    cwd: "/tmp",
    input: { requestContent: "content" },
    session: {},
    policy: {},
    config,
    emit: () => undefined,
  };
}

describe("provider SDK loaders", () => {
  it("normalizes a missing Claude Agent SDK package with install guidance", async () => {
    const loadSdk = () => loadClaudeAgentSdk({
      importer: async () => {
        throw missingModuleError(CLAUDE_AGENT_SDK_PACKAGE);
      },
    });
    const runner = new ClaudeCodeRunner({ _loadSdkFn: loadSdk });

    await expectMissingProviderError(runner.run(makeMinimalClaudeRunContext()), CLAUDE_AGENT_SDK_PACKAGE);
  });

  it("preserves install guidance when Claude SDK loading fails inside the local query path", async () => {
    const loadSdk = () => loadClaudeAgentSdk({
      importer: async () => {
        throw missingModuleError(CLAUDE_AGENT_SDK_PACKAGE);
      },
    });
    const queryFn = async function* (params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      const sdk = await loadSdk();
      yield* sdk.query(params);
    };
    const runner = new ClaudeCodeRunner({ _queryFn: queryFn });

    await expectMissingProviderError(runner.run(makeMinimalClaudeRunContext()), CLAUDE_AGENT_SDK_PACKAGE);
  });

  it("normalizes a missing Codex SDK package with install guidance", async () => {
    const loadSdk = () => loadCodexSdk({
      importer: async () => {
        throw missingModuleError(CODEX_SDK_PACKAGE);
      },
    });
    const runner = new CodexAgentRunner({ _loadSdkFn: loadSdk });

    await expectMissingProviderError(runner.run({} as AgentRunContext), CODEX_SDK_PACKAGE);
  });

  it("uses the same guided error for queryOneShot default Claude SDK loading", async () => {
    const loadSdk = () => loadClaudeAgentSdk({
      importer: async () => {
        throw missingModuleError(CLAUDE_AGENT_SDK_PACKAGE);
      },
    });

    await expectMissingProviderError(
      queryOneShot({ systemPrompt: "sys", prompt: "user" }, config, undefined, loadSdk),
      CLAUDE_AGENT_SDK_PACKAGE,
    );
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

  it("does not misclassify provider-package paths under node_modules as missing top-level provider SDKs", async () => {
    const cause = Object.assign(
      new Error(
        `Cannot find package 'some-transitive-package' imported from /tmp/node_modules/${CLAUDE_AGENT_SDK_PACKAGE}/dist/index.js`,
      ),
      { code: "ERR_MODULE_NOT_FOUND" },
    );

    await expect(loadClaudeAgentSdk({
      importer: async () => {
        throw cause;
      },
    })).rejects.toBe(cause);
  });
});
