import { describe, it, expect } from "vitest";
import { renderPrTitle } from "../body-template.js";
import type { ParsedRequest } from "../../../parser/request-md.js";

function makeRequest(overrides: Partial<ParsedRequest>): ParsedRequest {
  return {
    type: "new-feature",
    title: "some feature",
    slug: "some-feature",
    baseBranch: "main",
    content: "",
    adr: false,
    sections: {},
    issue: undefined,
    ...overrides,
  };
}

describe("renderPrTitle", () => {
  it("prepends feat: prefix for new-feature type", () => {
    const req = makeRequest({ type: "new-feature", title: "release-please の導入" });
    expect(renderPrTitle(req)).toBe("feat: release-please の導入");
  });

  it("prepends fix: prefix for bug-fix type", () => {
    const req = makeRequest({ type: "bug-fix", title: "null pointer exception" });
    expect(renderPrTitle(req)).toBe("fix: null pointer exception");
  });

  it("prepends feat: prefix for spec-change type", () => {
    const req = makeRequest({ type: "spec-change", title: "update spec" });
    expect(renderPrTitle(req)).toBe("feat: update spec");
  });

  it("prepends refactor: prefix for refactoring type", () => {
    const req = makeRequest({ type: "refactoring", title: "clean up internals" });
    expect(renderPrTitle(req)).toBe("refactor: clean up internals");
  });

  it("prepends chore: prefix for chore type", () => {
    const req = makeRequest({ type: "chore", title: "update dependencies" });
    expect(renderPrTitle(req)).toBe("chore: update dependencies");
  });

  it("does not double-prepend when title already has a prefix", () => {
    const req = makeRequest({ type: "bug-fix", title: "fix: already prefixed" });
    expect(renderPrTitle(req)).toBe("fix: already prefixed");
  });

  it("does not double-prepend when title has a scoped prefix", () => {
    const req = makeRequest({ type: "new-feature", title: "feat(scope): scoped feature" });
    expect(renderPrTitle(req)).toBe("feat(scope): scoped feature");
  });

  it("falls back to feat: for unknown type", () => {
    const req = makeRequest({ type: "unknown-type", title: "some change" });
    expect(renderPrTitle(req)).toBe("feat: some change");
  });
});
