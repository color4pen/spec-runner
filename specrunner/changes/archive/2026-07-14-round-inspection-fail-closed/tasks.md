# Tasks: 並列 round の worktree 検査を fail-closed 化する（検査不能を clean と区別し escalation）

> 実装順の原則: まず T-01 で seam の DU 型と port contract を interface-stable に確定させ、
> T-02〜T-04 で各 runtime 実装と consumer 配線を DU へ追随させる。signature に依存する
> spy / behavior test は seam 確定後の T-05 に置く（interface 確定前に test を書かない）。
> `architecture/` 配下・`specrunner/adr/` 配下は変更しない（スコープ外）。
> `commitRoundArtifacts` / `partitionRoundChanges` のロジックは不変（呼び出し条件のみ変える）。

## T-01: seam の戻り値を判別共用体にし、port contract を更新する（D1）

- [x] `src/core/port/runtime-strategy.ts` に DU 型を定義・export する:
  - `export type WorktreeInspectionResult = { kind: "success"; paths: string[] } | { kind: "unavailable"; reason: string }`。
  - 型は port 定義ファイル内に置く（`reason: string` のみで表現し、domain 型を import しない ＝ ports→domain 非依存を維持）。
- [x] `RuntimeStrategy.listWorktreeChanges?`（optional, L424 付近）の戻り値を `Promise<WorktreeInspectionResult>` に変更する。
- [x] `RealRuntimeStrategy.listWorktreeChanges`（required, L534 付近の intersection）の戻り値を `Promise<WorktreeInspectionResult>` に変更する。
- [x] doc comment（L405-424 付近）の「**Never throws — returns [] on any error**」を除去し、新 contract に更新する:
  - 成功時 `{kind:"success", paths}`（worktree 相対、追加・変更・削除・untracked を含む）。
  - 検査不能時 `{kind:"unavailable", reason}`。
  - throw しない点は維持する（DU を返して表現する）。
  - local / managed の分岐説明も新 contract に合わせて更新する。

**Acceptance Criteria**:
- `WorktreeInspectionResult` が port 定義ファイルに export され、domain import を増やさない。
- port / RealRuntimeStrategy の `listWorktreeChanges` 戻り値が `Promise<WorktreeInspectionResult>`。
- doc comment から「Never throws — returns [] on any error」が消え、成功=success / 検査不能=unavailable の新 contract に更新されている（受け入れ基準）。

## T-02: local 実装を DU に追随させ、git 失敗を検査不能にする（D2）

- [x] `src/core/runtime/local.ts:845` `listWorktreeChanges`:
  - `git status --porcelain -z --no-renames` exit 0 → 従来の NUL パース（`part.length < 4` = 4 文字未満のエントリを skip、`slice(3)` で path を取り出す）で `paths` を組み、`{kind:"success", paths}` を返す。
  - exit 非ゼロ → `{kind:"unavailable", reason}`（reason に exit code を含める。例: `git status exited with code ${result.exitCode}`）。
  - catch（spawn 例外・その他例外）→ `{kind:"unavailable", reason}`（reason にエラー概要を含める）。
  - パースロジック自体は不変。戻り値の wrap のみ変える。

**Acceptance Criteria**:
- exit 0 で `{kind:"success", paths}`（未 commit 変更を worktree 相対で返す）。
- 非ゼロ終了で `{kind:"unavailable"}`（reason に exit code）。
- spawn 例外・その他例外で `{kind:"unavailable"}`（reason にエラー概要）。
- どの失敗経路でも空の success（`{kind:"success", paths:[]}`）を返さない。

## T-03: managed 実装を DU に追随させる（挙動不変）（D3）

- [x] `src/core/runtime/managed.ts:560` `listWorktreeChanges`: `{kind:"success", paths:[]}` を返す。`unavailable` にはしない。
- [x] doc comment を「local worktree 不在ゆえの真の空（検査失敗ではない）」旨に更新する。

**Acceptance Criteria**:
- managed は常に `{kind:"success", paths:[]}` を返す（挙動不変）。
- 検査不能を返さない（local の git 失敗と区別する線引きを実装で固定）。

## T-04: consumer を DU 分岐に配線し、検査不能を escalation にする（D4）

