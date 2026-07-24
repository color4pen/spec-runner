# Scale-Tolerance Review Result

## 対象変更

`spec-review-full-enumeration` — spec-review 全量列挙規律と後出し検出

## 確認した観点とエビデンス

### 1. 呼び出し経路の頻度（定期実行 vs 手動コマンド）

**確認箇所**: `src/core/step/commit-orchestrator.ts` L272–299

`applySuccessPostPersistEffects` 内の finding-recency 検出ブロックは、`step.name === STEP_NAMES.SPEC_REVIEW` かつ `iteration >= 2` のときのみ実行される。
`applySuccessPostPersistEffects` は `commitSuccess`（逐次ステップ完了時）と `commitRound`（並列 round 完了時）から呼ばれる。
いずれも `specrunner run` / `specrunner resume` という手動コマンドのコンテキスト内で spec-review ステップが完了したときのみ発火する。
定期実行経路（inbox tick / exit-guard / polling ループ）への配線はない。

→ **コスト発生タイミング: 手動コマンド限定。定期実行経路への単調増加コスト追加なし。**

### 2. ディレクトリ走査（readdir / glob）の有無

**確認箇所**: `src/core/step/finding-recency.ts`（computeFindingRecency）、`src/core/runtime/local.ts`（readRevisionContent）

readdir / glob の追加はない。`fs.readFile`（ファイル 1 件）と `git show <oid>:<file>`（コマンド 1 回）のみ。
`contentCache = new Map<string, { current, prior }>()` で per-file コンテンツをキャッシュし、同一ファイルへの重複 `readRevisionContent` 呼び出しを削減する。
git show の実行回数は findings 件数ではなく distinct file 数に比例する。
spec-review の finding 対象は通常 1〜数ファイルであり、git show コールは有界。

→ **コスト増分: distinct finding file 数 × 1 回の git show。ループ走査なし。**

### 3. GitHub API の一覧系呼び出し

**確認箇所**: `src/core/runtime/managed.ts` L695–719（readRevisionContent）

managed runtime では `getRawFile(owner, repo, branch, file)` を 1 ファイル 1 コールで呼ぶ。
一覧系（list issues / list PRs 等）の API は呼ばない。ページング問題は生じない。
managed runtime では `prior` は常に null（indeterminate に倒れる）ため、git OID 解決の API 呼び出しもない。

→ **一覧系 API 呼び出しなし。ページング欠落リスクなし。**

### 4. 並列 fan-out（Promise.all）の多重度

**確認箇所**: `src/core/step/finding-recency.ts` L139–208（computeFindingRecency for-of ループ）

`computeFindingRecency` は `for...of findings` で逐次実行する。`Promise.all` による並列 fan-out はない。
finding 件数が増えても、同時発行コマンド数は常に 1 に制限される。
contentCache でキャッシュ済みファイルはコマンド発行せずにスキップされる。

→ **無制限並列発行なし。逐次 + per-file キャッシュで I/O を制御。**

### 5. 新たに増え続けるファイル・ディレクトリの新設と retention

**確認箇所**: `src/store/event-journal.ts`（appendEventRecord）、`src/store/job-journal.ts`（appendFindingRecency）

finding-recency record は既存の `events.jsonl` に 1 行 append するだけで、新ファイル・新ディレクトリは作成しない。
events.jsonl のクリーンアップは既存の `job archive` フローが担当（変更なし）。
finding-recency 行数は spec-review の iteration 数（= `maxIterations` 以内）で有界であり、単調増加に上限がある。

→ **新規ファイル新設なし。既存 events.jsonl への追記のみ。retention 経路は既存 archive フローに委任。**

### 6. fold() での finding-recency 収集

**確認箇所**: `src/store/event-journal.ts` L347–350（fold 内 finding-recency 分岐）

`fold()` は events.jsonl の全行をスキャンする（既存動作）。finding-recency 行も同一ループ内で収集され、
`findingRecencyRecords` 配列に push される。
finding-recency 行数は spec-review iteration 数で有界（上述）。
`fold()` の呼び出しは job load 時（手動コマンド経路）のみであり、定期実行経路ではない。

→ **fold() への影響は既存動作の延長。新たな全件走査を導入しない。件数は有界。**

### 7. classifyFindingRecency での split 再実行（observation）

**確認箇所**: `src/core/step/finding-recency.ts` L99–103

`classifyFindingRecency` 内で `priorFileContent.split("\n")` を finding ごとに実行する。
`contentCache` は raw content をキャッシュするが split 済み行配列はキャッシュしない。
同一ファイルに N 件の finding があると、split が N 回実行される（O(N × L)）。
実際のスケール（finding < 20 件、ファイル < 1000 行）では無視できる水準であり、
かつこの処理は手動コマンド経路で spec-review completion 時のみ実行される。

→ **情報観察。現実スケールでは問題なし。定期実行経路ではないため判定には影響しない。**

## 判定基準への照合

| 基準 | 結果 |
|------|------|
| 定期実行経路への単調増加コスト追加 | 該当なし（手動コマンド限定） |
| 増え続ける成果物の新設・retention 欠落 | 該当なし（既存 events.jsonl への追記） |
| 成長依存コストが手動コマンドに限定 | 該当（approved 条件を満たす） |
| 走査前フィルタで必要分しか読まない | 該当（per-file キャッシュ + scope finding 除外） |
