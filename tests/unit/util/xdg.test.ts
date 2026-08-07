/**
 * Unit tests for XDG state dir helpers.
 *
 * TC-XDG-01: resolveXdgStateDir returns XDG_STATE_HOME when set
 * TC-XDG-02: resolveXdgStateDir returns ~/.local/state when XDG_STATE_HOME not set
 * TC-XDG-03: getVerboseLogDir(repoRoot) returns <repoRoot>/.specrunner/logs
 * TC-XDG-04: getVerboseLogPath(repoRoot, jobId) returns <repoRoot>/.specrunner/logs/<jobId>.log
 */
import { describe, it, expect } from "vitest";
import {
  getVerboseLogDir,
  getVerboseLogPath,
} from "../../../src/util/xdg.js";

describe("getVerboseLogDir", () => {
  it("TC-XDG-03: returns <repoRoot>/.specrunner/logs", () => {
    expect(getVerboseLogDir("~/myrepo")).toBe("~/myrepo/.specrunner/logs");
  });
});

describe("getVerboseLogPath", () => {
  it("TC-XDG-04: returns <repoRoot>/.specrunner/logs/<jobId>.log", () => {
    expect(getVerboseLogPath("~/myrepo", "job-abc-123")).toBe(
      "~/myrepo/.specrunner/logs/job-abc-123.log",
    );
  });
});
