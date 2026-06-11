/**
 * T-10: executeReviewersNew unit tests.
 *
 * Verifies:
 * - generates specrunner/reviewers/<name>.md
 * - scaffold passes parseReviewerDefinition + validateReviewerDefinitions
 * - invalid name → exit 2
 * - existing file → exit 1
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { executeReviewersNew } from "../../../src/core/command/reviewers-new.js";
import { parseReviewerDefinition } from "../../../src/core/reviewers/definition.js";
import { validateReviewerDefinitions } from "../../../src/core/reviewers/validate.js";

let tempDir: string;
let _stderrSpy: ReturnType<typeof import("vitest").vi.spyOn>;
let _stdoutSpy: ReturnType<typeof import("vitest").vi.spyOn>;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reviewers-new-test-"));
  const { vi } = await import("vitest");
  _stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  _stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  const { vi } = await import("vitest");
  vi.restoreAllMocks();
});

describe("executeReviewersNew — success", () => {
  it("creates specrunner/reviewers/<name>.md and returns 0", async () => {
    const result = await executeReviewersNew("security", tempDir);
    expect(result).toBe(0);
    const fileAbs = path.join(tempDir, "specrunner/reviewers/security.md");
    const stat = await fs.stat(fileAbs);
    expect(stat.isFile()).toBe(true);
  });

  it("generated file passes parseReviewerDefinition → validateReviewerDefinitions", async () => {
    await executeReviewersNew("perf-check", tempDir);
    const fileAbs = path.join(tempDir, "specrunner/reviewers/perf-check.md");
    const content = await fs.readFile(fileAbs, "utf-8");
    const def = parseReviewerDefinition("perf-check.md", content);
    expect(() => validateReviewerDefinitions([def])).not.toThrow();
  });

  it("generated file has activation condition comments but no active conditions", async () => {
    await executeReviewersNew("style", tempDir);
    const fileAbs = path.join(tempDir, "specrunner/reviewers/style.md");
    const content = await fs.readFile(fileAbs, "utf-8");
    // The template should have commented-out paths/requestTypes
    expect(content).toContain("# paths:");
    expect(content).toContain("# requestTypes:");
  });
});

describe("executeReviewersNew — invalid name", () => {
  it("returns 2 for name with uppercase", async () => {
    const result = await executeReviewersNew("Security", tempDir);
    expect(result).toBe(2);
  });

  it("returns 2 for name starting with hyphen", async () => {
    const result = await executeReviewersNew("-security", tempDir);
    expect(result).toBe(2);
  });

  it("returns 2 for empty name", async () => {
    const result = await executeReviewersNew("", tempDir);
    expect(result).toBe(2);
  });
});

describe("executeReviewersNew — collision", () => {
  it("returns 1 when file already exists", async () => {
    // Create the file first
    const dirAbs = path.join(tempDir, "specrunner/reviewers");
    await fs.mkdir(dirAbs, { recursive: true });
    await fs.writeFile(path.join(dirAbs, "security.md"), "existing content", "utf-8");

    const result = await executeReviewersNew("security", tempDir);
    expect(result).toBe(1);
  });
});
