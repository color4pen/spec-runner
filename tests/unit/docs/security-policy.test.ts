/**
 * Drift guard: SECURITY.md must exist and contain the required sections and key strings.
 * Fails when SECURITY.md is removed or a required heading / anchor phrase is accidentally deleted.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SECURITY_PATH = path.resolve(process.cwd(), "SECURITY.md");

describe("SECURITY.md drift guard", () => {
  it("SECURITY.md exists", async () => {
    const stat = await fs.stat(SECURITY_PATH);
    expect(stat.isFile()).toBe(true);
  });

  const REQUIRED_HEADINGS = [
    "## Supported Versions",
    "## Reporting a Vulnerability",
    "## Response Expectations",
    "## Scope",
  ];

  it.each(REQUIRED_HEADINGS)(
    "SECURITY.md contains heading '%s'",
    async (heading) => {
      const content = await fs.readFile(SECURITY_PATH, "utf-8");
      expect(content).toContain(heading);
    },
  );

  it("SECURITY.md contains 'Report a vulnerability' (reporting link anchor)", async () => {
    const content = await fs.readFile(SECURITY_PATH, "utf-8");
    expect(content).toContain("Report a vulnerability");
  });

  it("SECURITY.md references 'trust model' (case-insensitive)", async () => {
    const content = await fs.readFile(SECURITY_PATH, "utf-8");
    expect(content.toLowerCase()).toContain("trust model");
  });
});
