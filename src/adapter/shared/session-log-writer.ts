/**
 * SessionLogWriter: JSONL writer for agent session logs (provider-neutral).
 *
 * Design: one SessionLogWriter per step execution.
 * Writes each SDK message as a JSONL line to <agentLogDir>/<stepName>-<attempt>.jsonl.
 * A final summary line is written after the query completes with session ID, model, and token usage.
 *
 * Sensitive values are masked via maskSensitive() before writing (MUST).
 * On write failure, fd is closed and further writes become no-op (pipeline must not be blocked).
 *
 * The file is opened in write mode (not append) — each step/attempt produces a fresh file.
 * Mode 0o600 — agent logs may contain source code and secrets via tool_result.
 */
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { maskSensitive } from "../../logger/stdout.js";
import type { ModelUsage } from "../../core/port/agent-runner.js";

export class SessionLogWriter {
  private fd: number | null;

  /**
   * Open a session log file at the given path.
   * Creates intermediate directories with mode 0o700 (recursive).
   *
   * @param logPath - Absolute path to the JSONL session log file.
   */
  constructor(logPath: string) {
    try {
      mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
      this.fd = openSync(logPath, "w", 0o600);
    } catch {
      this.fd = null;
    }
  }

  /**
   * Write a single JSONL line to the session log.
   * Masks sensitive values before writing.
   * On write failure, closes fd and becomes no-op.
   */
  write(entry: Record<string, unknown>): void {
    if (this.fd === null) return;
    const fd = this.fd;
    try {
      const line = maskSensitive(JSON.stringify({ ts: new Date().toISOString(), ...entry })) + "\n";
      writeSync(fd, line);
    } catch {
      try { closeSync(fd); } catch { /* ignore */ }
      this.fd = null;
    }
  }

  /**
   * Write a summary entry at the end of the session.
   * Records session ID, model, and token usage.
   */
  writeSummary(summary: {
    sessionId?: string;
    model?: string;
    modelUsage?: Record<string, ModelUsage>;
  }): void {
    this.write({
      type: "session:summary",
      sessionId: summary.sessionId ?? null,
      model: summary.model ?? null,
      modelUsage: summary.modelUsage ?? null,
    });
  }

  /**
   * Close the file descriptor.
   * Safe to call multiple times.
   */
  close(): void {
    if (this.fd !== null) {
      const fd = this.fd;
      this.fd = null;
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}
