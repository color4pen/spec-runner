/**
 * Unit tests for XDG state dir helpers.
 *
 * TC-XDG-01: resolveXdgStateDir returns XDG_STATE_HOME when set
 * TC-XDG-02: resolveXdgStateDir returns ~/.local/state when XDG_STATE_HOME not set
 * TC-XDG-03: getVerboseLogDir returns <stateDir>/specrunner/logs
 * TC-XDG-04: getVerboseLogPath returns <logDir>/<jobId>.log
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { resolveXdgStateDir, getVerboseLogDir, getVerboseLogPath } from "../../../src/util/xdg.js";

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
  it("TC-XDG-03: returns <stateDir>/specrunner/logs", () => {
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
