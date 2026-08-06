# Scale-Tolerance Review — issue-request-fidelity-gate (Iteration 1)

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

---

## Checked Items

| 対象リソース | 走査有無 | 根拠 |
|---|---|---|
| archive (`specrunner/changes/archive/`) | なし | gate は `requestMdPath(slug)` のみ読む。archive ディレクトリ走査なし。 |
| sidecar (`.specrunner/local/<slug>/`) | なし | gate コードに sidecar パスへの参照なし。 |
| issue/PR 一覧 | なし | `getIssue` は単一オブジェクト取得（`GET /repos/{owner}/{repo}/issues/{n}`）、ページネーションなし。 |
| コメント一覧 | なし | `listIssueComments`（ページネーション付き）は gate から呼ばれない。 |
| journal (`events.jsonl`) | なし | gate は journal をロードしない。 |
| 全 jobState (`JobStateStore.list`) | なし (gate 内) | gate コードに `JobStateStore.list` の呼び出しなし。inbox orchestrator 側の既存呼び出し（`run-inbox.ts:90`）はこの PR で変更なし。 |

---

## Gate 発火条件分析

`evaluateIssueFidelityGate` は `runner.ts` の `execute()` から無条件に呼ばれるが、3 段のショートサーキットで実コストは最小化されている：

```
1. startStep !== REQUEST_REVIEW  → 即 proceed（I/O なし）  非 entrance resume はここで終了
2. issueNumber == null           → 即 proceed（I/O なし）  --issue なし run はここで終了
3. inboxOrigin === true          → 即 proceed（log のみ）  inbox run はここで終了
4. 上記 3 条件をすべて満たす場合のみ: getIssue (1 HTTP) + queryOneShot (1 LLM)
```

実際にコストが発生するのは「`--issue` 付き initial run / entrance からの resume」のみ（パス 4）。

---

## 新規 API 呼び出しのコスト評価

### `getIssue` (adapter: `github-client.ts:670`)

```ts
GET /repos/{owner}/{repo}/issues/{issueNumber}
200 → { number, title, body }
```

- **呼び出し回数**: 1 回 / 該当 run
- **ページネーション**: なし（単一オブジェクト）
- **スケール特性**: O(1) — issue 数・archive 数・job 数に無関係

### `queryOneShot` via comparator (`issue-fidelity-comparator.ts:111`)

- **呼び出し回数**: 1 回 / 該当 run
- **入力サイズ**: `len(issueBody) + len(requestMd)` — 個別ドキュメントのサイズに比例するが、蓄積件数には比例しない
- **スケール特性**: O(1) per run — 累積 archive 件数・job 件数に非依存

---

## 非伝播 / state 書き込みのスケール評価

gate の halt state 書き込み（`T-09` の halt 経路）は `deps.storeFactory(haltState.jobId).persist(haltState)` — 1 件の state file 書き込みで O(1)。全 job state の再スキャンなし。

---

## 所見

**ブロッキング所見なし。**

以下は情報記録（verdict に影響しない）：

1. **トークンサイズ成長（文書サイズ比例）**: LLM 比較 prompt は `issueBody + requestMd` のテキストを送る。これは個別ドキュメントの文字数に比例するが、蓄積 archive 件数には比例しない。単一 issue・単一 request の肥大化（数千行）では token コストが増加しうるが、これはスケール件数成長ではなくドキュメントサイズ成長であり、本レビュー観点（件数比例成長）の対象外。

2. **`evaluateIssueFidelityGate` の無条件呼び出し**: `runner.ts` は全 execute() 呼び出しで gate 関数を呼ぶ。非適用ケース（非 issue run）はステップ 1/2 で即 return するため実コストは async 関数呼び出し 1 回分（µs 単位）。run 件数増加に比例するが、絶対値は無視できる。

---

## 検証サマリー

- **checked**: 6（archive・sidecar・issue 一覧・コメント一覧・journal・全 jobState の各リソース）
- **skipped**: 0
- **unverified**: 0
