/**
 * Unit tests for parseRequestMdContent — issue field extraction and adr field.
 */
import { describe, it, expect } from "vitest";
import { parseRequestMdContent } from "../../../src/parser/request-md.js";

const MINIMAL_META = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n- **adr**: false\n`;
const MINIMAL_META_NO_ADR = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n`;

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

describe("parseRequestMdContent — adr field", () => {
  // TC-ADR-PARSE-01: adr: true → parsed as true
  it("TC-ADR-PARSE-01: parses adr: true correctly", () => {
    const content = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n- **adr**: true\n`;
    const result = parseRequestMdContent(content);
    expect(result.adr).toBe(true);
  });

  // TC-ADR-PARSE-02: adr: false → parsed as false
  it("TC-ADR-PARSE-02: parses adr: false correctly", () => {
    const result = parseRequestMdContent(MINIMAL_META);
    expect(result.adr).toBe(false);
  });

  // TC-ADR-PARSE-03: adr field absent → REQUEST_MD_INVALID
  it("TC-ADR-PARSE-03: throws REQUEST_MD_INVALID when adr field is absent", () => {
    expect(() => parseRequestMdContent(MINIMAL_META_NO_ADR)).toThrow(/REQUEST_MD_INVALID|missing 'adr'/i);
  });

  // TC-ADR-PARSE-04: adr: maybe (invalid value) → REQUEST_MD_INVALID
  it("TC-ADR-PARSE-04: throws REQUEST_MD_INVALID for invalid adr value", () => {
    const content = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n- **adr**: maybe\n`;
    expect(() => parseRequestMdContent(content)).toThrow(/REQUEST_MD_INVALID|invalid value for 'adr'/i);
  });
});
