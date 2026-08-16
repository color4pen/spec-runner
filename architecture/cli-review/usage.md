# `usage` review

Status: **reviewed**  
Verdict: **KEEP top-level command**. Keep `job stats` under `job`; the two reports answer different questions.

Current forms:

```text
specrunner usage
specrunner usage <slug>
```

## User goal

Understand model/token/cost consumption rather than job lifecycle state.

The command has two views:

- `usage <slug>`: per-invocation usage for one slug, with model token counts and SDK metrics when present.
- `usage`: historical aggregate across archived changes, grouped by slug and by step × model, with grand total and estimated USD cost.

## Placement verdict

### Keep `usage` top-level

`usage` is resource accounting, not a job lifecycle operation. Its data model is command invocation/model usage and it can include buckets whose identity is a command rather than a pipeline step.

Moving it under `job` would imply that all usage is job-owned, which is not the actual usage schema or reporting intent.

The short top-level noun is also appropriate for a cross-cutting report:

```text
specrunner usage
specrunner usage my-change
```

No new `report` / `analytics` namespace is justified merely to group one command.

### Keep `job stats` under `job`

The overlap is only the cost column.

```text
usage
  -> model / token / step cost accounting

job stats
  -> run count / duration / convergence / cost / turns / outcome
```

`job stats` derives rows from job state and asks how executions behaved. `usage` derives accounting from `usage.json` and asks where model resources were consumed.

Both should remain. Do not merge their output into one large report.

## Findings

### 1. Repo-root debt: `usage` still reads from invoker cwd

The registry dispatches both forms with `process.cwd()`:

```ts
showUsage(slug, process.cwd())
showUsageSummary(process.cwd())
```

Both functions treat that argument as the project root. From a repository subdirectory, `usage` can therefore report no archive/data even though the repository has usage records.

**Direction:** `usage` is repository-owned reporting. Mark it `requiresRepo: true` and pass dispatch-resolved `ctx.repoRoot` to both views.

This is the same invariant found throughout the review: invocation depth is not repository identity.

### 2. `<slug>` is not validated before being turned into a path

`showUsage` calls `usageJsonPath(slug)` directly. `usageJsonPath` is a pure string constructor and does not validate the slug.

The public command should accept a canonical request slug, not an arbitrary path-shaped string.

**Direction:** validate the positional slug with the shared slug domain before filesystem resolution. Keep path utilities pure; validation belongs at the command/application boundary.

This is primarily contract hygiene, but it also prevents path-shaped values from influencing repository-relative lookup.

### 3. Summary and single-slug views intentionally have different time scopes

`usage <slug>` first checks the active change and then the most recent matching archive.

Bare `usage` intentionally aggregates archived change folders only. That makes it a stable historical/cost summary rather than a live-progress view.

**Direction:** keep this behavior, but make it visible in help:

```text
usage         historical summary from archived runs
usage <slug>  detail for active slug or latest archive
```

Do not silently broaden the summary to active jobs during this CLI cleanup. Live usage reporting is a separate product decision.

### 4. `usage` is absent from top-level help despite being a real top-level command

The implementation is registered but the handwritten `USAGE` inventory does not represent the surface consistently.

This is another concrete symptom supporting generated help from CommandSpec. Once command metadata is canonical, top-level help should not be able to forget a command.

### 5. The two views have asymmetric machine-readable output

`job stats` already supports `--json`; `usage` does not. This is not inherently wrong, and this review does **not** add `--json` merely for symmetry.

If external automation needs usage data later, add a deliberate JSON contract from the existing aggregation types. Do not parse the human report or add a flag without defining stable output semantics.

## Desired shape

```text
specrunner usage [slug]
```

No subcommand tree is needed now. The optional slug expresses the natural detail drill-down without inventing `usage show` / `usage summary` ceremony.

Help should explain the two modes explicitly.

## Resolved decision for `job stats`

The prior HOLD in the `job` review is resolved:

- `usage`: **KEEP top-level** as model/token/cost accounting.
- `job stats`: **KEEP under `job`** as run analytics.

They may reuse pricing/storage primitives internally, but they should remain separate user-facing reports.

## Machine-contract implications

A future command definition should express:

- `requiresRepo: true`,
- optional positional `slug`,
- canonical slug validation,
- summary/detail help from the same definition,
- and eventual output-format metadata if JSON support is intentionally introduced.
