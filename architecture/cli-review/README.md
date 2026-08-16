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
| `init` | reviewed | KEEP; provider/default ownership needs `config` review |
| `login` | pending | auth/setup UX request is changing this surface |
| `run` | pending | decide whether this is the product's primary verb or only a compatibility alias |
| `request` | pending | authoring surface |
| `job` | pending | execution/lifecycle surface; largest group |
| `config` | pending | configuration/inspection surface |
| `inbox` | pending | unattended operation |
| `rules` | pending | extension surface |
| `reviewers` | pending | extension surface |
| `runtime` | pending | managed runtime surface |
| `doctor` | pending | diagnosis/setup navigator; likely primary guidance hub |
| `usage` | pending | reporting surface; top-level placement needs justification |

## Cross-cutting observations already visible

- `COMMANDS` is structured data, but top-level `USAGE` is separately handwritten. They already drift: implemented paths such as `job reopen`, `usage`, and the inline `doctor repair` path are not represented consistently in top help.
- Command-specific help is optional. Commands without `usage` fall back to `NO_DETAILED_HELP_USAGE`, so a registered command can accept flags that `specrunner <command> --help` does not explain.
- Deprecated compatibility flags currently remain indistinguishable from active flags in the registry. A future command contract should be able to mark hidden/deprecated migration surfaces explicitly.
- Guidance strings in runtime/doctor code can name commands independently of the registry. This is how dead command guidance such as `login --provider anthropic` survived.
- The likely architectural target is a machine-readable command spec from which parsing, detailed help, top-level help, aliases/deprecations, and guide command validation can be derived. Avoid per-command class hierarchy; the goal is one interface contract, not more ceremony.

## Review order

1. setup/auth: `init`, `login`, `doctor`, `config`, `runtime`
2. authoring: `request`
3. execution/lifecycle: `run`, `job`
4. unattended/extensions: `inbox`, `rules`, `reviewers`
5. reporting/repair leftovers: `usage` and any special hidden paths
