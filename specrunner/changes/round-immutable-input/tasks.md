# Tasks: 並列 round の入力を immutable にする（共有 deps 不変・resume 配布）

> 実装順の原則: 受け入れ基準は「intended-invariant, scenario 先」。まず T-01 で配布と不変性の
> scenario（test）を intended-invariant として置き、その後 T-02〜T-04 で実装、T-05 で全体を green にする。
> 現状の「最初の member が偶然消費する」挙動は固定しない。

## T-01: 配布・不変性の intended-invariant scenario を置く（scenario 先）

- [x] `src/core/pipeline/__tests__/parallel-review-round-resume.test.ts`（新規）を作り、`ParallelReviewRound.run` を fake executor / 2 member fixture で駆動する scenario を書く。executor は各 member の `buildStepContext` が組んだ resume prompt（= `deps.resumePrompt` / `deps.resumeContext` 由来の文字列）を capture できる形にする（`buildResumePrompt` を通した effective prompt を観測）。
- [x] Scenario「shared deps unchanged after a parallel round」: `deps.resumePrompt` / `deps.resumeContext` を set して round を実行し、round 完了後に共有 `deps.resumePrompt` / `deps.resumeContext` が元の値のままであることを assert する。
- [x] Scenario「human note distributed to all pending members」: human note を set し、pending 2 member 双方の resume prompt に human note が含まれることを assert する。
- [x] Scenario「automatic context only for the target member」: `resumeContext.resumePoint.step = <memberA 名>` を set し、memberA の prompt に automatic context block が含まれ、memberB の prompt には含まれないことを assert する。
- [x] Scenario「human note reaches non-target members without automatic context」: memberB は human note を含むが automatic context block を含まないことを assert する。
- [x] 実行順に依存しないこと（どの member が先に解決しても配布が同じ）を、少なくとも 1 つの assertion で表現する（例: 両 member の human note 有無が対称）。

**Acceptance Criteria**:
- 上記 scenario が失敗する（未実装の状態で red）ことを確認できる。
- test は member の解決順や「最初の member が消費する」現状挙動に依存しない。
- 共有 `deps` の不変性を assert する scenario が存在する。

## T-02: executor の in-place クリアを削除し、one-shot 所有を Pipeline へ移す（D1）

- [x] `src/core/step/executor.ts:242-246` の in-place クリアブロック（`deps.resumePrompt = undefined; deps.resumeContext = undefined;`）を削除する。executor は `deps.resumePrompt` / `deps.resumeContext` を読むだけで書かない。
- [x] `src/core/pipeline/pipeline.ts` の `runInternal` で resume 入力の one-shot を所有する:
  - ループ開始前に `depsWithoutResume = { ...deps, resumePrompt: undefined, resumeContext: undefined }` を一度構築する。
  - `firstUnitExecuted`（boolean, 初期 false）を持つ。
  - 各 unit 実行の直前に、渡す deps を選ぶ: `firstUnitExecuted` が false なら `deps`（resume 入力あり）、true なら `depsWithoutResume`。
  - この選択を coordinator 分岐（`this.round!.run(currentStep, state, <selected>)`）と逐次分岐（`this.executor.execute(step, state, <selected>)`）の両方に適用する。
  - unit 実行後（両分岐共通）に `firstUnitExecuted = true` を set する。
- [x] `deps` に resume 入力が無い run では `deps` と `depsWithoutResume` が等価（両 `undefined`）で、既存挙動と差が出ないことをコード上で担保する。

**Acceptance Criteria**:
- `executor.ts` に `deps.resumePrompt =` / `deps.resumeContext =` の代入が存在しない。
- 再開された最初の unit だけが resume 入力を受け、2 つ目以降の unit は受けない（逐次・並列共通）。
- 共有 `deps` オブジェクトは `runInternal` 内で in-place 変更されない。

## T-03: round が readonly な per-round execution input を構築する（D2）

