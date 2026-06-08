/**
 * Unit tests for detect-pm utilities.
 *
 * TC-PM-001: pnpm-lock.yaml → "pnpm"
 * TC-PM-002: bun.lockb → "bun"
 * TC-PM-003: bun.lock → "bun"
 * TC-PM-004: yarn.lock → "yarn"
 * TC-PM-005: package-lock.json → "npm"
 * TC-PM-006: packageManager field in package.json → detected PM
 * TC-PM-007: no lockfile, no packageManager field → "npm" fallback
 * TC-PM-008: multiple lockfiles → first in priority order wins
 * TC-PM-009: installCommand derivation table
 * TC-PM-010: runCommand derivation table
 */
import { describe, it, expect } from "vitest";
import { detectPackageManager, installCommand, runCommand } from "../../../src/util/detect-pm.js";
import type { DetectPmFs } from "../../../src/util/detect-pm.js";

/** Build a DetectPmFs mock from a set of existing files and optional package.json content. */
function makeFsMock(existingFiles: string[], packageJsonContent?: object): DetectPmFs {
  const existingSet = new Set(existingFiles);
  return {
    existsSync: (p: string) => existingSet.has(p),
    readFile: async (p: string) => {
      if (p.endsWith("package.json") && packageJsonContent !== undefined) {
        return JSON.stringify(packageJsonContent);
      }
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

const CWD = "/project";

// TC-PM-001
describe("TC-PM-001: pnpm-lock.yaml → pnpm", () => {
  it("detects pnpm when pnpm-lock.yaml exists", async () => {
    const fs = makeFsMock([`${CWD}/pnpm-lock.yaml`]);
    expect(await detectPackageManager(CWD, fs)).toBe("pnpm");
  });
});

// TC-PM-002
describe("TC-PM-002: bun.lockb → bun", () => {
  it("detects bun when bun.lockb exists", async () => {
    const fs = makeFsMock([`${CWD}/bun.lockb`]);
    expect(await detectPackageManager(CWD, fs)).toBe("bun");
  });
});

// TC-PM-003
describe("TC-PM-003: bun.lock → bun", () => {
  it("detects bun when bun.lock exists", async () => {
    const fs = makeFsMock([`${CWD}/bun.lock`]);
    expect(await detectPackageManager(CWD, fs)).toBe("bun");
  });
});

// TC-PM-004
describe("TC-PM-004: yarn.lock → yarn", () => {
  it("detects yarn when yarn.lock exists", async () => {
    const fs = makeFsMock([`${CWD}/yarn.lock`]);
    expect(await detectPackageManager(CWD, fs)).toBe("yarn");
  });
});

// TC-PM-005
describe("TC-PM-005: package-lock.json → npm", () => {
  it("detects npm when package-lock.json exists", async () => {
    const fs = makeFsMock([`${CWD}/package-lock.json`]);
    expect(await detectPackageManager(CWD, fs)).toBe("npm");
  });
});

// TC-PM-006
describe("TC-PM-006: packageManager field in package.json", () => {
  it("detects pnpm from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "pnpm@9.12.0" });
    expect(await detectPackageManager(CWD, fs)).toBe("pnpm");
  });

  it("detects bun from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "bun@1.0.0" });
    expect(await detectPackageManager(CWD, fs)).toBe("bun");
  });

  it("detects yarn from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "yarn@4.0.0" });
    expect(await detectPackageManager(CWD, fs)).toBe("yarn");
  });

  it("detects npm from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "npm@10.0.0" });
    expect(await detectPackageManager(CWD, fs)).toBe("npm");
  });

  it("ignores unknown PM names in packageManager field and falls back to npm", async () => {
    const fs = makeFsMock([], { packageManager: "custom-pm@1.0.0" });
    expect(await detectPackageManager(CWD, fs)).toBe("npm");
  });
});

// TC-PM-007
describe("TC-PM-007: no lockfile, no packageManager field → npm fallback", () => {
  it("returns npm when no lockfile and no package.json", async () => {
    const fs = makeFsMock([]);
    expect(await detectPackageManager(CWD, fs)).toBe("npm");
  });

  it("returns npm when package.json has no packageManager field", async () => {
    const fs = makeFsMock([], { name: "my-pkg", scripts: {} });
    expect(await detectPackageManager(CWD, fs)).toBe("npm");
  });

  it("swallows parse errors and returns npm", async () => {
    const badFs: DetectPmFs = {
      existsSync: () => false,
      readFile: async () => "{ invalid json }",
    };
    expect(await detectPackageManager(CWD, badFs)).toBe("npm");
  });
});

// TC-PM-008
describe("TC-PM-008: multiple lockfiles → priority order wins", () => {
  it("pnpm-lock.yaml beats package-lock.json", async () => {
    const fs = makeFsMock([`${CWD}/pnpm-lock.yaml`, `${CWD}/package-lock.json`]);
    expect(await detectPackageManager(CWD, fs)).toBe("pnpm");
  });

  it("bun.lockb beats yarn.lock", async () => {
    const fs = makeFsMock([`${CWD}/bun.lockb`, `${CWD}/yarn.lock`]);
    expect(await detectPackageManager(CWD, fs)).toBe("bun");
  });

  it("pnpm-lock.yaml beats all others", async () => {
    const fs = makeFsMock([
      `${CWD}/pnpm-lock.yaml`,
      `${CWD}/bun.lockb`,
      `${CWD}/yarn.lock`,
      `${CWD}/package-lock.json`,
    ]);
    expect(await detectPackageManager(CWD, fs)).toBe("pnpm");
  });
});

// TC-PM-009
describe("TC-PM-009: installCommand derivation", () => {
  it("bun → [bun, install, --frozen-lockfile]", () => {
    expect(installCommand("bun")).toEqual(["bun", "install", "--frozen-lockfile"]);
  });

  it("pnpm → [pnpm, install, --frozen-lockfile]", () => {
    expect(installCommand("pnpm")).toEqual(["pnpm", "install", "--frozen-lockfile"]);
  });

  it("yarn → [yarn, install, --frozen-lockfile]", () => {
    expect(installCommand("yarn")).toEqual(["yarn", "install", "--frozen-lockfile"]);
  });

  it("npm → [npm, ci]", () => {
    expect(installCommand("npm")).toEqual(["npm", "ci"]);
  });
});

// TC-PM-010
describe("TC-PM-010: runCommand derivation", () => {
  it("bun → [bun, run, <script>]", () => {
    expect(runCommand("bun")("build")).toEqual(["bun", "run", "build"]);
  });

  it("pnpm → [pnpm, run, <script>]", () => {
    expect(runCommand("pnpm")("test")).toEqual(["pnpm", "run", "test"]);
  });

  it("yarn → [yarn, run, <script>]", () => {
    expect(runCommand("yarn")("lint")).toEqual(["yarn", "run", "lint"]);
  });

  it("npm → [npm, run, <script>]", () => {
    expect(runCommand("npm")("typecheck")).toEqual(["npm", "run", "typecheck"]);
  });
});
