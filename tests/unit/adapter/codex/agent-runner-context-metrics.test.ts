/**
 * Unit tests for CodexAgentRunner — contextMetrics unavailability (T-08, TC-011).
 *
 * TC-011: Codex runtime は unavailable — contextMetrics が undefined
 *
 * Codex SDK's Usage type does not expose per-request context window size,
 * compaction events, or context-limit exhaustion errors. Therefore contextMetrics
 * is never set in AgentRunResult from the Codex adapter.
 *
 * This test uses static source-code analysis to verify the contract, supplemented
 * by a structural check that the adapter does not import context-observer.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("TC-011: CodexAgentRunner — contextMetrics は unavailable", () => {
  it("codex agent-runner.ts does not import createContextObserver or context-observer", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/codex/agent-runner.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // The Codex adapter must NOT import the context observer (it does not observe context metrics)
    expect(content).not.toMatch(/from\s+["'].*context-observer["']/);
    expect(content).not.toMatch(/createContextObserver/);
    expect(content).not.toMatch(/contextObserver/);
  });

  it("codex agent-runner.ts doc comment acknowledges contextMetrics unavailability", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/codex/agent-runner.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Must have a doc comment explaining why contextMetrics is not set
    // (agent-context-observability keyword in the header)
    expect(content).toMatch(/agent-context-observability/);
    expect(content).toMatch(/contextMetrics.*never set|never set.*contextMetrics/i);
  });

  it("codex agent-runner.ts does not set contextMetrics in any return statement", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/codex/agent-runner.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Must not set contextMetrics in any return value
    expect(content).not.toMatch(/contextMetrics\s*:/);
  });
});
