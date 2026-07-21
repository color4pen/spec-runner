# Design: sequential step の commit を write-set 境界で機械強制する

## Context

sequential step の commit は `commitAndPush`（`src/core/step/commit-push.ts:36`）が
`git add -A`（worktree 全体・pathspec なし）で staging する。agent が宣言された書込境界の
外（正典 request.md、他 step の成果物、無関係な source code）へ書いても、その変更は
そのまま同一 commit に混入する。書込境界は rules.md の責任範囲表と各 system prompt の
Contract 節で **宣言** されているが、破られたときに止める機械は存在しない。

一方、並列 reviewer round 経路には既に coordinator-owned scoped staging が存在する:

- `RuntimeStrategy.listWorktreeChanges`（`src/core/runtime/local.ts:774`）が
  `git status --porcelain -z` で worktree 変更を列挙する。
- `partitionRoundChanges`（`src/core/pipeline/round-git-scope.ts:83`）が変更を
  `toStage`（changed ∩ declared）と `offending`（changed − declared − pipelineManaged）へ分離する。
- `commitScopedPaths`（`src/core/step/commit-push.ts:172`）が宣言 path だけを
  `git add -A -- <paths>` で stage する。
- offending が 1 件でもあれば round 全体を halt する（fail-closed）。

本変更は、この round 経路で確立済みの機構を **sequential 経路に対称に導入** する。round
経路の挙動は一切変えない。

### 現状の step 分類（writes() 実測）

- **成果物が確定的な step**（writes() が固定 path を返す）: request-review / design /
  spec-review / spec-fixer / test-case-gen / code-review / conformance / custom-reviewer /
  regression-gate。これらは宣言 path のみを stage すれば境界が構造的に保証される。
- **広域 write step**（writes() が `{ path: changeFolderPath, artifact: "gitState" }` を含む、
  または実ファイル名が実行時決定）: implementer / build-fixer / code-fixer / test-materialize
  （`artifact: "gitState"`）、adr-gen（実ファイル名が `specrunner/adr/YYYY-MM-DD-<slug>.md` と
  日付 prefix 付きで宣言 path と一致しない）。これらは出力を事前列挙できないため scoped
  staging では silent drop（実装物の commit 漏れ）が起きる。

### 検証済みの前提（本設計が依存する事実）

- `commitAndPush` は `finalizeStepArtifacts`（`local.ts:659`）から全 sequential step に対し
  呼ばれ、失敗（throw）は executor が `makeCommitFailHalt`（`step-halt.ts:305`）で halt 化する
  （`executor.ts:436-458`）。halt の `ErrorInfo.code` / `message` は throw した error の
  `code` / `message` を保持する。
- `commitAndPush` の HEAD-advance 検出（agent 自主 commit → push-only、`commit-push.ts:62-73`）は
  implementer-self-commit-tolerance の挙動であり、保存する必要がある。
- 既存の commit 系テスト（`tests/unit/step/commit-and-push.test.ts`）は git subcommand を
  `toContain` ＋ 相対順序で緩く assert しており、`add` の pathspec 追加や status 呼び出しの
  挿入では壊れない（exact-arg assert は不在）。

## Goals / Non-Goals

**Goals**:

- 各 step の許可書込領域を機械可読な単一ソース（`src/` の leaf module）で定義する。
- 確定的 step は宣言 path のみを stage し、境界外の変更を commit へ混入させない。
- 広域 write step は commit 前に禁止領域への変更を差分検査し、検出したら fail-closed で
  halt する（違反 path を halt 報告に列挙）。
- spec-review の reads() に request.md を追加し、review が request を正典として読む事実を
  lineage に残す。
- 正常経路（境界内のみの変更）で commit 内容・挙動を現行と同一に保つ。

**Non-Goals**:

