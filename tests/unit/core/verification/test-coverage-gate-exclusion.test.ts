/**
 * Fixture tests for Category: gate must TC exclusion from coverage evaluation.
 *
 * TC-001: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない
 * TC-002: gate must TC が foundTcIds / assertionlessTcIds にも現れない
 * TC-003: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一
 * TC-004: gate を含む enum 行で unit の must TC が誤除外されない
 * TC-005: bullet 形式の `**Category**: gate` も plain 形式と同様に除外される
 * TC-006: manual と gate の must TC が共存するとき両方とも除外される
 *
 * Source:
 *   TC-001: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する
 *             > Scenario: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない
 *   TC-002: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する
 *             > Scenario: gate must TC が foundTcIds / assertionlessTcIds にも現れない
 *   TC-003: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する
 *             > Scenario: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一
 *   TC-004: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する
 *             > Scenario: gate を含むテンプレート enum 行で誤除外が起きない
 *   TC-005: tasks.md > T-01: extractMustTcIds に Category: gate 除外を追加する
 *   TC-006: design.md > D1: extractMustTcIds に Category: gate 除外を manual と同型で追加する / tasks.md > T-01
 *
 * RED tests (TC-001 most assertions, TC-002, TC-005, TC-006 gate part):
 *   intentionally fail until T-01 is implemented (extractMustTcIds does not yet exclude gate TCs).
 * GREEN tests (TC-003, TC-004):
 *   regression guard — pass before and after T-01.
 * New file — does NOT modify tests/unit/core/verification/test-coverage-manual-exclusion.test.ts.
 *
 * Note on fixture TC IDs: numeric IDs (e.g. TC-901) are used to match the
 * regex TC-\d+ that extractMustTcIds recognizes. Alphabetic segments (TC-G01)
 * would not be recognized.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  runTestCoveragePhase,
  extractMustTcIds,
} from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-gate-exclusion-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeTestCasesMd(slug: string, content: string): Promise<void> {
  const dir = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "test-cases.md"), content, "utf-8");
}

async function writeTestFile(relPath: string, content: string): Promise<void> {
  const full = path.join(tempDir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

// ---------------------------------------------------------------------------
// TC-001: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない
//
// Given: **Priority**: must かつ **Category**: gate を宣言する TC を含む test-cases.md がある
// And:   その TC-ID がどのテストファイルにもリテラルとして出現しない
// When:  test-coverage を評価する
// Then:  当該 TC は missingTcIds に含まれず、totalMustTcs にも数えられず、
//        status は他の must TC の充足状況のみで決まる
// ---------------------------------------------------------------------------

describe("TC-001: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない", () => {
  it("TC-001: extractMustTcIds は **Category**: gate の must TC を返さない", () => {
    const content = `
### TC-901: typecheck && test が green
**Priority**: must
**Category**: gate
`;
    expect(extractMustTcIds(content)).not.toContain("TC-901");
  });

  it("TC-001: **Category**: gate の must TC は ID 出現なしでも missingTcIds に含まれない", async () => {
    const slug = "gate-exclusion-001a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-901: typecheck && test が green
**Priority**: must
**Category**: gate

Verification phase: typecheck, test
`,
    );
    // TC-901 does NOT appear in any test file

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.missingTcIds).not.toContain("TC-901");
  });

  it("TC-001: gate must TC は totalMustTcs に数えられない", async () => {
    const slug = "gate-exclusion-001b";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-901: typecheck && test が green
**Priority**: must
**Category**: gate

Verification phase: typecheck, test
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.totalMustTcs).toBe(0);
  });

  it("TC-001: gate must TC のみの場合 status は passed になる（自動化可能な must TC が 0 件）", async () => {
    const slug = "gate-exclusion-001c";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-901: typecheck && test が green
**Priority**: must
**Category**: gate

Verification phase: typecheck, test
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
  });

  it("TC-001: gate must TC + 充足済み unit must TC が混在 → status: passed", async () => {
    const slug = "gate-exclusion-001d";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-902: unit test scenario
**Priority**: must
**Category**: unit

### TC-901: typecheck && test が green
**Priority**: must
**Category**: gate

Verification phase: typecheck, test
`,
    );
    // Only TC-902 is covered; TC-901 is gate and should be excluded
    await writeTestFile(
      "tests/unit/a.test.ts",
      `it("TC-902: unit scenario", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.missingTcIds).not.toContain("TC-901");
    expect(result.missingTcIds).not.toContain("TC-902");
  });

  it("TC-001: gate must TC + 未充足 unit must TC が混在 → status: failed, unit TC は missing、gate TC は missing に含まれない", async () => {
    const slug = "gate-exclusion-001e";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-902: unit test scenario
**Priority**: must
**Category**: unit

### TC-901: typecheck && test が green
**Priority**: must
**Category**: gate

Verification phase: typecheck, test
`,
    );
    // Neither TC-902 nor TC-901 appear in any test file
    // TC-902 should be missing; TC-901 should be excluded (not missing)

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-902");
    expect(result.missingTcIds).not.toContain("TC-901");
  });
});

// ---------------------------------------------------------------------------
// TC-002: gate must TC が foundTcIds / assertionlessTcIds にも現れない
//
// Given: **Priority**: must かつ **Category**: gate を宣言する TC があり、
//        その TC-ID がテストファイルにリテラルとして出現する
// When:  test-coverage を評価する
// Then:  当該 TC は foundTcIds にも assertionlessTcIds にも含まれず、
//        totalMustTcs にも数えられない
// ---------------------------------------------------------------------------

describe("TC-002: gate must TC が foundTcIds / assertionlessTcIds にも現れない", () => {
  it("TC-002: gate must TC の ID がテストファイルに出現しても foundTcIds に含まれない", async () => {
    const slug = "gate-exclusion-002a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-901: gate scenario
**Priority**: must
**Category**: gate

Verification phase: typecheck
`,
    );
    // TC-901 appears as a literal in a test file, but it's a gate TC
    await writeTestFile(
      "tests/unit/a.test.ts",
      `// TC-901: gate scenario (verification phase only — should not be counted)
it("some unrelated test", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.foundTcIds).not.toContain("TC-901");
  });

  it("TC-002: gate must TC の ID がテストファイルに出現しても assertionlessTcIds に含まれない", async () => {
    const slug = "gate-exclusion-002b";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-901: gate scenario
**Priority**: must
**Category**: gate

Verification phase: test
`,
    );
    // TC-901 appears in a file with NO assertion — but since it's gate, it must not be in assertionlessTcIds
    await writeTestFile(
      "tests/unit/stub.test.ts",
      `// TC-901: gate scenario
it("stub", () => {});`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.assertionlessTcIds).not.toContain("TC-901");
  });

  it("TC-002: gate TC は集計から除外されるため totalMustTcs が 0 になる（ID 出現あり）", async () => {
    const slug = "gate-exclusion-002c";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-901: gate scenario
**Priority**: must
**Category**: gate

Verification phase: build
`,
    );
    // TC-901 in test file with assertion — still must not be counted as must TC
    await writeTestFile(
      "tests/unit/a.test.ts",
      `// TC-901: gate scenario
it("real test", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.totalMustTcs).toBe(0);
    expect(result.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-003: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一
//
// Given: **Priority**: must かつ **Category**: unit（または integration、manual、Category 欄なし）の
//        must TC を含む test-cases.md がある
// When:  test-coverage を評価する
// Then:  unit / integration / Category 欄なしの must TC は従来どおり must coverage 集計に含まれ、
//        未出現なら missingTcIds に入り status は failed になる。
//        manual の must TC は従来どおり集計から除外され、その判定は本変更で一切変化しない
// ---------------------------------------------------------------------------

describe("TC-003: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一 (regression)", () => {
  it("TC-003: **Category**: unit の must TC は extractMustTcIds に含まれる（従来挙動）", () => {
    const content = `
### TC-801: unit must TC
**Priority**: must
**Category**: unit
`;
    expect(extractMustTcIds(content)).toContain("TC-801");
  });

  it("TC-003: **Category**: integration の must TC は extractMustTcIds に含まれる（従来挙動）", () => {
    const content = `
### TC-802: integration must TC
**Priority**: must
**Category**: integration
`;
    expect(extractMustTcIds(content)).toContain("TC-802");
  });

  it("TC-003: Category 欄なしの must TC は extractMustTcIds に含まれる（従来挙動）", () => {
    const content = `
### TC-803: no category must TC
**Priority**: must
`;
    expect(extractMustTcIds(content)).toContain("TC-803");
  });

  it("TC-003: **Category**: manual の must TC は extractMustTcIds に含まれない（manual 除外に回帰なし）", () => {
    const content = `
### TC-804: manual must TC
**Priority**: must
**Category**: manual
`;
    expect(extractMustTcIds(content)).not.toContain("TC-804");
  });

  it("TC-003: gate TC が存在しても unit / integration / no-category の TC は引き続き extractMustTcIds に含まれる（regression）", () => {
    // Checks that adding gate TCs to the content does not break existing behavior for
    // unit / integration / no-category TCs.  Does NOT assert on gate TC exclusion here —
    // that is covered by TC-001 / TC-005 / TC-006 (which are RED until T-01).
    const content = `
### TC-801: unit must TC
**Priority**: must
**Category**: unit

### TC-901: gate must TC
**Priority**: must
**Category**: gate

### TC-802: integration must TC
**Priority**: must
**Category**: integration

### TC-803: no category must TC
**Priority**: must
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-801");
    expect(ids).toContain("TC-802");
    expect(ids).toContain("TC-803");
  });

  it("TC-003: manual must TC の runTestCoveragePhase での除外挙動が gate 変更前後で同一（integration test）", async () => {
    const slug = "gate-exclusion-003a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-804: Manual scenario
**Priority**: must
**Category**: manual
`,
    );
    // TC-804 does NOT appear in any test file — should still be excluded (manual)

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.missingTcIds).not.toContain("TC-804");
    expect(result.totalMustTcs).toBe(0);
    expect(result.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-004: gate を含む enum 行で unit の must TC が誤除外されない (REGRESSION — GREEN from start)
//
// Given: test-cases.md の TC section より前に `**Category**: unit | integration | manual | gate`
//        というテンプレート enum 行が存在し、TC section 内には `**Category**: unit` かつ
//        `**Priority**: must` の TC がある
// When:  extractMustTcIds を実行する
// Then:  unit の must TC は除外されず返り値のリストに含まれる（enum 行はコロン直後が `unit` なので
//        gate 正規表現にも manual 正規表現にもマッチしない）
// ---------------------------------------------------------------------------

describe("TC-004: gate を含む enum 行で unit の must TC が誤除外されない (regression)", () => {
  it("TC-004: '**Category**: unit | integration | manual | gate' という enum 行があっても unit TC は除外されない", () => {
    const content = `# Test Cases

<!-- FORMAT REQUIREMENTS:
  **Category**: unit | integration | manual | gate
-->

### TC-801: Unit test scenario
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-801");
  });

  it("TC-004: gate を含む enum 行は gate 正規表現にマッチしない（コロン直後が unit）", () => {
    // "**Category**: unit | integration | manual | gate" — value after **: is "unit", not "gate"
    // The categoryGateRe (**Category**:\s*gate) must not match this line
    const content = `
**Category**: unit | integration | manual | gate

### TC-801: Must unit TC
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-801");
  });

  it("TC-004: TC section 外に gate という文字列が出現しても TC section 内の unit 判定は独立している", () => {
    const content = `# Test Cases

<!-- This template uses Category: gate for verification-phase TCs -->

### TC-801: Unit test scenario
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-801");
  });
});

// ---------------------------------------------------------------------------
// TC-005: bullet 形式の `**Category**: gate` も plain 形式と同様に除外される
//
// Given: test-cases.md の TC section に `- **Priority**: must` と
//        `- **Category**: gate`（bullet 形式、先頭 `- ` あり）を宣言する TC がある
// When:  `extractMustTcIds` を実行する
// Then:  当該 TC は mustTcIds に含まれず、totalMustTcs にも数えられない
// ---------------------------------------------------------------------------

describe("TC-005: bullet 形式の `**Category**: gate` も plain 形式と同様に除外される", () => {
  it("TC-005: '- **Category**: gate'（bullet 形式）の must TC は extractMustTcIds の返り値に含まれない", () => {
    const content = `
### TC-901: Bullet form gate
**Priority**: must
- **Category**: gate
`;
    expect(extractMustTcIds(content)).not.toContain("TC-901");
  });

  it("TC-005: '**Category**: gate'（plain 形式）の must TC は extractMustTcIds の返り値に含まれない", () => {
    const content = `
### TC-902: Plain form gate
**Priority**: must
**Category**: gate
`;
    expect(extractMustTcIds(content)).not.toContain("TC-902");
  });

  it("TC-005: bullet 形式 gate TC と plain 形式 gate TC が共存 → 両方とも除外される", () => {
    const content = `
### TC-901: Bullet form gate
**Priority**: must
- **Category**: gate

### TC-902: Plain form gate
**Priority**: must
**Category**: gate
`;
    const ids = extractMustTcIds(content);
    expect(ids).not.toContain("TC-901");
    expect(ids).not.toContain("TC-902");
  });

  it("TC-005: bullet 形式 gate TC と unit TC が共存 → gate のみ除外され unit は含まれる", () => {
    const content = `
### TC-801: Unit TC
**Priority**: must
- **Category**: unit

### TC-901: Bullet gate TC
**Priority**: must
- **Category**: gate
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-801");
    expect(ids).not.toContain("TC-901");
  });
});

// ---------------------------------------------------------------------------
// TC-006: manual と gate の must TC が共存するとき両方とも除外される
//
// Given: test-cases.md に `**Category**: manual` かつ `**Priority**: must` の TC と
//        `**Category**: gate` かつ `**Priority**: must` の TC が共存し、
//        さらに `**Category**: unit` かつ `**Priority**: must` の TC が 1 件ある
// When:  `extractMustTcIds` を実行する
// Then:  manual の must TC も gate の must TC も返り値に含まれず、
//        unit の must TC のみが返り値に含まれる
// ---------------------------------------------------------------------------

describe("TC-006: manual と gate の must TC が共存するとき両方とも除外される", () => {
  it("TC-006: extractMustTcIds は manual + gate が共存する場合に unit TC のみを返す", () => {
    const content = `
### TC-804: Manual scenario
**Priority**: must
**Category**: manual

### TC-901: Gate scenario
**Priority**: must
**Category**: gate

### TC-801: Unit scenario
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).not.toContain("TC-804");
    expect(ids).not.toContain("TC-901");
    expect(ids).toContain("TC-801");
  });

  it("TC-006: manual と gate の must TC はどちらも missingTcIds に含まれず unit のみ含まれる（integration test）", async () => {
    const slug = "gate-exclusion-006a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-801: Unit scenario
**Priority**: must
**Category**: unit

### TC-804: Manual scenario
**Priority**: must
**Category**: manual

### TC-901: Gate scenario
**Priority**: must
**Category**: gate

Verification phase: typecheck, test
`,
    );
    // Only TC-801 is covered
    await writeTestFile(
      "tests/unit/a.test.ts",
      `// TC-801: unit scenario
it("unit test", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.totalMustTcs).toBe(1);
    expect(result.missingTcIds).not.toContain("TC-804");
    expect(result.missingTcIds).not.toContain("TC-901");
    expect(result.status).toBe("passed");
  });

  it("TC-006: manual + gate 共存時、unit のみが mustTcIds に含まれる（extractMustTcIds 返り値は unit のみ）", () => {
    const content = `
### TC-804: Manual
**Priority**: must
**Category**: manual

### TC-901: Gate
**Priority**: must
**Category**: gate

### TC-801: Unit
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toEqual(["TC-801"]);
  });
});
