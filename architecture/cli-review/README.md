# CLI command review

> Working review notes. This directory is not normative product documentation.

Baseline: `main@57d9e7411b9f6dd80cbaf63531febca56a4f4ab5` (0.4.10)

## Purpose

Review the CLI as one public interface, not as a bag of individually useful handlers. For each top-level command, decide whether it should be kept, renamed, moved, hidden/operator-scoped, merged, or removed.

The current registry exposes 12 top-level entries (`init`, `login`, `run`, `request`, `job`, `config`, `inbox`, `rules`, `reviewers`, `runtime`, `doctor`, `usage`). Counting canonical subcommands gives 27 command paths; `run` is a `job start` alias and `doctor repair` is an inline special path outside the subcommand registry.

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
| `init` | reviewed | KEEP; provider choice stays scaffold concern, but current flag semantics need cleanup |
| `login` | reviewed | KEEP as GitHub-only login; move headless credential storage out and remove config side effect |
| `run` | pending | decide whether this is the product's primary verb or only a compatibility alias |
| `request` | pending | authoring surface |
| `job` | pending | execution/lifecycle surface; largest group |
| `config` | reviewed | KEEP as read/diagnostic namespace; do not add generic setter just to absorb init provider |
| `inbox` | pending | unattended operation |
| `rules` | pending | extension surface |
| `reviewers` | pending | extension surface |
| `runtime` | pending | managed runtime surface |
| `doctor` | pending | diagnosis/setup navigator; likely primary guidance hub |
| `usage` | pending | reporting surface; top-level placement needs justification |

## Cross-cutting observations already visible

- `COMMANDS` is structured data, but top-level `USAGE` is separately handwritten. They already drift: implemented paths such as `job reopen`, `usage`, and the inline `doctor repair` path are not represented consistently in top help.
- Command-specific and parent-command help is optional. Commands such as `init` and parents such as `config` can therefore expose behavior that `--help` does not describe structurally.
- Deprecated compatibility flags currently remain indistinguishable from active flags in the registry. A future command contract should be able to mark hidden/deprecated migration surfaces explicitly.
- Guidance strings in runtime/doctor code can name commands independently of the registry. This is how dead command guidance such as `login --provider anthropic` survived.
- Config JSON is the source of truth; `config effective` is a read-only resolution/source-attribution view. Avoid inventing CLI-only configuration concepts that do not exist in the schema.
- Commands should mutate only state implied by their verb. `login` creating global config is an example of setup convenience outliving its ownership boundary.
- Credential setup must respect the same source precedence as runtime resolution. Writing a lower-priority credential must not be reported as a successful repair while a higher-priority invalid source still shadows it.
- The likely architectural target is a machine-readable command spec from which parsing, detailed help, parent/top-level help, aliases/deprecations, and guide command validation can be derived. Avoid per-command class hierarchy; the goal is one interface contract, not more ceremony.

## Review order

1. setup/auth: `init`, `config`, `login`, `doctor`, `runtime`
2. authoring: `request`
3. execution/lifecycle: `run`, `job`
4. unattended/extensions: `inbox`, `rules`, `reviewers`
5. reporting/repair leftovers: `usage` and any special hidden paths
