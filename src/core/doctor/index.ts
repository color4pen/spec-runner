/**
 * Public API of the doctor subsystem.
 */
export type {
  DoctorCheck,
  DoctorContext,
  DoctorResult,
  DoctorCategory,
  DoctorFs,
  DoctorConfig,
  DoctorGitHubClient,
  ExecFileFunction,
} from "./types.js";
export { runChecks } from "./runner.js";
export { formatHuman, formatJson } from "./formatter.js";
export { allChecks } from "./checks/index.js";