- 並列 round 経路（既に scoped）の変更。挙動を変えない。
- prompt の Contract 節文言の変更（宣言は既存のまま。同源化は別 request）。
- agent 実行時の tool-level write 遮断（SDK permission 層）。
- 過去 commit の境界違反の遡及監査。
- 広域 write step に対する source code の **positive allow-list** 強制（例: test-materialize が
  production code を書かない / adr-gen が src を書かない）。これは列挙不能領域であり、本変更の
  禁止集合（request.md を最低限とする正典・他 step 成果物）とは別軸。責任範囲表の prompt 規律
  として残す。

## Decisions

### D1: commit 境界での強制（staging scope ＋ 差分検査）

commit 境界で強制する。agent がどう書こうと、境界外の変更は「commit されない」か「halt する」
かのいずれかになり、宣言と機械が一致する。

- **Rationale**: commit 境界は runtime 非依存の共通経路であり、最小の強制点。既存 scoped
  variant（`commitScopedPaths`）と round scan 機構を流用でき実装面積が小さい。
- **Alternatives**: SDK permission（tool-level 遮断）→ provider 依存で managed runtime と挙動が
  割れる。却下。違反変更の自動 revert → 証跡を消す。却下（halt して人間に見せる）。

### D2: 単一ソース `src/core/step/write-scope.ts`（leaf module）

step 名 → staging mode と、広域 write step の禁止 path 集合を、他 module へ依存しない leaf
module に集約する。`src/util/paths.ts` の path helper のみを import する。

- `stagingModeFor(stepName): "scoped" | "guarded"`。既定は `"scoped"`。`GUARDED_WRITE_STEPS`
  集合（implementer / build-fixer / code-fixer / test-materialize / adr-gen）に属する step のみ
  `"guarded"`。
- `forbiddenWritePaths(stepName, slug, declaredWritePaths): string[]` = 変更後に保護すべき
  正典・他 step 成果物集合 `protectedCanonPaths(slug)` から、その step が writes() で宣言する
  owned path を差し引いた集合。`protectedCanonPaths` = request.md / spec.md / design.md /
  tasks.md / test-cases.md / request-review-attestation.json ＋ 判定成果物（`*-result-*.md` /
  `review-feedback-*.md`）を表す述語。
- `findWriteScopeViolations(stepName, slug, changedPaths, declaredWritePaths): string[]` =
  changedPaths ∩ forbidden。

- **Rationale**: 既定を strict な `"scoped"` にすることで、未分類の新 step や arbitrary 名の
  custom reviewer は fail-safe（宣言外の書込を commit しない）へ倒れる。`"guarded"` は列挙不能な
  広域書込が本当に必要な小さな明示集合に限る。分類を step 名 key にするのは、custom reviewer が
  arbitrary 名を持ち writes() の有無で分類できないため。
- **Alternatives**: writes() に `artifact: "gitState"` が含まれるかで判定 → adr-gen（gitState では
  ないが日付 prefix で宣言 path が実ファイルと不一致）を scoped と誤分類し silent drop する。却下。

### D3: 確定的 step は scoped staging（既存 variant を流用）

`stagingModeFor` が `"scoped"` の step は、`writes(state, deps)` の file path（`artifact:
"gitState"` を除く）と pipeline 管理 path（`pipelineManagedPaths(slug)` =
state.json / events.jsonl / usage.json）の union を pathspec とし、`git add -A -- <paths>` で
stage する。境界外（request.md 等）の変更が worktree にあっても commit に混入しない。

- **Rationale**: pipeline 管理 path を staging 集合へ含めるのは、現行の per-step commit が
  `git add -A` で state.json 等を運んでいる挙動を保存するため（commit 内容同一）。宣言 path のみに
  絞ると state 永続化の commit 内容が現行と変わる。round 経路が管理 path を round commit に
  含めないのは terminal seam（`commitFinalState`）へ委ねる設計だが、sequential per-step commit は
  現行挙動保存を優先し管理 path を含める。
