/**
 * Drift guard: README.md must contain every STEP_NAMES value and the four new section headings.
 * Fails when a step is renamed in step-names.ts without updating README, or when a required
 * section is accidentally removed.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { STEP_NAMES } from "../../../src/kernel/step-names.js";

const README_PATH = path.resolve(process.cwd(), "README.md");

describe("README ↔ STEP_NAMES drift guard", () => {
  it("README.md exists", async () => {
    const stat = await fs.stat(README_PATH);
    expect(stat.isFile()).toBe(true);
  });

  it.each(Object.values(STEP_NAMES))(
    "README.md contains step name '%s'",
    async (stepName) => {
      const content = await fs.readFile(README_PATH, "utf-8");
      expect(content).toContain(stepName);
    },
  );
});

describe("README required section headings", () => {
  const REQUIRED_HEADINGS = [
    "## Stability",
    "## How the Pipeline Works",
    "## Cost",
    "## Assumptions & Supported Scope",
  ];

  it.each(REQUIRED_HEADINGS)(
    "README.md contains heading '%s'",
    async (heading) => {
      const content = await fs.readFile(README_PATH, "utf-8");
      expect(content).toContain(heading);
    },
  );
});
