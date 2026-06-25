/**
 * Unit tests for codexCliCheck
 *
 * TC: no OpenAI steps → pass without calling execFile
 * TC: OpenAI steps configured + codex found → pass
 * TC: OpenAI steps configured + codex missing → fail
 */
import { describe, it, expect, vi } from "vitest";
import { codexCliCheck } from "../../../../../src/core/doctor/checks/runtime/codex-cli.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";

describe("codexCliCheck — no OpenAI model steps", () => {
  it("returns pass without calling execFile when no steps configured", async () => {
    const execFile = vi.fn();
    const ctx = buildMockContext({
      execFile,
      config: buildMockConfig({}),
    });
    const result = await codexCliCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(execFile).not.toHaveBeenCalled();
  });

  it("returns pass when steps only use anthropic models", async () => {
    const execFile = vi.fn();
    const ctx = buildMockContext({
      execFile,
      config: buildMockConfig({
        steps: { implementer: { model: "claude-sonnet-4-5" } },
      }),
    });
    const result = await codexCliCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("not required");
    expect(execFile).not.toHaveBeenCalled();
  });
});

describe("codexCliCheck — OpenAI model steps present", () => {
  it("returns pass with (authenticated) when codex CLI is available and auth succeeds", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "0.1.0\n", stderr: "" });
    const ctx = buildMockContext({
      execFile,
      config: buildMockConfig({
        steps: { implementer: { model: "gpt-5.4" } },
      }),
    });
    const result = await codexCliCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("codex");
    expect(result.message).toContain("authenticated");
    expect(execFile).toHaveBeenCalledWith("codex", ["--version"], expect.anything());
    expect(execFile).toHaveBeenCalledWith("codex", ["auth", "whoami"], expect.anything());
  });

  it("returns warn with hint when codex is installed but not authenticated", async () => {
    const execFile = vi.fn()
      .mockResolvedValueOnce({ stdout: "0.1.0\n", stderr: "" }) // --version succeeds
      .mockRejectedValueOnce(new Error("not authenticated"));   // auth whoami fails
    const ctx = buildMockContext({
      execFile,
      config: buildMockConfig({
        steps: { implementer: { model: "gpt-5.4" } },
      }),
    });
    const result = await codexCliCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("not authenticated");
    expect(result.hint).toContain("codex login");
    expect(result.hint).toContain("CODEX_API_KEY");
  });

  it("returns fail when codex CLI is not in PATH", async () => {
    const execFile = vi.fn().mockRejectedValue(new Error("command not found: codex"));
    const ctx = buildMockContext({
      execFile,
      config: buildMockConfig({
        steps: { implementer: { model: "gpt-5.4" } },
      }),
    });
    const result = await codexCliCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toContain("@openai/codex");
  });

  it("returns pass for user-defined openai model", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "1.0.0\n", stderr: "" });
    const ctx = buildMockContext({
      execFile,
      config: buildMockConfig({
        models: { "my-oai-model": { provider: "openai" } },
        steps: { implementer: { model: "my-oai-model" } },
      }),
    });
    const result = await codexCliCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(execFile).toHaveBeenCalled();
  });
});
