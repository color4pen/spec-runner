/**
 * Run root path layout for the artifact-output profile.
 * T-06: run-layout.ts — pure path functions, no I/O, no process.cwd().
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
