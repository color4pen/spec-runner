/**
 * Regression test: finish archives to changes/archive/ only, no requests/merged/ writes.
 *
 * TC-ARCH-001: move-requests-dir.ts is not imported by orchestrator.ts
 * TC-ARCH-002: orchestrator does not import move-requests-dir
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ORCHESTRATOR_PATH = path.resolve(
  import.meta.dirname ?? __dirname,
  "../../../../src/core/finish/orchestrator.ts",
);

describe("TC-ARCH-001: move-requests-dir.ts is not imported by orchestrator.ts", () => {
  it("orchestrator.ts does not contain move-requests-dir import", () => {
    const content = fs.readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(content).not.toContain("move-requests-dir");
  });
});

describe("TC-ARCH-002: move-requests-dir.ts file does not exist", () => {
  it("move-requests-dir.ts has been deleted", () => {
    const moveRequestsDirPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/core/finish/move-requests-dir.ts",
    );
    expect(fs.existsSync(moveRequestsDirPath)).toBe(false);
  });
});
