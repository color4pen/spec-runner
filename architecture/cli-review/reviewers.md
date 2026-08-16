# `reviewers` review

Status: **reviewed**  
Verdict: **KEEP namespace and `new`**, fix repo-root ownership and make scaffold/runtime validation share one contract.

Current subcommand: `new`.

## User goal

Declare a project-owned custom review concern that becomes an actual agent review step in the implementation review chain.

A reviewer is materially different from a rule:

- `rules` adds follow-up guidance to an existing agent step.
- `reviewers` declares a new named agent step, with its own purpose, criteria, judgment, iteration budget, optional model, and activation conditions.

The on-disk artifact is `specrunner/reviewers/<name>.md`; the plural CLI noun matches the collection directory and is coherent with `rules`.

## Current contract

```text
specrunner reviewers new <name>
```

The command validates a local name regex, creates `specrunner/reviewers/<name>.md`, and prints the relative path.

The generated file contains:

- frontmatter `name` matching the filename,
- `maxIterations: 3`,
- optional model / `paths` / `requestTypes` examples,
- empty required sections for purpose / review criteria / judgment.

At job start, all reviewer files are loaded from the repository, parsed, validated, snapshotted into job state, and composed into the runtime pipeline as real dynamic agent steps using each reviewer's `name`.

## Verdict

### Keep `reviewers` as a top-level project-artifact namespace

Do not merge it with `rules` under a generic `extensions` namespace.

The two nouns correspond directly to persisted project artifacts and have distinct execution semantics. This is useful vocabulary, not command clutter.

Plural `reviewers` is also appropriate: the artifact namespace is a collection (`specrunner/reviewers/`) and `reviewers new foo` reads naturally as "create an entry in the reviewers collection".

### Keep `reviewers new`

The generator prevents users from having to memorize the frontmatter / required-section shape and filename-name coupling. No `ls`, `show`, `edit`, or `rm` commands are justified now; after scaffolding, these are normal repository files managed with editor/git.

## Findings

### 1. Repo-root debt: `reviewers new` writes relative to invoker cwd

The registry currently calls:

```ts
executeReviewersNew(name, process.cwd())
```

This has the same defect as `rules new`: running from a repository subdirectory can create a second `specrunner/reviewers/` tree in the wrong place.

**Direction:** `reviewers` is repo-owned. Make the namespace repo-required and pass dispatch-resolved `repoRoot` into the command.

### 2. The scaffold writer and runtime validator duplicate the reviewer-name contract

`reviewers-new.ts` contains its own `NAME_PATTERN`, while `reviewers/validate.ts` contains another copy of the same regex plus additional semantic checks.

The copies agree today, but there is no structural tooth keeping them aligned.

**Direction:** extract/share the reviewer-name validation primitive (or canonical constraint) so both scaffold generation and runtime loading use the same source.

This follows the broader rule from the CLI review: a writer should not re-specify a domain that the reader already owns.

### 3. `reviewers new` can generate a name that runtime immediately rejects

The runtime validator forbids collision with every standard pipeline step name. The generator does not.

For example:

```text
specrunner reviewers new code-review
```

can create `specrunner/reviewers/code-review.md`, but the next job start rejects it because `code-review` is a built-in pipeline step.

**Direction:** the scaffold command must reject built-in step-name collisions before writing. Use the same canonical step-name predicate as runtime validation.

The CLI should not knowingly generate a project artifact whose identity is impossible to activate.

### 4. A newly generated reviewer is intentionally incomplete, but the CLI does not say so

The template leaves the required `目的`, `観点`, and `判定基準` sections empty. Runtime validation correctly rejects empty required sections.

That means a successful `reviewers new foo` does **not** mean the reviewer is ready for the next job. This is acceptable for a scaffold command, but the current output is only the path, so the transition is easy to misread.

Do not fill the sections with generic prose merely to make validation pass; that would create a semantically fake reviewer.

**Direction:** keep the scaffold incomplete, but make success output explicit:

```text
Created: specrunner/reviewers/security.md
Next: edit the required sections before starting a job.
```

A separate `reviewers validate` command is not justified solely for this; runtime validation remains authoritative, and `doctor` may later surface project-definition readiness if that fits its broader role.

### 5. Custom-reviewer rules should be a supported capability, not a filesystem trick

The `rules` review left this decision open. `reviewers` resolves it.

Custom reviewers are composed into the descriptor as real dynamic agent steps using `reviewer.name`. The generic agent context builder resolves step rules for `step.name`, so `specrunner/rules/<reviewer-name>/...` already works at runtime.

That behavior is a natural composition of two project extension mechanisms and does not require a special pipeline branch.

**Decision:** formally support rules on custom reviewers.

`rules new <step-name> ...` should resolve legal targets from:

1. built-in agent steps, plus
2. valid repository-declared reviewer names.

Do not keep the current state where manual directory creation works but the CLI refuses the same target.

When implementing this, use reviewer loading/validation as the source rather than treating any arbitrary directory name as a valid step.

### 6. Reviewer activation/model examples belong to the artifact format, not a second runbook

The current template's commented `model`, `paths`, and `requestTypes` examples are useful because they teach the definition shape in-place. The model example (`claude-sonnet-5`) is currently part of the built-in model registry, so it is not stale at the reviewed baseline.

Future guide work should explain when to use activation/model overrides; the template should remain focused on syntax and the minimum editing task.

## Recommended final shape

```text
reviewers
  new <name>

rules
  new <built-in-agent-step | valid-reviewer-name> <rule-slug>
```

Both namespaces should be repo-required and operate from the dispatch-resolved repository root.

No generic `extensions` parent is recommended.

## Machine-contract implications

A future command/application contract should provide:

- inherited `requiresRepo: true` for `reviewers`,
- one validated positional `name`,
- shared reviewer-name / built-in-collision validation with the runtime reader,
- help generated from the same definition,
- and a reusable project reviewer resolver that `rules new` can query for dynamic legal step targets.

This is another case where the CLI registry alone is not enough: command shape is static, but some value domains are repository-derived and belong behind a typed application validation seam.
