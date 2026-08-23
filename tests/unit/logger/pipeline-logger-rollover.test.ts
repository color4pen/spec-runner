/**
 * Unit tests for PipelineLogger — step:rollover JSONL write (TC-029).
 *
 * TC-029: PipelineLogger.subscribe が step:rollover イベントを受け取り
 *         JSONL ファイルへ正しいフィールドで書き出す
 *
 * Rationale: pipeline-logger.ts の step:rollover ハンドラ（4 行）は実装済みだが
 * 専用 unit test が存在しなかった。本ファイルはそのギャップを埋める。
 *
 * Source: tasks.md TC-029 (should 優先度)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PipelineLogger } from "../../../src/logger/pipeline-logger.js";
import { EventBus } from "../../../src/core/event/event-bus.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "pipeline-logger-rollover-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsPromises.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonLines(logPath: string): Record<string, unknown>[] {
  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; }
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// TC-029: step:rollover → JSONL に書き出される
// ---------------------------------------------------------------------------

describe("TC-029: PipelineLogger が step:rollover イベントを JSONL に書き出す", () => {
  it("step:rollover event results in a JSONL line with correct type and payload fields", () => {
    const logPath = path.join(tempDir, "pipeline-rollover.jsonl");
    const logger = new PipelineLogger(logPath);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("step:rollover", {
      step: "implementer",
      attempt: 1,
      maxRollovers: 2,
      reason: "context-exhaustion",
    });

    logger.close();

    const lines = readJsonLines(logPath);
    const rolloverLine = lines.find((l) => l["type"] === "step:rollover");

    expect(rolloverLine).toBeDefined();
    expect(rolloverLine!["step"]).toBe("implementer");
    expect(rolloverLine!["attempt"]).toBe(1);
    expect(rolloverLine!["maxRollovers"]).toBe(2);
    expect(rolloverLine!["reason"]).toBe("context-exhaustion");
  });

  it("step:rollover JSONL line contains a valid ISO 8601 ts field", () => {
    const logPath = path.join(tempDir, "pipeline-rollover-ts.jsonl");
    const logger = new PipelineLogger(logPath);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("step:rollover", {
      step: "spec-review",
      attempt: 2,
      maxRollovers: 3,
      reason: "context-exhaustion",
    });

    logger.close();

    const lines = readJsonLines(logPath);
    const rolloverLine = lines.find((l) => l["type"] === "step:rollover");

    expect(rolloverLine).toBeDefined();
    expect(typeof rolloverLine!["ts"]).toBe("string");
    expect(rolloverLine!["ts"] as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("multiple step:rollover events each produce a separate JSONL line", () => {
    const logPath = path.join(tempDir, "pipeline-rollover-multi.jsonl");
    const logger = new PipelineLogger(logPath);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("step:rollover", {
      step: "implementer",
      attempt: 1,
      maxRollovers: 2,
      reason: "context-exhaustion",
    });

    events.emit("step:rollover", {
      step: "implementer",
      attempt: 2,
      maxRollovers: 2,
      reason: "context-exhaustion",
    });

    logger.close();

    const lines = readJsonLines(logPath);
    const rolloverLines = lines.filter((l) => l["type"] === "step:rollover");

    expect(rolloverLines).toHaveLength(2);
    expect(rolloverLines[0]!["attempt"]).toBe(1);
    expect(rolloverLines[1]!["attempt"]).toBe(2);
  });

  it("step:rollover is written independently from other event types (no cross-contamination)", () => {
    const logPath = path.join(tempDir, "pipeline-rollover-mixed.jsonl");
    const logger = new PipelineLogger(logPath);
    const events = new EventBus();
    logger.subscribe(events);

    events.emit("step:retry", {
      step: "implementer",
      attempt: 1,
      maxRetries: 3,
      delayMs: 1000,
    });

    events.emit("step:rollover", {
      step: "implementer",
      attempt: 1,
      maxRollovers: 1,
      reason: "context-exhaustion",
    });

    logger.close();

    const lines = readJsonLines(logPath);
    const retryLines = lines.filter((l) => l["type"] === "step:retry");
    const rolloverLines = lines.filter((l) => l["type"] === "step:rollover");

    // Both event types should produce their own JSONL lines
    expect(retryLines).toHaveLength(1);
    expect(rolloverLines).toHaveLength(1);
    // Fields are separate — rollover line has maxRollovers, retry line has maxRetries
    expect(rolloverLines[0]!["maxRollovers"]).toBe(1);
    expect(retryLines[0]!["maxRetries"]).toBe(3);
  });
});
