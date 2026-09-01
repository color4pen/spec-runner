/**
 * RuntimeFacade: composition-root aggregate type for CommandRunner subclasses.
 *
 * Defined in the domain layer (src/core/) rather than:
 * - src/core/port/command-runtime.ts (ports): would require a ports→domain import
 *   edge for PipelineDepsBuilder, which is forbidden by the §3 DSM matrix.
 * - src/core/runtime/factory.ts (composition-root): PipelineRunCommand and
 *   ResumeCommand (domain) cannot import from composition-root.
 *
 * This file is importable by:
 * - domain layer: src/core/command/pipeline-run.ts, src/core/command/resume.ts
 * - composition-root: src/core/runtime/factory.ts, src/cli/bootstrap.ts
 *   (composition-root may import from domain per §3 whitelist)
 *
 * LocalRuntime and ManagedRuntime satisfy RuntimeFacade structurally.
 * Contract compliance is verified at compile time in command-lifecycle-contract.test.ts.
 */
import type {
  ProviderReadinessCapability,
  JobBootstrapCapability,
  WorkspaceLifecycleCapability,
  JobStatePersistenceCapability,
} from "./port/command-runtime.js";
import type { ChangedFilesCapability } from "./port/runtime-strategy.js";
import type { PipelineDepsBuilder } from "./types.js";

export type RuntimeFacade = ProviderReadinessCapability
  & JobBootstrapCapability
  & WorkspaceLifecycleCapability
  & JobStatePersistenceCapability
  & PipelineDepsBuilder
  & ChangedFilesCapability;
