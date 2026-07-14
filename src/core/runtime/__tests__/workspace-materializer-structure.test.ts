/**
 * Structure gate: asserts that manager.create() calls reside in
 * workspace-materializer.ts and NOT in local.ts.
 *
 * This catches the failure mode where the implementation was copied rather
 * than moved, or where manager.create() was accidentally re-added to local.ts.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(__dirname, "..");

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = source.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

const localSrc = fs.readFileSync(path.join(runtimeDir, "local.ts"), "utf-8");
const materializerSrc = fs.readFileSync(
  path.join(runtimeDir, "workspace-materializer.ts"),
  "utf-8",
);

describe("Structural ownership: manager.create", () => {
  it("local.ts contains 0 occurrences of manager.create(", () => {
    expect(countOccurrences(localSrc, "manager.create(")).toBe(0);
  });

  it("workspace-materializer.ts contains ≥2 occurrences of manager.create(", () => {
    expect(countOccurrences(materializerSrc, "manager.create(")).toBeGreaterThanOrEqual(2);
  });
});

describe("Structural ownership: liveness sidecar", () => {
  it("workspace-materializer.ts contains ≥1 occurrence of writeLivenessSidecar(", () => {
    expect(countOccurrences(materializerSrc, "writeLivenessSidecar(")).toBeGreaterThanOrEqual(1);
  });
});

describe("Structural ownership: registerWorkspace", () => {
  it("workspace-materializer.ts contains ≥1 occurrence of registerWorkspace(", () => {
    expect(countOccurrences(materializerSrc, "registerWorkspace(")).toBeGreaterThanOrEqual(1);
  });
});
