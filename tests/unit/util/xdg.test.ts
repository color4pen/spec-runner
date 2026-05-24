/**
 * Unit tests for XDG state dir helpers.
 *
 * TC-XDG-01: resolveXdgStateDir returns XDG_STATE_HOME when set
 * TC-XDG-02: resolveXdgStateDir returns ~/.local/state when XDG_STATE_HOME not set
 * TC-XDG-03: getVerboseLogDir returns <stateDir>/specrunner/logs
 * TC-XDG-04: getVerboseLogPath returns <logDir>/<jobId>.log
 * TC-XDG-10: setJobsLocation("project", repoRoot) → getJobsDir() returns <repoRoot>/.specrunner/jobs
 * TC-XDG-11: setJobsLocation("project", repoRoot) → getJobStatePath() returns project-local path
 * TC-XDG-12: setJobsLocation("project", repoRoot) → getVerboseLogDir() returns <repoRoot>/.specrunner/logs
 * TC-XDG-13: setJobsLocation("xdg") after project mode → reverts to XDG path
 * TC-XDG-14: resetJobsLocation() → reverts to XDG default
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveXdgStateDir,
  getVerboseLogDir,
  getVerboseLogPath,
  getJobsDir,
  getJobStatePath,
  setJobsLocation,
  resetJobsLocation,
} from "../../../src/util/xdg.js";

let originalXdgStateHome: string | undefined;

beforeEach(() => {
  originalXdgStateHome = process.env["XDG_STATE_HOME"];
});

afterEach(() => {
  if (originalXdgStateHome !== undefined) {
    process.env["XDG_STATE_HOME"] = originalXdgStateHome;
  } else {
    delete process.env["XDG_STATE_HOME"];
  }
  // Reset module state after each test to prevent cross-test contamination
  resetJobsLocation();
});

describe("resolveXdgStateDir", () => {
  it("TC-XDG-01: returns XDG_STATE_HOME when set", () => {
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(resolveXdgStateDir()).toBe("/custom/state");
  });

  it("TC-XDG-02: returns ~/.local/state when XDG_STATE_HOME is not set", () => {
    delete process.env["XDG_STATE_HOME"];
    expect(resolveXdgStateDir()).toBe(path.join(os.homedir(), ".local", "state"));
  });

  it("returns ~/.local/state when XDG_STATE_HOME is empty string", () => {
    process.env["XDG_STATE_HOME"] = "";
    expect(resolveXdgStateDir()).toBe(path.join(os.homedir(), ".local", "state"));
  });
});

describe("getVerboseLogDir", () => {
  it("TC-XDG-03: returns <stateDir>/specrunner/logs (XDG mode)", () => {
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(getVerboseLogDir()).toBe("/custom/state/specrunner/logs");
  });
});

describe("getVerboseLogPath", () => {
  it("TC-XDG-04: returns <logDir>/<jobId>.log", () => {
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(getVerboseLogPath("job-abc-123")).toBe("/custom/state/specrunner/logs/job-abc-123.log");
  });
});

describe("project mode via setJobsLocation", () => {
  it("TC-XDG-10: setJobsLocation('project', repoRoot) → getJobsDir() returns <repoRoot>/.specrunner/jobs", () => {
    setJobsLocation("project", "~/myrepo");
    expect(getJobsDir()).toBe("~/myrepo/.specrunner/jobs");
  });

  it("TC-XDG-11: setJobsLocation('project', repoRoot) → getJobStatePath() returns project-local path", () => {
    setJobsLocation("project", "~/myrepo");
    expect(getJobStatePath("abc")).toBe("~/myrepo/.specrunner/jobs/abc.json");
  });

  it("TC-XDG-12: setJobsLocation('project', repoRoot) → getVerboseLogDir() returns <repoRoot>/.specrunner/logs", () => {
    setJobsLocation("project", "~/myrepo");
    expect(getVerboseLogDir()).toBe("~/myrepo/.specrunner/logs");
  });

  it("TC-XDG-13: setJobsLocation('xdg') after project mode → reverts to XDG path", () => {
    setJobsLocation("project", "~/myrepo");
    setJobsLocation("xdg");
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(getVerboseLogDir()).toBe("/custom/state/specrunner/logs");
  });

  it("TC-XDG-14: resetJobsLocation() → reverts to XDG default", () => {
    setJobsLocation("project", "~/myrepo");
    resetJobsLocation();
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(getJobsDir()).not.toContain(".specrunner");
    expect(getVerboseLogDir()).toBe("/custom/state/specrunner/logs");
  });

  it("setJobsLocation without projectRoot in project mode → falls back to XDG", () => {
    // When repoRoot is not provided, projectRoot is null → XDG path is used
    setJobsLocation("project");
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(getVerboseLogDir()).toBe("/custom/state/specrunner/logs");
  });
});
