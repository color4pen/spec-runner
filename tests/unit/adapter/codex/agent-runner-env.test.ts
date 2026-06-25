/**
 * Unit tests: codex adapter env containment via buildDefaultCodexFactory.
 *
 * Verifies that the default Codex factory:
 * - Does NOT include GH_TOKEN / GITHUB_TOKEN / ANTHROPIC_API_KEY / SPECRUNNER_API_KEY in opts.env
 * - Forwards OPENAI_API_KEY as opts.apiKey when set in the provided env
 * - Omits apiKey from opts when OPENAI_API_KEY is not present
 */
import { describe, it, expect } from "vitest";
import { buildDefaultCodexFactory } from "../../../../src/adapter/codex/agent-runner.js";
import type { CodexInstance } from "../../../../src/adapter/codex/agent-runner.js";
import { stripSecrets } from "../../../../src/util/env-filter.js";

/** Minimal CodexInstance stub — no methods needed for factory tests. */
const stubCodexInstance: CodexInstance = {
  startThread: () => { throw new Error("not used in factory tests"); },
  resumeThread: () => { throw new Error("not used in factory tests"); },
};

/**
 * Build a fake CodexSdk that captures the opts passed to `new Codex(opts)`.
 */
function makeFakeSdk(captured: { opts?: { env?: Record<string, string>; apiKey?: string } }): import("../../../../src/adapter/codex/sdk-loader.js").CodexSdk {
  return {
    Codex: class FakeCodex {
      constructor(opts?: { env?: Record<string, string>; apiKey?: string }) {
        captured.opts = opts;
        return stubCodexInstance;
      }
    } as unknown as import("../../../../src/adapter/codex/sdk-loader.js").CodexSdk["Codex"],
  };
}

describe("buildDefaultCodexFactory", () => {
  it("opts.env does not contain GH_TOKEN (stripped by stripSecrets)", () => {
    const processEnv: Record<string, string | undefined> = {
      GH_TOKEN: "ghp_test_secret",
      PATH: "/usr/bin",
    };
    const captured: { opts?: { env?: Record<string, string>; apiKey?: string } } = {};
    const sdk = makeFakeSdk(captured);

    const strippedEnv = Object.fromEntries(
      Object.entries(processEnv).filter(([k, v]) => k !== "GH_TOKEN" && v !== undefined) as [string, string][]
    ) as Record<string, string>;
    const factory = buildDefaultCodexFactory(sdk, strippedEnv, processEnv["OPENAI_API_KEY"]);
    factory();

    expect(captured.opts?.env?.["GH_TOKEN"]).toBeUndefined();
  });

  it("opts.env does not contain GITHUB_TOKEN, ANTHROPIC_API_KEY, or SPECRUNNER_API_KEY", () => {
    const processEnv: Record<string, string | undefined> = {
      GH_TOKEN: "ghp_secret",
      GITHUB_TOKEN: "github_pat_secret",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      SPECRUNNER_API_KEY: "sk-sr-secret",
      PATH: "/usr/bin",
    };

    // Simulate what stripSecrets produces (no secrets)
    const strippedEnv: Record<string, string> = { PATH: "/usr/bin" };

    const captured: { opts?: { env?: Record<string, string>; apiKey?: string } } = {};
    const sdk = makeFakeSdk(captured);

    const factory = buildDefaultCodexFactory(sdk, strippedEnv, processEnv["OPENAI_API_KEY"]);
    factory();

    expect(captured.opts?.env?.["GH_TOKEN"]).toBeUndefined();
    expect(captured.opts?.env?.["GITHUB_TOKEN"]).toBeUndefined();
    expect(captured.opts?.env?.["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(captured.opts?.env?.["SPECRUNNER_API_KEY"]).toBeUndefined();
  });

  it("forwards OPENAI_API_KEY as opts.apiKey when set in the env", () => {
    const strippedEnv: Record<string, string> = { PATH: "/usr/bin" };
    const openaiApiKey = "sk-openai-test-key";

    const captured: { opts?: { env?: Record<string, string>; apiKey?: string } } = {};
    const sdk = makeFakeSdk(captured);

    const factory = buildDefaultCodexFactory(sdk, strippedEnv, openaiApiKey);
    factory();

    expect(captured.opts?.apiKey).toBe("sk-openai-test-key");
  });

  it("omits apiKey from opts when OPENAI_API_KEY is undefined", () => {
    const strippedEnv: Record<string, string> = { PATH: "/usr/bin" };

    const captured: { opts?: { env?: Record<string, string>; apiKey?: string } } = {};
    const sdk = makeFakeSdk(captured);

    const factory = buildDefaultCodexFactory(sdk, strippedEnv, undefined);
    factory();

    expect(captured.opts).not.toHaveProperty("apiKey");
  });

  it("benign variables (PATH) are present in opts.env", () => {
    const strippedEnv: Record<string, string> = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/user",
    };

    const captured: { opts?: { env?: Record<string, string>; apiKey?: string } } = {};
    const sdk = makeFakeSdk(captured);

    const factory = buildDefaultCodexFactory(sdk, strippedEnv, undefined);
    factory();

    expect(captured.opts?.env?.["PATH"]).toBe("/usr/bin:/bin");
    expect(captured.opts?.env?.["HOME"]).toBe("/home/user");
  });
});

describe("buildDefaultCodexFactory — integration with stripSecrets denylist", () => {
  it("secrets stripped by stripSecrets are absent from opts.env passed to factory", () => {
    // Simulate the full flow as done in CodexAgentRunner.run():
    // 1. Read process.env-like object
    // 2. Call stripSecrets
    // 3. Build factory with strippedEnv
    // 4. Invoke factory and assert opts.env has no secrets
    const fakeProcessEnv: Record<string, string | undefined> = {
      GH_TOKEN: "ghp_secret",
      GITHUB_TOKEN: "github_pat_secret",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      SPECRUNNER_API_KEY: "sk-sr-secret",
      MY_CORP_TOKEN: "corp-secret",
      PATH: "/usr/bin",
      HOME: "/home/user",
    };

    const strippedEnv = stripSecrets(fakeProcessEnv) as Record<string, string>;
    const openaiApiKey = fakeProcessEnv["OPENAI_API_KEY"];

    const captured: { opts?: { env?: Record<string, string>; apiKey?: string } } = {};
    const sdk = makeFakeSdk(captured);

    const factory = buildDefaultCodexFactory(sdk, strippedEnv, openaiApiKey);
    factory();

    // No secrets in opts.env
    expect(captured.opts?.env?.["GH_TOKEN"]).toBeUndefined();
    expect(captured.opts?.env?.["GITHUB_TOKEN"]).toBeUndefined();
    expect(captured.opts?.env?.["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(captured.opts?.env?.["SPECRUNNER_API_KEY"]).toBeUndefined();
    expect(captured.opts?.env?.["MY_CORP_TOKEN"]).toBeUndefined();
    // Benign vars preserved
    expect(captured.opts?.env?.["PATH"]).toBe("/usr/bin");
    expect(captured.opts?.env?.["HOME"]).toBe("/home/user");
  });
});
