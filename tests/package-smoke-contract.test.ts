/**
 * Integration tests: package smoke contract assertions (packaged-smoke-contract)
 *
 * These tests verify structural and behavioral properties of
 * scripts/smoke/package-smoke.sh that can be evaluated quickly
 * without running a full npm pack → install → CLI cycle.
 *
 * Strategy: the smoke SCRIPT is the primary integration artifact
 * (design D1 explicitly rejects putting smoke assertions in vitest to preserve
 * "packed tarball + node only" isolation). These vitest tests complement it by
 * verifying the script contains the required assertion patterns and that its
 * fast-path behaviors (dist pre-check, bin-wiring sentinel) are correct.
 *
 * Automated TCs covered (must):
 *   TC-001  repo 外 init — S1 scenario assertions present in script
 *   TC-002  subdirectory init — S2 per-item created assertions present
 *   TC-003  2nd init already-exists — S2b per-item already-exists assertions present
 *   TC-004  half-init split — S2c created/already-exists assertions present
 *   TC-005  XDG doctor config-file-exists=pass per-check — S3 assertions present
 *   TC-006  doctor root/subdirectory identical — S3 equivalence assertions present
 *   TC-007  --help exit 0 + usage text — S5 assertions present
 *   TC-008  subdirectory request new root landing — S4 assertions present
 *   TC-009  smoke script has no bun invocations and no src/ references
 *   TC-010  token-free: doctor judgment uses per-check status, not overall exit code
 *   TC-011  fixture isolation: XDG_CONFIG_HOME and HOME are isolated in CLI invocations
 *   TC-015  dist-missing explicit error stop (behavioral run)
 *   TC-016  bin wiring sentinel: script checks node_modules/.bin/specrunner after install
 *
 * Automated TCs covered (should):
 *   TC-017  GIT_CEILING_DIRECTORIES guards S1 repo-outside assertion
 *   TC-018  trap EXIT cleanup for temp dirs and tarball
 *
 * Manual TCs (not automated here):
 *   TC-009  ← partially: the content analysis here covers the static check;
 *              end-to-end execution is the manual gate
 *   TC-012  CI runs smoke as gate (manual: CI config verification)
 *   TC-013  developer runs smoke locally (manual: operational check)
 *   TC-014  individual falsifiability (manual: expectation-inversion walk)
 *   TC-019  package.json smoke convenience entry (manual: config review)
 *   TC-020  CI workflow smoke step placement (manual: workflow review)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../");
const SMOKE_SCRIPT = path.join(REPO_ROOT, "scripts", "smoke", "package-smoke.sh");

/** Read the smoke script content once per describe block using this helper. */
async function readSmokeScript(): Promise<string> {
  return fs.readFile(SMOKE_SCRIPT, "utf8");
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "psc-unit-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared structural: smoke script file exists and is executable
// (prerequisite for all TC assertions below)
// ─────────────────────────────────────────────────────────────────────────────
describe("smoke script structural pre-requisites", () => {
  it("scripts/smoke/package-smoke.sh exists as a regular file", async () => {
    const stat = await fs.stat(SMOKE_SCRIPT);
    expect(stat.isFile()).toBe(true);
  });

  it("scripts/smoke/package-smoke.sh has execute permission", async () => {
    await expect(fs.access(SMOKE_SCRIPT, fsConstants.X_OK)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: repo 外 init — 非ゼロ exit と XDG 含む無書き込み
// Source: spec.md > Scenario: init outside a git repository writes nothing
//         including under isolated XDG
//
// WHEN the smoke asserts repo-outside init behavior
// THEN the script contains:
//   - a non-zero exit assertion for S1
//   - an absent assertion for specrunner/ in the fixture
//   - an absent assertion for .gitignore in the fixture
//   - an absent assertion for XDG config.json
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-001: repo 外 init — S1 scenario assertions present in smoke script", () => {
  it("TC-001: script asserts non-zero exit for S1 (init outside git repo)", async () => {
    const content = await readSmokeScript();
    // assert_exit_nonzero or equivalent must be called for S1
    expect(content).toMatch(/assert_exit_nonzero[^"]*"S1\/exit-nonzero"/);
  });

  it("TC-001: script asserts specrunner/ is absent in S1 fixture dir", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_absent[^"]*"S1\/no-specrunner-dir"/);
  });

  it("TC-001: script asserts .gitignore is absent in S1 fixture dir", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_absent[^"]*"S1\/no-gitignore"/);
  });

  it("TC-001: script asserts XDG config.json is absent after S1 init", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_absent[^"]*"S1\/no-xdg-config"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: subdirectory init — repo root 着地・入れ子なし・created 項目報告
// Source: spec.md > Scenario: init from a subdirectory lands scaffold at repo
//         root without nesting and reports created
//
// WHEN the smoke asserts S2 (first init from subdirectory)
// THEN the script asserts all four created items individually
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-002: subdirectory init — S2 per-item created assertions in smoke script", () => {
  it("TC-002: script asserts exit 0 for S2", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_exit_zero[^"]*"S2\/exit-zero"/);
  });

  it("TC-002: script asserts specrunner/drafts exists at repo root after S2", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_present[^"]*"S2\/root-drafts"/);
  });

  it("TC-002: script asserts specrunner/changes exists at repo root after S2", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_present[^"]*"S2\/root-changes"/);
  });

  it("TC-002: script asserts no nested specrunner/ in subdirectory after S2", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_absent[^"]*"S2\/no-nested-specrunner"/);
  });

  it("TC-002: script asserts per-item 'global config: created' in S2 output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("global config: created");
  });

  it("TC-002: script asserts per-item '.gitignore: created' in S2 output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain(".gitignore: created");
  });

  it("TC-002: script asserts per-item 'specrunner/drafts: created' in S2 output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("specrunner/drafts: created");
  });

  it("TC-002: script asserts per-item 'specrunner/changes: created' in S2 output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("specrunner/changes: created");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: 2 回目 init — 全項目 already-exists の冪等報告
// Source: spec.md > Scenario: second init reports per-item already-exists (idempotent)
//
// WHEN the smoke asserts S2b (second init from same subdirectory)
// THEN the script asserts all four already-exists items individually
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-003: 2nd init already-exists — S2b per-item assertions in smoke script", () => {
  it("TC-003: script asserts exit 0 for S2b", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_exit_zero[^"]*"S2b\/exit-zero"/);
  });

  it("TC-003: script asserts 'global config: already exists' in S2b output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("global config: already exists");
  });

  it("TC-003: script asserts '.gitignore: already exists' in S2b output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain(".gitignore: already exists");
  });

  it("TC-003: script asserts 'specrunner/drafts: already exists' in S2b output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("specrunner/drafts: already exists");
  });

  it("TC-003: script asserts 'specrunner/changes: already exists' in S2b output", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("specrunner/changes: already exists");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: 半初期化からの補完 — created / already-exists の項目別分離
// Source: spec.md > Scenario: half-initialized repo is completed with a per-item
//         created / already-exists split
//
// WHEN the smoke asserts S2c (half-initialized: config kept, scaffold removed)
// THEN the script asserts config=already-exists and the other 3=created
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-004: half-init split — S2c created/already-exists assertions in smoke script", () => {
  it("TC-004: script asserts exit 0 for S2c", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_exit_zero[^"]*"S2c\/exit-zero"/);
  });

  it("TC-004: script asserts global config 'already exists' in S2c (config was kept)", async () => {
    const content = await readSmokeScript();
    // .+ matches any non-newline char including quotes, spanning the variable arg between name and expected
    expect(content).toMatch(/assert_contains.+"S2c\/report-config-kept".+"global config: already exists"/);
  });

  it("TC-004: script asserts .gitignore 'created' in S2c (scaffold was removed)", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_contains.+"S2c\/report-gitignore".+"\.gitignore: created"/);
  });

  it("TC-004: script asserts specrunner/drafts 'created' in S2c", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_contains.+"S2c\/report-drafts".+"specrunner\/drafts: created"/);
  });

  it("TC-004: script asserts specrunner/changes 'created' in S2c", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_contains.+"S2c\/report-changes".+"specrunner\/changes: created"/);
  });

  it("TC-004: script removes scaffold (rm -rf specrunner .gitignore) before S2c", async () => {
    const content = await readSmokeScript();
    // The script must actually remove the scaffold to set up the half-init state
    expect(content).toMatch(/rm\s+-rf.*specrunner.*\.gitignore|rm\s+-rf.*\.gitignore.*specrunner/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: 隔離 XDG init → doctor の config-file-exists = pass（per-check 判定）
// Source: spec.md > Scenario: isolated XDG init then doctor reports
//         config-file-exists pass judged per-check
//
// WHEN the smoke asserts S3 XDG contract
// THEN the script parses doctor --json and checks config-file-exists per-check status
//      (NOT the overall doctor process exit code)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-005: isolated XDG doctor config-file-exists=pass per-check in smoke script", () => {
  it("TC-005: script asserts config-file-exists=pass check individually", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("config-file-exists=pass");
  });

  it("TC-005: script uses per-check status assertion (S3/config-file-exists via pass/fail helpers)", async () => {
    const content = await readSmokeScript();
    // The script uses pass/fail helper functions (not an "assert" wrapper) for S3 results
    expect(content).toMatch(/(pass|fail).*"S3\/config-file-exists"/);
  });

  it("TC-005: script parses doctor JSON to extract per-check status (uses node -e)", async () => {
    const content = await readSmokeScript();
    // Doctor JSON parsing must use node -e (no jq external dependency)
    expect(content).toMatch(/node\s+-e/);
  });

  it("TC-005: script does NOT use doctor overall exit code as the config-file-exists gate", async () => {
    const content = await readSmokeScript();
    // The doctor command invocations use shell line-continuation with || true on the next line,
    // so [\s\S]*? is needed to match across the backslash newline.
    expect(content).toMatch(/doctor\s+--json[\s\S]*?\|\|\s*true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: doctor の per-check 結果が root / subdirectory で同値
// Source: spec.md > Scenario: doctor per-check results are identical from root
//         and subdirectory
//
// WHEN the smoke asserts S3 root/subdirectory equivalence
// THEN the script runs doctor --json from BOTH root AND subdirectory
//      and compares the per-check (name, status) sets
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-006: doctor root/subdirectory identical — S3 assertions in smoke script", () => {
  it("TC-006: script runs doctor --json from the repo root", async () => {
    const content = await readSmokeScript();
    // Root run stores to a separate file from sub run
    expect(content).toMatch(/doctor\s+--json[\s\S]*s3-doctor-root\.json/);
  });

  it("TC-006: script runs doctor --json from the subdirectory", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/doctor\s+--json[\s\S]*s3-doctor-sub\.json/);
  });

  it("TC-006: script asserts the root and subdirectory results are identical (S3/root-sub-identical via pass/fail)", async () => {
    const content = await readSmokeScript();
    // The script uses pass/fail helper functions for S3 root-vs-sub comparison result
    expect(content).toMatch(/(pass|fail).*"S3\/root-sub-identical"/);
  });

  it("TC-006: script compares sorted per-check (name=status) sets from both runs", async () => {
    const content = await readSmokeScript();
    // The node -e comparison must compare sorted arrays (JSON.stringify of sorted arrays).
    // Uses [\s\S]*? for multiline matching since sort() and JSON.stringify appear on different lines.
    expect(content).toMatch(/\.sort\(\)[\s\S]*?JSON\.stringify|JSON\.stringify[\s\S]*?\.sort\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: --help — exit 0 と "Usage: specrunner" 出力の assert
// Source: spec.md > Scenario: help output includes usage text
//
// WHEN the smoke asserts S5 (--help)
// THEN exit 0 AND output contains "Usage: specrunner" are both asserted
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-007: --help exit 0 + usage text — S5 assertions in smoke script", () => {
  it("TC-007: script asserts exit 0 for --help invocation (S5/help-exit)", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_exit_zero[^"]*"S5\/help-exit"/);
  });

  it("TC-007: script asserts output contains 'Usage: specrunner' (S5/help-usage)", async () => {
    const content = await readSmokeScript();
    // .+ matches any non-newline char including quotes, spanning the captured-output variable
    expect(content).toMatch(/assert_contains.+"S5\/help-usage".+"Usage: specrunner"/);
  });

  it("TC-007: --help is asserted BEFORE other scenarios (bin wiring gate at top)", async () => {
    const content = await readSmokeScript();
    // S5 (help) must appear before S1 in the file
    const s5Index = content.indexOf("S5/help-exit");
    const s1Index = content.indexOf("S1/exit-nonzero");
    expect(s5Index).toBeGreaterThan(-1);
    expect(s1Index).toBeGreaterThan(-1);
    expect(s5Index).toBeLessThan(s1Index);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: subdirectory request new — repo root 着地・入れ子なし
// Source: spec.md > Scenario: request new from a subdirectory lands at repo
//         root without nesting
//
// WHEN the smoke asserts S4 (request new from subdirectory)
// THEN the script asserts request.md at repo root and no nested specrunner/
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-008: subdirectory request new root landing — S4 assertions in smoke script", () => {
  it("TC-008: script asserts exit 0 for S4 request new", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_exit_zero[^"]*"S4\/exit-zero"/);
  });

  it("TC-008: script asserts request.md exists at repo root (S4/root-request-md)", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_present[^"]*"S4\/root-request-md"/);
  });

  it("TC-008: script asserts no nested specrunner/ in subdirectory after S4 (S4/no-nested-specrunner)", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/assert_absent[^"]*"S4\/no-nested-specrunner"/);
  });

  it("TC-008: S4 uses a valid slug matching /^[a-z0-9][a-z0-9-]{0,63}$/", async () => {
    const content = await readSmokeScript();
    // The slug must be set as a variable and match the pattern
    const slugMatch = content.match(/S4_SLUG="([^"]+)"/);
    expect(slugMatch).not.toBeNull();
    const slug = slugMatch![1]!;
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: smoke が bun / repo src/ を参照しない（ソース純粋性）
// Source: spec.md > Scenario: the smoke does not reference bun or repository sources
//
// WHEN the smoke script is analyzed for forbidden references
// THEN no bun command invocations and no src/ path references are found
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-009: smoke script has no bun invocations and no src/ references", () => {
  it("TC-009: smoke script does not invoke bun as a command", async () => {
    const content = await readSmokeScript();
    const lines = content.split("\n");
    const invocationLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return false;
      // Strip single and double-quoted strings to avoid flagging echo messages
      const withoutQuoted = trimmed
        .replace(/'[^']*'/g, "''")
        .replace(/"[^"]*"/g, '""');
      // Detect bun as an actual command invocation at statement position
      return /(?:^|[$|;&(]\s*)\bbun\b/.test(withoutQuoted);
    });
    expect(invocationLines).toHaveLength(0);
  });

  it("TC-009: smoke script does not reference repository src/ directory", async () => {
    const content = await readSmokeScript();
    const lines = content.split("\n");
    const srcRefLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return false;
      // Path-like references to src/ (not just the substring "src" in variable names)
      return /[/.]src\//.test(trimmed);
    });
    expect(srcRefLines).toHaveLength(0);
  });

  it("TC-009: all CLI invocations in smoke use npx --no-install specrunner (not node dist directly)", async () => {
    const content = await readSmokeScript();
    // The run_cli helper must invoke npx --no-install specrunner
    expect(content).toContain("npx --no-install specrunner");
    // There should be no direct invocations of `node dist/` or `node ./dist/`
    const lines = content.split("\n");
    const directNodeDistLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return false;
      return /\bnode\s+[./]*dist\//.test(trimmed);
    });
    expect(directNodeDistLines).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: token 有無に依存しない assert 構成
// Source: spec.md > Requirement: Smoke SHALL run hermetically and token-free
//         > Scenario: assertions hold regardless of ambient tokens
//
// WHEN the smoke script runs doctor checks
// THEN it uses per-check status (not overall exit code) so token absence does not
//      affect the config-file-exists assertion
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-010: token-free — doctor judgment uses per-check status, not overall exit code", () => {
  it("TC-010: doctor --json invocations suppress exit code with || true to avoid token-driven failure", async () => {
    const content = await readSmokeScript();
    // Both doctor runs (root and sub) must not propagate non-zero exit to the script.
    // Each doctor invocation spans multiple lines (backslash continuation) so we count
    // occurrences of "doctor --json" and verify || true appears after each via multiline pattern.
    const doctorCount = (content.match(/doctor\s+--json/g) ?? []).length;
    // At least 2: one for root, one for subdirectory (comments excluded by rough count)
    expect(doctorCount).toBeGreaterThanOrEqual(2);
    // || true must appear after each doctor --json (multiline span via [\s\S]*?)
    const trueCount = (content.match(/doctor\s+--json[\s\S]*?\|\|\s*true/g) ?? []).length;
    expect(trueCount).toBeGreaterThanOrEqual(2);
  });

  it("TC-010: script does not use doctor process exit code as the pass/fail gate for config-file-exists", async () => {
    const content = await readSmokeScript();
    // The config-file-exists assertion must use the parsed JSON name=status,
    // NOT a pattern like `if doctor ... ; then pass else fail`
    // Verify: the pass for config-file-exists relies on the S3_CFG variable from JSON parse
    expect(content).toContain("config-file-exists=pass");
    // And the comparison must be a string comparison, not exit-code check
    expect(content).toMatch(/\[\s*"\$\{?S3_CFG\}?"\s*=\s*"config-file-exists=pass"\s*\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-011: fixtures と config がホスト環境から隔離される
// Source: spec.md > Requirement: Smoke SHALL run hermetically and token-free
//         > Scenario: fixtures and config are isolated from the host
//
// WHEN the smoke invokes the CLI
// THEN XDG_CONFIG_HOME and HOME are redirected to temp-directory paths,
//      not the host user's real directories
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-011: fixture isolation — XDG_CONFIG_HOME and HOME set in CLI invocations", () => {
  it("TC-011: smoke script defines isolated XDG_CONFIG_HOME directories for fixtures", async () => {
    const content = await readSmokeScript();
    // Script must create at least one XDG isolation variable pointing to SMOKE_TMP
    expect(content).toMatch(/XDG_CONFIG_HOME.*SMOKE_TMP|SMOKE_TMP.*XDG_CONFIG_HOME/);
  });

  it("TC-011: run_cli helper sets HOME to an isolated temp path on every invocation", async () => {
    const content = await readSmokeScript();
    // run_cli function body must set HOME=... to the isolated home variable
    expect(content).toMatch(/run_cli\s*\(\s*\)[\s\S]*?HOME="\$\{/);
  });

  it("TC-011: run_cli helper sets XDG_CONFIG_HOME to an isolated temp path on every invocation", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/run_cli\s*\(\s*\)[\s\S]*?XDG_CONFIG_HOME="\$\{/);
  });

  it("TC-011: S1 and F2 scenarios use separate isolated XDG_CONFIG_HOME directories", async () => {
    const content = await readSmokeScript();
    // Script must define at least two separate XDG dirs (S1 and F2 are independent)
    const xdgVars = content.match(/\w+_XDG="\${SMOKE_TMP}[^"]*"/g) ?? [];
    expect(xdgVars.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: dist 未 build 時のスクリプト明示エラー停止
// Source: tasks.md > T-01
//
// GIVEN dist/specrunner.js does not exist
// WHEN  bash scripts/smoke/package-smoke.sh is executed
// THEN  script exits non-zero and outputs an error mentioning 'dist' and 'build'
//       without proceeding to npm pack
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-015: dist-missing explicit error stop (behavioral)", () => {
  it("TC-015: exits non-zero when SMOKE_REPO_ROOT has no dist/specrunner.js", () => {
    const result = spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir, // tmpDir has no dist/
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(result.status).not.toBe(0);
  });

  it("TC-015: outputs an error mentioning 'dist' when dist is absent", () => {
    const result = spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir,
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    expect(output.toLowerCase()).toMatch(/dist/);
  });

  it("TC-015: outputs an error mentioning 'build' when dist is absent", () => {
    const result = spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir,
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    expect(output.toLowerCase()).toMatch(/build/);
  });

  it("TC-015: exits quickly without running npm pack (pre-check fires before expensive operations)", () => {
    const startMs = Date.now();
    spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir,
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });
    const elapsedMs = Date.now() - startMs;
    // Must exit well before npm pack would finish
    expect(elapsedMs).toBeLessThan(5_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: tarball install 後の bin 配線（node_modules/.bin/specrunner）の存在確認
// Source: design.md > D2: install 後 node_modules/.bin/specrunner が生成されて
//         いることを前提条件として検査する
//
// WHEN the script checks for node_modules/.bin/specrunner after npm install
// THEN it fails immediately (not silently) if the symlink is absent
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: bin wiring sentinel — script checks node_modules/.bin/specrunner", () => {
  it("TC-016: script explicitly checks that node_modules/.bin/specrunner exists", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("node_modules/.bin/specrunner");
  });

  it("TC-016: script exits non-zero and prints an error if .bin/specrunner is absent", async () => {
    const content = await readSmokeScript();
    // Must have an exit 1 (or non-zero exit) guarded by the bin check
    expect(content).toMatch(/\.bin\/specrunner[\s\S]*?exit\s+1|exit\s+1[\s\S]*?\.bin\/specrunner/);
  });

  it("TC-016: bin wiring check covers ALL fixture install directories", async () => {
    const content = await readSmokeScript();
    // The script must check both F1 (non-git) and F2 (git repo) installs
    // by iterating over them (for loop or explicit check per dir)
    expect(content).toMatch(/for\s+\w+\s+in[^;]+;\s*do[\s\S]*?\.bin\/specrunner|\.bin\/specrunner[\s\S]*?for/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: GIT_CEILING_DIRECTORIES による S1 fixture の repo 外保証
// Source: design.md > D3 / tasks.md > T-02
//         (should priority)
//
// WHEN the script validates that S1 fixture is outside any git repo
// THEN it uses GIT_CEILING_DIRECTORIES to bound upward git search,
//      and verifies with git rev-parse before running the assertion
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017: GIT_CEILING_DIRECTORIES bounds S1 repo-outside check", () => {
  it("TC-017: script sets GIT_CEILING_DIRECTORIES in run_cli or CLI invocations", async () => {
    const content = await readSmokeScript();
    expect(content).toContain("GIT_CEILING_DIRECTORIES");
  });

  it("TC-017: script uses git rev-parse to validate S1 fixture is outside a git repo", async () => {
    const content = await readSmokeScript();
    // Pre-check with git rev-parse before S1 assertion
    expect(content).toMatch(/git\s+.*rev-parse/);
  });

  it("TC-017: script fails S1 with an environment error if fixture is detected inside a git repo", async () => {
    const content = await readSmokeScript();
    // Must have a guard that fails (fail ... or exit 1) when fixture appears to be in a repo
    expect(content).toMatch(/fail\s+"S1\/env-guard"|S1\/env-guard.*fail/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-018: temp ディレクトリと tarball の cleanup（trap による後片付け）
// Source: tasks.md > T-01
//         (should priority)
//
// WHEN the smoke script exits (normally or on error)
// THEN trap cleanup removes temp dirs and the generated tarball
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-018: trap EXIT cleanup for temp dirs and tarball", () => {
  it("TC-018: script registers a trap on EXIT for cleanup", async () => {
    const content = await readSmokeScript();
    expect(content).toMatch(/trap\s+\w+\s+EXIT/);
  });

  it("TC-018: cleanup function removes the SMOKE_TMP temporary directory", async () => {
    const content = await readSmokeScript();
    // cleanup() must reference SMOKE_TMP for removal
    expect(content).toMatch(/rm\s+-rf[^#]*SMOKE_TMP|SMOKE_TMP[^#]*rm\s+-rf/);
  });

  it("TC-018: cleanup function removes the PACK_DIR temporary directory", async () => {
    const content = await readSmokeScript();
    // cleanup() must reference PACK_DIR for removal
    expect(content).toMatch(/rm\s+-rf[^#]*PACK_DIR|PACK_DIR[^#]*rm\s+-rf/);
  });

  it("TC-018: cleanup is triggered on both normal exit and error exit", async () => {
    const content = await readSmokeScript();
    // trap on EXIT covers both normal and error exits (signal EXIT is universal)
    expect(content).toMatch(/trap\s+cleanup\s+EXIT/);
  });
});
