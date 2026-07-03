/**
 * Tests for the design elements citation section added to buildScaffoldTemplate.
 *
 * TC-TMPL-DL-001: template output contains ## 設計要素引用 heading
 * TC-TMPL-DL-002: section is between ## 現状コードの前提 and ## 要件
 * TC-TMPL-DL-003: section includes a comment about [[id]] notation
 * TC-TMPL-DL-004: template with the section still passes parseRequestMdContent
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildScaffoldTemplate, executeTemplate } from "../../../../src/core/command/request.js";
import { parseRequestMdContent } from "../../../../src/parser/request-md.js";

describe("TC-TMPL-DL-001: template contains ## 設計要素引用 heading", () => {
  it("buildScaffoldTemplate includes the section heading", () => {
    const content = buildScaffoldTemplate({
      title: "My Feature",
      type: "new-feature",
      slug: "my-feature",
    });
    expect(content).toContain("## 設計要素引用");
  });
});

describe("TC-TMPL-DL-002: section is between ## 現状コードの前提 and ## 要件", () => {
  it("order is correct", () => {
    const content = buildScaffoldTemplate({
      title: "Test",
      type: "spec-change",
      slug: "test-change",
    });
    const factCheckIdx = content.indexOf("## 現状コードの前提");
    const citationIdx = content.indexOf("## 設計要素引用");
    const reqIdx = content.indexOf("## 要件");
    expect(factCheckIdx).toBeGreaterThan(-1);
    expect(citationIdx).toBeGreaterThan(factCheckIdx);
    expect(reqIdx).toBeGreaterThan(citationIdx);
  });
});

describe("TC-TMPL-DL-003: section includes [[id]] notation comment", () => {
  it("includes a comment mentioning [[id]]", () => {
    const content = buildScaffoldTemplate({
      title: "Test",
      type: "new-feature",
      slug: "test-feature",
    });
    expect(content).toContain("[[id]]");
  });

  it("mentions that the section is optional for projects without aozu", () => {
    const content = buildScaffoldTemplate({
      title: "Test",
      type: "new-feature",
      slug: "test-feature",
    });
    expect(content).toContain("省略");
  });
});

describe("TC-TMPL-DL-004: template with section passes parseRequestMdContent", () => {
  it("does not throw when validating template output", () => {
    const content = buildScaffoldTemplate({
      title: "My New Feature",
      type: "new-feature",
      slug: "my-new-feature",
    });
    const parsed = parseRequestMdContent(content, "<test>");
    expect(parsed.type).toBe("new-feature");
    expect(parsed.slug).toBe("my-new-feature");
  });
});

describe("TC-TMPL-DL-005: executeTemplate output contains the section", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executeTemplate writes template with ## 設計要素引用 section", () => {
    executeTemplate("new-feature");
    const written = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(written).toContain("## 設計要素引用");
  });
});
