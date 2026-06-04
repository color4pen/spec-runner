/**
 * Unit tests for run.ts pipeline wiring.
 *
 * TC-025: Pipeline steps Map — pr-create が登録されている
 * TC-026: AgentRegistry — pr-create が登録されない
 */
import { describe, it, expect, vi } from "vitest";

// TC-025: Pipeline steps Map — pr-create が登録されている
describe("TC-025: Pipeline steps Map — pr-create が登録されている", () => {
  it("STANDARD_DESCRIPTOR has at least 9 steps including pr-create", async () => {
    const { STANDARD_DESCRIPTOR } = await import("../../../../src/core/pipeline/registry.js");

    // Verify STANDARD_DESCRIPTOR has at least 9 steps (runtime check)
    expect(STANDARD_DESCRIPTOR.steps.length).toBeGreaterThanOrEqual(9);

    // Verify pr-create is included in the steps
    const prCreateEntry = STANDARD_DESCRIPTOR.steps.find(([name]) => name === "pr-create");
    expect(prCreateEntry).toBeDefined();
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
