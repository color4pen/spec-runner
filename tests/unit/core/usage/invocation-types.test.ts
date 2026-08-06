/**
 * Unit tests for CommandInvocation and AgentInvocationMetrics type definitions.
 *
 * TC-016: CommandInvocation 型定義に 4 optional フィールドと doc comment が存在する
 * TC-017: AgentInvocationMetrics 共有型と AgentRunResult.invocationMetrics フィールドの存在
 *
 * These tests verify the type shapes by:
 * 1. Checking that CommandInvocation can be assigned with the 4 new optional fields
 * 2. Checking that AgentInvocationMetrics exists as an independent type
 * 3. Checking that AgentRunResult has invocationMetrics field
 *
 * Since Bun transpiles TypeScript without type checking, these tests use
 * runtime shape validation (creating objects and verifying field access).
 * For strict type enforcement, `bun run typecheck` covers it.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appendInvocation, readUsageFile } from "../../../../src/core/usage/store.js";

// ---------------------------------------------------------------------------
// TC-016: CommandInvocation に 4 optional フィールドが存在する
// ---------------------------------------------------------------------------

describe("TC-016: CommandInvocation 型定義に 4 optional フィールドと doc comment が存在する", () => {
  it("CommandInvocation accepts numTurns as an optional number field", async () => {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `invocation-types-test-${Date.now()}.json`);

    // Create an invocation with numTurns set (the new optional field)
    // If CommandInvocation doesn't have numTurns, TypeScript would reject this
    // but at runtime we verify it round-trips through JSON correctly
    const invocationWithMetrics = {
      command: "job" as const,
      timestamp: new Date().toISOString(),
      modelUsage: null,
      jobId: "type-test-job",
      stepName: "implementer",
      numTurns: 5,
      durationMs: 10000,
      durationApiMs: 8000,
      totalCostUsd: 0.025,
    };

    // TC-016: The type must accept these fields without TypeScript error
    // At runtime: write to file and read back to verify JSON round-trip
    await appendInvocation(filePath, invocationWithMetrics as Parameters<typeof appendInvocation>[1]);

    const usageFile = await readUsageFile(filePath);
    const inv = usageFile.commandInvocations[0]!;

    // The fields must survive JSON round-trip (if type accepts them, they're written)
    // This FAILS until implementation adds numTurns etc. to CommandInvocation
    const invRaw = inv as unknown as Record<string, unknown>;
    expect(invRaw["numTurns"]).toBe(5);
    expect(invRaw["durationMs"]).toBe(10000);
    expect(invRaw["durationApiMs"]).toBe(8000);
    expect(invRaw["totalCostUsd"]).toBe(0.025);

    // Clean up
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it("CommandInvocation without metrics fields still works (optional fields are absent)", async () => {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `invocation-no-metrics-${Date.now()}.json`);

    // A standard invocation without any metrics fields
    const invocationWithoutMetrics = {
      command: "job" as const,
      timestamp: new Date().toISOString(),
      modelUsage: { "claude-opus-4-5": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
      jobId: "type-test-no-metrics",
      stepName: "design",
    };

    await appendInvocation(filePath, invocationWithoutMetrics);

    const usageFile = await readUsageFile(filePath);
    const inv = usageFile.commandInvocations[0]!;

    // Optional fields should be absent (not null or 0)
    const invRaw2 = inv as unknown as Record<string, unknown>;
    expect(invRaw2["numTurns"]).toBeUndefined();
    expect(invRaw2["durationMs"]).toBeUndefined();
    expect(invRaw2["durationApiMs"]).toBeUndefined();
    expect(invRaw2["totalCostUsd"]).toBeUndefined();

    // Clean up
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it("src/core/usage/types.ts file contains the 4 optional fields", () => {
    // Static analysis of the source file
    const typesPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/core/usage/types.ts",
    );
    const content = fs.readFileSync(typesPath, "utf-8");

    // TC-016: The type file must declare these 4 optional fields
    // FAILS until implementation adds them
    expect(content).toContain("numTurns?:");
    expect(content).toContain("durationMs?:");
    expect(content).toContain("durationApiMs?:");
    expect(content).toContain("totalCostUsd?:");
  });

  it("src/core/usage/types.ts has doc comments for the new fields", () => {
    const typesPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/core/usage/types.ts",
    );
    const content = fs.readFileSync(typesPath, "utf-8");

    // TC-016: doc comments must be present (AC #1 explicitly requires them)
    // Check that there are JSDoc-style comments near the field declarations
    // FAILS until implementation adds doc comments
    // The content should reference SDK origin or undefined conditions
    const hasDocComment = content.includes("/** SDK") ||
      content.includes("* SDK") ||
      content.includes("numTurns") && content.includes("num_turns") ||
      content.includes("undefined") && content.includes("numTurns");

    expect(hasDocComment).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-017: AgentInvocationMetrics 共有型と AgentRunResult.invocationMetrics フィールドの存在
// ---------------------------------------------------------------------------

describe("TC-017: AgentInvocationMetrics 共有型と AgentRunResult.invocationMetrics フィールドの存在", () => {
  it("src/core/port/agent-runner.ts declares AgentInvocationMetrics type", () => {
    const portPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/core/port/agent-runner.ts",
    );
    const content = fs.readFileSync(portPath, "utf-8");

    // TC-017: AgentInvocationMetrics must be declared in the port file
    // FAILS until implementation adds the type
    expect(content).toContain("AgentInvocationMetrics");

    // It must have the 4 optional fields
    expect(content).toContain("numTurns?:");
    expect(content).toContain("durationMs?:");
    expect(content).toContain("durationApiMs?:");
    expect(content).toContain("totalCostUsd?:");
  });

  it("src/core/port/agent-runner.ts AgentRunResult has invocationMetrics field", () => {
    const portPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/core/port/agent-runner.ts",
    );
    const content = fs.readFileSync(portPath, "utf-8");

    // TC-017: AgentRunResult must have invocationMetrics field
    // FAILS until implementation adds the field
    expect(content).toContain("invocationMetrics");
  });
});
