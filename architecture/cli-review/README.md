# CLI command review

> Working review notes. This directory is not normative product documentation.

Initial baseline: `main@57d9e7411b9f6dd80cbaf63531febca56a4f4ab5` (0.4.10)  
Latest re-review baseline: `main@bb435a1c1c8dced532c6a699726cf08388098128` (`auth-setup-ux`, #1001)

## Purpose

Review the CLI as one public interface, not as a bag of individually useful handlers. For each top-level command, decide whether it should be kept, renamed, moved, hidden/operator-scoped, merged, or removed.

After #1001 the registry exposes 13 top-level entries (`init`, `login`, `credentials`, `run`, `request`, `job`, `config`, `inbox`, `rules`, `reviewers`, `runtime`, `doctor`, `usage`). Excluding the promoted `run` shortcut gives 28 normal command paths; including `run` gives 29. `doctor repair` remains an inline special path outside the subcommand registry, for 30 user-facing entrances in the current implementation.

## Review rubric

Each file records:

1. User goal: what outcome the user is trying to achieve.
2. Current contract: command path, flags, side effects, prerequisites.
3. Audience: normal user / operator / repair / automation.
4. Placement: whether the current top-level grouping is correct.
5. Duplication: overlap with another command or upstream tool.
6. Discoverability: whether users should memorize it or reach it through `doctor` / `guide` / errors.
7. Machine contract: whether help, parsing, aliases and guidance are derived from the same command definition.
8. Verdict: KEEP / RENAME / MOVE / HIDE / MERGE / REMOVE / HOLD.

## Status

| top command | status | current direction |
| --- | --- | --- |
| `init` | reviewed | KEEP; provider choice stays scaffold concern; #1001 fixed silent ignore and made doctor the next step |
| `login` | re-reviewed after #1001 | KEEP as GitHub-only login; effective-source validation/deprecated migration are fixed; remove remaining global-config creation side effect later |
| `credentials` | reviewed after #1001 | KEEP as advanced/headless credential-storage namespace; `set` only, no list/show/export growth without a real need |
| `run` | reviewed | KEEP as promoted/common shortcut to canonical lifecycle spelling `job start`; alias relation should be machine-declared |
| `request` | reviewed | KEEP authoring namespace; fix repo-root/type constraints; likely merge `prompt` into future guide |
| `job` | reviewed | KEEP namespace; normal lifecycle vs operator/maintenance visibility split; move bulk terminated cleanup out of `cancel`; KEEP `stats` under job as run analytics |
| `config` | reviewed | KEEP as read/diagnostic namespace; do not add generic setter just to absorb init provider |
| `inbox` | reviewed | KEEP one-shot automation namespace; child exit codes must propagate and verbose/quiet are currently dead flags |
| `rules` | reviewed | KEEP project-artifact namespace; fix repo-root write; formally support valid custom reviewer names as rule targets |
| `reviewers` | reviewed | KEEP project-artifact namespace; fix repo-root write, share validation contract, reject built-in name collisions, make incomplete scaffold explicit |
| `runtime` | reviewed | KEEP setup/status/reset; fix reset non-TTY success-no-op semantics |
| `doctor` | re-reviewed after #1001 | KEEP as read-only readiness/setup navigator; readiness + headless guidance fixed; keep repair under doctor but make it a structured repo-required repair/operator subcommand |
| `usage` | reviewed | KEEP top-level as model/token/cost accounting; distinct from `job stats`; fix repo-root and slug validation |

## Cross-cutting observations

- `COMMANDS` is structured data, but top-level `USAGE` is separately handwritten. They already drift: implemented paths such as `job reopen`, `usage`, and the inline `doctor repair` path are not represented consistently in top help.
- Command-specific and parent-command help is optional. Commands such as `init`, the `request` family, and several `job` commands can therefore expose behavior that `--help` does not describe structurally.
- #1001 added a useful `FlagDef.deprecated` mechanism. Deprecated compatibility syntax can now remain parseable for migration guidance without remaining an active/public flag. Future CommandSpec should preserve this distinction and derive help visibility from it.
- #1001 also added mechanical tests for dead doctor guidance. This closes the specific `login --provider anthropic` failure mode, but command references should ultimately be validated from command metadata rather than source-text grep alone.
- Config JSON is the source of truth; `config effective` is a read-only resolution/source-attribution view. Avoid inventing CLI-only configuration concepts that do not exist in the schema.
- Commands should mutate only state implied by their verb. `login` still creates global config after Device Flow, and `job cancel --all-terminated` performs maintenance cleanup; both are examples of convenience behavior outliving the clean ownership boundary.
- Credential setup must respect the same source precedence as runtime resolution. #1001 fixed this at the `login` boundary. Doctor still has a minor navigation inefficiency: an invalid higher-priority token first points to `specrunner login`, which then explains the actual active-source repair. Direct source-aware doctor guidance would remove that extra hop.
- A successful exit code must mean the requested state transition actually completed (or was already satisfied). Interactive/automation guards should not silently no-op with exit 0 when an operation such as reset was refused for lack of confirmation. Repository surgery such as `doctor repair` must likewise not fall back to arbitrary cwd and report success outside a repository.
- Delegation success is not Promise resolution. When one command invokes another application operation (`inbox` -> start/resume), the delegated operation's typed result/exit status must propagate; discarding a non-zero result creates false success in automation.
- Public flags need semantic consumers. `inbox --verbose/--quiet` currently survive parsing and option plumbing without changing behavior, showing why structured flag definitions alone are not enough unless usage is connected to the application operation.
- `status` and `doctor` are different surfaces: object-specific state inspection can remain direct, while `doctor` owns readiness/health and next-action guidance.
- Plain diagnostics and repair can share a namespace without sharing mutation semantics. `doctor` should remain read-only and runnable outside a repo; `doctor repair <slug>` is a contextual mutation and must independently declare repo-required/operator-repair constraints.
- Repository-owned objects should resolve from dispatch-time repo root, not invocation depth. Explicit user file paths may remain relative to invoker cwd, but slugs/listings/state/artifacts/reporting must not disappear or be recreated under a subdirectory. The `job` review found remaining debt in start/resume/reopen/archive; `rules new`, `reviewers new`, and `usage` have the same root-vs-cwd defect.
- Repository requirement should be owned at the highest truthful command node, but child commands must be able to strengthen it. All `job` operations are repo-owned, while `doctor` is intentionally repo-optional and `doctor repair` is repo-required. A future command spec needs inheritance plus override, not only a flat boolean.
- Tolerant readers and strict writers are different contracts. Backward-compatible parsing may accept/warn on unknown values, while CLI generators should not knowingly create identities that the authoritative runtime validator rejects. Scaffold commands may intentionally create incomplete content, but must say that another edit is required before use.
- Reader/writer validation domains need one source. `reviewers new` duplicates reviewer-name validation and omits a runtime collision rule; `credentials set` keeps its accepted names in the handler rather than command metadata; positional identities such as `usage <slug>` likewise need shared domain validation before path resolution.
- Typed flag and positional parsing belongs in the command contract. Numeric flags such as `archive --merge-wait-ms` should not be reparsed with permissive `parseInt` logic in handlers, and enum-like positional values such as credential kinds should arrive prevalidated.
- Dynamic value domains need an explicit resolver. `rules new` should accept canonical built-in agent steps plus valid repository-declared custom reviewer names, matching the runtime's actual dynamic step composition instead of leaving a filesystem-only hidden path.
- Reports should be separated by user question, not merged because they share a metric. `usage` owns model/token/cost accounting; `job stats` owns run-level duration/convergence/cost/turns/outcome analytics. Both remain useful surfaces.
- Static operational knowledge should have one owner. If `guide request` supersedes `request prompt`, keep at most a compatibility alias; do not maintain two independent prose bodies. Generated artifact templates should keep format/mechanics and avoid becoming a second runbook.
- Discoverability needs more than public/hidden. The CLI already has normal lifecycle, advanced/headless setup, operator recovery, maintenance, repair, reporting, and compatibility concerns; a future CommandSpec should express audience/visibility so contextual commands remain available without crowding Quick Start.
- A shortcut/alias is itself part of the CLI contract. Promoted shortcuts such as `run -> job start` should inherit flags, positional args, guards and help from their target through machine-readable alias metadata rather than separate dispatch conventions.
- A command may have a default action plus named children with different contracts. `doctor` is the concrete example: default diagnosis is repo-optional/read-only, while `repair` is repo-required/operator-scoped. The current `CommandDef | ParentCommandDef` split cannot model this cleanly without inline parser branches.
- The likely architectural target is a machine-readable command spec from which parsing, detailed help, parent/top-level help, aliases/deprecations, inherited/overridden constraints, visibility, typed flags/positionals, dynamic value validation, structured command references, and guide command validation can be derived. Avoid per-command class hierarchy; the goal is one interface contract, not more ceremony.

## Review order / completion

1. setup/auth: `init`, `config`, `login`, `credentials`, `runtime`, `doctor` — reviewed, including post-#1001 follow-up
2. authoring: `request` — reviewed
3. execution/lifecycle: `run`, `job` — reviewed
4. unattended/extensions: `inbox`, `rules`, `reviewers` — reviewed
5. reporting/repair: `usage`, `doctor repair` — reviewed

The top-level command inventory is now complete. The next useful step is not another command-by-command pass; it is to derive the target CLI contract/visibility model and implementation plan from these findings.
