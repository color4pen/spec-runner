# executor の commit/push 抽出と pipeline の重複 stdout 共通化

## Meta

- **type**: refactoring
- **slug**: executor-pipeline-cleanup
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

当初モジュール評価で挙げた最後の構造的負債。実機確認:

### executor.ts（495 行）に責務が 2 つ同居
- step ライフサイクル制御（execute / runAgentStep / runCliStep / finalizeStep）
- **git commit/push 操作**（`findAuthoritySpecViolations` L27, `commitAndPush` L272 周辺、`tryPush` retry など約 100 行）

step 実行と git 操作は別の変更理由を持つ（spec 違反検出ルールが変わっても step 制御は変わらない）。`gitExec`/`gitExecExitCode` は既に `util/git-exec.ts` にあるので、commit/push まわりを `step/commit-push.ts` 等に切り出すのは低リスク。

### pipeline.ts（474 行）に同型 stdout が 3 重
```
L265-266: stdoutWrite(`Pipeline finished: spec-review iterations=${...}, final verdict=${...}\n`)
L323-324: 同形
L349-350: 同形
```
loop 完了 / iteration exhaustion / fixer exhaustion の 3 経路でほぼ同じ出力。共通 helper 化で readability / reusability が上がる。

## type: refactoring の理由

振る舞い・port 契約・spec 契約とも不変、delta spec 不要。前例（`managed-agent-runner-refactor` = #373 等）と同じく純粋な構造リファクタなので `refactoring` 型（`no-specs-for-required-type` 対象外、`TYPES_REQUIRING_SPECS = ["spec-change","new-feature"]`）。

## 要件

1. **commit/push を別ファイルへ抽出**: `src/core/step/commit-push.ts`（または同等の path）を新設し、`findAuthoritySpecViolations` / `commitAndPush` / `pushOnly`（内部の `tryPush` retry lambda 含む）等の commit/push 関連ロジックを移す。executor.ts はこれを呼び出す薄い orchestrator にとどめる。executor の step ライフサイクル制御の責務だけ残す。
2. **pipeline の `Pipeline finished` stdout 3 箇所を 1 ヘルパーに集約**: `formatPipelineFinished({ iterations, verdict })` 等の private helper を作り、L265-266 / L323-324 / L349-350 で同一形式の出力を共通化する。
3. **振る舞い不変**: 既存 spec scenario（step-execution-architecture / pipeline-orchestrator）が green のまま、外部挙動・stdout 内容・exit code・verdict が変わらないこと。
4. ファイルサイズは結果として小さくなるが、行数目標は努力目標とする（私の前回 AC 反省: in-file private 抽出は LOC を減らさない。別ファイル抽出を主目的とし、行数のために振る舞い保持の分岐を圧縮しない）。

## 振る舞い保持で壊しやすい箇所（regression 注意）

- **`commitAndPush` のエラー記録経路**（executor.ts L230-234 の catch）: `AUTHORITY_SPEC_EDIT_VIOLATION` / `PUSH_FAILED` 等のエラーが step history に記録される現状の挙動を保つ
- **`requiresCommit` guard と組み合わせた変化なし時の sile 退出**（L262-272 のコメント参照）
- **`tryPush` の 5秒 retry**（`sleepFn` injectable）
- **`findAuthoritySpecViolations`** の挙動（baseline spec 直接編集の検出と escalation）
- pipeline 側の 3 箇所は出力文言が完全一致している前提で集約する（差分があれば抽出を見送る）

## スコープ外

- `AgentRunner` port / `Pipeline.run` / `StepExecutor.execute` の公開 API 変更
- spec の編集（既存挙動を保つので delta 不要）
- commit/push のロジック自体の改善（retry 回数・5秒 sleep など）
- pipeline の他 stdout（step:start や iter 開始等の出力形式）の変更

## 受け入れ基準

- [ ] commit/push 関連関数（`findAuthoritySpecViolations`, `commitAndPush`, `pushOnly`（`tryPush` retry lambda を含む）等）が executor.ts から別ファイルに抽出されている
- [ ] executor.ts は step ライフサイクル制御の責務に絞られ、commit/push の本体ロジックを持たない（呼び出すだけ）
- [ ] pipeline.ts の `Pipeline finished: spec-review iterations=...` stdout 3 箇所が共通 helper 経由になっている
- [ ] 既存 spec scenario（step-execution-architecture / pipeline-orchestrator）が green
- [ ] stdout 出力が文言含め従来どおり（regression なし）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

未確定（必要に応じ module-architect で確定）。論点:
- 抽出先のファイル名・配置（`src/core/step/commit-push.ts` か `src/core/git/` か等）
- pipeline の helper を free function にするか Pipeline class 内 private にするか
- type が `refactoring` で良いこと、delta spec 不要なことは前例（#373 managed-agent-runner-refactor）から確定済み
