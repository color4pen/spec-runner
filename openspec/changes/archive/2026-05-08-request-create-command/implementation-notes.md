# Implementation Notes: request-create-command

- **result**: completed
- **tasks_completed**: 18/18
- **date**: 2026-05-08

## Summary

All tasks in tasks.md were implemented. `bun run typecheck && bun run test` are both green (1171 tests pass).

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/util/slugify.ts` | created | `slugify()` and `checkSlugCollision()` |
| `src/context/request-patterns.ts` | created | `collectRequestPatterns()` |
| `src/core/runtime/strategy.ts` | modified | Added `model` and `allowedTools` to `QueryOptions` |
| `src/core/runtime/local.ts` | modified | Named options constructor + `QueryFn` injection + `query()` implementation |
| `src/core/runtime/factory.ts` | modified | Updated `new LocalRuntime(...)` to named options |
| `src/prompts/create-system.ts` | created | `buildCreateSystemPrompt()` and `buildCreateUserMessage()` |
| `src/core/command/create.ts` | created | `executeCreate()`, `buildScaffoldTemplate()`, `isResultMessage()`, `extractRequestContent()` |
| `src/cli/create.ts` | created | `runCreate()` facade |
| `bin/specrunner.ts` | modified | Added `create` subcommand |
| `tests/unit/util/slugify.test.ts` | created | Tests for slugify and checkSlugCollision |
| `tests/unit/context/request-patterns.test.ts` | created | Tests for collectRequestPatterns |
| `tests/unit/core/command/create.test.ts` | created | Tests for create command |
| `tests/unit/core/runtime/local.test.ts` | modified | Added named options and query() tests |
| `openspec/changes/request-create-command/tasks.md` | modified | Marked all tasks as [x] |

## Design Notes

- **LocalRuntime constructor**: Used a union type approach (`cwdOrOpts: string | LocalRuntimeOptions`) to maintain full backward compatibility with existing positional-argument usage in all existing tests while also supporting named options. All existing tests passed without modification.

- **3-tier fallback**: The `parseRequestMdContent()` parser scans line-by-line without fence awareness, so Tier 1 often succeeds even on wrapped responses (the parser finds title/type/slug within the fence block). Tier 2 (code fence extraction) is a safety net for cases where the outer text has no recognized heading or missing meta fields.

- **spec-review finding #2**: Implemented type/slug validation in `executeCreate()` step i — after writing the file, checks that `parsed.type === type` and `parsed.slug === slug`, returning exit code 1 with descriptive message if mismatched.

## Blocked Tasks

None.
