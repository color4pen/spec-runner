/**
 * Verification phase configuration.
 * Maps phase names to package.json script names.
 * All phases run as `bun run <script>` via the runner.
 *
 * Using script names (not runner commands) allows the target project's
 * package.json to specify the actual test runner (e.g. vitest, jest, bun test).
 */

/** All verification phase names, in fail-fast order. */
export type PhaseName = "build" | "typecheck" | "test" | "lint" | "security";

/** Ordered list of phase names for sequential execution. */
export const PHASE_NAMES: readonly PhaseName[] = [
  "build",
  "typecheck",
  "test",
  "lint",
  "security",
] as const;

/**
 * Mapping from phase name to package.json script name.
 * These script names are looked up in the target project's package.json.
 * If a script is absent, the phase is recorded as "skipped".
 */
export const PHASE_SCRIPTS: Record<PhaseName, string> = {
  build: "build",
  typecheck: "typecheck",
  test: "test",
  lint: "lint",
  security: "security",
};
