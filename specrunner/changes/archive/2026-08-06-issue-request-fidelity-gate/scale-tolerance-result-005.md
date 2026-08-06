# Scale-Tolerance Review — issue-request-fidelity-gate (Iteration 5)

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

---

## Iteration 5 デルタ確認

`git diff origin/main...HEAD --stat` で確認した production code 差分（`src/` 以下）:

| ファイル | 変更量 | 内容 |
|---|---|---|
| `src/adapter/github/github-client.ts` | +19 | `getIssue` 実装 |
| `src/cli/resume.ts` | +9 | comparator factory 注入 |
| `src/cli/run.ts` | +14 | comparator factory 注入 |
| `src/core/command/pipeline-run.ts` | +18 | `inboxOrigin` flag 設定 |
| `src/core/command/resume.ts` | +5 | comparator factory 注入 |
| `src/core/command/runner.ts` | +157 | gate 呼び出しと halt path |
| `src/core/gate/issue-fidelity-gate.ts` | +187 | gate ロジック（新規） |
| `src/core/inbox/draft-writer.ts` | +12 | draft 書き込み wrapper（新規） |
| `src/core/inbox/run-inbox.ts` | +4 | `inboxOrigin: true` 注入 |
| `src/core/port/issue-fidelity-comparator.ts` | +46 | port 定義（新規） |
| `src/errors.ts` | +11 | 新エラーコード 2 件 |
| `src/kernel/github-client.ts` | +17 | `getIssue` port 宣言 |
| `src/prompts/issue-fidelity-system.ts` | +92 | 照合 prompt（新規） |
| `src/state/schema/types.ts` | +10 | `inboxOrigin` field 追加 |

iteration 4 から production code の変更なし（iter 4→5 で追加されたのはテストファイルとレビュー結果ファイルのみ）。

---

## 検証済み項目

### 1. `evaluateIssueFidelityGate` — 3 段ショートサーキット

直接ソース確認（`src/core/gate/issue-fidelity-gate.ts`）:

```
1. startStep !== REQUEST_REVIEW  → 即 proceed（I/O なし）
2. issueNumber == null           → 即 proceed（I/O なし）
3. inboxOrigin === true          → 即 proceed（log のみ）
4. 上記 3 条件満たす場合のみ: getIssue (1 HTTP) + queryOneShot (1 LLM)
```

- ループ・コレクション走査なし
- archive / sidecar / job 一覧への参照なし
- **O(1) per applicable run**

### 2. `getIssue` (`src/adapter/github/github-client.ts:670-682`)

```ts
GET /repos/{owner}/{repo}/issues/{issueNumber}
200 → { number, title, body: body ?? "" }
非 200 → throw GITHUB_API_ERROR
```

- `while` ループなし、ページネーションなし
- 累積 issue 数・archive 数に無関係
- **O(1)**

### 3. `createIssueFidelityComparator` (`src/adapter/claude-code/issue-fidelity-comparator.ts`)

- `{ compare: async function }` クロージャを返すだけ（I/O なし）
- `queryOneShot` は `compare()` 呼び出し時に 1 回のみ発火
- **O(1) factory 生成**

### 4. `runner.ts` halt path (`src/core/command/runner.ts:279-323`)

halt 時の操作:
- `deps.storeFactory(haltState.jobId).persist(haltState)` — 単一ファイル書き込み、O(1)
- `deps.runtimeStrategy?.commitFinalState(...)` — 単一 checkpoint publish、O(1)
- `notifyJobTerminal(haltState, ...)` — `createIssueComment` 1 回 POST のみ、O(1)

### 5. `notifyJobTerminal` (`src/core/notify/issue-notifier.ts:230-251`)

- `createIssueComment` 1 回のみ（コメント一覧取得なし）
- gate halt 時は `state.steps` は空のため `getOpenDecisionFindings` のループは 0 回
- **O(1)**

### 6. `inboxOrigin` flag、`draft-writer.ts`

- `JobState.inboxOrigin` は boolean の単純読み書き — O(1)
- `draft-writer.ts` は単一ファイル write の wrapper — O(1)

---

## スケール対象リソース別評価

| 対象リソース | 走査有無 | 根拠 |
|---|---|---|
| archive (`specrunner/changes/archive/`) | なし | gate は `requestMdPath(slug)` 単一ファイルのみ読む |
| sidecar (`.specrunner/local/<slug>/`) | なし | gate / runner の新規コードに sidecar パス参照なし |
| issue/PR 一覧 | なし | `getIssue` は単一オブジェクト GET、while ループなし |
| コメント一覧 | なし | `listIssueComments`（ページネーション付き）は gate 経路から呼ばれない |
| journal (`events.jsonl`) | なし | gate は journal をロードしない |
| 全 jobState (`JobStateStore.list`) | なし（gate 内） | gate コードに `JobStateStore.list` 呼び出しなし |

---

## 情報記録（verdict に影響しない）

1. **prompt サイズのドキュメント比例成長**: LLM 照合 prompt は `issueBody + requestMd` のテキスト全文を送る。個別ドキュメントの文字数に比例するが、累積 archive・job 件数には比例しない。本レビュー観点（件数比例成長）の対象外。

2. **resume 反復の追加コスト**: gate halt → request.md 修正 → resume を繰り返す場合、1 resume ごとに `getIssue` 1 HTTP + `queryOneShot` 1 LLM が発生する。これは operator による明示的な反復であり、システム蓄積件数に依存しない（O(1) per resume）。

---

## 検証サマリー

**ブロッキング所見なし。**

- **checked**: 8（archive・sidecar・issue 一覧・コメント一覧・journal・全 jobState・inboxOrigin 読み書き・writeDraft）
- **skipped**: 0
- **unverified**: 0
