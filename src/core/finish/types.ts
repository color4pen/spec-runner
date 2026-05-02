/**
 * Shared types for the finish command modules.
 */
import type { SpawnFn } from "../../util/spawn.js";

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
  /** dry-run: Phase 0 only, no destructive ops */
  dryRun?: boolean;
}
