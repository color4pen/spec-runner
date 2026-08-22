/**
 * Unit tests for ManagedAgentRunner — contextMetrics unavailability (T-08, TC-011).
 *
 * TC-011: Managed runtime は unavailable — contextMetrics が undefined
 *
 * The managed runtime SessionUsage schema contains only token counts (input / output /
 * cache). It does NOT include context_window size, compaction events, or a per-request
 * active-context breakdown. Therefore contextMetrics is never set in AgentRunResult
 * from the managed adapter, and values are NOT derived from cumulative usage.
 *
 * This test uses static source-code analysis to verify the contract.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("TC-011: ManagedAgentRunner — contextMetrics は unavailable", () => {
  it("managed-agent agent-runner.ts does not import createContextObserver or context-observer", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/managed-agent/agent-runner.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // The managed adapter must NOT import the context observer
    expect(content).not.toMatch(/from\s+["'].*context-observer["']/);
    expect(content).not.toMatch(/createContextObserver/);
    expect(content).not.toMatch(/contextObserver/);
  });

  it("managed-agent agent-runner.ts doc comment acknowledges contextMetrics unavailability", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/managed-agent/agent-runner.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Must have a doc comment explaining why contextMetrics is not set
    expect(content).toMatch(/agent-context-observability/);
    expect(content).toMatch(/contextMetrics.*never set|never set.*contextMetrics/i);
  });

  it("managed-agent agent-runner.ts does not set contextMetrics in any return statement", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/managed-agent/agent-runner.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Must not set contextMetrics in any return value
    expect(content).not.toMatch(/contextMetrics\s*:/);
  });

  it("managed-agent usage.ts doc comment acknowledges contextMetrics unavailability", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/managed-agent/usage.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Must have a doc comment acknowledging that context metrics are not derived from usage
    expect(content).toMatch(/agent-context-observability/);
    expect(content).toMatch(/contextMetrics.*NOT populated|NOT populated.*contextMetrics/i);
  });
});
