/**
 * Unit tests for parseRequestMdContent — issue field extraction.
 */
import { describe, it, expect } from "vitest";
import { parseRequestMdContent } from "../../../src/parser/request-md.js";

const MINIMAL_META = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n`;

describe("parseRequestMdContent — issue field", () => {
  it("extracts issue field from Meta section", () => {
    const content = `${MINIMAL_META}- **issue**: #264\n`;
    const result = parseRequestMdContent(content);
    expect(result.issue).toBe("#264");
  });

  it("returns undefined issue when field is absent", () => {
    const result = parseRequestMdContent(MINIMAL_META);
    expect(result.issue).toBeUndefined();
  });
});
