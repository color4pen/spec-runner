/**
 * Unit tests for run.ts pipeline wiring.
 *
 * TC-025: Pipeline steps Map — pr-create が登録されている
 * TC-026: AgentRegistry — pr-create が登録されない
 */
import { describe, it, expect, vi } from "vitest";

// TC-025: Pipeline steps Map — pr-create が登録されている
describe("TC-025: Pipeline steps Map — pr-create が登録されている", () => {
  it("steps Map contains 9 entries including pr-create", async () => {
    // Read run.ts source to verify pr-create is in the steps Map
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../../../../src/core/pipeline/run.ts", import.meta.url).pathname,
      "utf-8",
    );

    // Verify pr-create is included in the steps Map (via STEP_NAMES constant)
    expect(source).toContain('STEP_NAMES.PR_CREATE');
    expect(source).toContain("PrCreateStep");

    // Count entries in the steps Map by counting [STEP_NAMES.*, Step] patterns
    const mapEntries = source.match(/\[STEP_NAMES\.\w+,\s+\w+Step\]/g);
    expect(mapEntries).not.toBeNull();
    expect(mapEntries!.length).toBeGreaterThanOrEqual(9);
  });
});

// TC-026: AgentRegistry — pr-create が登録されない
describe("TC-026: AgentRegistry — pr-create が登録されない", () => {
  it("managed.ts AgentRegistry.fromSteps does not include PrCreateStep", async () => {
    const fs = await import("node:fs/promises");
    const managedSource = await fs.readFile(
      new URL("../../../../src/cli/managed.ts", import.meta.url).pathname,
      "utf-8",
    );

    // PrCreateStep should NOT be in the fromSteps call in managed.ts
    const fromStepsMatch = /AgentRegistry\.fromSteps\(\[([^\]]+)\]\)/.exec(managedSource);
    expect(fromStepsMatch).not.toBeNull();
    const fromStepsContent = fromStepsMatch![1]!;
    expect(fromStepsContent).not.toContain("PrCreateStep");
  });
});
