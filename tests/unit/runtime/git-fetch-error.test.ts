/**
 * TC-014: 認証系 stderr で specrunner login を処方し元 stderr を保持する
 * TC-015: 非認証系 stderr で現行文字列と同一のメッセージを返す
 * TC-019: describeGitFetchFailure が各認証パターンを個別に認識する
 *
 * Source: spec.md > git fetch の認証失敗は login を処方し元 stderr を保持する
 * tasks.md > T-09: src/core/runtime/git-fetch-error.ts を新設
 *
 * 実装前は RED:
 *   - src/core/runtime/git-fetch-error.ts が存在しない
 *   - dynamic import が失敗し全テストが fail
 */
import { describe, it, expect } from "vitest";

// Dynamic import — module does not exist yet; tests fail until implementation
async function getDescribeGitFetchFailure(): Promise<(exitCode: number, stderr: string) => string> {
  const mod = await import("../../../src/core/runtime/git-fetch-error.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (mod as any).describeGitFetchFailure;
  if (typeof fn !== "function") {
    throw new Error(
      "describeGitFetchFailure not exported — implement src/core/runtime/git-fetch-error.ts",
    );
  }
  return fn;
}

// ---------------------------------------------------------------------------
// TC-014: 認証系 stderr で specrunner login を処方し元 stderr を保持する
// ---------------------------------------------------------------------------
describe("TC-014: 認証系 stderr → specrunner login 処方 + 元 stderr 保持", () => {
  it("'could not read Username' パターンで第一文が specrunner login を含む", async () => {
    const fn = await getDescribeGitFetchFailure();
    const stderr = "fatal: could not read Username for 'https://github.com': No such device or address";
    const result = fn(128, stderr);
    // First sentence must prescribe specrunner login
    const firstSentence = result.split(/[.\n]/)[0]!;
    expect(firstSentence).toContain("specrunner login");
  });

  it("'could not read Username' パターンで元 stderr が詳細として保持される", async () => {
    const fn = await getDescribeGitFetchFailure();
    const stderr = "fatal: could not read Username for 'https://github.com': No such device or address";
    const result = fn(128, stderr);
    expect(result).toContain(stderr.trim());
  });

  it("認証系 stderr で従来の 'git fetch origin failed' 文字列も詳細に含まれる", async () => {
    const fn = await getDescribeGitFetchFailure();
    const stderr = "fatal: could not read Password: terminal prompts disabled";
    const exitCode = 128;
    const result = fn(exitCode, stderr);
    // Original git fetch failure detail must be preserved
    expect(result).toContain(`git fetch origin failed (exit ${exitCode})`);
    expect(result).toContain(stderr.trim());
  });
});

// ---------------------------------------------------------------------------
// TC-015: 非認証系 stderr で現行文字列と同一のメッセージを返す（回帰防止）
// ---------------------------------------------------------------------------
describe("TC-015: 非認証系 stderr → 現行と同一のメッセージ（回帰防止）", () => {
  it("非認証系 stderr で 'git fetch origin failed (exit N): <stderr>' と完全に同一", async () => {
    const fn = await getDescribeGitFetchFailure();
    const exitCode = 1;
    const stderr = "  error: The requested URL returned error: 404  ";
    const expected = `git fetch origin failed (exit ${exitCode}): ${stderr.trim()}`;
    const result = fn(exitCode, stderr);
    expect(result).toBe(expected);
  });

  it("空 stderr の非認証系失敗でも現行と同一", async () => {
    const fn = await getDescribeGitFetchFailure();
    const exitCode = 1;
    const stderr = "";
    const expected = `git fetch origin failed (exit ${exitCode}): ${stderr.trim()}`;
    const result = fn(exitCode, stderr);
    expect(result).toBe(expected);
  });

  it("'network unreachable' は非認証エラー → 現行文字列と同一", async () => {
    const fn = await getDescribeGitFetchFailure();
    const exitCode = 1;
    const stderr = "fatal: unable to connect to github.com: network unreachable";
    const expected = `git fetch origin failed (exit ${exitCode}): ${stderr.trim()}`;
    const result = fn(exitCode, stderr);
    expect(result).toBe(expected);
  });

  it("exit code 2 の非認証エラーで現行文字列と同一", async () => {
    const fn = await getDescribeGitFetchFailure();
    const exitCode = 2;
    const stderr = "error: pathspec 'main' did not match any file(s) known to git";
    const expected = `git fetch origin failed (exit ${exitCode}): ${stderr.trim()}`;
    const result = fn(exitCode, stderr);
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// TC-019: describeGitFetchFailure が各認証パターンを個別に認識する
// ---------------------------------------------------------------------------
describe("TC-019: 各認証パターンを個別に認識する", () => {
  const AUTH_PATTERNS: Array<{ label: string; stderr: string }> = [
    {
      label: "could not read Username",
      stderr: "fatal: could not read Username for 'https://github.com': No such device or address",
    },
    {
      label: "Authentication failed",
      stderr: "remote: Authentication failed for 'https://github.com/'",
    },
    {
      label: "terminal prompts disabled",
      stderr: "fatal: could not read Password: terminal prompts disabled",
    },
    {
      label: "Invalid username or password",
      stderr: "fatal: Invalid username or password.",
    },
  ];

  for (const { label, stderr } of AUTH_PATTERNS) {
    it(`パターン "${label}" が認証エラーとして認識される（第一文に specrunner login）`, async () => {
      const fn = await getDescribeGitFetchFailure();
      const result = fn(128, stderr);
      const firstSentence = result.split(/[.\n]/)[0]!;
      expect(firstSentence).toContain("specrunner login");
      // Original stderr must be preserved in the full message
      expect(result).toContain(stderr.trim());
    });
  }

  it("大文字小文字を問わず認証パターンを認識する（Authentication failed 大文字）", async () => {
    const fn = await getDescribeGitFetchFailure();
    const upperStderr = "AUTHENTICATION FAILED FOR 'https://github.com/'";
    const result = fn(128, upperStderr);
    const firstSentence = result.split(/[.\n]/)[0]!;
    expect(firstSentence).toContain("specrunner login");
  });

  it("大文字小文字を問わず認証パターンを認識する（could not read Username 大文字）", async () => {
    const fn = await getDescribeGitFetchFailure();
    const mixedStderr = "Fatal: Could Not Read Username For 'https://github.com'";
    const result = fn(128, mixedStderr);
    const firstSentence = result.split(/[.\n]/)[0]!;
    expect(firstSentence).toContain("specrunner login");
  });
});
