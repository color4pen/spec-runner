/**
 * Shared types for the finish command modules.
 */
import type { SpawnFn } from "../../util/spawn.js";

/**
 * Data returned from gh pr view for the feature PR.
 * Shared between preflight.ts and pr-status.ts.
 */
export interface PrViewData {
  state: string;
  mergeStateStatus?: string;
  headRefName?: string;
}

/**
 * Resolved target from input resolution (jobId / --slug / active detection).
 */
export interface ResolvedTarget {
  jobId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  slug: string;
  /**
   * Path to the persistent job worktree (local runtime only).
   * null for managed mode or crash recovery without a worktree.
   */
  worktreePath?: string | null;
}

/**
 * Injectable fs boundary for finish modules (mirrors DoctorFs pattern).
 */
export interface FinishFs {
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
  /**
   * Get file/directory stats for path.
   * Used for directory detection in archive spec detection logic.
   */
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  mkdir(path: string, opts: { recursive: boolean }): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
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
