/**
 * Lockfile-based package manager detection.
 * Detection priority: lockfile (upward search) → packageManager field in package.json → fallback "npm".
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

/** Result returned by detectPackageManager. */
export interface DetectPmResult {
  pm: PackageManager;
  /** Directory where the lockfile was found. Equals cwd when no lockfile was found via upward search. */
  root: string;
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
 * Searches for lockfiles starting at `cwd` and walking up parent directories.
 * Stops when a lockfile is found, a `.git` entry is encountered, or the filesystem
 * root is reached. Falls back to the `packageManager` field in `cwd/package.json`,
 * then to `"npm"`.
 *
 * @param cwd - Starting directory for lockfile search.
 * @param fsLike - Optional fs abstraction for testing; defaults to node:fs / node:fs/promises.
 * @returns `{ pm, root }` — detected package manager and the directory where the lockfile was found.
 *   `root` equals `cwd` when no lockfile was found via upward search.
 */
export async function detectPackageManager(
  cwd: string,
  fsLike?: DetectPmFs,
): Promise<DetectPmResult> {
  const fs: DetectPmFs = fsLike ?? {
    existsSync: nodeFs.existsSync,
    readFile: (p, enc) => nodeFsp.readFile(p, enc),
  };

  // 1. Walk upward from cwd looking for lockfiles, stopping at .git or filesystem root
  let dir = cwd;
  while (true) {
    // Check lockfiles in priority order (first match wins)
    for (const [lockfile, pm] of LOCKFILE_MAP) {
      if (fs.existsSync(path.join(dir, lockfile))) {
        return { pm, root: dir };
      }
    }

    // Stop at git root (.git directory or gitdir file)
    if (fs.existsSync(path.join(dir, ".git"))) {
      break;
    }

    // Stop at filesystem root
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  // 2. Fallback: packageManager field in cwd/package.json (not upward search)
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { packageManager?: unknown };
    if (typeof pkg.packageManager === "string") {
      const name = pkg.packageManager.split("@")[0] as PackageManager;
      if (KNOWN_PMS.has(name)) {
        return { pm: name, root: cwd };
      }
    }
  } catch {
    // swallow: absent / malformed package.json → fall through to default
  }

  // 3. Default
  return { pm: "npm", root: cwd };
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
