## ADDED Requirements

### Requirement: DynamicContext type defines repository snapshot fields

`DynamicContext` interface SHALL be defined at `src/git/dynamic-context.ts` with the following shape:

```ts
interface DynamicContext {
  gitLog: string;        // main..HEAD の直近 commit（最大 20 件）
  diffStat: string;      // main..HEAD の diff --stat 出力
  specsList: string[];   // openspec/specs/ 配下の .md ファイル一覧
  changesList: string[]; // openspec/changes/ 配下のディレクトリ一覧
}
```

All fields SHALL be present. When a git command fails or the directory does not exist, the field SHALL contain an empty string (for `string` fields) or an empty array (for `string[]` fields).

#### Scenario: DynamicContext has all four fields

- **WHEN** a value of type `DynamicContext` is constructed
- **THEN** it contains `gitLog`, `diffStat`, `specsList`, and `changesList` fields
- **AND** TypeScript compilation succeeds without type errors

#### Scenario: Empty values for failed commands

- **WHEN** `gitLog` cannot be collected (e.g., shallow clone, no main branch)
- **THEN** the `gitLog` field SHALL be `""`
- **AND** the `diffStat` field SHALL be `""`

### Requirement: collectDynamicContext gathers repository state

`collectDynamicContext(cwd: string, branch: string): Promise<DynamicContext>` SHALL be exported from `src/git/dynamic-context.ts`. It SHALL:

1. Execute `git log main..HEAD --oneline -n 20` to populate `gitLog`
2. Execute `git diff main..HEAD --stat` to populate `diffStat`
3. Read `openspec/specs/` directory to populate `specsList` with `.md` file paths
4. Read `openspec/changes/` directory to populate `changesList` with subdirectory names (excluding `archive`)

The function SHALL use `node:child_process` `execFile` for git commands. It SHALL NOT import from `src/adapter/` (dependency direction: core does not reference adapter layer).

When any individual git command or directory read fails, the corresponding field SHALL be set to its empty fallback value. The function SHALL NOT throw — all errors are absorbed into fallback values.

#### Scenario: Successful collection on a feature branch

- **GIVEN** cwd is a git repository with commits on a feature branch ahead of main
- **AND** `openspec/specs/` contains spec directories
- **WHEN** `collectDynamicContext(cwd, "feat/my-feature")` is called
- **THEN** `gitLog` contains commit lines from `git log main..HEAD`
- **AND** `diffStat` contains file change statistics
- **AND** `specsList` contains paths of `.md` files under `openspec/specs/`
- **AND** `changesList` contains directory names under `openspec/changes/`

#### Scenario: Git command failure produces empty fallback

- **GIVEN** cwd is a directory where `git log` fails (e.g., not a git repo)
- **WHEN** `collectDynamicContext(cwd, "main")` is called
- **THEN** the function resolves (does not reject)
- **AND** `gitLog` is `""`
- **AND** `diffStat` is `""`

#### Scenario: Missing openspec directories produce empty arrays

- **GIVEN** `openspec/specs/` does not exist in cwd
- **WHEN** `collectDynamicContext(cwd, "main")` is called
- **THEN** `specsList` is `[]`
- **AND** `changesList` is `[]`

#### Scenario: archive directory is excluded from changesList

- **GIVEN** `openspec/changes/` contains `archive/`, `my-change/`, `another-change/`
- **WHEN** `collectDynamicContext(cwd, "main")` is called
- **THEN** `changesList` contains `["my-change", "another-change"]`
- **AND** `changesList` does NOT contain `"archive"`

### Requirement: DynamicContext is injected once per pipeline execution

`CommandRunner.execute()` SHALL call `collectDynamicContext()` after `runtime.buildDeps()` and before `pipeline.run()`. The collected `DynamicContext` SHALL be assigned to `deps.dynamicContext`. Collection SHALL happen exactly once per pipeline execution — step-level re-collection SHALL NOT occur.

#### Scenario: deps.dynamicContext is populated before pipeline runs

- **GIVEN** `CommandRunner.execute()` is called
- **WHEN** `runtime.buildDeps()` returns `deps`
- **AND** `collectDynamicContext()` completes
- **THEN** `deps.dynamicContext` is a `DynamicContext` value (not undefined)
- **AND** pipeline steps receive the same `dynamicContext` snapshot

#### Scenario: collectDynamicContext failure does not halt pipeline

- **GIVEN** `collectDynamicContext()` throws an unexpected error
- **WHEN** `CommandRunner.execute()` catches the error
- **THEN** `deps.dynamicContext` remains `undefined`
- **AND** `pipeline.run()` proceeds without interruption

### Requirement: buildMessage includes dynamic context sections when available

Each step's `buildMessage` SHALL include a dynamic context section when `deps.dynamicContext` is defined. The section SHALL be omitted entirely when `deps.dynamicContext` is undefined (backward compatibility).

- **propose**: SHALL include `specsList` and `changesList` to provide awareness of existing specs and active changes
- **implementer**: SHALL include `gitLog` and `diffStat` to show what propose committed
- **code-review**: SHALL include `diffStat` to provide upfront change scope

#### Scenario: propose buildMessage includes specs and changes lists

- **GIVEN** `dynamicContext.specsList` is `["pipeline-orchestrator", "step-execution-architecture"]`
- **AND** `dynamicContext.changesList` is `["my-other-change"]`
- **WHEN** `ProposeStep.buildMessage(state, deps)` is called
- **THEN** the returned message contains a section listing existing specs
- **AND** the returned message contains a section listing active changes

#### Scenario: implementer buildMessage includes git log and diff stat

- **GIVEN** `dynamicContext.gitLog` is `"abc1234 Add proposal\ndef5678 Add design"`
- **AND** `dynamicContext.diffStat` is `" 2 files changed, 100 insertions(+)"`
- **WHEN** `ImplementerStep.buildMessage(state, deps)` is called
- **THEN** the returned message contains the git log output
- **AND** the returned message contains the diff stat output

#### Scenario: code-review buildMessage includes diff stat

- **GIVEN** `dynamicContext.diffStat` is `" 5 files changed, 200 insertions(+), 50 deletions(-)"`
- **WHEN** `CodeReviewStep.buildMessage(state, deps)` is called
- **THEN** the returned message contains the diff stat output

#### Scenario: buildMessage omits dynamic context when undefined

- **GIVEN** `deps.dynamicContext` is `undefined`
- **WHEN** any step's `buildMessage(state, deps)` is called
- **THEN** the returned message does NOT contain a dynamic context section
- **AND** the message is identical to the output before this change was implemented
