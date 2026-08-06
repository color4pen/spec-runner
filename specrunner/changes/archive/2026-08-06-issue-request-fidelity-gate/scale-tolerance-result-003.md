# Scale-Tolerance Review — issue-request-fidelity-gate (Iteration 3)

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

---

## Scope delta from iteration 2

`git diff main...HEAD --name-only` で確認した実際の変更ファイルは前回と同一セット。iteration 3 で追加されたのはテストファイル群（スケール中立）と、iteration 2 時点で存在していた production コードの最終確認。archive ディレクトリの deletion（2026-08-06-adr-gen-postfix-context / 2026-08-06-gate-ac-classification）はプロジェクトのアーカイブ運用上の整理であり、本レビュー観点に対して影響なし。

---

## Checked Items

| 対象リソース | 走査有無 | 根拠 |
|---|---|---|
| archive (`specrunner/changes/archive/`) | なし | gate は `requestMdPath(slug)` のみ読む。ディレクトリ走査なし。 |
| sidecar (`.specrunner/local/<slug>/`) | なし | gate コードに sidecar パスへの参照なし（`runner.ts`・`issue-fidelity-gate.ts` 両方で確認済み）。 |
| issue/PR 一覧 | なし | `getIssue` は `GET /repos/{owner}/{repo}/issues/{n}` 単一オブジェクト取得。`while` ループなし（`github-client.ts:670-682`）。 |
| コメント一覧 | なし | `listIssueComments`（ページネーション付き while ループ）は gate 経路から呼ばれない。halt 後の `notifyJobTerminal` は `createIssueComment`（単一 POST）のみ。 |
| journal (`events.jsonl`) | なし | gate は journal をロードしない。 |
| 全 jobState (`JobStateStore.list`) | なし (gate 内) | gate コードに `JobStateStore.list` の呼び出しなし。`run-inbox.ts:382` の既存 `JobStateStore.list` 呼び出しは本 PR の変更前から存在し、本 PR はそこに触れていない（diff で確認）。 |
| `inboxOrigin` flag 読み書き | O(1) | `JobState.inboxOrigin` は boolean field の単純読み書き。全 state 走査なし。 |
| `writeDraft` (new module) | O(1) | `draft-writer.ts` は `write(repoRoot, slug, content)` を呼ぶ単一ファイル書き込みの thin wrapper。追加の IO なし。 |

---

## Gate 発火条件分析（最終確認）

`evaluateIssueFidelityGate`（`src/core/gate/issue-fidelity-gate.ts`）は 3 段のショートサーキットで実コストを最小化している：

```
1. startStep !== REQUEST_REVIEW  → 即 proceed（I/O なし）  非 entrance resume はここで終了
2. issueNumber == null           → 即 proceed（I/O なし）  --issue なし run はここで終了
3. inboxOrigin === true          → 即 proceed（log のみ）  inbox run はここで終了
4. 上記 3 条件をすべて満たす場合のみ: getIssue (1 HTTP) + queryOneShot (1 LLM)
```

実際に I/O コストが発生するのは「`--issue` 付き initial run / entrance からの resume」のみ（pass 4）。

---

## 新規 API 呼び出しのコスト評価（最終確認）

### `getIssue` (`src/adapter/github/github-client.ts:670-682`)

```ts
GET /repos/{owner}/{repo}/issues/{issueNumber}
200 → { number, title, body }  (body null → "")
非 200 → throw（fail-closed）
```

- **呼び出し回数**: 1 回 / 該当 run
- **ページネーション**: なし（`while` ループ不在を直接確認）
- **スケール特性**: O(1) — 蓄積 issue 数・archive 数・job 数に無関係

### `queryOneShot` via comparator (`src/adapter/claude-code/issue-fidelity-comparator.ts:103-122`)

- **呼び出し回数**: 1 回 / 該当 run
- **入力サイズ**: `len(issueBody) + len(requestMd)` — 個別ドキュメントのサイズに比例するが、蓄積件数には比例しない
- **スケール特性**: O(1) per run — 累積 archive・job 件数に非依存

### halt 後 `notifyJobTerminal`（`runner.ts:323`）

- `createIssueComment` を 1 回呼ぶ（単一 POST）。コメント一覧の取得なし。O(1)。

---

## 非伝播 / state 書き込みのスケール評価（最終確認）

gate halt state の書き込み（`runner.ts` halt 経路）は `deps.storeFactory(haltState.jobId).persist(haltState)` — 単一 job の state file 書き込みで O(1)。全 job state の再スキャンなし。

---

## `comparatorFactory` の eager 呼び出し（最終確認）

```ts
// runner.ts:270
comparator: this.comparatorFactory?.(config),
```

`comparatorFactory?.(config)` は gate の 3 条件チェック前に評価される。しかし：

- `createIssueFidelityComparator(config)` は `{ compare: async function }` のクロージャを返すだけ（I/O なし）
- `queryOneShot`（SDK/ネットワーク呼び出し）は `compare()` 内のみ、かつ `compare()` は gate 条件を全て満たした後にのみ呼ばれる
- コスト：µs 単位のオブジェクト生成。蓄積件数に比例する I/O コストは発生しない

---

## `run-inbox.ts` の変更確認

```diff
-import { write as writeDraft } from "../request/store.js";
+import { writeDraft } from "./draft-writer.js";
...
-await runRunCore(draftPath, { cwd: repoRoot, issue: issueNumber });
+await runRunCore(draftPath, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true });
```

変更は 2 点のみ。`JobStateStore.list(repoRoot)` 呼び出し（`run-inbox.ts:382`）は本 PR の変更前から存在する pre-existing コードであり、本 PR はそこに一切触れていないことを diff で確認。新規スケール問題なし。

---

## 所見

**ブロッキング所見なし。**

以下は情報記録（verdict に影響しない）：

1. **トークンサイズ成長（文書サイズ比例）**: LLM 比較 prompt は `issueBody + requestMd` のテキストを送る。これは個別ドキュメントの文字数に比例するが、蓄積 archive 件数には比例しない。本レビュー観点（件数比例成長）の対象外。

2. **`comparatorFactory?.(config)` の eager 実行**: 全 `execute()` 呼び出しで factory が呼ばれるが、I/O は発生しない。µs 単位のオブジェクト生成のみ。run 件数増加に比例するが絶対コストは無視できる。

---

## 検証サマリー

- **checked**: 8（archive・sidecar・issue 一覧・コメント一覧・journal・全 jobState・inboxOrigin 読み書き・writeDraft）
- **skipped**: 0
- **unverified**: 0
