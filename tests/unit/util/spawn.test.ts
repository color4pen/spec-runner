/**
 * Unit tests for src/util/spawn.ts — env merge behavior.
 *
 * TC-33: passing opts.env = { GITHUB_TOKEN: "ghp_test" } results in subprocess
 *        seeing both process.env.PATH and the injected GITHUB_TOKEN.
 * TC-34: omitting opts.env leaves subprocess env equal to process.env
 *        (backward compat — specifically PATH is available).
 * TC-35: GITHUB_TOKEN present in process.env is NOT visible in the subprocess
 *        when not explicitly passed via opts.env.
 * TC-36: variable explicitly passed via opts.env IS visible in the subprocess
 *        even if it is on the denylist.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { spawnCommand } from "../../../src/util/spawn.js";

// TC-33
describe("TC-33: spawnCommand with opts.env merges parent env with injected vars", () => {
  it("subprocess sees injected GITHUB_TOKEN and inherited PATH", async () => {
    const result = await spawnCommand(
      "node",
      ["-e", "process.stdout.write(JSON.stringify({ token: process.env.GITHUB_TOKEN || '', path: process.env.PATH || '' }))"],
      {
        cwd: process.cwd(),
        env: { GITHUB_TOKEN: "ghp_test" },
      },
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as { token: string; path: string };
    expect(output.token).toBe("ghp_test");
    // PATH must be inherited from process.env
    expect(output.path).toBe(process.env["PATH"] ?? "");
  });
});

// TC-34
describe("TC-34: spawnCommand without opts.env inherits process.env (backward compat)", () => {
  it("subprocess sees process.env.PATH when opts.env is omitted", async () => {
    const result = await spawnCommand(
      "node",
      ["-e", "process.stdout.write(process.env.PATH || '')"],
      {
        cwd: process.cwd(),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(process.env["PATH"] ?? "");
  });
});

// TC-35
describe("TC-35: spawnCommand strips GITHUB_TOKEN from process.env", () => {
  const originalToken = process.env["GITHUB_TOKEN"];

  beforeEach(() => {
    process.env["GITHUB_TOKEN"] = "ghp_should_be_stripped";
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env["GITHUB_TOKEN"];
    } else {
      process.env["GITHUB_TOKEN"] = originalToken;
    }
  });

  it("subprocess does NOT see GITHUB_TOKEN from process.env", async () => {
    const result = await spawnCommand(
      "node",
      ["-e", "process.stdout.write(process.env.GITHUB_TOKEN || 'not-set')"],
      { cwd: process.cwd() },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("not-set");
  });
});

// TC-36
describe("TC-36: spawnCommand passes opts.env variables even if on denylist", () => {
  it("subprocess sees GITHUB_TOKEN when explicitly passed via opts.env", async () => {
    const result = await spawnCommand(
      "node",
      ["-e", "process.stdout.write(process.env.GITHUB_TOKEN || 'not-set')"],
      {
        cwd: process.cwd(),
        env: { GITHUB_TOKEN: "ghp_explicit" },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ghp_explicit");
  });
});