- [x] `src/core/pipeline/parallel-review-round.ts` の `run` で、fan-out（`Promise.allSettled`）前に `roundDeps`（渡された `deps` からの shallow clone、`{ ...deps }`）を構築する。
- [x] 各 member の実行を `this.executor.execute(memberStep, state, roundDeps)` に変更する（共有 `deps` を直接渡さない）。
- [x] round.run 自身の store / runtime 操作（invalidation, `captureHeadSha`, `persist` 等）は従来どおり `deps` を使う（挙動不変）。
- [x] 配布ロジックは新設しない: human note（全 member）と automatic context（対象 member）の差は `buildResumePrompt` の既存 gate（human note ungated / automatic context は `resumePoint.step === stepName` gate）に委ねる。

**Acceptance Criteria**:
- member 実行は `roundDeps`（round 所有の readonly 入力）を受け、共有 `deps` を受けない。
- T-01 の配布・不変性 scenario が green になる。
- 既存の parallel review / coordinator fan-out の挙動（pending 選択・aggregate verdict・merge・persist）は不変。

## T-04: member→coordinator 写像後も automatic context を保持する（D3）

- [x] `src/core/resume/resolve-step.ts` の `mapMemberToCoordinator` を `export` する（引数・戻り値は現行のまま）。
- [x] `src/core/command/resume.ts` の返却で、automatic context gate を strict equality から写像後一致に変える:
  - `const mappedResumeStep = resumePoint ? mapMemberToCoordinator(resumePoint.step, state.reviewers) : undefined;`
  - `resumeContext: resumePoint && startStep === mappedResumeStep ? { resumePoint } : undefined,`
  - 保持する `resumePoint` は**元の member 名**のまま（写像しない）。
- [x] `resume.ts` で `mapMemberToCoordinator` を import する。`state.reviewers` を渡す（`buildAllowedStepSet(state.reviewers)` と同じ source）。

**Acceptance Criteria**:
- member 由来 resumePoint（reviewers present, `--from` 無し）で `resumeContext` が定義され、`resumeContext.resumePoint.step` が元の member 名。
- 静的 step 経路（写像なし）の gate は `startStep === resumePoint.step` と完全に同値で、現状挙動が不変。
- `--from` が resumePoint 位置と異なる step へ redirect する場合は `resumeContext` が `undefined`。

## T-05: member→coordinator context 保持と逐次 resume 挙動不変の test

- [x] `src/core/command/__tests__/resume-member-context.test.ts`（新規、または既存 `resume-hard-crash.test.ts` に describe を追加）で、member 由来 resumePoint（reviewers present, `--from` 無し）が coordinator へ写像されても `resumeContext` が保持され、`resumeContext.resumePoint.step` が元の member 名であることを固定する。
- [x] 静的 step resume（`resumePoint.step = "spec-review"`）で `resumeContext.resumePoint.step === "spec-review"` を assert（現状不変を固定）。
- [x] `--from` 別 step redirect で `resumeContext` が `undefined` を assert。
- [x] 逐次 one-shot の observable behavior test を Pipeline レベルへ移設する:
  - `src/core/step/__tests__/executor-resume-context.test.ts` と `tests/unit/step/executor-resume-context.test.ts` の「executor が `deps` を in-place クリアする」機構 assertion（`expect(deps.resumeContext).toBeUndefined()` 等）を削除／更新する。executor は `deps` を書き換えなくなるため、この機構 assert は無効。
  - Pipeline を fake executor で駆動し、「human note / automatic context が再開した最初の step だけに届き、次 step には届かない」「非 resume run では resume 入力が届かない」を固定する test を `src/core/pipeline/__tests__/` に追加する。

**Acceptance Criteria**:
- member→coordinator resume で automatic context が保持されることが test で固定される。
- 逐次経路の human note / automatic context の one-shot 配布が Pipeline レベルの test で固定される。
- 除去された機構（executor の in-place クリア）に依存する既存 assertion が残っていない。

## T-06: 全体検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（新規・更新 test 含む、既存 parallel review / resume / executor test の regression なし）。
- [x] `architecture/` 配下・`specrunner/adr/` 配下に変更が無いことを確認する（スコープ外）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 変更ファイルは `src/core/step/executor.ts` / `src/core/pipeline/pipeline.ts` / `src/core/pipeline/parallel-review-round.ts` / `src/core/resume/resolve-step.ts` / `src/core/command/resume.ts` と対応 test に限られる（`architecture/` は不変）。
