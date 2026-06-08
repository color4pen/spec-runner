/**
 * Verification phase configuration.
 * Maps phase names to package.json script names.
 * All phases run via the package manager run command detected at runtime.
 *
 * Using script names (not runner commands) allows the target project's
 * package.json to specify the actual test runner (e.g. vitest, jest, bun test).
 */

/** All verification phase names, in fail-fast order. */
export type PhaseName = "build" | "typecheck" | "test" | "lint" | "security" | "test-coverage";

/** Ordered list of phase names for sequential execution. */
export const PHASE_NAMES: readonly PhaseName[] = [
  "build",
  "typecheck",
  "test",
  "lint",
  "security",
  "test-coverage",
] as const;

/**
 * Phase names that correspond to package.json scripts.
 * "test-coverage" is excluded — it is an internal processing phase
 * that does not spawn a child process.
 */
export type ScriptPhaseName = Exclude<PhaseName, "test-coverage">;

/**
 * Mapping from script phase name to package.json script name.
 * These script names are looked up in the target project's package.json.
 * If a script is absent, the phase is recorded as "skipped".
 *
 * "test-coverage" is NOT included — it runs as CLI internal processing,
 * not as a package.json script.
 */
export const PHASE_SCRIPTS: Record<ScriptPhaseName, string> = {
  build: "build",
  typecheck: "typecheck",
  test: "test",
  lint: "lint",
  security: "security",
};
