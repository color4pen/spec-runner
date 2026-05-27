/**
 * Verbose log instrumentation tests for runSseStream (SSE stream).
 *
 * TC-07-01: runSseStream で status_idle (end_turn) event 受信 → ログに "status_idle event" エントリ
 * TC-07-02: runSseStream で session_error event 受信 → ログに "session_error event" エントリ + errorType フィールド
 */

// vi.mock is hoisted before imports — sdk/sessions.js gets mocked before sse-stream.ts loads it.
vi.mock("../../../../src/adapter/managed-agent/sdk/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../../../src/adapter/managed-agent/sdk/sessions.js")>(
    "../../../../src/adapter/managed-agent/sdk/sessions.js",
  );
  return {
    ...actual,
    streamEvents: vi.fn(),
    sendEvents: vi.fn(),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type Anthropic from "@anthropic-ai/sdk";
import { streamEvents } from "../../../../src/adapter/managed-agent/sdk/sessions.js";
import { runSseStream } from "../../../../src/adapter/managed-agent/sse-stream.js";
import {
  setLogLevel,
  initVerboseLog,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../../src/logger/stdout.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sse-verbose-log-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fsPromises.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function readLogEntries(logPath: string): Record<string, unknown>[] {
  closeVerboseLog();
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function makeDeps(overrides: Partial<Parameters<typeof runSseStream>[0]> = {}): Parameters<typeof runSseStream>[0] {
  return {
    client: {} as unknown as Anthropic,
    sessionId: "test-session-id",
    requestContent: "request content",
    slug: "test-slug",
    branch: "feat/test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-07-01: status_idle (end_turn) event → "status_idle event" がログに記録される
// ---------------------------------------------------------------------------

describe("TC-07-01: runSseStream — logs 'status_idle event' on end_turn", () => {
  it("status_idle(end_turn) event 受信後、ログに 'status_idle event' エントリが書き出される", async () => {
    const jobId = "tc07-01-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    // streamEvents returns an async generator that yields a single status_idle/end_turn event
    vi.mocked(streamEvents).mockResolvedValue(
      (async function* () {
        yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
      })() as unknown as Awaited<ReturnType<typeof streamEvents>>,
    );

    await runSseStream(makeDeps());

    const entries = readLogEntries(logPath);
    const idleEntry = entries.find((e) => e["message"] === "status_idle event");
    expect(idleEntry).toBeDefined();
    expect(idleEntry!["component"]).toBe("sse");
    expect(idleEntry!["stopReason"]).toBe("end_turn");
  });
});

// ---------------------------------------------------------------------------
// TC-07-02: session_error event → "session_error event" エントリ + errorType フィールド
// ---------------------------------------------------------------------------

describe("TC-07-02: runSseStream — logs 'session_error event' with errorType on terminal error", () => {
  it("session_error(terminal) event 受信後、ログに component='sse' かつ errorType フィールドを持つエントリが書き出される", async () => {
    const jobId = "tc07-02-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    // streamEvents returns a session_error event with terminal retry_status
    vi.mocked(streamEvents).mockResolvedValue(
      (async function* () {
        yield {
          type: "session.error",
          error: {
            type: "overloaded_error",
            retry_status: { type: "terminal" },
          },
        };
      })() as unknown as Awaited<ReturnType<typeof streamEvents>>,
    );

    await runSseStream(makeDeps());

    const entries = readLogEntries(logPath);
    const errorEntry = entries.find((e) => e["message"] === "session_error event");
    expect(errorEntry).toBeDefined();
    expect(errorEntry!["component"]).toBe("sse");
    expect(typeof errorEntry!["errorType"]).toBe("string");
  });
});
