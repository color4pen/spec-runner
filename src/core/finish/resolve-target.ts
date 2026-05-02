/**
 * Input resolution for finish command.
 * Resolves target job via jobId / --slug / awaiting-merge dir auto-detection.
 *
 * TC-001 through TC-006.
 */
import * as path from "node:path";
import { listJobStates, loadJobState } from "../../state/store.js";
import type { ResolvedTarget } from "./types.js";

export interface ResolveTargetInput {
  jobId?: string;
  slug?: string;
  /** Base directory for awaiting-merge detection (defaults to cwd) */
  cwd?: string;
}

export type ResolveTargetResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; exitCode: 2; message: string };

/**
 * Resolve the finish target from the given inputs.
 * Priority: jobId → --slug → awaiting-merge auto-detection.
 *
 * TC-001: jobId resolves state file
 * TC-002: --slug resolves single match
 * TC-003: --slug multiple matches → picks latest updatedAt (stdout warning)
 * TC-004: awaiting-merge 1 entry → auto-detect
 * TC-005: awaiting-merge 0 entries → exit code 2
 * TC-006: awaiting-merge 2+ entries → exit code 2
 */
export async function resolveTarget(
  input: ResolveTargetInput,
  stdoutWrite: (msg: string) => void = (m) => process.stdout.write(m + "\n"),
): Promise<ResolveTargetResult> {
  // 1. jobId direct resolution
  if (input.jobId) {
    try {
      const state = await loadJobState(input.jobId);
      const slug = path.basename(state.request.path);
      const prNumber = state.pullRequest?.number;
      const prUrl = state.pullRequest?.url;
      const branch = state.branch;

      if (!prNumber || !prUrl || !branch) {
        return {
          ok: false,
          exitCode: 2,
          message: `Job ${input.jobId} is missing pullRequest or branch info. Was the pr-create step completed?`,
        };
      }

      return {
        ok: true,
        target: {
          jobId: input.jobId,
          prNumber,
          prUrl,
          branch,
          slug,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, exitCode: 2, message };
    }
  }

  // 2. --slug fallback
  if (input.slug) {
    const allStates = await listJobStates();
    const matching = allStates.filter(
      (s) => path.basename(s.request.path) === input.slug,
    );

    if (matching.length === 0) {
      return {
        ok: false,
        exitCode: 2,
        message: `No job found with slug '${input.slug}'. Run 'specrunner ps' to see available jobs.`,
      };
    }

    let chosen = matching[0]!;

    if (matching.length > 1) {
      // Pick latest updatedAt
      matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      chosen = matching[0]!;
      stdoutWrite(
        `Multiple jobs found for slug '${input.slug}'. Using most recently updated: ${chosen.jobId} (${chosen.updatedAt})`,
      );
    }

    const prNumber = chosen.pullRequest?.number;
    const prUrl = chosen.pullRequest?.url;
    const branch = chosen.branch;

    if (!prNumber || !prUrl || !branch) {
      return {
        ok: false,
        exitCode: 2,
        message: `Job ${chosen.jobId} is missing pullRequest or branch info. Was the pr-create step completed?`,
      };
    }

    return {
      ok: true,
      target: {
        jobId: chosen.jobId,
        prNumber,
        prUrl,
        branch,
        slug: input.slug,
      },
    };
  }

  // 3. awaiting-merge dir auto-detection
  const awaitingMergeDir = path.join(
    input.cwd ?? process.cwd(),
    "openspec-workflow",
    "requests",
    "awaiting-merge",
  );

  let entries: string[];
  try {
    const { readdir } = await import("node:fs/promises");
    const dirents = await readdir(awaitingMergeDir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      entries = [];
    } else {
      throw err;
    }
  }

  if (entries.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      message: [
        "No awaiting-merge slugs found.",
        "",
        "Usage: specrunner finish <jobId>",
        "       specrunner finish --slug <slug>",
        "",
        "Provide a jobId or --slug to specify which job to finish.",
      ].join("\n"),
    };
  }

  if (entries.length > 1) {
    return {
      ok: false,
      exitCode: 2,
      message: [
        `Multiple awaiting-merge slugs found: ${entries.join(", ")}`,
        "",
        "Specify which one to finish:",
        ...entries.map((e) => `  specrunner finish --slug ${e}`),
      ].join("\n"),
    };
  }

  // Exactly 1 slug — auto-detect
  const autoSlug = entries[0]!;
  stdoutWrite(`Auto-detected awaiting-merge slug: ${autoSlug}`);

  // Now find the state by slug
  return resolveTarget({ slug: autoSlug, cwd: input.cwd }, stdoutWrite);
}
