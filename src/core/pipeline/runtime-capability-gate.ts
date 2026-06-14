/**
 * Runtime capability gate for pipeline profiles that declare a permissionScope.
 *
 * Purpose: a pipeline profile that declares permissionScope requires a runtime
 * that can derive changed files. This preflight check enforces that constraint
 * before any job state is created (착수前 reject).
 *
 * Design:
 * - Pure domain module — no I/O, no filesystem, no SDK imports.
 * - Judgement is based on descriptor.permissionScope presence, NOT on profile name.
 *   Future scope-declaring profiles inherit this gate automatically via registry registration.
 * - Import edges: core/pipeline → core/port (existing allowed edge).
 */
import type { PipelineDescriptor } from "./types.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// UnsupportedRuntimeCapabilityError
// ---------------------------------------------------------------------------

/**
 * Thrown by assertRuntimeSupportsScope when a pipeline profile that declares
 * permissionScope is selected but the current runtime cannot derive changed files.
 *
 * The error is thrown BEFORE bootstrapJob, so no job state is ever created
 * (착수前 reject, same position as validateReviewerDefinitions).
 */
export class UnsupportedRuntimeCapabilityError extends Error {
  /** Pipeline id that declared the unsatisfiable permissionScope requirement. */
  public readonly pipelineId: string;

  constructor(pipelineId: string) {
    const message =
      `選択された pipeline "${pipelineId}" は permissionScope を宣言しており、` +
      `changed-files を導出できる runtime が必要ですが、現在の runtime はその能力を持ちません。\n` +
      `代替案:\n` +
      `  - permissionScope を宣言しない pipeline を選ぶ（例: standard）\n` +
      `  - permissionScope を宣言しない profile を使う\n` +
      `  - changed-files を導出できる runtime で実行する`;
    super(message);
    this.name = "UnsupportedRuntimeCapabilityError";
    this.pipelineId = pipelineId;
  }
}

// ---------------------------------------------------------------------------
// assertRuntimeSupportsScope
// ---------------------------------------------------------------------------

/**
 * Assert that the runtime satisfies the capability requirement declared by the
 * pipeline descriptor's permissionScope.
 *
 * Gate logic:
 *   - If descriptor.permissionScope is absent → no requirement → pass (return).
 *   - If runtime.canDeriveChangedFiles?.() === false → capability not met → throw.
 *   - If runtime.canDeriveChangedFiles?.() === true OR absent (undefined) → pass (return).
 *
 * The gate fires ONLY on the intersection of:
 *   descriptor.permissionScope !== undefined  AND  canDeriveChangedFiles?.() === false
 *
 * Judgement is derived from descriptor.permissionScope presence — NOT from descriptor.id value.
 * No "if id === 'fast'" or similar profile-name branches exist here.
 *
 * @param descriptor - resolved PipelineDescriptor for the selected pipeline
 * @param runtime    - RuntimeStrategy (only canDeriveChangedFiles is consulted)
 * @throws UnsupportedRuntimeCapabilityError when scope is declared and runtime cannot derive changed files
 */
export function assertRuntimeSupportsScope(
  descriptor: PipelineDescriptor,
  runtime: Pick<RuntimeStrategy, "canDeriveChangedFiles">,
): void {
  if (descriptor.permissionScope === undefined) {
    // No scope declared — no capability requirement — pass.
    return;
  }

  // Scope is declared. Check runtime capability.
  // canDeriveChangedFiles is optional on RuntimeStrategy.
  // absent (undefined) → treated as "does not block" (fall-through to listChangedFiles path).
  // false             → capability not met → throw.
  // true              → capability met → pass.
  if (runtime.canDeriveChangedFiles?.() === false) {
    throw new UnsupportedRuntimeCapabilityError(descriptor.id);
  }
}
