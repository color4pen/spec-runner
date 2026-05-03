/**
 * Regression guard for the requiresCommit flag on writing-agent steps.
 *
 * Writing agents (spec-fixer, implementer, build-fixer, code-fixer) are
 * responsible for committing + pushing their changes during a session. The
 * StepExecutor uses requiresCommit to detect the failure mode where an agent
 * ends its turn without advancing the branch HEAD. Forgetting to set this
 * flag silently disables the safeguard, so this test pins it.
 *
 * Review-style steps (spec-review, code-review) and propose are NOT
 * required to advance the branch beyond writing their result file (which
 * has a separate verification path), so they should leave the flag falsy.
 */
import { describe, it, expect } from "vitest";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { BuildFixerStep } from "../../../src/core/step/build-fixer.js";
import { CodeFixerStep } from "../../../src/core/step/code-fixer.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { CodeReviewStep } from "../../../src/core/step/code-review.js";
import { ProposeStep } from "../../../src/core/step/propose.js";

describe("requiresCommit flag — writing agents must opt in", () => {
  it("SpecFixerStep.requiresCommit === true", () => {
    expect(SpecFixerStep.requiresCommit).toBe(true);
  });

  it("ImplementerStep.requiresCommit === true", () => {
    expect(ImplementerStep.requiresCommit).toBe(true);
  });

  it("BuildFixerStep.requiresCommit === true", () => {
    expect(BuildFixerStep.requiresCommit).toBe(true);
  });

  it("CodeFixerStep.requiresCommit === true", () => {
    expect(CodeFixerStep.requiresCommit).toBe(true);
  });
});

describe("requiresCommit flag — review and propose steps stay opt-out", () => {
  it("SpecReviewStep.requiresCommit is falsy (review file verified separately)", () => {
    expect(SpecReviewStep.requiresCommit).toBeFalsy();
  });

  it("CodeReviewStep.requiresCommit is falsy (review file verified separately)", () => {
    expect(CodeReviewStep.requiresCommit).toBeFalsy();
  });

  it("ProposeStep.requiresCommit is falsy (gated by register_branch + change folder verification)", () => {
    expect(ProposeStep.requiresCommit).toBeFalsy();
  });
});