- **Alternatives**: 宣言 path のみ stage → state.json が per-step commit から落ち、commit 内容が
  現行と非同一になり既存 integration 期待が揺れる。却下。

### D4: 広域 write step は差分検査 ＋ fail-closed

`stagingModeFor` が `"guarded"` の step は、`git add -A` の **前** に
`git status --porcelain -z --no-renames`（`infra.spawnFn` 経由）で worktree 変更を列挙し、
`findWriteScopeViolations` で禁止領域への変更を照合する。1 件でも違反があれば commit せず、
`writeScopeViolationError`（違反 path を列挙）を throw して halt する。違反が無ければ従来どおり
`git add -A` → commit → push。

- **Rationale**: 列挙不能な write を scoped staging で無理に列挙すると silent drop が起きる。
  禁止領域検出 → halt の方が変更の黙殺より安全で監査可能。status を add の前に行うのは、round
  経路（`listWorktreeChanges` → partition → 判定）と対称であり、halt 時に何も stage しない
  （証跡を worktree に残す）ため。
- **Alternatives**: add 後に `git diff --cached --name-only` で検査 → 既に stage 済みで、halt 後の
  worktree 状態が add 前と変わる。add 前 status の方が挙動が明快。

### D5: `writeScopeViolationError` と halt 経路

新 error code `WRITE_SCOPE_VIOLATION` を `ERROR_CODES` に追加し、`writeScopeViolationError(
stepName, branch, violatedPaths)` を `src/errors.ts` に定義する。message に違反 path を列挙する。
`commitAndPush` が throw したこの error は executor が `makeCommitFailHalt` で halt 化し、
`ErrorInfo.code = WRITE_SCOPE_VIOLATION` / `message` に違反 path が入る。

- **Rationale**: 既存の commit-fail halt 経路（`makeCommitFailHalt` が err.code を保持）に
  そのまま乗せられ、新しい halt 種別を FSM に足さずに済む。halt 報告に違反 path が残る。

### D6: spec-review の reads() に request.md を追加

`SpecReviewStep.reads()`（`spec-review.ts:80`）に `{ path: requestMdPath(deps.slug) }` を足す。
request.md は spec-review 実行時に必ず存在する正典入力なので required（既定）で問題ない。

- **Rationale**: review が request を正典として読む事実が I/O contract（lineage）に残る。
  pre-execution validation（`validateStepInputs`）にも乗る。

## Risks / Trade-offs

- **[Risk] scoped 化で per-step commit の内容が変わる（state.json 等の欠落）**
  → Mitigation: D3 で pipeline 管理 path を scoped staging 集合へ含め、現行の per-step commit 内容を
  保存する。正常経路 commit 内容同一を固定するテストを置く。

- **[Risk] 広域 step の分類漏れ（本来 guarded を scoped 扱い）で silent drop**
  → Mitigation: `GUARDED_WRITE_STEPS` を実測（`artifact: "gitState"` ＋ 実行時決定ファイル名の
  adr-gen）で網羅。分類テストで固定。既定 scoped の fail-safe は「宣言外を commit しない」方向で、
  guarded 側の silent drop 危険（halt すべきものを黙殺）とは非対称に安全。

- **[Risk] guarded 検査の status 呼び出しが既存 commit テストの sequence 期待を壊す**
  → Mitigation: 既存テストは `toContain` ＋ 相対順序の緩い assert（exact-arg 不在）を確認済み。
  add < diff < commit < push の順序は保存される。commit-and-push.test.ts の新規分岐テストのみ追加。

- **[Risk] 単一ソースが rules.ts 責任範囲表と乖離する**
  → Mitigation: 表の 禁止 セルのうち path 表現可能な項目（spec / design / tasks / test-cases）が
  module の forbidden 集合に含まれること（表 ⊆ module、機械が表より弱くならない方向）と、
  Touch 可能 セルの tasks（implementer）が module で forbidden されないことをテストで固定する。

## Open Questions

- なし（architect 評価で採用/却下は確定済み）。
