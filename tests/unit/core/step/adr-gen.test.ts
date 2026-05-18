/**
 * Unit tests for AdrGenStep and buildAdrGenInitialMessage.
 */
import { describe, it, expect } from "vitest";
import { AdrGenStep, buildAdrGenInitialMessage } from "../../../../src/core/step/adr-gen.js";
import { NULL_PARSE_RESULT } from "../../../../src/core/step/types.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";

function buildState(branch?: string) {
  return { branch: branch ?? "feat/test-slug", steps: {} } as Parameters<typeof AdrGenStep.buildMessage>[0];
}

function buildDeps(adr: boolean) {
  return {
    slug: "test-slug",
    request: {
      type: "new-feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Do something",
      enabled: [],
      adr,
    },
    dynamicContext: undefined,
  } as unknown as Parameters<typeof AdrGenStep.buildMessage>[1];
}

// TC-ADR-STEP-03: step properties
describe("AdrGenStep — static properties", () => {
  it("TC-ADR-STEP-03a: step.name === 'adr-gen'", () => {
    expect(AdrGenStep.name).toBe(STEP_NAMES.ADR_GEN);
    expect(AdrGenStep.name).toBe("adr-gen");
  });

  it("TC-ADR-STEP-03b: step.kind === 'agent'", () => {
    expect(AdrGenStep.kind).toBe("agent");
  });

  it("TC-ADR-STEP-03c: step.completionVerdict === 'success'", () => {
    expect(AdrGenStep.completionVerdict).toBe("success");
  });
});

// TC-ADR-STEP-04: resultFilePath and parseResult
describe("AdrGenStep — result methods", () => {
  it("TC-ADR-STEP-04a: resultFilePath returns null", () => {
    expect(AdrGenStep.resultFilePath(buildState(), buildDeps(false))).toBeNull();
  });

  it("TC-ADR-STEP-04b: parseResult returns NULL_PARSE_RESULT", () => {
    expect(AdrGenStep.parseResult("", buildDeps(false))).toEqual(NULL_PARSE_RESULT);
  });
});

// TC-ADR-STEP-01: request.adr === false → buildMessage returns no-op instruction
describe("buildAdrGenInitialMessage — adr: false", () => {
  it("TC-ADR-STEP-01: returns no-op instruction when adr is false", () => {
    const msg = buildAdrGenInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      baseBranch: "main",
      adr: false,
      requestContent: "content",
    });
    expect(msg).toContain("adr: false");
    expect(msg).toContain("ADR generation is disabled");
    expect(msg).toContain("end your turn immediately");
    // Should NOT contain file paths or judge instructions
    expect(msg).not.toContain("specrunner/adr/");
    expect(msg).not.toContain("judge");
  });

  it("TC-ADR-STEP-01-step: AdrGenStep.buildMessage with adr=false", () => {
    const msg = AdrGenStep.buildMessage(buildState(), buildDeps(false));
    expect(msg).toContain("adr: false");
    expect(msg).toContain("ADR generation is disabled");
  });
});

// TC-ADR-STEP-02: request.adr === true → buildMessage returns judge+generate instructions
describe("buildAdrGenInitialMessage — adr: true", () => {
  it("TC-ADR-STEP-02: returns judge+generate instruction when adr is true", () => {
    const msg = buildAdrGenInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      baseBranch: "main",
      adr: true,
      requestContent: "do the thing",
    });
    expect(msg).toContain("adr: true");
    expect(msg).toContain("judge");
    expect(msg).toContain("specrunner/changes/my-slug");
    expect(msg).toContain("design.md");
    expect(msg).toContain("review-feedback");
    expect(msg).toContain("git diff main..HEAD --stat");
  });

  it("TC-ADR-STEP-02-step: AdrGenStep.buildMessage with adr=true includes change folder", () => {
    const msg = AdrGenStep.buildMessage(buildState(), buildDeps(true));
    expect(msg).toContain("specrunner/changes/test-slug");
    expect(msg).toContain("design.md");
    expect(msg).toContain("judge");
  });
});
