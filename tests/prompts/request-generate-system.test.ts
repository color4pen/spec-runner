/**
 * Unit tests for src/prompts/request-generate-system.ts
 *
 * TC-006: request-generate prompt が任意節を案内する (must)
 * Source: spec.md > Requirement: request-generate は「現状コードの前提」を任意節として案内する
 */
import { describe, it, expect } from "vitest";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../../src/prompts/request-generate-system.js";

// TC-006: REQUEST_GENERATE_SYSTEM_PROMPT に「現状コードの前提」任意節の案内が含まれる
describe("TC-006: request-generate prompt guides the optional 現状コードの前提 section", () => {
  it("contains the 現状コードの前提 section name", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toContain("現状コードの前提");
  });

  it("marks the section as optional", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toMatch(/optional/i);
  });

  it("defines file:line as a trigger for the section", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toMatch(/file:line/);
  });

  it("defines specific symbol names as a trigger for the section", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toMatch(/symbol/i);
  });

  it("defines file paths as a trigger for the section", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toMatch(/file path|file paths/i);
  });

  it("excludes intentions and future plans from the section", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toMatch(/out of scope|Intentions|intentions/);
  });

  it("instructs to omit the section when no such assertions exist", () => {
    expect(REQUEST_GENERATE_SYSTEM_PROMPT).toMatch(/[Oo]mit.*section/);
  });
});
