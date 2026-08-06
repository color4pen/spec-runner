# Scale-Tolerance Review — issue-request-fidelity-gate (Iteration 4)

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

---

## Iteration 4 デルタ確認

前回 iteration 3 からの production code 変更はなし。iteration 4 で追加されたのはテストファイル群と旧アーカイブディレクトリの削除（`2026-08-06-adr-gen-postfix-context`・`2026-08-06-gate-ac-classification`・`2026-08-06-tc-category-gate-exclusion`）。テストはスケール中立であり、削除はコスト増ではなくコスト削減方向。production code のスケール特性に変化なし。

verification-result.md（iter 1）: 696 テストファイル 10223 テスト全 pass、typecheck / lint green 確認済み。

---

## Checked Items

| 対象リソース | 走査有無 | 根拠 |
|---|---|---|
| archive (`specrunner/changes/archive/`) | なし | gate は `requestMdPath(slug)` 単一ファイルのみ読む。ディレクトリ走査なし。 |
| sidecar (`.specrunner/local/<slug>/`) | なし | `issue-fidelity-gate.ts` / `runner.ts` に sidecar パスへの参照なし。 |
| issue/PR 一覧 | なし | `getIssue` は `GET /repos/{owner}/{repo}/issues/{n}` 単一オブジェクト取得（`github-client.ts:670-682`）。`while` ループなし、ページネーションなし。 |
| コメント一覧 | なし | `listIssueComments`（while ループ付きページネーション）は gate 経路から呼ばれない。halt 後の `notifyJobTerminal` は `createIssueComment` 単一 POST のみ。 |
| journal (`events.jsonl`) | なし | gate は journal をロードしない。 |
| 全 jobState (`JobStateStore.list`) | なし (gate 内) | gate コードに `JobStateStore.list` の呼び出しなし。`run-inbox.ts:382` の既存呼び出しは本 PR 変更前から存在し、本 PR はそこに触れていない（diff 4 行 = `inboxOrigin: true` 追加のみ）。 |
| `inboxOrigin` flag 読み書き | O(1) | `JobState.inboxOrigin` は boolean field の単純読み書き。全 state 走査なし。 |
| `writeDraft` (新 module) | O(1) | `draft-writer.ts` は `write(repoRoot, slug, content)` を呼ぶ薄い wrapper。追加 I/O なし。 |

---

## Gate 発火条件分析

`evaluateIssueFidelityGate`（`src/core/gate/issue-fidelity-gate.ts`）は 3 段ショートサーキットで I/O コストを最小化する:

```
1. startStep !== REQUEST_REVIEW  → 即 proceed（I/O なし）  非 entrance resume はここで終了
2. issueNumber == null           → 即 proceed（I/O なし）  --issue なし run はここで終了
3. inboxOrigin === true          → 即 proceed（log のみ）  inbox run はここで終了
4. 上記 3 条件をすべて満たす場合のみ: getIssue (1 HTTP) + queryOneShot (1 LLM)
```

実 I/O コストが発生するのは「`--issue` 付き initial run / entrance からの resume」のみ。

---

## 新規 API 呼び出しのコスト評価

### `getIssue` (`src/adapter/github/github-client.ts:670-682`)

```ts
GET /repos/{owner}/{repo}/issues/{issueNumber}
200 → { number, title, body: body ?? "" }
非 200 → throw GITHUB_API_ERROR（fail-closed）
```

- **呼び出し回数**: 1 回 / 該当 run
- **ページネーション**: なし（`while` ループ不在を直接確認）
- **スケール特性**: O(1) — 累積 issue 数・archive 数・job 数に無関係

### `queryOneShot` via comparator (`src/adapter/claude-code/issue-fidelity-comparator.ts:111`)

- **呼び出し回数**: 1 回 / 該当 run
- **入力サイズ**: `len(issueBody) + len(requestMd)` — 個別ドキュメントのサイズに比例するが、蓄積件数には比例しない
- **スケール特性**: O(1) per run — 累積 archive 件数・job 件数に非依存

### halt 後 `notifyJobTerminal`（`runner.ts:323`）

- `createIssueComment` を 1 回呼ぶ（単一 POST）。コメント一覧の取得なし。O(1)。

---

## state 書き込みのスケール評価

gate halt state の書き込み（`runner.ts` halt 経路）は `deps.storeFactory(haltState.jobId).persist(haltState)` — 単一 job の state file 書き込みで O(1)。全 job state の再スキャンなし。

---

## `comparatorFactory?.(config)` の評価タイミング

```ts
// runner.ts:270
comparator: this.comparatorFactory?.(config),
```

gate の 3 条件チェック前（`evaluateIssueFidelityGate` 呼び出し時の引数評価）に factory が実行される。しかし:

- `createIssueFidelityComparator(config)` は `{ compare: async function }` のクロージャを返すだけ（I/O なし）
- `queryOneShot`（SDK/ネットワーク呼び出し）は `compare()` 内のみ、かつ gate 条件を全て満たした後にのみ呼ばれる
- コスト: µs 単位のオブジェクト生成。蓄積件数に比例する I/O コストは発生しない

---

## 所見

**ブロッキング所見なし。**

以下は情報記録（verdict に影響しない）:

1. **トークンサイズ成長（文書サイズ比例）**: LLM 比較 prompt は `issueBody + requestMd` のテキストを送る。これは個別ドキュメントの文字数に比例するが、蓄積 archive 件数には比例しない。本レビュー観点（件数比例成長）の対象外。

2. **resume 反復の追加コスト**: gate halt → request.md 修正 → resume を繰り返す場合、1 回の resume ごとに `getIssue` 1 HTTP + `queryOneShot` 1 LLM が発生する。しかしこれは operator による明示的な反復であり、システムの蓄積件数に依存しない。O(1) per resume。

---

## 検証サマリー

- **checked**: 8（archive・sidecar・issue 一覧・コメント一覧・journal・全 jobState・inboxOrigin 読み書き・writeDraft）
- **skipped**: 0
- **unverified**: 0
