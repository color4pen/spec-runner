/**
 * Shared types for the finish command modules.
 */

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
  rm(path: string, opts: { recursive: boolean; force: boolean }): Promise<void>;
}

