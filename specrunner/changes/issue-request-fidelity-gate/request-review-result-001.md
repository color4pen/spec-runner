# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コード断定の事実確認（現状コードの前提節 + 全体スキャン）

| 断定 | 確認結果 |
|------|---------|
| `pipeline-run.ts:155-157` — issue 番号を `jobState.issueNumber` に保存 | ✅ 一致（L155-157） |
| `issue-notifier.ts:230-251` — 終端通知にのみ使用 | ✅ `notifyJobTerminal` がL230-251で定義、`issueNumber` の確認と comment 書き込みのみ |
| `src/prompts/` / `src/core/step/` に issue 本文の参照なし | ✅ grep "issueBody\|issue.*body" → 0件 |
| `src/kernel/github-client.ts` に単一 issue 取得メソッドなし | ✅ `GitHubClient` interface に `getIssue` 相当のメソッドは存在しない（`src/core/port/github-client.ts` は同ファイルの re-export） |
| adapter `src/adapter/github/github-client.ts` — 単一 issue GET エンドポイントなし | ✅ `GET /repos/{owner}/{repo}/issues/{number}` の呼び出しは存在しない |
| `src/cli/run.ts:82` — preflight 後に client を構築 | ✅ L82 `const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl)` |
| `src/core/preflight.ts:61-79` — GitHub token 解決 | ✅ L61-79 Step 2.5 でトークン解決、失敗時 `throw err` |
| `src/core/command/request.ts:126-177` — validate は offline 決定的 | ✅ `executeValidate` は LLM 呼び出しなし（design-layer gate は spawn のみ、network/LLM 非使用） |
| `src/core/inbox/run-inbox.ts:397-400` — issue 本文がそのまま request.md に | ✅ L397-400: `writeDraft(repoRoot, slug, issueBody)` → `runRunCore(draftPath, ...)` |
| `pipeline-run.ts:165` — 最初の step が `REQUEST_REVIEW` | ✅ L165 `startStep: STEP_NAMES.REQUEST_REVIEW` |
| `src/prompts/request-review-system.ts` — issue 本文を入力に取らない | ✅ "issue" キーワードは 0 件一致（本文注入なし） |
| `src/parser/request-md.ts:117-126` — issue フィールドは optional | ✅ L117-126 で optional 抽出パターンが定義されている |
| ADR `specrunner/adr/2026-07-31-deterministic-request-entrance.md` 存在 | ✅ ファイル確認済み |

### 2. 要件・受け入れ基準の検証

- **要件 1（entrance gate 位置）**: run 経路内・最初の step 前という配置は、`pipeline-run.ts` の `prepare()` または step 実行ループ開始前にフックする位置として自然に実装可能。✅ 明確
- **要件 2（判定規則）**: "undeclared drop" の定義（issue に明記 ∧ request の要件に不在 ∧ スコープ外宣言にも不在）は LLM 照合 prompt に落とせる。✅ 明確
- **要件 3（halt → resume 再評価）**: 受け入れ基準 9 で "gate が再評価される" が指定されている。resume 経路は `ResumeCommand.prepare()` で開始するため、gate を resume 前フックとして挿入する必要がある。設計詳細（どのフック点で gate を再実行するか）は design step に委ねられる。✅ 要件として明確
- **要件 4（非伝播）**: issue 本文の非保存を受け入れ基準 4 でテスト固定。✅ 明確
- **要件 5（getIssue port）**: port interface にメソッドが存在せず追加が必要と確認済み。✅ 正確
- **要件 6（fail-closed）**: 受け入れ基準 7 でテスト固定。✅ 明確
- **要件 7（inbox skip）**: 受け入れ基準 6 でテスト固定。✅ 明確

### 3. スコープ・整合性確認

- inbox 経路（`run-inbox.ts:397-400`）は issue 本文をそのまま request.md として `writeDraft` するため、乖離が構造的に生じない — inbox skip 根拠と一致 ✅
- 入口決定性 canon（#939）との整合: gate は `runRunCore` 内（job 実行経路）に置くため、`request validate` の決定性は維持される ✅

## 検証できなかった項目

None — すべての断定を code で確認した。

## Findings 詳細

### OBSERVATION: adapter description の軽微な過小記述

`src/adapter/github/github-client.ts` の説明が「`/issues/{n}/comments` と labels 操作のみ」となっているが、実際には `searchOpenIssuesByLabel`（`GET /repos/{owner}/{repo}/issues?labels=<label>`）も存在する。核心の主張（単一 issue GET エンドポイントなし）は正確であり、設計・実装への影響はない。
