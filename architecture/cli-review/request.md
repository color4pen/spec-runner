# `request` review

Status: **reviewed**  
Verdict: **KEEP** the `request` namespace. Keep `new`, `ls`, `template`, and `validate`; `prompt` is **HOLD / likely MERGE into `guide request`** once the operator guide exists.

Baseline implementation:

- `src/cli/command-registry.ts` (`COMMANDS.request`)
- `src/core/command/request-new.ts`
- `src/core/command/request.ts`
- `src/core/command/request-prompt.ts`
- `src/core/command/request-list.ts`
- `src/core/request/store.ts`

## User goal

Author, inspect, and mechanically validate a request before starting a stateful job.

That boundary remains sound:

```text
request = static authoring artifact
job     = stateful pipeline execution
```

The namespace should remain a first-class public surface.

## Current surface

```text
specrunner request new <slug> [--type <type>]
specrunner request prompt
specrunner request ls
specrunner request template [--type <type>]
specrunner request validate <file|slug>
```

`new` writes a scaffold under `specrunner/drafts/<slug>/request.md`.
`template` prints the same scaffold to stdout.
`prompt` prints a self-contained authoring prompt for an external LLM session.
`ls` lists draft requests.
`validate` parses the request, runs request discipline checks, emits the large-request warning, and optionally runs the design-layer gate.

## What is good

- `new` and `template` share `buildScaffoldTemplate`; the CLI does not maintain two request formats.
- `request prompt` is deterministic: no network, auth, config load, file write, or LLM call.
- The earlier `request generate` LLM path was deliberately removed so authoring context stays in the external session rather than inside a context-poor CLI one-shot call.
- `validate` is a meaningful local gate and can validate an explicit file without requiring a job.
- `new` checks slug collisions across drafts and archive history before writing.

## Findings

### 1. `request ls` and slug-based `validate` do not consistently use repo root

`request new` is `requiresRepo: true` and writes using dispatch-resolved `ctx.repoRoot`.

By contrast:

- `request ls` calls `executeList(process.cwd())`.
- `request validate <slug>` resolves the draft store from `process.cwd()`.

This means invoking from a repository subdirectory can make `request ls` report no requests and can make slug-based validation fail even though the request exists at the repository root.

**Direction:**

- `request ls` should be repository-scoped, use `ctx.repoRoot`, and fail clearly outside a repository instead of returning an empty list.
- `request validate <explicit-file>` should remain usable relative to the invoker cwd, including outside a repo.
- `request validate <slug>` should resolve the slug against `ctx.repoRoot` when a repo is available.

This preserves the useful file-validation primitive without making repository objects depend on invocation depth.

### 2. `ls` still speaks in the retired `active request` vocabulary

The store enumerates `specrunner/drafts/`, but empty output is:

```text
(no active requests)
```

The current lifecycle calls these drafts. Use `draft requests` / `drafts` consistently so the CLI does not imply a separate active-request state.

### 3. `new --type` / `template --type` accept arbitrary strings

The command registry declares `type` as an unrestricted string. `executeNew` and `executeTemplate` then write that value directly into the scaffold.

There are five canonical types in `TYPE_CONFIG`, while the request parser deliberately treats an unknown type only as a warning for backward compatibility. Therefore the CLI can currently create an unknown-type request itself and `request validate` can still exit successfully with only a warning.

Backward-compatible parsing and CLI authoring are different responsibilities. The parser may remain tolerant of historical/forward data, but a generator owned by the current CLI should only emit values it understands.

**Direction:** derive `--type` allowed values from the same canonical type registry used elsewhere. Do not hand-copy the five values into command help/parser definitions.

### 4. `request prompt` will overlap heavily with `guide request`

`request prompt` was intentionally introduced as a static knowledge-injection command after `request generate` was removed. Its contents are exactly the kind of versioned operational authoring knowledge proposed for the future `specrunner guide request` topic: type choice, test teeth, scope-out discipline, external API constraints, template, and validation.

Two separately named commands owning near-identical prose would recreate the second-source-of-truth problem the guide is intended to solve.

**Direction:** HOLD until operator-guide design is implemented, with a bias toward:

```text
specrunner guide request
  = canonical request-authoring knowledge, self-contained enough for an agent session

request prompt
  = remove, or keep only as a deprecated compatibility alias to the same guide content
```

Do not maintain independent `request prompt` and `guide request` bodies.

If the guide intentionally chooses not to contain the self-contained agent instruction/scaffold, then `request prompt` may remain, but both outputs must consume the same authoring registry/content source.

### 5. `new` and `template` are not duplicates

They share content but serve different effects:

```text
request new      = create a repository draft with collision checks
request template = emit raw scaffold to stdout for tooling/manual composition
```

Both can remain. `template` is a lower-level/tooling primitive and does not need equal visual prominence to `new`, but it is not redundant enough to remove.

### 6. Request command help is effectively missing

The `request` parent has no `usage`, and its subcommands have no detailed `usage` strings. As a result, `request --help` and `request new --help` / `validate --help` cannot explain type choices, repository semantics, file-vs-slug behavior, or outputs.

This is another instance of the cross-cutting CommandSpec problem rather than five separate documentation tasks. Detailed help should be derived from structured command definitions.

## Desired user-facing shape

Normal authoring flow:

```text
specrunner request new my-change --type spec-change
# edit specrunner/drafts/my-change/request.md
specrunner request validate my-change
specrunner job start my-change
```

Inspection/tooling primitives remain available:

```text
specrunner request ls
specrunner request template --type new-feature
```

Once guide exists, authoring knowledge should have one obvious entry:

```text
specrunner guide request
```

rather than requiring users to distinguish `request prompt` from `guide request`.

## Final verdict

- Namespace: **KEEP**
- `request new`: **KEEP**; constrain `--type` from canonical registry and keep repo-root semantics
- `request ls`: **KEEP**; make repo-root based and rename `active` wording to draft wording
- `request validate`: **KEEP**; explicit file remains cwd-relative, slug lookup becomes repo-root based
- `request template`: **KEEP** as stdout/tooling primitive; constrain `--type` from canonical registry
- `request prompt`: **HOLD / likely MERGE into `guide request`**
- Parent/subcommand detailed help: **must improve through CommandSpec work**
