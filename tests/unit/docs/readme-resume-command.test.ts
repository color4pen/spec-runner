/**
 * Drift guard: README.md must not document the nonexistent top-level
 * `specrunner resume` command. Resume guidance should use
 * `specrunner job resume` instead.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

const README_PATH = path.resolve(process.cwd(), "README.md");

describe("README resume command drift guard", () => {
  it("does not reference a top-level specrunner resume command", async () => {
    const content = await readFile(README_PATH, "utf-8");

    expect(content).not.toContain("specrunner resume");
  });
});
