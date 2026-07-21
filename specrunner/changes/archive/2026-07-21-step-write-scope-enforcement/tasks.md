# Tasks: sequential step の commit を write-set 境界で機械強制する

実装は implementer が行う。各タスクは既存機構（`commitScopedPaths` / `partitionRoundChanges` /
`listWorktreeChanges` / `makeCommitFailHalt`）の流用を前提とする。

## T-01: write-scope 単一ソース module を新設する

- [x] `src/core/step/write-scope.ts` を新規作成する（leaf module。import は `src/util/paths.ts` の
      path helper のみに限定し、他 core module へ依存しない）。
- [x] `GUARDED_WRITE_STEPS: ReadonlySet<string>` を定義する = { `implementer`, `build-fixer`,
      `code-fixer`, `test-materialize`, `adr-gen` }（STEP_NAMES 定数を使用）。
- [x] `stagingModeFor(stepName: string): "scoped" | "guarded"` を定義する。既定 `"scoped"`、
      `GUARDED_WRITE_STEPS` に属する step のみ `"guarded"`。
- [x] `protectedCanonPaths(slug: string): string[]` を定義する = request.md / spec.md / design.md /
      tasks.md / test-cases.md / request-review-attestation.json（`requestMdPath` /
      `factCheckAttestationPath` ／ `changeFolderPath` 連結で解決）。
- [x] 判定成果物述語 `isJudgeArtifact(path: string, slug: string): boolean` を定義する
      = `specrunner/changes/<slug>/` 配下の `*-result-*.md` / `review-feedback-*.md` に一致。
- [x] `forbiddenWritePaths(stepName, slug, declaredWritePaths: string[]): string[]` を定義する
      = `protectedCanonPaths(slug)` − `declaredWritePaths`（step が writes() で owned とする path を除外）。
- [x] `findWriteScopeViolations(stepName, slug, changedPaths: string[], declaredWritePaths: string[]):
      string[]` を定義する = changedPaths のうち `forbiddenWritePaths(...)` に含まれるか
      `isJudgeArtifact` に一致し、かつ declaredWritePaths に含まれないものの集合。

**Acceptance Criteria**:
- `stagingModeFor` が実測分類（scoped: request-review / design / spec-review / spec-fixer /
  test-case-gen / code-review / conformance / custom-reviewer 相当の未知名 / regression-gate、
  guarded: 上記 5 step）どおりに返る。
- module が `src/util/paths.ts` 以外の core module を import しない（leaf 性）。

## T-02: write-scope 違反 error を定義する

- [x] `src/errors.ts` の `ERROR_CODES` に `WRITE_SCOPE_VIOLATION: "WRITE_SCOPE_VIOLATION"` を追加する。
- [x] `writeScopeViolationError(stepName: string, branch: string, violatedPaths: string[]):
      SpecRunnerError` を追加する。message に違反 path を列挙し、code は `WRITE_SCOPE_VIOLATION`。
      hint は「境界外への変更を検出したため commit を中止した。worktree を確認し、境界外変更を
      取り除いてから resume する」旨。

**Acceptance Criteria**:
- error の `code` が `WRITE_SCOPE_VIOLATION`、`message` に全 violatedPaths が含まれる。

## T-03: commitAndPush に scoped staging 分岐を実装する

- [x] `src/core/step/commit-push.ts` の `commitAndPush` を、`stagingModeFor(step.name)` で分岐する。
- [x] scoped mode: `step.writes?.(state, deps)` の file path（`artifact === "gitState"` を除外）と
      `pipelineManagedPaths(deps.slug)`（`round-git-scope.ts` から import）の union を stagePaths とし、
      `git add -A -- <stagePaths>` で stage する。stagePaths が空なら現行の空 stage 相当（no-op で
      commit しない）に倒す。
- [x] stage 後の tail（`git diff --cached --quiet` による hasChanges 判定、HEAD-advance 検出、
      commit、`pushOnly`）は既存ロジックを共有ヘルパへ抽出して両 mode から呼ぶ。HEAD-advance
      検出（agent 自主 commit → push-only）を scoped mode でも保存する。

**Acceptance Criteria**:
- scoped mode の stage が `git add -A -- <paths>` を用い、pathspec なしの `git add -A` を用いない。
- 宣言出力 union に含まれない worktree 変更（例 request.md）が commit に混入しない。
- HEAD-advance 検出・commit message 形式（`<step.name>: <slug>`）・push retry が現行と同一。

## T-04: commitAndPush に guarded 差分検査（fail-closed）を実装する

- [x] guarded mode: `git add -A` の **前** に `git status --porcelain -z --no-renames`
      （`infra.spawnFn` 経由）で worktree 相対の変更 path を列挙する（stdout を返す小ヘルパを
      `commit-push.ts` 内 or `git-exec.ts` に追加。NUL 分割 parse は `local.ts` の
      `listWorktreeChanges` と同じ規則）。
