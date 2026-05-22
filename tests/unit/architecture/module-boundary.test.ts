/**
 * Architecture regression tests: core layer boundary violations.
 *
 * These tests guard against re-introducing the violations fixed in core-layer-boundary-fix:
 * - core/request/ must not import from cli/ (ProgressDisplay, etc.)
 * - core/request/ must not import from adapter/ (concrete implementations)
 * - core/request/ must not import @anthropic-ai/claude-agent-sdk directly
 *
 * Scope: core/request/ only.
 * core/runtime/ has separate violations tracked in a dedicated issue
 * (the module-boundary spec's stale grep pattern does not cover claude-agent-sdk yet).
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

/**
 * Run grep and return matched lines, or empty string if no matches.
 * Throws on grep error (exit code > 1 means a real error, not "no matches").
 */
function grepImports(pattern: string, dir: string): string {
  try {
    return execSync(`grep -rn ${pattern} ${dir}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    // grep exits with code 1 when no matches — that's our success case
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return "";
    throw err;
  }
}

function grepImportsE(pattern: string, dir: string): string {
  try {
    return execSync(`grep -rE ${pattern} ${dir}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return "";
    throw err;
  }
}

describe("architecture: core/request must not import from cli/", () => {
  it('grep -rn "cli/" src/core/request returns 0 matches', () => {
    const result = grepImports('"cli/"', "src/core/request");
    expect(result).toBe("");
  });
});

describe("architecture: core/request must not import @anthropic-ai/claude-agent-sdk", () => {
  it('grep -rn "@anthropic-ai/claude-agent-sdk" src/core/request returns 0 matches', () => {
    const result = grepImports('"@anthropic-ai/claude-agent-sdk"', "src/core/request");
    expect(result).toBe("");
  });
});

describe("architecture: core/request must not import from adapter/ (baseline scenario scoped)", () => {
  it("grep -rE adapter/ src/core/request returns 0 matches", () => {
    const result = grepImportsE(
      "\"from ['\\\"](\\.\\./)*adapter/\"",
      "src/core/request",
    );
    expect(result).toBe("");
  });
});
