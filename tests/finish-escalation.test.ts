/**
 * Tests for finish command: escalation formatter.
 *
 * TC-023: formatEscalation contains all 4 required fields
 */
import { describe, it, expect } from "vitest";
import { formatEscalation } from "../src/core/finish/escalation.js";

// TC-023
describe("TC-023: formatEscalation contains all 4 required fields", () => {
  it("includes failedStep, detectedState, recommendedAction, resumeCommand", () => {
    const cases = [
      {
        failedStep: "merge-feature-pr",
        detectedState: "OPEN_BEHIND",
        recommendedAction: "Rebase the branch",
        resumeCommand: "specrunner finish test-job",
      },
      {
        failedStep: "merge-feature-pr",
        detectedState: "OPEN_CONFLICTS",
        recommendedAction: "Resolve conflicts",
        resumeCommand: "specrunner finish test-job",
      },
      {
        failedStep: "merge-feature-pr",
        detectedState: "OPEN_CHECKS_FAILING",
        recommendedAction: "Wait for CI or use --force",
        resumeCommand: "specrunner finish test-job --force",
      },
      {
        failedStep: "archive-pr-creation",
        detectedState: "git push failed",
        recommendedAction: "Check network and retry",
        resumeCommand: "specrunner finish test-job",
      },
    ];

    for (const params of cases) {
      const output = formatEscalation(params);

      expect(output).toContain(params.failedStep);
      expect(output).toContain(params.detectedState);
      expect(output).toContain(params.recommendedAction);
      expect(output).toContain(params.resumeCommand);
    }
  });

  it("produces consistent structure with header and footer", () => {
    const output = formatEscalation({
      failedStep: "test-step",
      detectedState: "TEST_STATE",
      recommendedAction: "Do something",
      resumeCommand: "specrunner finish abc",
    });

    expect(output).toContain("specrunner finish: escalation");
    expect(output).toContain("Failed Step:");
    expect(output).toContain("Detected State:");
    expect(output).toContain("Recommended Action:");
    expect(output).toContain("Resume Command:");
  });
});
