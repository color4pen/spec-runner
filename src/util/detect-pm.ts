/**
 * Lockfile-based package manager detection.
 * Detection priority: lockfile → packageManager field in package.json → fallback "npm".
 * External dependencies: none (node:* only).
 */
import * as path from "node:path";
import * as nodeFs from "node:fs";
import * as nodeFsp from "node:fs/promises";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface DetectPmFs {
  existsSync(path: string): boolean;
  readFile(path: string, encoding: "utf-8"): Promise<string>;
}

/** Ordered lockfile → PM mapping (first match wins). */
const LOCKFILE_MAP: Array<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

const KNOWN_PMS = new Set<PackageManager>(["bun", "pnpm", "yarn", "npm"]);

/**
 * Detect the package manager used in `cwd`.
 *
 * @param cwd - Directory to inspect (where lockfiles live).
 * @param fsLike - Optional fs abstraction for testing; defaults to node:fs / node:fs/promises.
 */
export async function detectPackageManager(
  cwd: string,
  fsLike?: DetectPmFs,
): Promise<PackageManager> {
  const fs: DetectPmFs = fsLike ?? {
    existsSync: nodeFs.existsSync,
    readFile: (p, enc) => nodeFsp.readFile(p, enc),
  };

  // 1. Check lockfiles (priority order, first match wins)
  for (const [lockfile, pm] of LOCKFILE_MAP) {
    if (fs.existsSync(path.join(cwd, lockfile))) {
      return pm;
    }
  }

  // 2. Fallback: packageManager field in package.json
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { packageManager?: unknown };
    if (typeof pkg.packageManager === "string") {
      const name = pkg.packageManager.split("@")[0] as PackageManager;
      if (KNOWN_PMS.has(name)) {
        return name;
      }
    }
  } catch {
    // swallow: absent / malformed package.json → fall through to default
  }

  // 3. Default
  return "npm";
}

/**
 * Returns the install command for the given package manager.
 * npm uses `npm ci`; all others use `<pm> install --frozen-lockfile`.
 */
export function installCommand(pm: PackageManager): [string, ...string[]] {
  if (pm === "npm") {
    return ["npm", "ci"];
  }
  return [pm, "install", "--frozen-lockfile"];
}

/**
 * Returns a factory that builds the run command for the given package manager.
 * All PMs: `<pm> run <script>`.
 */
export function runCommand(pm: PackageManager): (script: string) => [string, ...string[]] {
  return (script: string) => [pm, "run", script];
}