- [x] `src/core/pipeline/parallel-review-round.ts:222-259` の worktree 検査ブロック:
  - `deps.runtimeStrategy?.listWorktreeChanges` が存在すれば `inspection = await listWorktreeChanges(cwd)`。
  - `inspection.kind === "unavailable"` →
    - `aggregateVerdictResult = "escalation"`。
    - `roundError = { code: "ROUND_INSPECTION_UNAVAILABLE", message, hint }`。`message` は `inspection.reason` を写像（例: `Worktree inspection unavailable: ${inspection.reason}`）、`hint` は worktree 検査・git 復旧を促す操作上の手がかり。
    - `commitRoundArtifacts` は呼ばない。
  - `inspection.kind === "success"` → 従来どおり `partitionRoundChanges({changed: inspection.paths, declared, slug: deps.slug})` を通す（`offending` → `ROUND_NONDECLARED_CHANGE` escalation、`toStage` → `commitRoundArtifacts`）。既存分岐・infra 構築は不変。
  - `listWorktreeChanges` 不在（method 省略の test fake）→ 従来どおり検査・commit を skip（既存挙動維持）。
- [x] `roundError` は既存経路（synthetic coordinator `StepRun.outcome.error` ＋ `commitRound` の `state.error`）でそのまま state に載る。写像（`reason: string` → `ErrorInfo` = `{code, message, hint}`）は consumer 側に閉じる。
- [x] `partitionRoundChanges` / `commitRoundArtifacts` のロジックには手を入れない（呼び出し条件のみ変える）。

**Acceptance Criteria**:
- `unavailable` で `aggregateVerdictResult = "escalation"`、`roundError.code = "ROUND_INSPECTION_UNAVAILABLE"`、`commitRoundArtifacts` を呼ばない。
- `success` で従来どおり `partitionRoundChanges(paths)` を通し、宣言外変更検出・scoped commit の既存挙動が不変。
- `listWorktreeChanges` 未実装の runtime では検査・commit を skip（既存挙動維持）。
- port の ports→domain 非依存が保たれる（写像は consumer 側）。

## T-05: 全 test fake・既存 test を新 DU に追随させ、intended-invariant を固定する（G5）

- [x] `grep -rn listWorktreeChanges src` で全実装・全 fake・全 test を列挙し、`string[]` 前提の箇所を漏れなく DU へ更新する（本 repo に top-level `tests/` ディレクトリは無く、test は `src/**/__tests__/` 配下）。method 省略の fake（skip 経路）は現状維持。
- [x] `src/core/runtime/__tests__/local-round-git.test.ts` を更新する:
  - git 非ゼロ終了 → `{kind:"unavailable"}`（reason を検証）。spawn 例外 → `{kind:"unavailable"}`。
  - exit 0（空 / 単一 / 複数 / 短い entry skip / 削除）→ `{kind:"success", paths}` を検証する（既存アサーションを DU 形へ移す）。
- [x] `src/core/runtime/__tests__/managed-round-git.test.ts` を更新する: `{kind:"success", paths:[]}` を検証する（`[]` 期待を DU 形へ）。
- [x] `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts` を更新する:
  - fake `makeRuntimeStrategy` の `listWorktreeChanges` を `{kind:"success", paths: opts.worktreeChanges}` を返すよう変更する。既存 Scenario 1〜6（declared-only / undeclared halt / pipeline-managed 除外 / no-change / roundOwnsGitEffects / method 省略）が新 fake で従来どおり通ることを維持する。
  - **新 Scenario（本 request の主眼）**: fake が `{kind:"unavailable", reason:"..."}` を返すとき、`round.run` の outcome が escalation、`state.error.code === "ROUND_INSPECTION_UNAVAILABLE"`、synthetic coordinator StepRun の `outcome.verdict === "escalation"` かつ `outcome.error.code === "ROUND_INSPECTION_UNAVAILABLE"`、`commitRoundArtifacts` が呼ばれないことを固定する。
- [x] method 省略の fake（例: `parallel-review-round-resume.test.ts` 等、`listWorktreeChanges` 未実装）が回帰しないことを確認する（optional のまま skip 経路で通る）。

**Acceptance Criteria**:
- local: 非ゼロ終了・spawn 例外で `{kind:"unavailable"}`、exit 0 で `{kind:"success", paths}` が test で固定される。
- managed: `{kind:"success", paths:[]}` が test で固定される。
- consumer: `unavailable` で escalation（verdict = escalation、`roundError.code = "ROUND_INSPECTION_UNAVAILABLE"`）し `commitRoundArtifacts` を呼ばないことが test で固定される。
- `success` 経路の宣言外変更検出・scoped commit が既存 test で維持される。

## T-06: 全体検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（更新 test 含む、既存 parallel review / resume / runtime git test の regression なし）。
- [x] 変更ファイルが `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` / `src/core/pipeline/parallel-review-round.ts` と対応 test（`local-round-git.test.ts` / `managed-round-git.test.ts` / `parallel-review-round-git-effects.test.ts`）に限られることを確認する。
- [x] `architecture/` 配下・`specrunner/adr/` 配下に変更が無いことを確認する（B-15 の §4 / conformance / 歯への反映はスコープ外、merge 後 attended）。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ基準）。
- `architecture/` は不変（trust-root を out-of-loop に保つ）。
