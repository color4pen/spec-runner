# `run` review

Status: **reviewed**  
Verdict: **KEEP as a promoted shortcut to `job start`**, not as a separate operation and not merely as a historical compatibility shim.

Baseline implementation:

- `src/cli/command-registry.ts` (`RUN_JOB_FLAGS`, `runJobHandler`, `COMMANDS.run`, `job.start`)
- `bin/specrunner.ts` worktree guard
- `src/cli/run.ts`
- `README.md`
- `specrunner/adr/2026-05-20-cli-noun-verb-restructure.md`

## User goal

Take a request and start the SpecRunner pipeline.

This is the product's shortest core action:

```text
request.md in -> pull request out
```

For that goal, `specrunner run <slug>` is materially easier to discover and type than `specrunner job start <slug>`.

## Current contract

Current surface:

```text
specrunner run <slug|file> [job-start flags]
specrunner job start <slug|file> [same flags]
```

Both use the same `RUN_JOB_FLAGS` object and the same `runJobHandler`, so execution semantics are already mostly shared. The top-level `run` entry is described in the registry as an alias of `job start`.

The remaining alias relationship is not structural, however:

- `run` has its own top-level command entry and positional declaration.
- `run` worktree guarding is separately hard-coded in `bin/specrunner.ts` via `WORKTREE_GUARDED_COMMANDS`.
- `job start` is guarded through `job.guardedSubcommands`.
- help/usage presents `run` separately and neither path has a dedicated detailed usage contract.

So behavior sharing exists, but the fact that one command is an alias/shortcut of another is not machine-readable.

## Why `run` should remain

The May noun-verb ADR retained only `run` when other top-level verb aliases were removed, citing the unusually strong conventional meaning of `run`.

Since then it has become more than compatibility:

- README Quick Start teaches `specrunner run my-feature` as the normal first pipeline invocation.
- Managed runtime setup tells the user to run `specrunner run` next.
- Troubleshooting examples use `specrunner run`.
- The product itself is called SpecRunner and describes its central contract as `request.md in, pull request out`.

Removing `run` now would make the most common action less direct in order to preserve noun-verb purity. That is the wrong tradeoff.

## Relationship with `job start`

Do not remove `job start` either.

`job` is the correct object namespace for the stateful execution lifecycle:

```text
job start
job wait
job show
job resume
job cancel
job archive
```

It gives the full lifecycle a coherent noun-verb surface and makes `job --help` self-contained.

The useful model is therefore:

```text
run <request>        -> primary convenience entry
job start <request>  -> canonical lifecycle spelling
```

They are two spellings of one operation, not two operations.

## Findings

### 1. `run` is mislabeled as only a compatibility alias

The CLI and README actively recommend it. Calling it a compatibility alias suggests it could disappear after migration, while actual product UX treats it as a normal entry point.

**Direction:** classify it explicitly as a stable/promoted shortcut.

### 2. Alias semantics should be declared, not manually mirrored

The current implementation already shares flags and handler, which is good. But positional metadata, guard placement, help and discoverability are still maintained in separate places.

A future command spec should be able to say conceptually:

```ts
alias("run", "job start", {
  visibility: "promoted",
})
```

and derive parsing, flags, positional args, guard semantics and help from the target unless deliberately overridden.

This is a concrete reason for the CLI command-contract refactor: aliases are part of the public interface and should be represented as data.

### 3. `run --help` / `job start --help` are under-specified

Neither command has dedicated detailed usage despite carrying `--detach`, `--issue`, `--json`, `--no-worktree`, `--verbose` and `--quiet` behavior.

Because `run` is a promoted entry point, this is especially visible. Detailed help should derive from the canonical `job start` command spec and be available through both spellings.

### 4. Documentation currently mixes canonical and shortcut terminology

Top-level help puts `run` under `Aliases`, while README Quick Start treats it as the normal command. Pick one product story.

**Direction:** documentation should call `run` a shortcut/common entry and identify `job start` as the equivalent lifecycle form, rather than framing `run` as deprecated-looking compatibility syntax.

## Desired user-facing shape

```text
# common path
specrunner run my-feature

# equivalent lifecycle spelling
specrunner job start my-feature
```

Both must always accept the same operational flags and have the same guard/behavior contract.

## Final verdict

- Top-level placement: **KEEP**
- Name: **KEEP**
- Product role: **promoted shortcut / common entry**
- Canonical lifecycle target: **`job start`**
- Separate implementation semantics: **NO**
- Machine-readable alias relation: **REQUIRED in future CommandSpec cleanup**
- Detailed help: **derive from `job start` and expose on both paths**
