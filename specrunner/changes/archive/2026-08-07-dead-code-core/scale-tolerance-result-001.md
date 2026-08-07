# Scale-Tolerance Review: dead-code-core (Iteration 1)

**Reviewer**: scale-tolerance  
**Date**: 2026-08-07  
**Verdict**: derived by CLI from findings below

---

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

---

## 変更の性質

純粋な削除リファクタリング。src/ tests/ で計66ファイルの変更、うち実装の削除が大半。追加は `specrunner/changes/dead-code-core/` 配下のアーティファクトと `tests/unit/dead-code-core.test.ts` のみ。

---

## 走査対象の確認

### 1. 削除コードに含まれていた scale-sensitive パターン

**`src/core/finish/resolve-target.ts`（削除済）**  
`resolveBySlug` 内に `JobStateStore.list(repoRoot, { includeArchived: true })` が存在。  
本番呼び出しゼロの dead code であり、削除によってこの O(archive-count) スキャン経路がコードベースから消えた。scale 観点では**削除は正の変化**。

**`src/state/reconcile.ts`（削除済）**  
純粋関数のみ。I/O・スキャンなし。scale 無関係。

**`src/core/finish/pr-status.ts`（削除済）**  
固定回数(3回)のリトライのみ。単調増加データに触れない。

**`src/core/doctor/checks/index.ts` の `allChecks`（削除済）**  
静的配列スプレッドのみ。ランタイムスキャンなし。

### 2. 変更後に残存する orchestrator.ts の既存スキャン

`src/core/archive/orchestrator.ts:128` の `JobStateStore.list(cwd, { includeArchived: true })` は **本変更で触れていない**（diff に該当行の変更なし）。この呼び出しは archive 件数に比例するコストを持つが、本変更のスコープ外の既存実装である。

### 3. 新規追加 `tests/unit/dead-code-core.test.ts`

`execSync('grep -rn ...')` を27回発火する tombstone-invariant テスト。スキャン対象は `src/` と `tests/` ディレクトリ（開発成果物）であり、archive・sidecar・journal 等のランタイム増加データセットではない。テスト実行時間はコードベースファイル数に比例するが：

- テストのみ（本番コードなし）
- コードベースサイズの成長速度はランタイムデータより桁違いに遅い
- パターンは削除済みシンボルの存在確認であり、時間とともに件数が増えるものではない

**判定**: 本観点の定義（archive/sidecar/issue/PR/comment/journal への比例コスト）には該当しない。

---

## チェック結果サマリ

| チェック項目 | 対象ファイル / パターン | 結果 |
|-------------|----------------------|------|
| 削除コードに O(archive-count) スキャンが含まれるか | `resolve-target.ts:resolveBySlug` | 含む → 削除により除去（正の変化） |
| 残存本番コードに新規スキャン導入があるか | `orchestrator.ts` diff | なし（既存行は変更前から存在） |
| `deriveAndWriteUsage` 削除後の orchestrator に副作用漏れがあるか | `orchestrator.ts:230-` | なし（no-op ブロックの純粋削除） |
| 新規テストが journal/sidecar/archive を直接スキャンするか | `dead-code-core.test.ts` | なし（src/・tests/ のみ） |
| doctor checks 削除後に全体スキャン経路が生まれるか | `checks/index.ts` diff | なし（静的配列の削除のみ） |

---

## findings

なし（scale-tolerance 観点での問題は検出されなかった）

---

## 付記（observations）

- `orchestrator.ts:128` の `includeArchived: true` スキャンは本変更スコープ外の既存実装。archive 件数増加とともにコストが成長する性質を持つが、本 PR は触れていない。
- `dead-code-core.test.ts` の 27 subprocess grep は test-suite 実行時間に影響する。archive 件数ではなくコードベースファイル数に比例するため本観点の対象外だが、将来的に grep を ripgrep/import-graph ベースに置き換えると高速化できる。
