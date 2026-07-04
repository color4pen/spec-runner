import { configSchema } from "../../src/config/schema.js";
import type {
  SpecRunnerConfig,
  StepExecutionConfig,
  AgentRecord,
  ModelEntry,
  EnvironmentConfig,
  SpecReviewConfig,
  PipelineConfig,
  ProgressConfig,
  VerificationConfig,
  VerificationCommand,
  ShellCommand,
  WorkspaceConfig,
  LogsConfig,
  ArchiveConfig,
  GitHubHostConfig,
} from "../../src/config/schema.js";
import type { infer as ZodInfer } from "zod/v4-mini";

// Strict structural equality helper (type-challenges pattern).
// (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
// is only true when X and Y have identical type structure — distinguishes
// { x?: T } from {} so optional-only additions on either side are caught.
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

type I = ZodInfer<typeof configSchema>;

// ---------------------------------------------------------------------------
// Top-level whole-object equality
// Fields separated by design (D3):
//   - "steps": byRequestType recursion — interface is recursive Record<string, StepExecutionConfig>,
//     schema uses a separate flat byRequestTypeEntrySchema. Cannot reach Equal at container level.
//   - "agents": schema-level nullability — agentRecordSchema is nullable(), so inferred value type
//     is AgentRecord | null. Interface omits | null (managed.ts accesses un-guarded).
//   - "specFixer": interface-only placeholder (Record<string, never>). Schema intentionally omits it;
//     adding it would be a runtime/dist change and is out of scope.
// ---------------------------------------------------------------------------
type _Top = Expect<
  Equal<Omit<I, "steps" | "agents">, Omit<SpecRunnerConfig, "steps" | "agents" | "specFixer">>
>;

// ---------------------------------------------------------------------------
// steps entry-level assertions (byRequestType excluded both sides, per design D3)
// ---------------------------------------------------------------------------
type InfStepEntry = NonNullable<NonNullable<I["steps"]>[string]>;
type _StepEntry = Expect<
  Equal<Omit<InfStepEntry, "byRequestType">, Omit<StepExecutionConfig, "byRequestType">>
>;
type InfByRtEntry = NonNullable<NonNullable<InfStepEntry["byRequestType"]>[string]>;
type _ByRtEntry = Expect<Equal<InfByRtEntry, Omit<StepExecutionConfig, "byRequestType">>>;

// ---------------------------------------------------------------------------
// agents schema-derived shape assertion
// ---------------------------------------------------------------------------
type _AgentRecord = Expect<Equal<NonNullable<NonNullable<I["agents"]>[string]>, AgentRecord>>;

// ---------------------------------------------------------------------------
// Remaining sub-interface assertions (diagnostic locality, requirement 3)
// ---------------------------------------------------------------------------
type _Model = Expect<Equal<NonNullable<I["models"]>[string], ModelEntry>>;
type _Env = Expect<Equal<NonNullable<I["environment"]>, EnvironmentConfig>>;
type _SpecReview = Expect<Equal<NonNullable<I["specReview"]>, SpecReviewConfig>>;
type _Pipeline = Expect<Equal<NonNullable<I["pipeline"]>, PipelineConfig>>;
type _Progress = Expect<Equal<NonNullable<I["progress"]>, ProgressConfig>>;
type _Verification = Expect<Equal<NonNullable<I["verification"]>, VerificationConfig>>;
type _VerCmd = Expect<
  Equal<NonNullable<NonNullable<I["verification"]>["commands"]>[number], VerificationCommand>
>;
type _Logs = Expect<Equal<NonNullable<I["logs"]>, LogsConfig>>;
type _Archive = Expect<Equal<NonNullable<I["archive"]>, ArchiveConfig>>;
type _Github = Expect<Equal<NonNullable<I["github"]>, GitHubHostConfig>>;

// ---------------------------------------------------------------------------
// workspace type assertions (T-07)
// ---------------------------------------------------------------------------
type _Workspace = Expect<Equal<NonNullable<I["workspace"]>, WorkspaceConfig>>;
type _SetupCmd = Expect<Equal<NonNullable<NonNullable<I["workspace"]>["setup"]>[number], ShellCommand>>;
// VerificationCommand is an alias for ShellCommand — existing assertion remains green
type _VerCmdIsShellCmd = Expect<Equal<VerificationCommand, ShellCommand>>;
