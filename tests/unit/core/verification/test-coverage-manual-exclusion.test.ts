/**
 * Fixture tests for Category: manual must TC exclusion from coverage evaluation.
 *
 * TC-001: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない
 * TC-002: unit / integration の must TC の判定は従来と同一
 * TC-005: bullet 形式と plain 形式の Category: manual が両方とも除外として検出される
 * TC-006: manual TC が foundTcIds / assertionlessTcIds にも現れない
 * TC-007: テンプレート enum 行での誤除外が起きない
 *
 * Source:
 *   TC-001: spec.md > Requirement: test-coverage は Category: manual の must TC を coverage 集計から除外する
 *             > Scenario: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない
 *   TC-002: spec.md > Requirement: test-coverage は Category: manual の must TC を coverage 集計から除外する
 *             > Scenario: unit / integration の must TC の判定は従来と同一
 *   TC-005: tasks.md > T-01 Acceptance Criteria
 *   TC-006: design.md > D1: Category: manual の除外を extractMustTcIds の section-scan に組み込む
 *   TC-007: design.md > D1: Category: manual の除外を extractMustTcIds の section-scan に組み込む
 *
 * RED tests (TC-001, TC-005, TC-006 assertions): intentionally fail until T-01 is implemented.
 * GREEN tests (TC-002, TC-007): regression guard — pass before and after T-01.
 * New file — does NOT modify tests/unit/core/verification/test-coverage.test.ts.
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-manual-exclusion-"));
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
// TC-001: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない
//
// Given: **Priority**: must かつ **Category**: manual を宣言する TC を含む test-cases.md がある
// And:   その TC-ID がどのテストファイルにもリテラルとして出現しない
// When:  test-coverage を評価する
// Then:  当該 TC は missingTcIds に含まれず、totalMustTcs にも数えられず、
//        status は他の must TC の充足状況のみで決まる
// ---------------------------------------------------------------------------

describe("TC-001: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない", () => {
  it("**Category**: manual の must TC は ID 出現なしでも missingTcIds に含まれない", async () => {
    const slug = "manual-exclusion-001a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-101: Manual verification scenario
**Priority**: must
**Category**: manual
`,
    );
    // TC-101 does NOT appear in any test file

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.missingTcIds).not.toContain("TC-101");
  });

  it("manual must TC は totalMustTcs に数えられない", async () => {
    const slug = "manual-exclusion-001b";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-101: Manual verification scenario
**Priority**: must
**Category**: manual
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.totalMustTcs).toBe(0);
  });

  it("manual must TC のみの場合 status は passed になる（自動化可能な must TC が0件）", async () => {
    const slug = "manual-exclusion-001c";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-101: Manual verification scenario
**Priority**: must
**Category**: manual
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
  });

  it("manual must TC + 充足済み unit must TC が混在 → status: passed", async () => {
    const slug = "manual-exclusion-001d";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-102: Unit test scenario
**Priority**: must
**Category**: unit

### TC-101: Manual verification scenario
**Priority**: must
**Category**: manual
`,
    );
    // Only TC-102 is covered; TC-101 is manual and should be excluded
    await writeTestFile(
      "tests/unit/a.test.ts",
      `it("TC-102: unit scenario", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.missingTcIds).not.toContain("TC-101");
    expect(result.missingTcIds).not.toContain("TC-102");
  });

  it("manual must TC + 未充足 unit must TC が混在 → status: failed, unit TC は missing、manual TC は missing に含まれない", async () => {
    const slug = "manual-exclusion-001e";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-102: Unit test scenario
**Priority**: must
**Category**: unit

### TC-101: Manual verification scenario
**Priority**: must
**Category**: manual
`,
    );
    // Neither TC-102 nor TC-101 appear in any test file
    // TC-102 should be missing; TC-101 should be excluded (not missing)

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-102");
    expect(result.missingTcIds).not.toContain("TC-101");
  });
});

// ---------------------------------------------------------------------------
// TC-002: unit / integration の must TC の判定は従来と同一 (REGRESSION — GREEN from start)
//
// Given: **Priority**: must かつ **Category**: unit（または integration、または Category 欄なし）の
//        must TC を含む test-cases.md がある
// And:   その TC-ID がどのテストファイルにも出現しない
// When:  test-coverage を評価する
// Then:  当該 TC は従来どおり must coverage 集計に含まれ、missingTcIds に入り status は failed になる
// ---------------------------------------------------------------------------

describe("TC-002: unit / integration の must TC の判定は従来と同一 (regression)", () => {
  it("**Category**: unit の must TC は未出現で missingTcIds に入る", async () => {
    const slug = "manual-exclusion-002a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-201: Unit test scenario
**Priority**: must
**Category**: unit
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-201");
  });

  it("**Category**: integration の must TC は未出現で missingTcIds に入る", async () => {
    const slug = "manual-exclusion-002b";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-202: Integration test scenario
**Priority**: must
**Category**: integration
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-202");
  });

  it("Category 欄なしの must TC は未出現で missingTcIds に入る（従来挙動）", async () => {
    const slug = "manual-exclusion-002c";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-203: No category TC
**Priority**: must
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-203");
  });

  it("extractMustTcIds は **Category**: unit の must TC を返す", () => {
    const content = `
### TC-201: unit must TC
**Priority**: must
**Category**: unit
`;
    expect(extractMustTcIds(content)).toContain("TC-201");
  });

  it("extractMustTcIds は **Category**: integration の must TC を返す", () => {
    const content = `
### TC-202: integration must TC
**Priority**: must
**Category**: integration
`;
    expect(extractMustTcIds(content)).toContain("TC-202");
  });

  it("extractMustTcIds は Category 欄なしの must TC を返す（従来挙動）", () => {
    const content = `
### TC-203: no category must TC
**Priority**: must
`;
    expect(extractMustTcIds(content)).toContain("TC-203");
  });
});

// ---------------------------------------------------------------------------
// TC-005: bullet 形式と plain 形式の Category: manual が両方とも除外として検出される
//
// Given: `- **Category**: manual`（bullet 形式）を持つ must TC と
//        `**Category**: manual`（plain 形式、先頭 bullet なし）を持つ must TC を
//        両方含む test-cases.md がある
// When:  extractMustTcIds を実行する
// Then:  いずれの形式の TC も must 集計から除外され、返り値のリストにどちらも含まれない
// ---------------------------------------------------------------------------

describe("TC-005: bullet 形式と plain 形式の Category: manual が両方とも除外として検出される", () => {
  it("'- **Category**: manual'（bullet 形式）の must TC は extractMustTcIds の返り値に含まれない", () => {
    const content = `
### TC-501: Bullet form manual
**Priority**: must
- **Category**: manual
`;
    expect(extractMustTcIds(content)).not.toContain("TC-501");
  });

  it("'**Category**: manual'（plain 形式）の must TC は extractMustTcIds の返り値に含まれない", () => {
    const content = `
### TC-502: Plain form manual
**Priority**: must
**Category**: manual
`;
    expect(extractMustTcIds(content)).not.toContain("TC-502");
  });

  it("bullet 形式 manual TC と plain 形式 manual TC が共存 → 両方とも除外される", () => {
    const content = `
### TC-501: Bullet form manual
**Priority**: must
- **Category**: manual

### TC-502: Plain form manual
**Priority**: must
**Category**: manual
`;
    const ids = extractMustTcIds(content);
    expect(ids).not.toContain("TC-501");
    expect(ids).not.toContain("TC-502");
  });

  it("bullet 形式 manual TC と unit TC が共存 → manual のみ除外され unit は含まれる", () => {
    const content = `
### TC-503: Unit TC
**Priority**: must
- **Category**: unit

### TC-504: Bullet manual TC
**Priority**: must
- **Category**: manual
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-503");
    expect(ids).not.toContain("TC-504");
  });
});

// ---------------------------------------------------------------------------
// TC-006: manual TC が foundTcIds / assertionlessTcIds にも現れない
//
// Given: **Priority**: must かつ **Category**: manual を宣言する TC があり、
//        その TC-ID がテストファイルにリテラルとして出現する
// When:  evaluateTestCoverage を実行する
// Then:  当該 TC は foundTcIds にも assertionlessTcIds にも含まれない
// ---------------------------------------------------------------------------

describe("TC-006: manual TC が foundTcIds / assertionlessTcIds にも現れない", () => {
  it("manual must TC の ID がテストファイルに出現しても foundTcIds に含まれない", async () => {
    const slug = "manual-exclusion-006a";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-601: Manual scenario
**Priority**: must
**Category**: manual
`,
    );
    // TC-601 appears as a literal in a test file, but it's a manual TC
    await writeTestFile(
      "tests/unit/a.test.ts",
      `// TC-601: Manual scenario (for traceability only — should not be counted)
it("some unrelated test", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.foundTcIds).not.toContain("TC-601");
  });

  it("manual must TC の ID がテストファイルに出現しても assertionlessTcIds に含まれない", async () => {
    const slug = "manual-exclusion-006b";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-601: Manual scenario
**Priority**: must
**Category**: manual
`,
    );
    // TC-601 appears in a file with NO assertion — but since it's manual, it must not be in assertionlessTcIds
    await writeTestFile(
      "tests/unit/stub.test.ts",
      `// TC-601: Manual scenario
it("stub", () => {});`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.assertionlessTcIds).not.toContain("TC-601");
  });

  it("manual TC は集計から除外されるため totalMustTcs が 0 になる", async () => {
    const slug = "manual-exclusion-006c";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-601: Manual scenario
**Priority**: must
**Category**: manual
`,
    );
    // TC-601 in test file with assertion — still must not be counted as must TC
    await writeTestFile(
      "tests/unit/a.test.ts",
      `// TC-601: Manual scenario
it("real test", () => { expect(true).toBe(true); });`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.totalMustTcs).toBe(0);
    expect(result.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-007: テンプレート enum 行での誤除外が起きない (REGRESSION — GREEN from start)
//
// Given: test-cases.md の TC section より前（HTML コメントブロック）に
//        `**Category**: unit | integration | manual` というテンプレート enum 行が存在し、
//        TC section 内には `**Category**: unit` かつ `**Priority**: must` の TC がある
// When:  extractMustTcIds を実行する
// Then:  unit の must TC は除外されず返り値のリストに含まれる
//        （enum 行はコロン直後が `unit` なので manual 正規表現にマッチしない）
// ---------------------------------------------------------------------------

describe("TC-007: テンプレート enum 行での誤除外が起きない (regression)", () => {
  it("'**Category**: unit | integration | manual' という enum 行があっても unit TC は除外されない", () => {
    const content = `# Test Cases

<!-- FORMAT REQUIREMENTS:
  **Category**: unit | integration | manual
-->

### TC-701: Unit test scenario
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-701");
  });

  it("TC section より前に manual という文字列が出現していても TC section の manual 判定は独立している", () => {
    // Outside any TC section: a line mentioning 'manual' in an HTML comment.
    // Inside TC-701's section: Category is 'unit', so TC-701 must NOT be excluded.
    const content = `# Test Cases

<!-- This template uses Category: manual for manual-only verifications -->

### TC-701: Unit test scenario
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-701");
  });

  it("'**Category**: unit | integration | manual' 行は manual 正規表現にマッチしない（コロン直後が unit）", () => {
    // The enum line "**Category**: unit | integration | manual" must NOT trigger manual exclusion
    // because the value immediately after "**: " is 'unit', not 'manual'
    const content = `
**Category**: unit | integration | manual

### TC-701: Must unit TC
**Priority**: must
**Category**: unit
`;
    const ids = extractMustTcIds(content);
    expect(ids).toContain("TC-701");
  });
});
