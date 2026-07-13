# Scale-Tolerance Review — jobstatestore-internal-split — iter 1

- **reviewer**: scale-tolerance
- **verdict**: approved

## Summary

純粋な refactoring（コードの機械的移動）であり、成長依存コストの新規追加はゼロ。既存のスケール緩和策はすべて保持されている。

## 観点別確認

### 1. ディレクトリ走査の追加・変更

**変更なし。** `JobCatalog.listWithSourceDirs` は元の `JobStateStore.listWithSourceDirs` のコードを verbatim コピーしている。

- archive 走査は `opts?.includeArchived === true` の場合のみ実行（`job-catalog.ts` L73, L135）— ゲート保持確認済み
- 走査は手動コマンド（`specrunner ps`, `specrunner job show`）からのみ呼び出される。定期実行経路（inbox tick / exit-guard）への接続なし
- 走査前フィルタ（`entry.name === "archive"` skip, `entry.name === "canceled"` skip）は保持

### 2. 呼び出し経路の頻度

**変更なし。** 全 static メソッド（`list` / `listWithSourceDirs` / `resolveId`）は手動 CLI コマンドからのみ呼ばれる。  
`persist()` / `appendHistory()` はジョブ pipeline のステップ遷移時に呼ばれる（ジョブ数が増えても呼び出し多重度は増えない。1 ジョブ 1 インスタンス固定）。

### 3. `persist()` の O(journal-size) fold パス

**変更なし。** `JobJournal.persist()` の fast path（`fastPathEligible`判定 → counter のみ更新）は保持（`job-journal.ts` L126–138）。  
O(journal-size) の fold は新規イベントが存在する場合のみ実行。fast path で fold が不要な場合は events.jsonl を読まない。

### 4. `resolveId` の archive 全件走査

**変更なし（pre-existing）。** `resolveId` は短縮 prefix の場合 `list({ includeArchived: true })` + `listLocalSidecars` を並列実行する。  
UUID 全長（36 文字）の場合は即リターンするショートサーキット（`job-catalog.ts` L266–268）は保持。  
archive 全件走査は手動コマンド経路のみ。判定基準の「手動コマンドが archive 全件を読むのは許容」に合致。

### 5. 増え続けるファイル・ディレクトリの新設

**なし。** この変更で追加されたのは TypeScript ソースファイル（5 ファイル）のみ。runtime artifact（state.json / events.jsonl / sidecar）の新設なし。

### 6. GitHub API 一覧系呼び出し

**対象外。** この変更は GitHub API を一切呼び出さない。

## 参考: pre-existing な懸念（このレビューの scope 外）

以下は refactoring 前から存在する特性であり、本変更で導入・悪化はしていない。情報として記録する：

- **resolveId の二重 `listLocalSidecars` 呼び出し**: `list()` 内部で `listLocalSidecars` が呼ばれ、かつ `resolveId` から直接も呼ばれる（L272–275）。結果として sidecar データを 2 回読む。原本コードでも同じパターン。
- **`writeAllToJournal` の sequential append**: fresh write 時に history 全件 + step runs 全件を sequential に追記する。O(history + stepsTotal)。原本コードと同一。
- **list 走査での per-job `composeSplitLayout`**: 走査対象ジョブごとに state.json + events.jsonl を読んで fold する。O(jobs × journal-size-per-job)。原本コードと同一。

これらは本 request のスコープ（refactoring・公開 API 不変）外であり、別 request の対象。

## 判定根拠

判定基準「成長軸に触れない変更」に該当。  
全コードは元の `job-state-store.ts` からの機械的抽出であり、アルゴリズム変更・新規 I/O パス・新規定期実行接続のいずれも存在しない。
