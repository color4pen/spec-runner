/**
 * Design-layer entry gate: runs `aozu check --request <path>` when enabled.
 *
 * The gate is intentionally side-effect free (no throws); callers interpret the result:
 *   - runPreflight: passed===false → throw SpecRunnerError(DESIGN_LAYER_CHECK_FAILED)
 *   - executeValidate: passed===false → return 1
 */
import type { SpawnFn } from "../../util/spawn.js";
import { spawnCommand } from "../../util/spawn.js";
import { stderrWrite as defaultStderrWrite } from "../../logger/stdout.js";
import type { ResolvedDesignLayer } from "../../config/schema.js";

export type DesignLayerGateResult =
  | { passed: true; skipped: boolean }
  | { passed: false; exitCode: number | null; diagnostics: string };

export interface CheckGateParams {
  requestMdPath: string;
  requestType: string;
  designLayer: ResolvedDesignLayer;
  cwd: string;
  /** Injectable spawn function. Defaults to spawnCommand. */
  spawn?: SpawnFn;
  /** Injectable stderr writer for diagnostic transparency. Defaults to stderrWrite. */
  stderrWrite?: (s: string) => void;
}

/**
 * Run the design-layer check gate.
 * When designLayer.enabled is not true, returns {passed:true, skipped:true} without spawning.
 * When enabled, spawns `<command> check --request <path>` and returns the result.
 * aozu stderr diagnostics are forwarded to stderrWrite for user visibility.
 */
export async function runDesignLayerCheckGate(
  params: CheckGateParams,
): Promise<DesignLayerGateResult> {
  const {
    requestMdPath,
    requestType,
    designLayer,
    cwd,
    spawn = spawnCommand,
    stderrWrite = defaultStderrWrite,
  } = params;

  // When disabled, skip entirely — no spawn, no side effects.
  if (designLayer.enabled !== true) {
    return { passed: true, skipped: true };
  }

  const args: string[] = ["check", "--request", requestMdPath];
  if (designLayer.requireCitationTypes.includes(requestType)) {
    args.push("--require-citation");
  }

  const result = await spawn(designLayer.command, args, { cwd });

  if (result.exitCode === 0) {
    return { passed: true, skipped: false };
  }

  // Non-zero exit: forward stderr diagnostics and return failure.
  if (result.stderr) {
    stderrWrite(result.stderr.trimEnd());
  }

  return {
    passed: false,
    exitCode: result.exitCode,
    diagnostics: result.stderr,
  };
}
