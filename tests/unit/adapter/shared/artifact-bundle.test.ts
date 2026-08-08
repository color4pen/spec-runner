/**
 * Unit tests for buildArtifactBundle (src/adapter/shared/artifact-bundle.ts).
 *
 * TC-001: existing artifacts are bundled
 * TC-002: missing artifacts are skipped
 * TC-003: output artifacts are excluded
 * TC-004: single file or combined size exceeds 64KB → returns ""
 * TC-005: change folder or artifacts absent → returns "" (conventional prompt)
 * TC-006: buildMessage wording is unchanged (invariant — verified by existing src/core/step/ tests)
 * TC-007: two files combined exceed 64KB → returns ""
 * TC-008: change folder directory absent → returns ""
 * TC-009: change folder present, zero artifacts → returns ""
 * TC-010: non-ENOENT per-file error is skipped, other artifacts still collected (should)
 * TC-011: only INPUT_ARTIFACT_NAMES are read, output/unknown files are not touched (should)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildArtifactBundle,
  INPUT_ARTIFACT_NAMES,
  MAX_ARTIFACT_BUNDLE_BYTES,
} from "../../../../src/adapter/shared/artifact-bundle.js";

const TEST_SLUG = "test-artifact-slug";

async function makeTempCwd(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "artifact-bundle-test-"));
}

async function makeChangeFolder(cwd: string, slug: string): Promise<string> {
  const dir = path.join(cwd, "specrunner", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: 存在する artifact が同梱される
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-001: existing artifacts are bundled", () => {
  it("includes bundled-change-artifacts block with path headers and content for each present file", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      await fs.writeFile(path.join(dir, "design.md"), "DESIGN");
      await fs.writeFile(path.join(dir, "tasks.md"), "TASKS");

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);

      expect(bundle).toContain("<bundled-change-artifacts>");
      expect(bundle).toContain(`specrunner/changes/${TEST_SLUG}/design.md`);
      expect(bundle).toContain("DESIGN");
      expect(bundle).toContain(`specrunner/changes/${TEST_SLUG}/tasks.md`);
      expect(bundle).toContain("TASKS");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: 存在しない artifact はスキップされる
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-002: missing artifacts are skipped", () => {
  it("includes only existing files, omits path headers for absent ones", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      await fs.writeFile(path.join(dir, "design.md"), "DESIGN");

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);

      expect(bundle).toContain(`specrunner/changes/${TEST_SLUG}/design.md`);
      expect(bundle).toContain("DESIGN");
      expect(bundle).not.toContain(`specrunner/changes/${TEST_SLUG}/tasks.md`);
      expect(bundle).not.toContain(`specrunner/changes/${TEST_SLUG}/spec.md`);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: 出力系 artifact が除外される
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-003: output artifacts are excluded", () => {
  it("excludes verification-result.md, code-review-result-001.md, implementation-notes.md", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      await fs.writeFile(path.join(dir, "design.md"), "DESIGN");
      await fs.writeFile(path.join(dir, "verification-result.md"), "VERIFICATION");
      await fs.writeFile(path.join(dir, "code-review-result-001.md"), "CODE_REVIEW");
      await fs.writeFile(path.join(dir, "implementation-notes.md"), "IMPL_NOTES");

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);

      expect(bundle).toContain("DESIGN");
      expect(bundle).not.toContain("VERIFICATION");
      expect(bundle).not.toContain("CODE_REVIEW");
      expect(bundle).not.toContain("IMPL_NOTES");
      expect(bundle).not.toContain("verification-result.md");
      expect(bundle).not.toContain("code-review-result-001.md");
      expect(bundle).not.toContain("implementation-notes.md");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: 上限超過で同梱なしにフォールバックする
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-004: size limit exceeded → returns empty string (fail-open)", () => {
  it("returns '' when a single file exceeds MAX_ARTIFACT_BUNDLE_BYTES", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      await fs.writeFile(path.join(dir, "design.md"), "x".repeat(MAX_ARTIFACT_BUNDLE_BYTES + 1));

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);

      expect(bundle).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: change folder に入力 artifact が無い場合も従来動作になる
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-005: no artifacts → returns empty string (conventional prompt)", () => {
  it("returns '' when change folder does not exist", async () => {
    const cwd = await makeTempCwd();
    try {
      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);
      expect(bundle).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns '' when change folder exists but no input artifacts are present", async () => {
    const cwd = await makeTempCwd();
    try {
      await makeChangeFolder(cwd, TEST_SLUG);

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);
      expect(bundle).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: buildMessage 文言が変わらない（invariant）
// This TC is verified by the existing src/core/step/__tests__/ buildMessage tests
// remaining green and unchanged. The constants below pin the expected allowlist.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-006: INPUT_ARTIFACT_NAMES and MAX_ARTIFACT_BUNDLE_BYTES are stable exports", () => {
  it("INPUT_ARTIFACT_NAMES contains the 6 expected input artifact filenames in order", () => {
    expect(INPUT_ARTIFACT_NAMES).toEqual([
      "request.md",
      "design.md",
      "tasks.md",
      "spec.md",
      "test-cases.md",
      "rules.md",
    ]);
  });

  it("MAX_ARTIFACT_BUNDLE_BYTES equals 64 * 1024 = 65536", () => {
    expect(MAX_ARTIFACT_BUNDLE_BYTES).toBe(64 * 1024);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: 2 ファイルの合計が 64KB 超でも空文字を返す
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-007: two files combined exceed 64KB → returns empty string", () => {
  it("returns '' and excludes both files when combined size > MAX_ARTIFACT_BUNDLE_BYTES", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      // Each file ~33KB; combined ~66KB > 64KB
      await fs.writeFile(path.join(dir, "design.md"), "x".repeat(33 * 1024));
      await fs.writeFile(path.join(dir, "tasks.md"), "y".repeat(33 * 1024));

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);

      expect(bundle).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: change folder 不在 slug で空文字を返す
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-008: missing change folder directory → returns empty string", () => {
  it("returns '' without throwing when the change folder does not exist", async () => {
    const cwd = await makeTempCwd();
    try {
      // Deliberately do NOT create specrunner/changes/<slug>/
      const bundle = await buildArtifactBundle(cwd, "non-existent-slug-abc123");
      expect(bundle).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: change folder 存在・artifact 0 件で空文字を返す
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-009: change folder present with zero artifacts → returns empty string", () => {
  it("returns '' when change folder exists but no INPUT_ARTIFACT_NAMES files are present", async () => {
    const cwd = await makeTempCwd();
    try {
      await makeChangeFolder(cwd, TEST_SLUG);
      // No artifact files written

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);
      expect(bundle).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010 (should): 非 ENOENT エラーファイルをスキップし他 artifact を収集する
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-010: non-ENOENT per-file error is skipped, other artifacts still collected", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collects design.md and skips tasks.md when readFile throws EACCES for tasks.md", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      await fs.writeFile(path.join(dir, "design.md"), "DESIGN");
      // tasks.md does NOT exist on disk; we mock readFile to throw EACCES for it

      const eaccesErr = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      const originalReadFile = fs.readFile;

      vi.spyOn(fs, "readFile").mockImplementation(
        async (filePath: unknown, opts: unknown): Promise<string> => {
          if (typeof filePath === "string" && filePath.endsWith("tasks.md")) {
            throw eaccesErr;
          }
          // ponytail: as-any cast for overloaded readFile signature
          return (originalReadFile as (p: unknown, o: unknown) => Promise<string>)(filePath, opts);
        },
      );

      const bundle = await buildArtifactBundle(cwd, TEST_SLUG);

      expect(bundle).toContain("DESIGN");
      expect(bundle).not.toContain("tasks.md");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-011 (should): allowlist 外ファイルを read・glob しない
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-011: only INPUT_ARTIFACT_NAMES are read — output/unknown files are not touched", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("readFile is only called for INPUT_ARTIFACT_NAMES paths, not for output or unknown files", async () => {
    const cwd = await makeTempCwd();
    try {
      const dir = await makeChangeFolder(cwd, TEST_SLUG);
      await fs.writeFile(path.join(dir, "design.md"), "DESIGN");
      await fs.writeFile(path.join(dir, "verification-result.md"), "VERIFICATION");
      await fs.writeFile(path.join(dir, "unknown-file.md"), "UNKNOWN");

      const readFileSpy = vi.spyOn(fs, "readFile");
      await buildArtifactBundle(cwd, TEST_SLUG);

      const calledPaths = readFileSpy.mock.calls.map((args) => String(args[0]));

      // Every called path must have a basename that is in INPUT_ARTIFACT_NAMES
      for (const calledPath of calledPaths) {
        const basename = path.basename(calledPath);
        expect(INPUT_ARTIFACT_NAMES).toContain(basename);
      }

      // Specifically: output and unknown files must NOT be touched
      expect(calledPaths.some((p) => p.endsWith("verification-result.md"))).toBe(false);
      expect(calledPaths.some((p) => p.endsWith("unknown-file.md"))).toBe(false);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
