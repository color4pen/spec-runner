/**
 * Tests for src/core/command/request-new.ts
 *
 * TC-NEW-001: valid new slug → creates <slug>.md
 * TC-NEW-002: existing slug → SLUG_COLLISION error (exit 1)
 * TC-NEW-003: invalid slug (path traversal) → exit 2
 * TC-NEW-004: invalid slug (uppercase) → exit 2
 * TC-NEW-005: valid slug passes through validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-req-new-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function invokeExecuteNew(slug: string, type = "new-feature", cwd = tempDir) {
  // Reset module cache so process.cwd() is fresh
  const { executeNew } = await import("../../../../src/core/command/request-new.js");
  return executeNew(slug, type, cwd);
}

// TC-NEW-001: valid new slug → creates flat file
describe("TC-NEW-001: valid new slug creates <slug>.md", () => {
  it("creates specrunner/requests/active/my-feature.md and returns 0", async () => {
    const result = await invokeExecuteNew("my-feature");
    expect(result).toBe(0);

    const filePath = path.join(tempDir, "specrunner", "requests", "active", "my-feature.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## Meta");
    expect(content).toContain("new-feature");

    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Created: specrunner/requests/active/my-feature.md");
  });
});

// TC-NEW-002: slug collision → exit 1
describe("TC-NEW-002: slug collision returns exit 1", () => {
  it("returns 1 when slug already exists in active/", async () => {
    // Create the flat file first
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(path.join(activeDir, "existing-slug.md"), "# existing\n");

    const result = await invokeExecuteNew("existing-slug");
    expect(result).toBe(1);

    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("existing-slug");
  });
});

// TC-NEW-003: path traversal → exit 2
describe("TC-NEW-003: path traversal slug rejected with exit 2", () => {
  it("returns 2 for '../../evil' slug", async () => {
    const result = await invokeExecuteNew("../../evil");
    expect(result).toBe(2);

    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Invalid slug");
  });
});

// TC-NEW-004: uppercase slug → exit 2
describe("TC-NEW-004: uppercase slug rejected with exit 2", () => {
  it("returns 2 for 'MyFeature' slug", async () => {
    const result = await invokeExecuteNew("MyFeature");
    expect(result).toBe(2);
  });
});

// TC-NEW-005: valid slug with hyphens and digits → passes
describe("TC-NEW-005: valid slug with hyphens and digits", () => {
  it("accepts 'my-feature-123' slug and creates flat file", async () => {
    const result = await invokeExecuteNew("my-feature-123");
    expect(result).toBe(0);

    const filePath = path.join(tempDir, "specrunner", "requests", "active", "my-feature-123.md");
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });
});

// TC-NEW-006: --type option changes template type
describe("TC-NEW-006: --type option sets request type in template", () => {
  it("creates file with spec-change type", async () => {
    const result = await invokeExecuteNew("my-spec", "spec-change");
    expect(result).toBe(0);

    const filePath = path.join(tempDir, "specrunner", "requests", "active", "my-spec.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("spec-change");
  });
});
