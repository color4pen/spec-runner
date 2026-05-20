/**
 * Tests for src/core/command/request-show.ts
 *
 * TC-SHOW-001: existing slug → stdout content + exit 0
 * TC-SHOW-002: nonexistent slug → exit 1
 * TC-SHOW-003: invalid slug → exit 2
 * TC-SHOW-004: valid slug with hyphens → passes validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-req-show-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function createRequest(slug: string, content: string): Promise<void> {
  const activeDir = path.join(tempDir, "specrunner", "requests", "active");
  await fs.mkdir(activeDir, { recursive: true });
  await fs.writeFile(path.join(activeDir, slug + ".md"), content, "utf-8");
}

async function invokeExecuteShow(slug: string, cwd = tempDir) {
  const { executeShow } = await import("../../../../src/core/command/request-show.js");
  return executeShow(slug, cwd);
}

// TC-SHOW-001: existing slug → stdout content + exit 0
describe("TC-SHOW-001: existing slug outputs content to stdout", () => {
  it("returns 0 and writes content to stdout", async () => {
    const content = "# My Feature\n\nSome content here.\n";
    await createRequest("my-feature", content);

    const result = await invokeExecuteShow("my-feature");

    expect(result).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(output).toContain("# My Feature");
    expect(output).toContain("Some content here.");
  });
});

// TC-SHOW-002: nonexistent slug → exit 1
describe("TC-SHOW-002: nonexistent slug returns exit 1", () => {
  it("returns 1 and writes error to stderr", async () => {
    const result = await invokeExecuteShow("nonexistent");

    expect(result).toBe(1);
    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Request not found: nonexistent");
  });
});

// TC-SHOW-003: invalid slug (space) → exit 2
describe("TC-SHOW-003: invalid slug (space) returns exit 2", () => {
  it("returns 2 for 'invalid slug' with space", async () => {
    const result = await invokeExecuteShow("invalid slug");

    expect(result).toBe(2);
    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("Invalid slug");
  });
});

// TC-SHOW-004: path traversal → exit 2
describe("TC-SHOW-004: path traversal slug returns exit 2", () => {
  it("returns 2 for '../../evil' slug", async () => {
    const result = await invokeExecuteShow("../../evil");

    expect(result).toBe(2);
  });
});

// TC-SHOW-005: valid slug with hyphens and digits passes
describe("TC-SHOW-005: valid slug my-feature-123 passes validation", () => {
  it("returns 0 when slug exists", async () => {
    await createRequest("my-feature-123", "# Feature 123\n");

    const result = await invokeExecuteShow("my-feature-123");

    expect(result).toBe(0);
  });
});
