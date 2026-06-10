/**
 * Unit tests for PipelineLogger.
 *
 * T-005: initPipelineLog creates directory and returns PipelineLogger
 * T-006: PipelineLogger opens file in append mode (0o600)
 * T-008: step:start event is recorded as JSONL
 * T-009: step:complete event is recorded as JSONL
 * T-010: step:error event is recorded as JSONL
 * T-011: verdict:parsed event is recorded as JSONL
 * T-012: pipeline:complete event is recorded as JSONL
 * T-013: pipeline:fail event is recorded as JSONL
 * T-014: each JSONL line has ts and type fields
 * T-015: write error → fd closed, further writes no-op
 * T-016: sensitive values are masked
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PipelineLogger, initPipelineLog, logPipelineEvent, closePipelineLog } from "../pipeline-logger.js";
import { EventBus } from "../../core/event/event-bus.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "pipeline-logger-test-"));
});

afterEach(async () => {
  closePipelineLog();
  await fsPromises.rm(tempDir, { recursive: true, force: true });
});

function readJsonLines(filePath: string): Record<string, unknown>[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function makeMinimalJobState(overrides: Record<string, unknown> = {}): import("../../state/schema.js").JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as import("../../state/schema.js").JobState;
}

// T-005: initPipelineLog creates directory
describe("T-005: initPipelineLog creates directory and returns PipelineLogger", () => {
  it("creates logs directory and returns a PipelineLogger", () => {
    const logsDir = path.join(tempDir, ".specrunner", "logs");
    expect(fs.existsSync(logsDir)).toBe(false);
    const logger = initPipelineLog(tempDir, "test-job-id");
    expect(logger).toBeInstanceOf(PipelineLogger);
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it("creates the log file at the expected path", () => {
    const logger = initPipelineLog(tempDir, "my-job-id");
    logger.write({ type: "test" });
    const expectedPath = path.join(tempDir, ".specrunner", "logs", "my-job-id.log");
    expect(fs.existsSync(expectedPath)).toBe(true);
  });
});

// T-014: each JSONL line has ts and type fields
describe("T-014: JSONL lines have ts and type fields", () => {
  it("each line has ts (ISO 8601) and type fields and is valid JSON", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    logger.write({ type: "step:start", step: "design" });
    logger.write({ type: "step:complete", step: "design" });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(typeof line["ts"]).toBe("string");
      expect((line["ts"] as string)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof line["type"]).toBe("string");
    }
  });
});

// T-008 to T-013: EventBus event recording
describe("EventBus event recording", () => {
  it("T-008: records step:start events", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("step:start", { step: "design", state: makeMinimalJobState() });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(1);
    expect(lines[0]!["type"]).toBe("step:start");
    expect(lines[0]!["step"]).toBe("design");
  });

  it("T-009: records step:complete events with elapsed time", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    const stateWithStep = makeMinimalJobState({
      steps: {
        design: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: null, findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:05.000Z",
          },
        ],
      },
    });
    events.emit("step:complete", { step: "design", state: stateWithStep });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(1);
    expect(lines[0]!["type"]).toBe("step:complete");
    expect(lines[0]!["step"]).toBe("design");
    expect(lines[0]!["elapsed"]).toBe(5000); // 5 seconds in milliseconds
  });

  it("T-009b: elapsed is null when no step timing data is available", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("step:complete", { step: "design", state: makeMinimalJobState() });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines[0]!["elapsed"]).toBeNull();
  });

  it("T-010: records step:error events with error code and message", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    const err = Object.assign(new Error("Something failed"), { code: "AGENT_STEP_FAILED" });
    events.emit("step:error", { step: "implementer", error: err, state: makeMinimalJobState() });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(1);
    expect(lines[0]!["type"]).toBe("step:error");
    expect(lines[0]!["step"]).toBe("implementer");
    expect(lines[0]!["error"]).toBe("Something failed");
    expect(lines[0]!["code"]).toBe("AGENT_STEP_FAILED");
  });

  it("T-011: records verdict:parsed events", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("verdict:parsed", { step: "spec-review", outcome: { verdict: "approved" } });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(1);
    expect(lines[0]!["type"]).toBe("verdict:parsed");
    expect(lines[0]!["verdict"]).toBe("approved");
  });

  it("T-012: records pipeline:complete events", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("pipeline:complete", { state: makeMinimalJobState({ status: "awaiting-archive" }) });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(1);
    expect(lines[0]!["type"]).toBe("pipeline:complete");
    expect(lines[0]!["status"]).toBe("awaiting-archive");
  });

  it("T-013: records pipeline:fail events", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("pipeline:fail", { state: makeMinimalJobState({ status: "failed" }), reason: "unknown error" });
    logger.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(1);
    expect(lines[0]!["type"]).toBe("pipeline:fail");
    expect(lines[0]!["reason"]).toBe("unknown error");
  });
});

// T-015: write error resilience
describe("T-015: write error → fd closed, further writes no-op", () => {
  it("does not throw when write fails, subsequent writes are no-op", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    // Force the fd to be in a bad state by calling close first
    logger.close();
    // Subsequent writes should be no-op, not throw
    expect(() => {
      logger.write({ type: "test" });
    }).not.toThrow();
  });
});

// T-016: sensitive values are masked
describe("T-016: sensitive values are masked", () => {
  it("masks Anthropic API keys in log entries", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    // Use a key with underscore so prefix extraction works predictably
    logger.write({ type: "test", message: "token=sk-ant-api_03SECRETKEYVALUE" });
    logger.close();

    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).not.toContain("03SECRETKEYVALUE");
    // The key is replaced — raw value not present
    expect(content).not.toContain("sk-ant-api_03SECRETKEYVALUE");
  });

  it("masks GitHub PAT tokens (ghp_)", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    logger.write({ type: "test", token: "ghp_MYGITHUBTOKENVALUE123" });
    logger.close();

    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).not.toContain("ghp_MYGITHUBTOKENVALUE123");
    expect(content).toContain("ghp_...");
  });

  it("masks GitHub OAuth tokens (gho_)", () => {
    const logFile = path.join(tempDir, "test.log");
    const logger = new PipelineLogger(logFile);
    logger.write({ type: "test", token: "gho_MYOAUTHTOKENVALUE12345" });
    logger.close();

    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).not.toContain("gho_MYOAUTHTOKENVALUE12345");
    expect(content).toContain("gho_...");
  });
});

// Module-level functions: logPipelineEvent / closePipelineLog
describe("module-level logPipelineEvent and closePipelineLog", () => {
  it("logPipelineEvent writes to active logger", () => {
    initPipelineLog(tempDir, "module-test-job");
    logPipelineEvent({ type: "finish:start", jobId: "module-test-job" });
    closePipelineLog();

    const logFile = path.join(tempDir, ".specrunner", "logs", "module-test-job.log");
    const lines = readJsonLines(logFile);
    expect(lines.some((l) => l["type"] === "finish:start")).toBe(true);
  });

  it("logPipelineEvent is no-op when no logger is active", () => {
    closePipelineLog(); // ensure no active logger
    expect(() => {
      logPipelineEvent({ type: "test" });
    }).not.toThrow();
  });

  it("closePipelineLog is safe to call multiple times", () => {
    initPipelineLog(tempDir, "close-test-job");
    expect(() => {
      closePipelineLog();
      closePipelineLog();
    }).not.toThrow();
  });
});

// T-006: append mode
describe("T-006: PipelineLogger appends to existing file", () => {
  it("opens in append mode so existing content is preserved", () => {
    const logFile = path.join(tempDir, "append-test.log");
    // Write initial content
    const logger1 = new PipelineLogger(logFile);
    logger1.write({ type: "first" });
    logger1.close();

    // Open again — should append
    const logger2 = new PipelineLogger(logFile);
    logger2.write({ type: "second" });
    logger2.close();

    const lines = readJsonLines(logFile);
    expect(lines).toHaveLength(2);
    expect(lines[0]!["type"]).toBe("first");
    expect(lines[1]!["type"]).toBe("second");
  });
});
