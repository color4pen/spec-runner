# Scale-Tolerance Review: inbox-reject-dedup

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

---

## 審査対象の変更

tick 経路（`runInboxOrchestrator`）に 2 つのコスト追加が含まれる。

1. **T-03**: unlinked approved issue に対して `listIssueComments` を tick ごとに呼ぶ fan-out
2. **T-04**: `hasLatestRejectNotification` による全コメントの in-memory 線形スキャン

---

## 観点別所見

### 1. `listIssueComments` fan-out（T-03）

**比例先**: 呼び出し回数は「承認ラベル付きかつ未 link の issue 数」に比例する。

- この値は**単調増加しない**。ユーザーのアクティビティが収束すれば 0 に近づく。
- L1（ラベル除去）が成功した tick の直後、issue は `searchOpenIssuesByLabel` の結果から消える → 次 tick 以降の呼び出しコストは 0 に戻る。
- L1 が失敗し続けるケース（API 障害）でも、L2（dedup）が reject コメントの追加を抑止するため、issue のコメント件数は単調増加しない。ページ fetch 回数は固定化される。

**ページング**: `listIssueComments` は `while (nextUrl)` で全ページを取得する。コメント件数に比例して API 呼び出しが増えるが、上記の通りその増加は設計上抑止されており、"単調増加する件数" ではない。

**並列多重度**: `Promise.all` の要素数は unlinked approved issue 数で上限が決まる。awaiting-resume ジョブの comment fetch と同じ `Promise.all` にまとめているため、既存の fan-out と同質の追加である。

### 2. `hasLatestRejectNotification` O(N) スキャン（T-04）

fetch 済みの配列を 1 パスで走査するだけであり、API 呼び出しを伴わない。件数が増えても影響は無視できる。

### 3. `linkedIssueNumbers` の二重計算

`run-inbox.ts` 冒頭（L98–100）と `planStarts` 内部で `linkedIssueNumbers` を別々に構築している。両者とも `allJobStates`（メモリ上の配列）の filter/map であり I/O 不要。コストは O(job_states) で pre-existing の `JobStateStore.list` ロードと同等以下。

### 4. 増え続けるファイル・ディレクトリ

本変更は新規の永続ファイルを作成しない。`commentsByIssue` は tick ごとにローカル変数として生成・破棄される。

---

## 設計ドキュメントとの整合

`design.md` の「Risks / Trade-offs」セクションが ticket 経路の comment fetch 増加を明示的に識別し、「steady state では 0 増、spam 発生中は 1 call/issue」と正しく評価している。本レビューの所見と一致する。

---

## 判定根拠

tick 経路に新規コストを追加しているが、そのコストが比例する軸（unlinked approved issue 数・issue ごとのコメント件数）はいずれも単調増加しない。L1/L2 の両層がそれぞれ抑止機構として機能しており、故障時でも件数が単調増加する経路が存在しない。
