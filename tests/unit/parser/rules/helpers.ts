import type { ParsedRequestRaw } from "../../../../src/parser/rules/types.js";

/** Build a fully-valid ParsedRequestRaw. Override individual fields per test. */
export function makeRaw(overrides: Partial<ParsedRequestRaw> = {}): ParsedRequestRaw {
  return {
    title: "My Title",
    type: "bug-fix",
    slug: "my-slug",
    baseBranch: "main",
    adrRaw: "false",
    adrAnyValue: null,
    issue: undefined,
    pipeline: undefined,
    sections: {},
    filePath: "<string>",
    content: "",
    ...overrides,
  };
}
