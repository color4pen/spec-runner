/**
 * Unit tests for src/cli/version.ts — resolveVersionFromDir
 *
 * TC-VERSION-01: resolves version from dist-style layout (1 level below package.json)
 * TC-VERSION-02: resolves version from src-style layout (2 levels below package.json)
 * TC-VERSION-03: throws when no package.json exists in any ancestor
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SEED_VERSION = "9.8.7";

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specrunner-version-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

async function importResolveVersionFromDir(): Promise<(startDir: string) => string> {
  const { resolveVersionFromDir } = await import("../../../src/cli/version.js");
  return resolveVersionFromDir;
}

// TC-VERSION-01: dist-style layout — package.json one level above startDir
describe("TC-VERSION-01: resolves version from dist-style layout", () => {
  it("returns the seed version when package.json is 1 level above startDir", async () => {
    const resolveVersionFromDir = await importResolveVersionFromDir();

    const root = makeTempDir();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "test-pkg", version: SEED_VERSION }),
    );
    const distDir = path.join(root, "dist");
    fs.mkdirSync(distDir);

    expect(resolveVersionFromDir(distDir)).toBe(SEED_VERSION);
  });
});

// TC-VERSION-02: src-style layout — package.json two levels above startDir
describe("TC-VERSION-02: resolves version from src-style layout", () => {
  it("returns the seed version when package.json is 2 levels above startDir", async () => {
    const resolveVersionFromDir = await importResolveVersionFromDir();

    const root = makeTempDir();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "test-pkg", version: SEED_VERSION }),
    );
    const srcCliDir = path.join(root, "src", "cli");
    fs.mkdirSync(srcCliDir, { recursive: true });

    expect(resolveVersionFromDir(srcCliDir)).toBe(SEED_VERSION);
  });
});

// TC-VERSION-03: no package.json in any ancestor → throw
describe("TC-VERSION-03: throws when no package.json found", () => {
  it("throws an error when no package.json exists in any ancestor directory", async () => {
    const resolveVersionFromDir = await importResolveVersionFromDir();

    // Use a directory guaranteed to have no package.json in its ancestors
    // by using a deeply nested temp path that we fully control
    const root = makeTempDir();
    const deepDir = path.join(root, "a", "b", "c");
    fs.mkdirSync(deepDir, { recursive: true });
    // No package.json written anywhere under root

    expect(() => resolveVersionFromDir(deepDir)).toThrow();
  });
});
