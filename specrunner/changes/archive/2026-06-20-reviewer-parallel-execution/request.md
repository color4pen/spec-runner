# カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation

## Meta

- **type**: new-feature
- **slug**: reviewer-parallel-execution
- **base-branch**: feat/reviewer-parallel
- **adr**: true

## 背景

カスタムレビュワーは現在直列実行される（declaration order）。レビュワーが複数あると wall-clock time が積み上がる（実測: review 5〜8分 + fix 3〜8分 per reviewer）。

各レビュワーは独立した収束ループ（review → fix → review → approved）を持つので、review フェーズは論理的に並列実行できる。ただし code-fixer が共用のため、並列 fix は同じファイルを別方向に修正しうる。

本 request は Phase 1 として以下を導入する:
1. カスタムレビュワーの review を並列実行する
2. blocking findings を集約して code-fixer に1回で渡す
3. fixer 後に touched paths ∩ activationPaths で再 review 対象を絞る（invalidation）
4. レビュワーごとの status を state に記録し、resume 時に approved を skip する

## 現状コードの前提

- `src/core/pipeline/reviewer-chain.ts:70` — `resolveActiveReviewer()` が `startedAt` の最新タイムスタンプで active reviewer を判定する。直列前提の設計で、並列実行すると複数レビュワーが同時に走るため成立しない
- `src/core/pipeline/reviewer-chain.ts:143` — `buildReviewerChainTransitions()` が直列遷移テーブルを生成する。各レビュワーから次のレビュワーへの1対1遷移
- `src/core/pipeline/pipeline.ts:181` — `runInternal()` が while ループで1ステップずつ直列実行。並列ステップの概念がない
- `src/state/schema.ts:314` — `JobState.reviewers?: ReviewerSnapshot[]` で snapshot は保持されるが、per-reviewer の実行 status（approved / pending / invalidated）を集約的に追跡する仕組みがない
- `src/core/step/code-fixer.ts:69` — `reads()` が `resolveActiveReviewer()` で単一レビュワーの findings のみを参照する。複数レビュワーの findings 集約に対応していない
- `src/core/pipeline/findings-ledger.ts:27` — `collectFindingsLedger()` は全レビュワーの全 run から fixable findings を集約・dedup する。regression gate 用だが、並列後の fixer 入力集約にも流用できる
- `src/core/reviewers/activation.ts:49` — `evaluateActivation()` が paths glob + requestTypes で activation を判定。changed files は `listChangedFiles()`（`git diff --name-only base...HEAD`）で取得
- `src/kernel/reviewer-snapshot.ts:55-56` — `ReviewerSnapshot` は `paths?: string[]` と `requestTypes?: string[]` を持つ。invalidation 判定にそのまま使える

## 要件

1. **per-reviewer status record を JobState に追加**: `reviewerStatuses?: ReviewerStatus[]` として name / status（pending | approved | skipped）/ approvedAtCommit / activationPaths / invalidatedByCommit を記録する
2. **カスタムレビュワーの review を並列実行する**: pipeline の reviewer chain 部分で、対象レビュワーの review フェーズを同時実行する。code-review（built-in）は並列化対象外で、code-review 完了後にカスタムレビュワー群が並列開始する
3. **blocking findings を集約して code-fixer に1回で渡す**: 並列 review 完了後、needs-fix のレビュワーの findings を集約し、code-fixer に1回のセッションで渡す。全レビュワーが approved なら fixer をスキップ
4. **fixer 後の invalidation**: fixer が変更したファイルと各レビュワーの activationPaths を照合し、該当レビュワーを pending に戻す。invalidation されたレビュワーだけ再 review する
5. **resume 時の skip**: approved かつ未 invalidate のレビュワーは resume 時に再実行しない
6. **regression gate は従来どおり**: 全カスタムレビュワーが approved になった後に regression gate を実行する。`collectFindingsLedger()` は全レビュワーの findings を既に集約するため変更不要
7. **レビュワー0件は無影響**: カスタムレビュワーが未定義の場合、既存の挙動と同一（backward compat）
8. **レビュワー1件は直列と同等**: 並列化の恩恵はないが、status tracking と invalidation は機能する

## スコープ外

- clustered fixer（finding を file/subsystem 単位でグルーピングして fixer を分割）— Phase 2
- reviewer scheduler（activation + cost/signal ベースのレビュワー選択最適化）— Phase 3
- code-review（built-in）の並列化 — code-review は always-run の judge であり、カスタムレビュワーとは別のステップ

## 受け入れ基準

- [ ] `state.json` に `reviewerStatuses` が記録され、各レビュワーの status / approvedAtCommit が含まれる
- [ ] カスタムレビュワーが2件以上あるとき、review フェーズが並列実行される（wall-clock が直列時より短い）
- [ ] 並列 review 後に needs-fix のレビュワーがある場合、findings が集約されて code-fixer に渡される
- [ ] fixer が activationPaths 内のファイルを変更した場合、該当レビュワーが pending に戻り再 review される
- [ ] fixer が activationPaths 外のファイルのみ変更した場合、レビュワーは approved のまま再 review されない
- [ ] 全レビュワー approved 後に regression gate が実行される
- [ ] resume 時に approved かつ未 invalidate のレビュワーが skip される
- [ ] カスタムレビュワーが0件の場合、既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **review 並列 + fix 集約（採用）**: review は独立した読み取り操作なので安全に並列化できる。fix は code-fixer が共用で同じファイルを触りうるため、全 findings を集約して1回で渡す。fix 後に invalidation で再 review 対象を絞ることで、不要な再実行を防ぐ
- **invalidation を activationPaths ベースで行う（採用）**: fixer が変更したファイルと各レビュワーの `paths` glob を照合する。正確な invalidation には fixer の変更ファイルリスト（`git diff`）と既存の `evaluateActivation()` を流用できる。paths が未定義のレビュワー（always-activate）は fixer 後に常に pending に戻す
- **per-reviewer status を state に持つ（採用）**: `StepRun[]` の最後の verdict から推論する方式は並列実行で破綻する（複数レビュワーが同時に完了）。集約的な status record を別途持つことで、resume / invalidation / 将来の scheduler 拡張に対応できる
- **完全並列 fix（却下）**: 各レビュワーが独立に fixer を呼ぶと同じファイルを別方向に修正しうる。worktree 分離は重く（200-500ms setup + disk per agent）、conflict 解消も必要。集約 fixer の方がシンプルで regression gate との整合も良い
- **`resolveActiveReviewer()` の置き換え**: 並列実行では「最後に走ったレビュワー」の概念がなくなる。code-fixer の入力を全レビュワーの findings 集約に変更し、active reviewer 解決を不要にする
