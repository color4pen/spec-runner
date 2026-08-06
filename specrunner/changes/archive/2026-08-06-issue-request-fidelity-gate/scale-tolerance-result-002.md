# Scale-Tolerance Review — issue-request-fidelity-gate (Iteration 2)

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

---

## Checked Items

| 対象リソース | 走査有無 | 根拠 |
|---|---|---|
| archive (`specrunner/changes/archive/`) | なし | gate は `requestMdPath(slug)` のみ読む。ディレクトリ走査なし。 |
| sidecar (`.specrunner/local/<slug>/`) | なし | gate コードに sidecar パスへの参照なし。 |
| issue/PR 一覧 | なし | `getIssue` は `GET /repos/{owner}/{repo}/issues/{n}` 単一 GET。ページネーションなし。 |
| コメント一覧 | なし | `listIssueComments`（ページネーション付き）は gate 経路から呼ばれない。halt 後の `notifyJobTerminal` は `createIssueComment`（単一 POST）のみ。 |
| journal (`events.jsonl`) | なし | gate は journal をロードしない。 |
| 全 jobState (`JobStateStore.list`) | なし (gate 内) | gate コードに `JobStateStore.list` の呼び出しなし。inbox orchestrator 側の既存呼び出しはこの PR で変更なし。 |
| `inboxOrigin` flag 読み書き | O(1) | JobState の boolean field を読み書きするだけ。全 state の走査なし。 |

---

## Gate 発火条件分析

`evaluateIssueFidelityGate`（`src/core/gate/issue-fidelity-gate.ts`）は `runner.ts` の `execute()` から毎回呼ばれるが、3 段のショートサーキットで実コストを最小化している：

```
1. startStep !== REQUEST_REVIEW  → 即 proceed（I/O なし）  非 entrance resume はここで終了
2. issueNumber == null           → 即 proceed（I/O なし）  --issue なし run はここで終了
3. inboxOrigin === true          → 即 proceed（log のみ）  inbox run はここで終了
4. 上記 3 条件をすべて満たす場合のみ: getIssue (1 HTTP) + queryOneShot (1 LLM)
```

実際に I/O コストが発生するのは「`--issue` 付き initial run / entrance からの resume」のみ。

---

## 新規 API 呼び出しのコスト評価

### `getIssue` (`src/adapter/github/github-client.ts:670`)

```
GET /repos/{owner}/{repo}/issues/{issueNumber}
200 → { number, title, body }  （body null → ""）
非 200 / network error → throw（fail-closed）
```

- **呼び出し回数**: 1 回 / 該当 run（ショートサーキット後）
- **ページネーション**: なし（単一オブジェクト）
- **スケール特性**: O(1) — 蓄積 issue 数・archive 数・job 数に無関係
- **実装**: 既存の共有 `request()` を通す。`listIssueComments`（ページネーション付き）とは別メソッドで、while ループなし。

### `queryOneShot` via comparator (`src/adapter/claude-code/issue-fidelity-comparator.ts:111`)

- **呼び出し回数**: 1 回 / 該当 run
- **入力サイズ**: `len(issueBody) + len(requestMd)` — 個別ドキュメントのサイズに比例するが、蓄積件数には比例しない
- **スケール特性**: O(1) per run — 累積 archive 件数・job 件数に非依存

### halt 後 `notifyJobTerminal`（`src/core/notify/issue-notifier.ts:230`）

- `createIssueComment` を 1 回呼ぶ（単一 POST）。コメント一覧の取得なし。O(1)。

---

## 非伝播 / state 書き込みのスケール評価

gate halt state の書き込み（`runner.ts` halt 経路）は `deps.storeFactory(haltState.jobId).persist(haltState)` — 1 件の state file 書き込みで O(1)。全 job state の再スキャンなし。

---

## `comparatorFactory` の eager 呼び出し（再確認）

```ts
// runner.ts:270
comparator: this.comparatorFactory?.(config),
```

`comparatorFactory?.(config)` は gate の 3 条件チェック**前**に評価される。つまり非 issue run（issueNumber が null）でも、非 entrance resume でも、inbox run でも、comparator オブジェクトが生成される。

ただし：
- `createIssueFidelityComparator(config)` は軽量な object literal（`{ compare: async function }` のクロージャ）を返すだけ
- `queryOneShot`（SDK/ネットワーク呼び出し）は `compare()` 内のみで、かつ `compare()` は gate の 3 条件がすべて満たされた後にのみ呼ばれる
- コスト：µs 単位のオブジェクト生成。run 件数比例だが絶対値は無視できる

蓄積件数に比例する I/O コストは一切発生しない。

---

## `undeclaredDrops` リスト処理のスケール評価

```ts
// issue-fidelity-gate.ts:171-174
const dropList = comparison.undeclaredDrops
  .map((d, i) => `  ${i + 1}. ${d}`)
  .join("\n");
```

O(n) where n = undeclared drop の数 = issue の要件数。蓄積 archive / job 件数には非依存。問題なし。

---

## 所見

**ブロッキング所見なし。**

以下は情報記録（verdict に影響しない）：

1. **トークンサイズ成長（文書サイズ比例）**: LLM 比較 prompt は `issueBody + requestMd` のテキストを送る。これは個別ドキュメントの文字数に比例するが、蓄積 archive 件数には比例しない。本レビュー観点（件数比例成長）の対象外。

2. **`comparatorFactory?.(config)` の eager 実行**: 全 `execute()` 呼び出しで factory が呼ばれるが、I/O は発生しない。µs 単位のオブジェクト生成のみ。run 件数増加に比例するが絶対コストは無視できる。

---

## 検証サマリー

- **checked**: 7（archive・sidecar・issue 一覧・コメント一覧・journal・全 jobState・inboxOrigin 読み書き）
- **skipped**: 0
- **unverified**: 0
