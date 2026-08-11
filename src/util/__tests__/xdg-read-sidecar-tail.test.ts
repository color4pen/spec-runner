/**
 * Coverage tests for readDetachLogTail() and readSidecarPid() in src/util/xdg.ts.
 * These functions are always injected in detach tests; this file exercises the real
 * implementations to satisfy changed-line-coverage.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readDetachLogTail, readSidecarPid } from "../xdg.js";

// ---------------------------------------------------------------------------
// readDetachLogTail
// ---------------------------------------------------------------------------

describe("readDetachLogTail", () => {
  it("returns the last N lines of the file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-tail-"));
    const logPath = path.join(tmp, "test.log");
    fs.writeFileSync(logPath, "line1\nline2\nline3");
    const result = readDetachLogTail(logPath, 2);
    expect(result).toBe("line2\nline3");
    fs.rmSync(tmp, { recursive: true });
  });

  it("returns all lines when N >= line count", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-tail-"));
    const logPath = path.join(tmp, "test.log");
    fs.writeFileSync(logPath, "only\nthis");
    const result = readDetachLogTail(logPath, 100);
    expect(result).toBe("only\nthis");
    fs.rmSync(tmp, { recursive: true });
  });

  it("returns empty string when file does not exist", () => {
    const result = readDetachLogTail("/nonexistent/path/file.log", 40);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// readSidecarPid
// ---------------------------------------------------------------------------

describe("readSidecarPid", () => {
  it("returns the numeric pid from the sidecar", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-sidecar-"));
    const slug = "test-slug";
    const sidecarDir = path.join(tmp, ".specrunner", "local", slug);
    fs.mkdirSync(sidecarDir, { recursive: true });
    fs.writeFileSync(path.join(sidecarDir, "liveness.json"), JSON.stringify({ pid: 12345, session: "s1" }));
    const result = readSidecarPid(tmp, slug);
    expect(result).toBe(12345);
    fs.rmSync(tmp, { recursive: true });
  });

  it("returns null when pid field is not a number", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-sidecar-"));
    const slug = "test-slug";
    const sidecarDir = path.join(tmp, ".specrunner", "local", slug);
    fs.mkdirSync(sidecarDir, { recursive: true });
    fs.writeFileSync(path.join(sidecarDir, "liveness.json"), JSON.stringify({ pid: "not-a-number" }));
    const result = readSidecarPid(tmp, slug);
    expect(result).toBeNull();
    fs.rmSync(tmp, { recursive: true });
  });

  it("returns null when sidecar file does not exist", () => {
    const result = readSidecarPid("/nonexistent/repo", "some-slug");
    expect(result).toBeNull();
  });
});
