/**
 * Re-exports from src/util/git-exec.ts for backward compatibility.
 * The canonical implementation lives in util/git-exec.ts.
 */
export {
  defaultSpawnFn,
  gitExec,
  gitExecExitCode,
  runSubprocess,
} from "../../util/git-exec.js";
export type { SpawnFn } from "../../util/git-exec.js";
