/**
 * Shared types for the finish command modules.
 */
import type { SpawnFn } from "../../util/spawn.js";

/**
 * Normalized PR state — 6 canonical states.
 * All mergeStateStatus variants from GitHub are mapped to these.
 */
export type NormalizedPrState =
  | "OPEN_MERGEABLE"
  | "OPEN_BEHIND"
  | "OPEN_CONFLICTS"
  | "OPEN_CHECKS_FAILING"
  | "MERGED"
  | "CLOSED";

/** All 6 normalized PR states (for exhaustive test verification) */
export const ALL_NORMALIZED_PR_STATES: NormalizedPrState[] = [
  "OPEN_MERGEABLE",
  "OPEN_BEHIND",
  "OPEN_CONFLICTS",
  "OPEN_CHECKS_FAILING",
  "MERGED",
  "CLOSED",
];

/**
 * Resolved target from input resolution (jobId / --slug / awaiting-merge detection).
 */
export interface ResolvedTarget {
  jobId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  slug: string;
}

/**
 * Injectable fs boundary for finish modules (mirrors DoctorFs pattern).
 */
export interface FinishFs {
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, opts: { recursive: boolean }): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

/**
 * Context for finish step modules.
 */
export interface FinishContext {
  spawn: SpawnFn;
  fs: FinishFs;
  cwd: string;
}

/**
 * Input flags for the finish command.
 */
export interface FinishFlags {
  force?: boolean;
  cleanupOnly?: boolean;
}
