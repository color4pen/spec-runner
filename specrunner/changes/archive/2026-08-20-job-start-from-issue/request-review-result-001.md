# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コード Assertion の照合（10 件）

| # | Assertion | 結果 |
|---|-----------|------|
| 1 | `src/cli/run.ts:45` — `runRunCore` が `issue?: number` と `inboxOrigin?: boolean` を持つ | ✅ 確認（line 45） |
| 2 | `src/cli/command-registry.ts:835` — `job start` の help に `--issue <number>` あり、`inboxOrigin` は未公開 | ✅ 確認（help text line 835、RUN_JOB_FLAGS line 540-547） |
| 3 | `src/core/command/pipeline-run.ts:167-170` — `inboxOrigin === true` のとき `jobState.inboxOrigin = true` | ✅ 確認（lines 167-171） |
| 4 | `src/core/gate/issue-fidelity-gate.ts:106` — `inboxOrigin === true` で comparator skip | ✅ 確認（line 106-111） |
| 5 | `src/core/inbox/run-inbox.ts:397-400` — `writeDraft` → `runRunCore(..., { inboxOrigin: true })` の 2 段 | ✅ 確認（lines 397-400） |
| 6 | `src/core/inbox/planner.ts:134-137` — `parseRequestMdContent(issue.body, ...)` → `slug = parsed.slug` | ✅ 確認（lines 134-137） |
| 7 | `src/core/inbox/draft-writer.ts` — `writeDraft` が `write()` に委譲 | ✅ 確認 |
| 8 | `src/core/runtime/local.ts:478-479` — worktree が `origin/<baseBranch>` から作成 | ✅ 確認（lines 478-479） |
| 9 | `src/cli/inbox.ts:44-69` — `resolveGitHubToken` / `getOriginInfo` / `createGitHubClient` の組み立て | ✅ 確認（lines 44-69） |
| 10 | `src/state/schema/types.ts:476` — `inboxOrigin?: boolean` | ✅ 確認（line 476） |

### 機能要件の整合性

- **Req 1 (`--from-issue <n>`)**: 4 ステップ（取得→parse→draft→start）の連鎖が明確に定義されており、実装可能。
- **Req 2 (inbox との経路統合)**: inbox の `writeDraft` → `runRunCore` という 2 段パターンと `--from-issue` 経路を core 関数で統合する方針。"挙動保存"を inbox テスト不改変で証明する制約が明示されており、テスト pin が設計安全弁になっている。
- **Req 3 (base-branch guard)**: "job state 作成前に fail-closed で停止"かつ "draft が残留しない" の 2 制約が受け入れ基準に pin されている。
- **Req 4 (排他と直交)**: `--from-issue` / positional / `--issue` の排他が明示。`--detach` との併用可を明記。
- **Req 5 (state field 再利用)**: schema 変更なし、`inboxOrigin` フィールド再利用。scoping が正確。
- **Req 6 (ヘルプ・guide)**: `guide.ts` 内 "jobs" topic（line 33）と "inbox" topic（line 494）の双方に `--from-issue` 記述が必要。

### guide 更新対象の現状確認

- `jobs` topic: `specrunner job start <slug|file> --detach [--issue <n>]` — `--from-issue` 記述なし
- `inbox` topic: `specrunner job start <slug|file> --issue <n>` — `--from-issue` 記述なし

### 受け入れ基準の検証可能性

全 7 項目とも機械検証またはテスト pin の形式になっており、通過判定が自明。

## 検証できなかった項目

None。

## Findings 詳細

### F1: base-branch guard のタイミングが実装に委ねられている（low）

Req 3 は "job state 作成前に fail-closed で停止" と述べるが、draft 書き込みとの相対順を明示しない。受け入れ基準 "draft が残留しない" を満たすには、guard を draft 書き込みより前に実行するか、guard 失敗時に draft を削除するかを設計で決める必要がある。前者のほうが副作用がなく実装が単純。

処理順の制約を受け入れ基準に追加（「base-branch guard は draft 書き込みより前に評価する」）すると、実装の迷いがなくなる。ただし現行の AC "draft が残留しない" でも結果として同等の保証が得られるため、設計ステップでの解決も許容範囲。

### F2: positional arg の optional 化が暗示のみ（low）

現行 `job start` コマンド定義は `args: [{ name: "slug|file", required: true }]`（`command-registry.ts:830`）。Req 4 は "positional と `--from-issue` の同時指定は usage エラー" と述べるが、`--from-issue` 単独時（positional なし）に positional が optional になる旨は明示されていない。

CLI パーサーが `required: true` を強制するため、`job start --from-issue 123`（positional なし）はパーサー層でエラーになる可能性がある。設計ステップで positional を `required: false` に変更し、ハンドラ層で排他を検証する構造にする必要がある。要件の意図は明確なので blocking ではないが、設計者が見落とすと実装が壊れる。
