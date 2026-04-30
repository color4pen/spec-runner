/**
 * Unit tests for src/prompts/propose-system.ts
 *
 * Regression for the dogfooding-001 second-pass bug where the propose agent
 * edited README.md (a file outside `openspec/changes/<slug>/`) because the
 * prompt's negative-only framing did not draw the boundary by path.
 */
import { describe, it, expect } from "vitest";
import {
  PROPOSE_SYSTEM_PROMPT,
  PROPOSE_INITIAL_MESSAGE_TEMPLATE,
  buildInitialMessage,
} from "../../src/prompts/propose-system.js";

describe("propose system prompt — workflow position (positive framing)", () => {
  it("declares propose as stage 1 of the pipeline", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("stage 1");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("propose");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("spec-review");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("implementer");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("verification");
  });

  it("explains that tasks.md is the hand-off to implementer", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/tasks\.md.*implementer|implementer.*tasks\.md/s);
  });
});

describe("propose system prompt — CRITICAL BOUNDARY (path-fence)", () => {
  it("contains a CRITICAL BOUNDARY section", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("CRITICAL BOUNDARY");
  });

  it("forbids modifying files outside openspec/changes/<slug>/", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/outside.*openspec\/changes/);
  });

  it("explicitly names README.md as forbidden", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("README.md");
  });

  it("draws the boundary by path, not by file type", () => {
    // The agent's prior failure mode was reasoning "README is documentation,
    // therefore not 'implementation work'". The prompt must override that.
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/by.*path/i);
  });

  it("includes an 'even if the user request asks' override clause", () => {
    // Either the system prompt or the message template must contain the override.
    const combined = `${PROPOSE_SYSTEM_PROMPT}\n${PROPOSE_INITIAL_MESSAGE_TEMPLATE}`;
    expect(combined).toMatch(/even if the user request asks/i);
  });
});

describe("propose initial message — user-request override clause", () => {
  it("template warns the agent not to follow user-request edits outside the change folder", () => {
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).toMatch(/IMPORTANT/);
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).toMatch(/README\.md|outside/i);
  });

  it("buildInitialMessage substitutes slug and branch into the override", () => {
    const msg = buildInitialMessage("body", "my-slug", "feat/my-slug");
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("body");
  });
});
