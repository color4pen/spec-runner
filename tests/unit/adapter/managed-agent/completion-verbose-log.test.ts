/**
 * Verbose log instrumentation tests for pollUntilComplete.
 *
 * TC-08-01: pollUntilComplete の poll 試行 → ログに "poll attempt" + intervalMs + sessionStatus
 */

// vi.mock is hoisted before imports — sdk/sessions.js gets mocked before completion.ts loads it.
vi.mock("../../../../src/adapter/managed-agent/sdk/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../../../src/adapter/managed-agent/sdk/sessions.js")>(
    "../../../../src/adapter/managed-agent/sdk/sessions.js",
  );
  return {
    ...actual,
    retrieveSession: vi.fn(),
    listEvents: vi.fn(),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type Anthropic from "@anthropic-ai/sdk";
import { retrieveSession, listEvents } from "../../../../src/adapter/managed-agent/sdk/sessions.js";
import { pollUntilComplete } from "../../../../src/adapter/managed-agent/completion.js";
import {
  setLogLevel,
  initVerboseLog,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../../src/logger/stdout.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "completion-verbose-log-test-"));
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

// ---------------------------------------------------------------------------
// TC-08-01: pollUntilComplete — "poll attempt" + intervalMs + sessionStatus がログに記録される
// ---------------------------------------------------------------------------

describe("TC-08-01: pollUntilComplete — logs 'poll attempt' with intervalMs and sessionStatus", () => {
  it("ポーリング試行ごとに 'poll attempt' エントリと intervalMs・sessionStatus フィールドがログに書き出される", async () => {
    const jobId = "tc08-01-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    // First poll returns "running", second returns "idle" → loop completes
    vi.mocked(retrieveSession)
      .mockResolvedValueOnce({ status: "running" } as unknown as Awaited<ReturnType<typeof retrieveSession>>)
      .mockResolvedValueOnce({ status: "idle" } as unknown as Awaited<ReturnType<typeof retrieveSession>>);

    // listEvents returns an async iterable that yields a single idle/end_turn event
    vi.mocked(listEvents).mockResolvedValue(
      (async function* () {
        yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
      })() as unknown as Awaited<ReturnType<typeof listEvents>>,
    );

    await pollUntilComplete(
      {} as unknown as Anthropic,
      "tc08-01-session",
      undefined,
      { sleepFn: async () => {} },
    );

    const entries = readLogEntries(logPath);
    const pollEntry = entries.find((e) => e["message"] === "poll attempt");
    expect(pollEntry).toBeDefined();
    expect(typeof pollEntry!["intervalMs"]).toBe("number");
    expect(typeof pollEntry!["sessionStatus"]).toBe("string");
  });
});
