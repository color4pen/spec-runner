# Delta Spec: request-management (request-manager)

Expands the baseline `request-management` spec with the `src/core/request/` module: store, generator, reviewer, and manager.

## New Requirements

### REQ-RM-STORE-01: Path Knowledge Centralization

The path pattern `specrunner/requests/{active,merged}/<slug>/request.md` SHALL be defined exclusively in `src/core/request/store.ts` as module-level constants `ACTIVE_SUBDIR` and `MERGED_SUBDIR`. No other module SHALL hardcode these paths (new code only; existing hardcoded paths are migrated in subsequent PRs).

### REQ-RM-STORE-02: `resolve(cwd, slug): string`

`store.resolve()` SHALL return the absolute path to `specrunner/requests/active/<slug>/request.md` under `cwd` without performing any filesystem existence check.

### REQ-RM-STORE-03: `list(cwd): Promise<string[]>`

`store.list()` SHALL return an array of slug strings for all active requests that have a `request.md` file under `specrunner/requests/active/`. If the active directory does not exist, it SHALL return an empty array without throwing.

### REQ-RM-STORE-04: `write(cwd, slug, content): Promise<void>`

`store.write()` SHALL create the directory `specrunner/requests/active/<slug>/` (recursively) and write `content` to `request.md`. Existing files are overwritten.

### REQ-RM-STORE-05: `checkSlugCollision(cwd, slug): Promise<void>`

`store.checkSlugCollision()` SHALL check both `specrunner/requests/active/` and `specrunner/requests/merged/` for an existing entry with the given slug. On collision, it SHALL throw a `SpecRunnerError` with code `SLUG_COLLISION`. `src/util/slugify.ts` SHALL re-export this function from `store.ts` for backward compatibility.

### REQ-RM-STORE-06: `read(cwd, slug): Promise<ParsedRequest>`

`store.read()` SHALL read the `request.md` file at the path returned by `store.resolve(cwd, slug)`, parse it using `parseRequestMdContent()`, and return the resulting `ParsedRequest`. If the file does not exist or parsing fails, it SHALL throw an error without swallowing the underlying cause.

### REQ-RM-GEN-01: One-Shot LLM Generation

`generator.generate()` SHALL invoke `query()` with `maxTurns: 1` and `allowedTools: []`. The generation is a pure text transformation with no file system exploration.

### REQ-RM-GEN-02: Slug Derivation from Input Text

`generator.generate()` SHALL derive the slug from the input text using `slugify(text)` before invoking the LLM. The derived slug is injected into the LLM output by replacing the placeholder `<generated-slug>`.

### REQ-RM-GEN-03: Validation Before Save

After obtaining the LLM output, `generator.generate()` SHALL validate the content by calling `parseRequestMdContent()`. If validation fails, it SHALL throw a `SpecRunnerError` without retrying and without writing to the store.

### REQ-RM-GEN-04: Collision Check Before LLM Call

`generator.generate()` SHALL call `store.checkSlugCollision()` before invoking the LLM. On collision, the SLUG_COLLISION error is thrown and no LLM call is made.

### REQ-RM-GEN-05: query Function Injection

`generator.generate()` SHALL accept an optional `queryFn` parameter (default: `query` from `@anthropic-ai/claude-agent-sdk`) to allow unit testing without a real LLM.

### REQ-RM-REV-01: `runReview()` query Injection

`reviewer.runReview()` SHALL accept an optional `queryFn` parameter (default: `query` from `@anthropic-ai/claude-agent-sdk`) to allow unit testing without a real LLM. `executeReview()` in `src/core/command/request-review.ts` SHALL remain the public CLI entry point and delegate the LLM invocation to `runReview()`.

### REQ-RM-REV-02: runReview Error on Session Failure

`reviewer.runReview()` SHALL throw a `SpecRunnerError` if the LLM session does not complete with a `success` subtype. The caller (`executeReview`) is responsible for converting the error to an appropriate exit code.

### REQ-RM-MGR-01: Manager as Thin Coordinator

`src/core/request/manager.ts` SHALL contain only coordination logic (delegating to store, generator, and reviewer). It SHALL NOT contain domain logic, path constants, or LLM invocation logic of its own.

### REQ-RM-MGR-02: `RequestState` Type

The `RequestState = "active" | "merged"` type SHALL be defined in `src/core/request/types.ts`. The `canceled` state is out of scope for this change (no `canceled/` directory is defined).
