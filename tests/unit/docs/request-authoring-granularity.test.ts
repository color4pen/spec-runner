/**
 * Content guards for docs/request-authoring.md — granularity gate additions.
 *
 * TC-005: docs/request-authoring.md の粒度節に実測値と宣言規約が記載される
 *
 * Source: spec.md > Requirement: authoring guidance が崖の実測と宣言規約を記載する
 *         > Scenario: docs に実測値と宣言規約が記載される
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DOCS_PATH = path.resolve(process.cwd(), "docs/request-authoring.md");

let content: string;

beforeAll(async () => {
  content = await fs.readFile(DOCS_PATH, "utf-8");
});

// ---------------------------------------------------------------------------
// TC-005: docs/request-authoring.md の粒度節に実測値と宣言規約が記載される
// ---------------------------------------------------------------------------

describe("TC-005: docs/request-authoring.md の粒度節に実測値と宣言規約が記載される", () => {
  it("15 本以上で一発完走率 8% の実測値が記載される", () => {
    expect(content).toContain("8%");
  });

  it("exhausted 率 23% の実測値が記載される", () => {
    expect(content).toContain("23%");
  });

  it("15 本以上の閾値への言及が記載される", () => {
    expect(content).toMatch(/15\s*(本|項目|以上)/);
  });

  it("分割検討済み宣言の書式（## 分割検討済み）が記載される", () => {
    expect(content).toContain("## 分割検討済み");
  });

  it("理由必須という規約が記載される", () => {
    expect(content).toMatch(/理由必須|理由.{0,20}必須|reason required/i);
  });
});