- [x] `findWriteScopeViolations(step.name, deps.slug, changed, declaredWritePaths)` を評価する。
      1 件でも違反があれば `writeScopeViolationError(step.name, branch, violations)` を throw し、
      commit / push を行わない（fail-closed）。
- [x] 違反が無ければ従来どおり `git add -A` → T-03 の共有 tail（diff / HEAD-advance / commit / push）。
- [x] status 列挙が spawn 失敗・非 0 exit の場合も fail-closed（commit せず halt）にする。

**Acceptance Criteria**:
- guarded step が禁止領域（request.md 最低限）を変更した状態で commit されず halt になり、halt の
  `ErrorInfo.message` に違反 path が含まれる。
- 境界内のみの変更では `git add -A` → commit → push が従来どおり実行され halt しない。

## T-05: spec-review の reads() に request.md を追加する

- [x] `src/core/step/spec-review.ts` の `SpecReviewStep.reads()` に
      `{ path: requestMdPath(deps.slug) }` を追加する（`util/paths.js` から `requestMdPath` を import）。

**Acceptance Criteria**:
- `SpecReviewStep.reads(state, deps)` の返す IoRef 集合に request.md path が含まれる。

## T-06: scoped 経路の境界強制テスト（judge の request.md 除外）

- [x] scoped step（spec-review 相当）の実行結果に request.md 変更が含まれる状態で commit 処理を
      行うと、request.md 変更が commit に **含まれない** ことを固定するテストを追加する
      （`tests/unit/step/` 配下。real git worktree もしくは spawn mock ＋ stage pathspec 検査）。

**Acceptance Criteria**:
- scoped step の commit に request.md 変更が含まれないことが assert される。

## T-07: guarded 経路の fail-closed halt テスト（implementer の request.md 変更）

- [x] 広域 write step（implementer 相当）が request.md を変更した状態で commit 処理を行うと、
      commit されず halt になり、halt 報告（`ErrorInfo.message` もしくは throw error の message）に
      違反 path が含まれることを固定するテストを追加する。

**Acceptance Criteria**:
- commit / push が呼ばれず、halt の報告に request.md path が含まれることが assert される。

## T-08: 正常経路の挙動同一テスト

- [x] 境界内のみの変更（scoped: 宣言出力 ＋ pipeline 管理 path、guarded: source ＋ 管理 path）で
      commit 内容・挙動が現行と同一であることを固定するテストを追加する。
- [x] 既存 pipeline テスト（`tests/pipeline-integration.test.ts`、`tests/core/pipeline/**`、
      `tests/unit/step/commit-and-push.test.ts` 等）を無改変で green に保つ。commit-and-push.test.ts の
      新規分岐（scoped / guarded / 違反 halt）は追加テストとして足す。

**Acceptance Criteria**:
- 正常経路で per-step commit 内容が現行と同一（state.json 等 pipeline 管理 path を含む）。
- 既存 pipeline テストが無改変で green。

## T-09: 単一ソース ↔ 責任範囲表 無矛盾テスト

- [x] write-scope 単一ソースが唯一の write 境界定義であり、`RULES_MD_CONTENT`
      （`src/prompts/rules.ts`）の責任範囲表と矛盾しないことを固定するテストを追加する。
- [x] 表の 禁止 セルのうち path 表現可能な項目（spec / design / tasks / test-cases）が、対応する
      guarded step の `forbiddenWritePaths(...)` に含まれること（表 ⊆ module）を assert する。
- [x] implementer の Touch 可能 tasks.md が `forbiddenWritePaths("implementer", ...)` に含まれない
      ことを assert する。

**Acceptance Criteria**:
- 責任範囲表の path 表現可能な 禁止 項目がすべて module の禁止領域に含まれる。
- implementer の tasks.md は禁止領域に含まれない。

## T-10: spec-review reads() テスト

- [x] `SpecReviewStep.reads()` の返す集合に request.md が含まれることを固定するテストを追加する。

**Acceptance Criteria**:
- reads() に request.md path が含まれることが assert される。

## T-11: 検証ゲート

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。

**Acceptance Criteria**:
- `typecheck && test` が green。

## T-12（任意・強化）: sequential 経路の architecture 不変を grep-pin する

> B-15（round 経路の coordinator 所有）と対称に、sequential commit 点が write-scope を経由する
> ことを grep-pin で固定する強化タスク。architecture/ は out-of-loop（CODEOWNERS）のため、採否は
> レビューで判断する。要件 1〜4 の behavioral テスト（T-06〜T-10）が主たる歯であり、本タスクは
> 回帰防止の追加壁。

- [x] `architecture/conformance.md` に不変（例 B-17）を追加する: `commit-push.ts` の `commitAndPush`
      が `stagingModeFor` / `findWriteScopeViolations`（write-scope 単一ソース）を経由するか。
- [x] `tests/unit/architecture/core-invariants.test.ts` に対応する grep 検査を追加する。

**Acceptance Criteria**:
- 追加した場合、grep-pin テストが green で、sequential 経路の無差別 `git add -A` 回帰を検出できる。
