/**
 * Tests for src/core/command/request-rm.ts
 *
 * TC-RM-001: existing slug → file deleted + exit 0
 * TC-RM-002: nonexistent slug → exit 1
 * TC-RM-003: path traversal slug → exit 2 (no filesystem access)
 * TC-RM-004: valid slug passes validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-req-rm-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function createRequest(slug: string): Promise<void> {
  const activeDir = path.join(tempDir, "specrunner", "requests", "active");
  await fs.mkdir(activeDir, { recursive: true });
  await fs.writeFile(path.join(activeDir, slug + ".md"), "# test\n", "utf-8");
}

async function invokeExecuteRm(slug: string, cwd = tempDir) {
  const { executeRm } = await import("../../../../src/core/command/request-rm.js");
  return executeRm(slug, cwd);
}

// TC-RM-001: existing slug → deleted + exit 0
describe("TC-RM-001: existing slug deletes file and returns 0", () => {
  it("removes the .md file and returns 0", async () => {
    await createRequest("to-delete");

    const result = await invokeExecuteRm("to-delete");

    expect(result).toBe(0);

    const filePath = path.join(tempDir, "specrunner", "requests", "active", "to-delete.md");
    await expect(fs.access(filePath)).rejects.toThrow();

    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Removed: specrunner/requests/active/to-delete.md");
  });
});

// TC-RM-002: nonexistent slug → exit 1
describe("TC-RM-002: nonexistent slug returns exit 1", () => {
  it("returns 1 and writes error to stderr", async () => {
    const result = await invokeExecuteRm("ghost-slug");

    expect(result).toBe(1);
    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Request not found: ghost-slug");
  });
});

// TC-RM-003: path traversal → exit 2, no filesystem access
describe("TC-RM-003: path traversal slug returns exit 2 without filesystem access", () => {
  it("returns 2 for '../../etc/passwd' slug", async () => {
    const result = await invokeExecuteRm("../../etc/passwd");

    expect(result).toBe(2);
    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Invalid slug");
  });
});

// TC-RM-004: uppercase letters → exit 2
describe("TC-RM-004: uppercase slug rejected with exit 2", () => {
  it("returns 2 for 'MyFeature'", async () => {
    const result = await invokeExecuteRm("MyFeature");
    expect(result).toBe(2);
  });
});

// TC-RM-005: valid slug my-feature-123 passes validation
describe("TC-RM-005: valid slug passes validation and deletes", () => {
  it("accepts 'my-feature-123' and removes it", async () => {
    await createRequest("my-feature-123");

    const result = await invokeExecuteRm("my-feature-123");
    expect(result).toBe(0);
  });
});
