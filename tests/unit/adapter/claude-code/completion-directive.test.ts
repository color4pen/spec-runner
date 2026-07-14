/**
 * Unit tests for buildReportToolCompletionDirective (T-01, reduce-added-agent-turns).
 *
 * AC: completion-directive.ts compiles without type errors; function returns a string
 * containing the given MCP tool name.
 */
import { describe, it, expect } from "vitest";
import { buildReportToolCompletionDirective } from "../../../../src/adapter/claude-code/completion-directive.js";

describe("buildReportToolCompletionDirective", () => {
  it("returns a string containing the given MCP tool name", () => {
    const directive = buildReportToolCompletionDirective("mcp__specrunner_report__report_result");
    expect(typeof directive).toBe("string");
    expect(directive).toContain("mcp__specrunner_report__report_result");
  });

  it("instructs the agent to call the tool before ending its turn", () => {
    const directive = buildReportToolCompletionDirective("mcp__specrunner_report__report_result");
    // Directive must contain an imperative instruction
    expect(directive.toLowerCase()).toMatch(/must|required|before ending/i);
  });

  it("works with an arbitrary MCP tool name", () => {
    const directive = buildReportToolCompletionDirective("mcp__custom_server__custom_tool");
    expect(directive).toContain("mcp__custom_server__custom_tool");
  });

  it("returns a non-empty string", () => {
    const directive = buildReportToolCompletionDirective("mcp__specrunner_report__report_result");
    expect(directive.trim().length).toBeGreaterThan(0);
  });
});
