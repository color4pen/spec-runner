/**
 * Run root path layout for the artifact-output profile.
 * T-06: run-layout.ts — path functions plus run-root creation; no process.cwd().
 *
 * All paths are derived from the injected runRoot argument.
 */
import * as nodePath from "node:path";
import * as fs from "node:fs/promises";

// ─── Path resolvers ───────────────────────────────────────────────────────────

/** Resolve path to run.json within the run root. */
export function runJsonPath(runRoot: string): string {
  return nodePath.join(runRoot, "run.json");
}

/** Resolve path to the baseline snapshot evidence file. */
export function baselineSnapshotPath(runRoot: string): string {
  return nodePath.join(runRoot, "baseline", "snapshot.json");
}

/** Resolve path to the candidate workspace directory. */
export function candidateDir(runRoot: string): string {
  return nodePath.join(runRoot, "candidate");
}

/** Resolve path to the steps directory. */
export function stepsDir(runRoot: string): string {
  return nodePath.join(runRoot, "steps");
}

/** Resolve path to the artifact staging directory. */
export function artifactStagingDir(runRoot: string): string {
  return nodePath.join(runRoot, "artifact.staging");
}

/** Resolve path to the final artifact directory. */
export function artifactDir(runRoot: string): string {
  return nodePath.join(runRoot, "artifact");
}

// ─── Run root / source containment ───────────────────────────────────────────

/**
 * Resolve `p` to a real (symlink-free) absolute path even when its tail does not
 * exist yet: the deepest existing ancestor is resolved with realpath and the
 * remaining segments are re-joined.
 */
async function realpathOfDeepestExisting(p: string): Promise<string> {
  let current = nodePath.resolve(p);
  const pending: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(current);
      return pending.length === 0 ? real : nodePath.join(real, ...pending);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = nodePath.dirname(current);
      if (parent === current) throw err; // filesystem root missing: cannot happen, but fail-closed
      pending.unshift(nodePath.basename(current));
      current = parent;
    }
  }
}

function isSameOrInside(candidate: string, container: string): boolean {
  const rel = nodePath.relative(container, candidate);
  return rel === "" || (!rel.startsWith("..") && !nodePath.isAbsolute(rel));
}

/**
 * Fail-closed guard: the run root (`parentDir/runId`) must be disjoint from the
 * source root. Both paths are compared after symlink resolution so a symlinked
 * parent pointing into the source (or vice versa) is rejected too.
 *
 * A run root inside the source would make SpecRunner write into the user's
 * source directory (baseline evidence, candidate, artifact) — violating the
 * "source is never written" contract — and would also feed the run's own output
 * back into the source snapshot. A source inside the run root is rejected for
 * the symmetric reason.
 */
export async function assertRunRootDisjointFromSource(
  sourceRoot: string,
  parentDir: string,
  runId: string,
): Promise<void> {
  const realSource = await fs.realpath(sourceRoot);
  const realRunRoot = await realpathOfDeepestExisting(nodePath.join(parentDir, runId));
  if (isSameOrInside(realRunRoot, realSource)) {
    throw new Error(`Run root must not be inside the source directory: runRoot=${realRunRoot} source=${realSource}`);
  }
  if (isSameOrInside(realSource, realRunRoot)) {
    throw new Error(`Source directory must not be inside the run root: source=${realSource} runRoot=${realRunRoot}`);
  }
}

// ─── Run root creation ────────────────────────────────────────────────────────

/**
 * Create the run root directory and required subdirectories.
 * Fails with an error if the run root already exists (fail-closed).
 */
export async function createRunRoot(parentDir: string, runId: string): Promise<string> {
  const runRoot = nodePath.join(parentDir, runId);

  // Fail-closed: do not reuse an existing run root
  try {
    await fs.access(runRoot);
    throw new Error(`Run root already exists: ${runRoot}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  // Create the run root and required subdirectories
  await fs.mkdir(runRoot, { recursive: false });
  await fs.mkdir(nodePath.join(runRoot, "baseline"), { recursive: false });
  await fs.mkdir(candidateDir(runRoot), { recursive: false });
  await fs.mkdir(stepsDir(runRoot), { recursive: false });

  return runRoot;
}
