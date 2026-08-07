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
  const found = findLockfile(cwd, fs);
  if (found) {
    return { pm: found.pm, root: found.root };
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

/** Result returned by findLockfile. */
export interface FindLockfileResult {
  pm: PackageManager;
  filename: string;
  root: string;
}

/**
 * Find the first lockfile by walking upward from `cwd`.
 *
 * Replicates the phase-1 upward search of `detectPackageManager` but returns
 * structured data instead of only the pm. Stops when a lockfile is found,
 * a `.git` entry is encountered, or the filesystem root is reached.
 *
 * @param cwd - Starting directory for lockfile search.
 * @param fsLike - Optional fs abstraction for testing (only needs `existsSync`).
 * @returns `{ pm, filename, root }` when a lockfile is found, `null` otherwise.
 */
export function findLockfile(
  cwd: string,
  fsLike?: { existsSync(path: string): boolean },
): FindLockfileResult | null {
  const exists = fsLike?.existsSync ?? nodeFs.existsSync;

  let dir = cwd;
  while (true) {
    for (const [lockfile, pm] of LOCKFILE_MAP) {
      if (exists(path.join(dir, lockfile))) {
        return { pm, filename: lockfile, root: dir };
      }
    }

    // Stop at git root
    if (exists(path.join(dir, ".git"))) {
      break;
    }

    // Stop at filesystem root
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return null;
}

/**
 * Returns true if `name` (basename) is one of the lockfile names tracked by LOCKFILE_MAP.
 *
 * @param name - Basename of the file to check (e.g. "bun.lock", "package-lock.json").
 */
export function isLockfileName(name: string): boolean {
  return LOCKFILE_MAP.some(([lockfile]) => lockfile === name);
}

/**
 * Returns a factory that builds the run command for the given package manager.
 * All PMs: `<pm> run <script>`.
 */
export function runCommand(pm: PackageManager): (script: string) => [string, ...string[]] {
  return (script: string) => [pm, "run", script];
}

/**
 * Check whether a directory contains JS dependency management traces.
 *
 * Returns `true` if any lockfile from LOCKFILE_MAP exists directly under `repoRoot`,
 * or if `package.json` exists directly under `repoRoot`. Returns `false` otherwise.
 *
 * Used to decide whether to run the default detectPm + install when `workspace.setup`
 * is not configured. Non-JS / greenfield projects (no lockfile, no package.json) return
 * `false` → worktree setup skips install automatically.
 *
 * @param repoRoot - The directory to check (typically the git repository root).
 * @param fsLike - Optional fs abstraction for testing; defaults to node:fs.existsSync.
 */
export function hasJsDependencyTraces(
  repoRoot: string,
  fsLike?: { existsSync(path: string): boolean },
): boolean {
  const fs = fsLike ?? { existsSync: nodeFs.existsSync };

  // Check for any lockfile in LOCKFILE_MAP
  for (const [lockfile] of LOCKFILE_MAP) {
    if (fs.existsSync(path.join(repoRoot, lockfile))) {
      return true;
    }
  }

  // Check for package.json
  return fs.existsSync(path.join(repoRoot, "package.json"));
}
