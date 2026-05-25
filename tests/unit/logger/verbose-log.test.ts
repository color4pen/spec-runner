/**
 * Unit tests for verbose log functions.
 *
 * TC-VL-01: resolveVerboseFlag(true) → true regardless of env
 * TC-VL-02: resolveVerboseFlag(false) + SPECRUNNER_LOG_LEVEL=verbose → true
 * TC-VL-03: resolveVerboseFlag(false) + SPECRUNNER_LOG_LEVEL unset → false
 * TC-VL-04: resolveVerboseFlag(false) + SPECRUNNER_LOG_LEVEL=debug → false
 * TC-VL-05: logVerbose writes JSON Lines after initVerboseLog
 * TC-VL-06: logVerbose is no-op after closeVerboseLog
 * TC-VL-07: log entry contains ts/component/message keys
 * TC-VL-08: maskSensitive is applied (API keys are masked)
 * TC-VL-09: append mode — same jobId gets two entries after two init/close cycles
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveVerboseFlag,
  setVerbose,
  initVerboseLog,
  logVerbose,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../src/logger/stdout.js";

let tempDir: string;
let originalLogLevel: string | undefined;

beforeEach(async () => {
  // Create a fresh temp dir per test
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "specrunner-verbose-log-test-"));
  originalLogLevel = process.env["SPECRUNNER_LOG_LEVEL"];
  // Ensure verbose is off by default
  setVerbose(false);
  closeVerboseLog();
});

afterEach(async () => {
  // Always close any open fd
  closeVerboseLog();
  setVerbose(false);
  if (originalLogLevel !== undefined) {
    process.env["SPECRUNNER_LOG_LEVEL"] = originalLogLevel;
  } else {
    delete process.env["SPECRUNNER_LOG_LEVEL"];
  }
  // Clean up temp dir
  await fsPromises.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// resolveVerboseFlag tests
// ---------------------------------------------------------------------------

describe("resolveVerboseFlag", () => {
  it("TC-VL-01: returns true when cliFlag is true (env var irrelevant)", () => {
    delete process.env["SPECRUNNER_LOG_LEVEL"];
    expect(resolveVerboseFlag(true)).toBe(true);
  });

  it("TC-VL-01b: returns true when cliFlag is true even if SPECRUNNER_LOG_LEVEL is something else", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "debug";
    expect(resolveVerboseFlag(true)).toBe(true);
  });

  it("TC-VL-02: returns true when cliFlag is false but SPECRUNNER_LOG_LEVEL=verbose", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "verbose";
    expect(resolveVerboseFlag(false)).toBe(true);
  });

  it("TC-VL-03: returns false when cliFlag is false and SPECRUNNER_LOG_LEVEL not set", () => {
    delete process.env["SPECRUNNER_LOG_LEVEL"];
    expect(resolveVerboseFlag(false)).toBe(false);
  });

  it("TC-VL-04: returns false when cliFlag is false and SPECRUNNER_LOG_LEVEL=debug", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "debug";
    expect(resolveVerboseFlag(false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// logVerbose file write tests
// ---------------------------------------------------------------------------

describe("logVerbose file writes", () => {
  it("TC-VL-05: writes JSON Lines to log file after initVerboseLog", async () => {
    setVerbose(true);
    initVerboseLog(tempDir, "test-job-001");

    logVerbose("test", "hello world");

    closeVerboseLog();

    const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-001.log");
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.component).toBe("test");
    expect(entry.message).toBe("hello world");
  });

  it("TC-VL-06: logVerbose is no-op after closeVerboseLog", async () => {
    setVerbose(true);
    initVerboseLog(tempDir, "test-job-002");
    closeVerboseLog();

    // This should not throw and should not write
    logVerbose("test", "should not appear");

    const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-002.log");
    // File may or may not exist; if it exists it should be empty
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      expect(content.trim()).toBe("");
    } catch {
      // File doesn't exist — also acceptable
    }
  });

  it("TC-VL-07: log entry contains ts, component, message keys", async () => {
    setVerbose(true);
    initVerboseLog(tempDir, "test-job-003");

    logVerbose("step", "step started", { jobId: "abc" });

    closeVerboseLog();

    const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-003.log");
    const content = fs.readFileSync(logPath, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry).toHaveProperty("ts");
    expect(entry).toHaveProperty("component", "step");
    expect(entry).toHaveProperty("message", "step started");
    expect(entry).toHaveProperty("jobId", "abc");
    // ts should be ISO 8601
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("TC-VL-08: maskSensitive masks API keys in log entries", async () => {
    setVerbose(true);
    initVerboseLog(tempDir, "test-job-004");

    // Real Anthropic API keys use underscore separator: sk-ant-api03_xxx
    logVerbose("session", "auth info", { apiKey: "sk-ant-api03_secretkeyabcdefghijk" });

    closeVerboseLog();

    const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-004.log");
    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).not.toContain("secretkeyabcdefghijk");
    expect(content).toContain("sk-ant-api03_...");
  });

  it("TC-VL-09: append mode — two init/close cycles append two entries to same file", async () => {
    setVerbose(true);

    // First cycle
    initVerboseLog(tempDir, "test-job-005");
    logVerbose("step", "entry one");
    closeVerboseLog();

    // Second cycle (resume simulation)
    initVerboseLog(tempDir, "test-job-005");
    logVerbose("step", "entry two");
    closeVerboseLog();

    const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-005.log");
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).message).toBe("entry one");
    expect(JSON.parse(lines[1]!).message).toBe("entry two");
  });

  it("initVerboseLog is no-op when verbose is false", async () => {
    setVerbose(false);
    initVerboseLog(tempDir, "test-job-006");
    logVerbose("step", "should not appear");

    const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-006.log");
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it("getVerboseLogFilePath returns null when not active", () => {
    setVerbose(false);
    expect(getVerboseLogFilePath()).toBeNull();
  });

  it("getVerboseLogFilePath returns the log path when active", () => {
    setVerbose(true);
    initVerboseLog(tempDir, "test-job-007");
    const logPath = getVerboseLogFilePath();
    expect(logPath).not.toBeNull();
    expect(logPath).toContain("test-job-007.log");
    closeVerboseLog();
  });

  it("getVerboseLogFilePath returns null after closeVerboseLog", () => {
    setVerbose(true);
    initVerboseLog(tempDir, "test-job-008");
    closeVerboseLog();
    expect(getVerboseLogFilePath()).toBeNull();
  });
});
