# `rules` review

Status: **reviewed**  
Verdict: **KEEP namespace**, with one boundary decision held until `reviewers` is reviewed.

Current subcommand: `new`.

## User goal

Add project-owned, step-specific natural-language discipline without changing the built-in agent prompt or pipeline code.

A rule is not a reviewer and does not create a new agent session. It is extra follow-up guidance injected into an existing agent step.

## Current contract

```text
specrunner rules new <step-name> <rule-slug>
```

The command:

1. validates `<step-name>` against the canonical built-in `AGENT_STEP_NAMES`,
2. normalizes spaces / underscores in the slug,
3. creates `specrunner/rules/<step-name>/<NN>-<rule-slug>.md`,
4. chooses the next numeric prefix from existing markdown files,
5. refuses a duplicate semantic slug,
6. prints the created relative path.

At execution time, agent context construction loads all markdown files under `specrunner/rules/<step.name>/`, orders numeric prefixes ascending, and turns them into follow-up prompts.

## Verdict

### Keep `rules` as its own top-level noun

Do not introduce a generic `extensions` namespace merely to reduce top-level count.

`rules` is a user-facing project artifact with a stable on-disk identity (`specrunner/rules/...`). The CLI noun matches the artifact noun and the mental model:

```text
rules new ...
reviewers new ...
```

Those two extension mechanisms have materially different execution semantics, so hiding both under an abstract `extension` noun would make the CLI less descriptive, not simpler.

### Keep `rules new`

The generator earns its existence because ordering is semantic: the `NN-` prefix determines rule injection order. Manual file creation is possible, but the CLI prevents users from having to know the numbering convention and collision behavior.

## Findings

### 1. Repo-root debt: `rules new` still writes relative to invoker cwd

The registry currently calls:

```ts
executeRulesNew(stepName, ruleSlug, process.cwd())
```

Rules are repository-owned artifacts. Running the command from a repository subdirectory can therefore create a second, wrong `specrunner/rules/...` tree below that subdirectory.

**Direction:** mark `rules` (or at minimum `rules new`) as repo-required and pass dispatch-resolved `repoRoot` into `executeRulesNew`.

This is the same cross-cutting invariant found in `request` and `job`: repository-owned objects derive from repo root; invoker cwd is only for explicit relative path arguments.

### 2. Built-in step validation is correctly sourced

`rules new` validates against `AGENT_STEP_NAMES`, not a local copied list. That is good and should remain machine-derived.

CLI steps such as `verification` / `bite-evidence` are intentionally not valid rule targets because rules are agent prompt guidance, not CLI-step configuration.

### 3. Custom reviewer rule support is structurally inconsistent

There is a real boundary mismatch:

- `rules new` only accepts names from built-in `AGENT_STEP_NAMES`.
- custom reviewers are inserted into the runtime pipeline using their arbitrary reviewer `name` as the actual agent step name.
- agent context construction calls `resolveStepRules(step.name, ...)` for every agent step.
- `resolveStepRules` itself accepts any string and reads `specrunner/rules/<step.name>/`.

Therefore a manually-created directory such as:

```text
specrunner/rules/security-reviewer/01-extra-policy.md
```

can be consumed by a custom reviewer named `security-reviewer`, while:

```text
specrunner rules new security-reviewer extra-policy
```

is rejected by the CLI.

That is not a good permanent contract.

**HOLD until `reviewers` review:** choose one explicit product rule:

1. **Support rules on custom reviewers**: resolve valid rule targets from built-in agent steps + declared reviewer definitions, and let `rules new` create them; or
2. **Built-in-only rules**: make runtime rule resolution explicitly skip custom reviewer steps so manual filesystem layout cannot bypass the CLI contract.

Do not leave “works if you know the hidden directory trick” as the interface.

### 4. The current scaffold contains operational advice that may belong in guide/docs

The generated file comment explains ordering and recommends placing important rules later due to recency bias. The ordering fact is part of the file format and is appropriate in the scaffold. The behavioral recommendation is softer operational guidance.

No immediate change is required, but when `guide` is introduced, keep stable mechanics in the template and broader advice in guide/docs rather than letting template prose become another operational source of truth.

### 5. Parent help is useful here and should stay generated from the command contract

`rules` already has parent usage text, unlike several other namespaces. Future CommandSpec work should preserve this while deriving it from the same `rules.new` definition rather than a separate handwritten string.

## Recommended final shape

Subject to the custom-reviewer decision:

```text
rules
  new <step-name> <rule-slug>
```

No `ls`, `show`, `edit`, or `rm` commands are justified now. These are ordinary repository files and normal file/editor/git tools are the right interface after creation.

## Machine-contract implications

A future command definition should express:

- `requiresRepo: true` inherited by `rules`,
- two positional args (`step-name`, `rule-slug`),
- a dynamic/canonical value source for `step-name`,
- help derived from the same definition,
- and, if custom reviewer names become legal targets, a validation seam that can combine static step names with repository-declared reviewer names without hard-coding them in the parser.
