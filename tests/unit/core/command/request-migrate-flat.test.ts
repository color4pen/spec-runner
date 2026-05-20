/**
 * Unit tests for src/core/command/request-migrate-flat.ts
 *
 * TC-MIG-001: dir形式 → flat形式 変換 + 空 dir 削除
 * TC-MIG-002: extra files がある dir は request.md だけ move、dir は残す (partial migration)
 * TC-MIG-003: request.md がない dir はスキップ
 * TC-MIG-004: active/ / merged/ が存在しない場合はスキップ
 * TC-MIG-005: active と merged 両方を変換する
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { migrateRequestsFlat } from "../../../../src/core/command/request-migrate-flat.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-flat-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function createDirRequest(subdir: "active" | "merged", slug: string, extraFiles: string[] = []): Promise<void> {
  const slugDir = path.join(tempDir, "specrunner", "requests", subdir, slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(path.join(slugDir, "request.md"), `# ${slug}\n`, "utf-8");
  for (const extra of extraFiles) {
    await fs.writeFile(path.join(slugDir, extra), `extra: ${extra}\n`, "utf-8");
  }
}

// TC-MIG-001
describe("TC-MIG-001: normal migration converts dir to flat file and removes empty dir", () => {
  it("moves request.md to <slug>.md and removes empty dir", async () => {
    await createDirRequest("active", "my-feature");

    const result = await migrateRequestsFlat(tempDir);

    expect(result.migrated).toContain("active/my-feature");
    expect(result.partial).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);

    // flat file exists
    const flatPath = path.join(tempDir, "specrunner", "requests", "active", "my-feature.md");
    const content = await fs.readFile(flatPath, "utf-8");
    expect(content).toContain("# my-feature");

    // old dir is gone
    const oldDir = path.join(tempDir, "specrunner", "requests", "active", "my-feature");
    await expect(fs.access(oldDir)).rejects.toThrow();
  });
});

// TC-MIG-002
describe("TC-MIG-002: partial migration leaves dir when extra files present", () => {
  it("moves request.md but retains dir with extra files", async () => {
    await createDirRequest("active", "with-extras", ["research-result.md"]);

    const result = await migrateRequestsFlat(tempDir);

    expect(result.partial).toContain("active/with-extras");
    expect(result.migrated).toHaveLength(0);

    // flat file exists
    const flatPath = path.join(tempDir, "specrunner", "requests", "active", "with-extras.md");
    const content = await fs.readFile(flatPath, "utf-8");
    expect(content).toContain("# with-extras");

    // dir still exists (has extra files)
    const slugDir = path.join(tempDir, "specrunner", "requests", "active", "with-extras");
    await expect(fs.access(slugDir)).resolves.toBeUndefined();

    // extra file still in dir
    const extraPath = path.join(slugDir, "research-result.md");
    await expect(fs.access(extraPath)).resolves.toBeUndefined();

    // request.md is removed from dir
    const requestMdInDir = path.join(slugDir, "request.md");
    await expect(fs.access(requestMdInDir)).rejects.toThrow();

    // warning written to stderr
    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("partial migration");
    expect(stderrOutput).toContain("with-extras");
  });
});

// TC-MIG-003
describe("TC-MIG-003: dir without request.md is skipped", () => {
  it("skips dirs that have no request.md", async () => {
    // Create dir without request.md
    const slugDir = path.join(tempDir, "specrunner", "requests", "active", "no-request");
    await fs.mkdir(slugDir, { recursive: true });
    await fs.writeFile(path.join(slugDir, "other.md"), "other\n");

    const result = await migrateRequestsFlat(tempDir);

    expect(result.skipped).toContain("active/no-request");
    expect(result.migrated).toHaveLength(0);
    expect(result.partial).toHaveLength(0);
  });
});

// TC-MIG-004
describe("TC-MIG-004: missing active/ or merged/ directories are skipped gracefully", () => {
  it("returns empty result when no requests directories exist", async () => {
    const result = await migrateRequestsFlat(tempDir);

    expect(result.migrated).toHaveLength(0);
    expect(result.partial).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});

// TC-MIG-005
describe("TC-MIG-005: migrates both active and merged subdirs", () => {
  it("converts dir-form requests in both active/ and merged/", async () => {
    await createDirRequest("active", "active-slug");
    await createDirRequest("merged", "merged-slug");

    const result = await migrateRequestsFlat(tempDir);

    expect(result.migrated).toContain("active/active-slug");
    expect(result.migrated).toContain("merged/merged-slug");
    expect(result.migrated).toHaveLength(2);

    const activeFlatPath = path.join(tempDir, "specrunner", "requests", "active", "active-slug.md");
    await expect(fs.access(activeFlatPath)).resolves.toBeUndefined();

    const mergedFlatPath = path.join(tempDir, "specrunner", "requests", "merged", "merged-slug.md");
    await expect(fs.access(mergedFlatPath)).resolves.toBeUndefined();
  });
});
