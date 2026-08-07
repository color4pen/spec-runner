# Scale-Tolerance Review — dead-code-adapter-cli (iteration 1)

**Reviewer**: scale-tolerance  
**Date**: 2026-08-07  
**Scope**: 61 files changed, 2537 insertions (+893 deletions)

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

---

## 検査結果

### 本番コード変更の性質

本 PR は削除のみの refactoring。`src/` 配下の追加行は下記だけ:

| ファイル | 追加内容 |
|---|---|
| `src/adapter/claude-code/agent-runner.ts` | import repoint（shim → shared/、util/） |
| `src/cli/archive.ts` | JSDoc 更新（`[--dry-run]` 除去） |
| `src/cli/config-effective.ts` | `cwd` fallback 削除後の 1 行単純化 |
| `src/logger/stdout.ts` | `export const` → `const`（un-export のみ） |
| `src/core/step/report-tool.ts` | import 行の削除（BaseReportResult 系）|

**新しいループ・ReadDir・API 呼び出しはゼロ。**

---

### スケールセンシティブ対象ごとの確認

| 対象 | 新規走査コードの有無 | 判定 |
|---|---|---|
| **archive** | なし。archive.ts の変更は `dryRun?: boolean` 削除のみ。既存の `JobStateStore.list()` + `readdir(archivedChangesDirRel())` は pre-existing かつ本 diff で変更なし | 影響なし |
| **sidecar** | なし | 影響なし |
| **issue/PR** | なし | 影響なし |
| **コメント** | なし | 影響なし |
| **journal** | なし | 影響なし |

---

### 新規テストファイルの走査パターン（観察）

`tests/dead-code-adapter-cli.test.ts` に `collectTsFiles(dir)` + `grepSymbol(symbol)` が追加された。
これは `src/`・`bin/`・`tests/` 配下の .ts ファイルを全件再帰走査し、シンボル文字列を検索する。

- 走査対象は **ソースコードファイル**（TS）であり、archive・sidecar・journal ではない
- ソースファイル数の増加速度は開発ベロシティに比例し、operational data（archive・journal）のような単調増加とは性質が異なる
- テストコードであり本番 path に影響しない
- `grepSymbol` は 1 テスト実行につき 1 回の完全スキャン（テスト実行の都度 ~O(N×ファイル数) だが、テストスイートの性質上許容範囲）

→ **scale-tolerance の判定対象外（ソースツリー走査は reviewer のスコープ外）**

---

## 既存の pre-existing パターン（本 diff で未変更）

以下は本 PR が手を触れていない既存コードであり、本レビューの判定対象外:

- `src/cli/archive.ts:97-104`: `JobStateStore.list(repoRoot)` → 全 job state をメモリにロードして slug フィルタ（O(N)）
- `src/cli/archive.ts:122-126`: `readdir(archivedChangesDirRel())` → archive フォルダを全件 find（O(N)）

これらは本 diff で増悪していない。

---

## エビデンス

- `git diff main...HEAD -- src/ bin/` の全追加行を走査: archive/sidecar/journal に触れる新規ループなし確認
- `src/cli/archive.ts` diff: 変更は `-  dryRun?: boolean;` と docstring 修正のみ
- `src/config/store.ts` diff: `FileConfigStore` クラスと `saveProjectConfig` の削除のみ
- `src/core/preflight.ts` diff: `checkConfigComplete` 呼び出しブロック削除のみ（別の I/O 追加なし）
- `tests/dead-code-adapter-cli.test.ts`: `collectTsFiles` は `src/`・`bin/`・`tests/` のみ走査、archive 配下には触れない

**checked**: 61 (全変更ファイル) / **skipped**: 0 / **unverified**: 0
