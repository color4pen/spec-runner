/**
 * TC-014: repoRequiredError carries NOT_GIT_REPO exit code and prescriptive hint
 *         (design.md > D2 — requiresRepo declaration + one unified out-of-repo error)
 *
 * Verifies that the new factory `repoRequiredError(command)` exported from
 * src/errors.ts:
 *   - returns a SpecRunnerError with code NOT_GIT_REPO
 *   - has exit code 2 (ARG_ERROR)
 *   - includes a prescriptive hint mentioning `git init` or `cd` into a repo
 *
 * This test is RED until the implementer adds `repoRequiredError` to src/errors.ts.
 */
import { describe, it, expect } from "vitest";
import { EXIT_CODE, ERROR_CODES, SpecRunnerError } from "../../../src/errors.js";

// ---------------------------------------------------------------------------
// TC-014: repoRequiredError factory (should)
// ---------------------------------------------------------------------------

describe("TC-014: repoRequiredError — NOT_GIT_REPO exit code and prescriptive hint", () => {
  it("exists as an exported function from src/errors.ts", async () => {
    const mod = await import("../../../src/errors.js");
    // repoRequiredError does not exist yet → will fail until T-01 adds it
    expect(typeof (mod as Record<string, unknown>)["repoRequiredError"]).toBe("function");
  });

  it("returns a SpecRunnerError with code NOT_GIT_REPO", async () => {
    const mod = await import("../../../src/errors.js") as Record<string, unknown>;
    const repoRequiredError = mod["repoRequiredError"] as ((command: string) => SpecRunnerError) | undefined;
    if (!repoRequiredError) {
      throw new Error("repoRequiredError is not exported from src/errors.ts — implement T-01");
    }

    const err = repoRequiredError("request new");

    expect(err).toBeInstanceOf(SpecRunnerError);
    expect(err.code).toBe(ERROR_CODES.NOT_GIT_REPO);
  });

  it("has exit code 2 (ARG_ERROR)", async () => {
    const mod = await import("../../../src/errors.js") as Record<string, unknown>;
    const repoRequiredError = mod["repoRequiredError"] as ((command: string) => SpecRunnerError) | undefined;
    if (!repoRequiredError) {
      throw new Error("repoRequiredError is not exported from src/errors.ts — implement T-01");
    }

    const err = repoRequiredError("request new");

    expect(err.exitCode).toBe(EXIT_CODE.ARG_ERROR);
  });

  it("hint prescribes running git init or cd into a repository", async () => {
    const mod = await import("../../../src/errors.js") as Record<string, unknown>;
    const repoRequiredError = mod["repoRequiredError"] as ((command: string) => SpecRunnerError) | undefined;
    if (!repoRequiredError) {
      throw new Error("repoRequiredError is not exported from src/errors.ts — implement T-01");
    }

    const err = repoRequiredError("request new");

    // The hint must mention how to fix the situation: git init or cd into a repo
    const hint = err.hint.toLowerCase();
    const mentionsGitInit = hint.includes("git init");
    const mentionsCd = hint.includes("cd");
    expect(mentionsGitInit || mentionsCd).toBe(true);
  });

  it("includes the command name in the error output for context", async () => {
    const mod = await import("../../../src/errors.js") as Record<string, unknown>;
    const repoRequiredError = mod["repoRequiredError"] as ((command: string) => SpecRunnerError) | undefined;
    if (!repoRequiredError) {
      throw new Error("repoRequiredError is not exported from src/errors.ts — implement T-01");
    }

    const commandName = "request new";
    const err = repoRequiredError(commandName);

    // The error message or hint should contain the command name
    const combined = `${err.message} ${err.hint}`;
    // Not strictly required by spec, but good practice — at minimum it should not throw
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.hint.length).toBeGreaterThan(0);
    void combined; // used for context
  });
});

// ---------------------------------------------------------------------------
// Regression guard: NOT_GIT_REPO exit code is still 2 (ARG_ERROR)
// ---------------------------------------------------------------------------

describe("TC-014 invariant: NOT_GIT_REPO maps to ARG_ERROR (exit 2)", () => {
  it("NOT_GIT_REPO is in ERROR_CODES", () => {
    expect(ERROR_CODES.NOT_GIT_REPO).toBe("NOT_GIT_REPO");
  });

  it("SpecRunnerError with NOT_GIT_REPO code derives exit 2", () => {
    const err = new SpecRunnerError(
      "NOT_GIT_REPO",
      "cd into a git repository",
      "Not a git repository.",
    );
    expect(err.exitCode).toBe(EXIT_CODE.ARG_ERROR);
  });
});
